import type { CronLogger } from "./runner";
import type { Env } from "../../types";
import { getConfig } from "../config";
import { findCityMatches, type GeoMatch } from "../geo-lookup";
import { getLlmProviderImpl } from "../llm-providers";
import {
  calculateTokenCost,
  getModelPricing,
  type ModelPricing,
} from "../ai-usage";

/**
 * Two-pass geo-tagging cron job:
 * 1. Keyword matching — only unambiguous city-name matches in titles
 * 2. LLM classification — everything else (sports teams, regional, state-level)
 *
 * The LLM approach eliminates false positives from keyword heuristics
 * (e.g., Southampton "Saints" ≠ New Orleans Saints).
 */
export async function runGeoTaggingJob(
  prisma: any,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  const batchSize = await getConfig<number>(
    prisma,
    "geoClassification.batchSize",
    2000
  );

  await logger.info(`Fetching up to ${batchSize} unprocessed podcasts for geo-tagging`);

  // Skip podcasts that have any manually curated geo profiles — admin edits
  // and deletions are sacred and should never be overwritten by automation.
  const manualPodcastIds = (await prisma.podcastGeoProfile.findMany({
    where: { source: "manual" },
    select: { podcastId: true },
    distinct: ["podcastId"],
  })).map((r: any) => r.podcastId);

  const podcasts = await prisma.podcast.findMany({
    where: {
      geoProcessedAt: null,
      status: "active",
      ...(manualPodcastIds.length > 0 ? { id: { notIn: manualPodcastIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      description: true,
      categories: true,
    },
    take: batchSize,
  });

  if (podcasts.length === 0) {
    await logger.info("All podcasts already geo-processed — nothing to do");
    return { processed: 0, pass1Matched: 0, pass2Matched: 0, pass2Attempted: 0, totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  }

  await logger.info(`Processing ${podcasts.length} podcast(s)`);

  // ── Pass 1: High-confidence city-name matches (title only) ──
  let pass1Matched = 0;
  const llmCandidates: typeof podcasts = [];

  for (const podcast of podcasts) {
    const title = podcast.title ?? "";
    // Only keep title-based city matches (confidence 0.9) — skip description-only
    const cityMatches = findCityMatches(title, "").filter(
      (m) => m.confidence >= 0.9
    );

    if (cityMatches.length > 0) {
      const deduped = deduplicateMatches(cityMatches);
      await writeGeoProfiles(prisma, podcast.id, deduped, "keyword");
      pass1Matched++;
    } else {
      // Everything without a strong title match goes to LLM
      llmCandidates.push(podcast);
    }

    // Mark as geo-processed regardless
    await prisma.podcast.update({
      where: { id: podcast.id },
      data: { geoProcessedAt: new Date() },
    });
  }

  await logger.info(`Pass 1 complete: ${pass1Matched} matched by city keywords, ${llmCandidates.length} candidate(s) for LLM`);

  // ── Pass 2: LLM classification for everything else ──
  let pass2Matched = 0;
  const pass2Attempted = llmCandidates.length;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  if (llmCandidates.length > 0) {
    const llmProviderId = await getConfig<string>(
      prisma,
      "geoClassification.llmProviderId",
      ""
    );

    if (llmProviderId) {
      const aiProvider = await prisma.aiModelProvider.findUnique({
        where: { id: llmProviderId },
        include: { model: { select: { modelId: true } } },
      });

      if (aiProvider) {
        const provider = getLlmProviderImpl(aiProvider.provider);
        const model = aiProvider.providerModelId ?? aiProvider.model.modelId;
        const llmBatchSize = await getConfig<number>(
          prisma,
          "geoClassification.llmBatchSize",
          10
        );

        // Fetch pricing for cost tracking
        const pricing: ModelPricing | null = {
          priceInputPerMToken: aiProvider.priceInputPerMToken,
          priceOutputPerMToken: aiProvider.priceOutputPerMToken,
        };

        // Load sports teams for context in the LLM prompt
        const sportsTeams = await prisma.sportsTeam.findMany({
          select: {
            name: true,
            nickname: true,
            markets: { select: { city: true, state: true } },
          },
        });

        for (let i = 0; i < llmCandidates.length; i += llmBatchSize) {
          const batch = llmCandidates.slice(i, i + llmBatchSize);
          try {
            const result = await provider.complete(
              [
                {
                  role: "user",
                  content: buildBatchGeoClassificationPrompt(batch, sportsTeams),
                },
              ],
              model,
              256 * batch.length,
              env,
              {
                system: GEO_SYSTEM_PROMPT,
              }
            );

            // Track tokens and cost
            totalInputTokens += result.inputTokens;
            totalOutputTokens += result.outputTokens;
            const batchCost = calculateTokenCost(
              pricing,
              result.inputTokens,
              result.outputTokens,
              result.cacheCreationTokens,
              result.cacheReadTokens
            );
            if (batchCost !== null) totalCost += batchCost;

            const batchResults = parseBatchGeoClassificationResponse(result.text, batch);
            for (const [podcastId, matches] of Object.entries(batchResults)) {
              if (matches.length > 0) {
                await writeGeoProfiles(prisma, podcastId, matches, "llm");
                pass2Matched++;
              }
            }
          } catch (err) {
            await logger.warn("geo_tagging_llm_batch_error", {
              batchSize: batch.length,
              batchStart: i,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } else {
        await logger.warn("geo_tagging_no_provider", {
          llmProviderId,
          message: "AiModelProvider not found",
        });
      }
    } else {
      await logger.info("geo_tagging_llm_skipped", {
        llmCandidates: llmCandidates.length,
        message: "No LLM provider configured for geo classification",
      });
    }
  }

  await logger.info("geo_tagging_complete", {
    processed: podcasts.length,
    pass1Matched,
    pass2Matched,
    pass2Attempted,
    totalCost: `$${totalCost.toFixed(4)}`,
    totalInputTokens,
    totalOutputTokens,
  });

  return {
    processed: podcasts.length,
    pass1Matched,
    pass2Matched,
    pass2Attempted,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalInputTokens,
    totalOutputTokens,
  };
}

// ── Helpers ──

function deduplicateMatches(matches: GeoMatch[]): GeoMatch[] {
  const map = new Map<string, GeoMatch>();
  for (const m of matches) {
    const key = `${m.city}:${m.state}:${m.teamId ?? ""}`;
    const existing = map.get(key);
    if (!existing || m.confidence > existing.confidence) {
      map.set(key, m);
    }
  }
  return Array.from(map.values());
}

async function writeGeoProfiles(
  prisma: any,
  podcastId: string,
  matches: GeoMatch[],
  source: "keyword" | "llm"
): Promise<void> {
  for (const match of matches) {
    await prisma.podcastGeoProfile.upsert({
      where: {
        podcastId_city_state: {
          podcastId,
          city: match.city,
          state: match.state,
        },
      },
      update: {
        confidence: match.confidence,
        scope: match.scope,
        source,
        teamId: match.teamId ?? null,
      },
      create: {
        podcastId,
        city: match.city,
        state: match.state,
        scope: match.scope,
        teamId: match.teamId ?? null,
        confidence: match.confidence,
        source,
      },
    });
  }
}

const GEO_SYSTEM_PROMPT = `You classify podcasts by US geographic market. You must be precise:

RULES:
- Only tag podcasts that are PRIMARILY ABOUT a specific US city, state, or region
- Sports teams: match to their HOME MARKET city/state (e.g., "New Orleans Saints" → New Orleans, Louisiana)
- Do NOT tag podcasts that merely mention a location in passing
- Do NOT tag international content to US markets (e.g., Southampton FC is UK, not US)
- Do NOT tag national US content to specific markets unless it has a clear local focus
- For podcasts with no US geographic focus, return an empty array []
- confidence: 0.9+ for primary market, 0.7-0.8 for secondary/partial

Return valid JSON only.`;

function buildBatchGeoClassificationPrompt(
  podcasts: { id: string; title: string | null; description: string | null }[],
  sportsTeams: { name: string; nickname: string; markets: { city: string; state: string }[] }[]
): string {
  const entries = podcasts
    .map((p, i) => `[${i + 1}] id=${p.id}\nTitle: ${p.title ?? ""}\nDescription: ${(p.description ?? "").slice(0, 300)}`)
    .join("\n\n");

  // Provide sports team context so the LLM can disambiguate
  const teamList = sportsTeams
    .map((t) => `${t.name} (${t.nickname}) → ${t.markets.map((m) => `${m.city}, ${m.state}`).join("; ")}`)
    .join("\n");

  return `Classify each podcast by US geographic market.

${entries}

US Sports Teams for reference:
${teamList}

Return a JSON object mapping podcast ID to its geo matches:
{
  "<podcast_id>": [{"city": "<city>", "state": "<full state name>", "scope": "city"|"state"|"regional", "confidence": 0.0-1.0}],
  "<podcast_id>": []
}

Rules:
- For state-level matches, set city to ""
- For podcasts with no US geographic focus, use an empty array []
- scope must be one of: "city", "state", "regional"
- confidence should reflect how certain you are (0.7-1.0)
- Match sports podcasts to the team's HOME MARKET, not where the sport originated
- International sports (Premier League, La Liga, etc.) should get empty arrays unless the podcast specifically covers a US market angle`;
}

function parseBatchGeoClassificationResponse(
  text: string,
  podcasts: { id: string }[]
): Record<string, GeoMatch[]> {
  const results: Record<string, GeoMatch[]> = {};
  for (const p of podcasts) {
    results[p.id] = [];
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return results;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== "object" || parsed === null) return results;

    for (const [podcastId, matches] of Object.entries(parsed)) {
      if (!results.hasOwnProperty(podcastId) || !Array.isArray(matches)) continue;

      results[podcastId] = (matches as any[])
        .filter(
          (item: any) =>
            typeof item.city === "string" &&
            typeof item.state === "string" &&
            typeof item.scope === "string" &&
            typeof item.confidence === "number" &&
            ["city", "state", "regional"].includes(item.scope) &&
            item.confidence >= 0 &&
            item.confidence <= 1
        )
        .map((item: any) => ({
          city: item.city,
          state: item.state,
          scope: item.scope as "city" | "state" | "regional",
          confidence: item.confidence,
        }));
    }
  } catch {
    // Parse failure — return empty results for all
  }

  return results;
}
