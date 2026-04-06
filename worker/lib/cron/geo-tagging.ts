import type { CronLogger } from "./runner";
import type { Env } from "../../types";
import { getConfig } from "../config";
import {
  findCityMatches,
  findStateMatches,
  findRegionalMatches,
  type GeoMatch,
} from "../geo-lookup";
import { getLlmProviderImpl } from "../llm-providers";

/**
 * Two-pass geo-tagging cron job:
 * 1. Keyword matching using geo-lookup tables + sports team keywords from DB
 * 2. LLM classification for unmatched Sports podcasts
 */
export async function runGeoTaggingJob(
  prisma: any,
  logger: CronLogger,
  env: Env
): Promise<Record<string, unknown>> {
  const batchSize = await getConfig<number>(
    prisma,
    "geoClassification.batchSize",
    500
  );

  // Fetch unprocessed podcasts
  const podcasts = await prisma.podcast.findMany({
    where: {
      geoProcessedAt: null,
      status: "active",
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
    await logger.info("geo_tagging_no_podcasts", { message: "No unprocessed podcasts" });
    return { processed: 0, pass1Matched: 0, pass2Matched: 0, pass2Attempted: 0 };
  }

  await logger.info("geo_tagging_start", { podcastCount: podcasts.length });

  // Load sports teams with keywords for team-level matching
  const sportsTeams = await prisma.sportsTeam.findMany({
    select: {
      id: true,
      keywords: true,
      markets: { select: { city: true, state: true } },
    },
  });

  // ── Pass 1: Keyword matching ──
  let pass1Matched = 0;
  const unmatchedSports: typeof podcasts = [];

  for (const podcast of podcasts) {
    const title = podcast.title ?? "";
    const description = podcast.description ?? "";
    const categories: string[] = podcast.categories ?? [];
    const isSports = categories.some(
      (c: string) => c.toLowerCase().includes("sport")
    );

    // Check sports team keywords — standalone nicknames (single-word keywords
    // like "Saints", "Bears", "Eagles") are too ambiguous for non-Sports podcasts
    // so we only match those against Sports-category pods. Multi-word keywords
    // like "New Orleans Saints" or "Da Bears" are specific enough to match anywhere.
    const teamMatches: GeoMatch[] = [];
    for (const team of sportsTeams) {
      const keywords: string[] = team.keywords ?? [];
      for (const keyword of keywords) {
        const isSingleWord = !keyword.includes(" ");
        if (isSingleWord && !isSports) continue; // skip ambiguous nicknames for non-sports pods

        const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (pattern.test(title) || pattern.test(description)) {
          for (const market of team.markets) {
            teamMatches.push({
              city: market.city,
              state: market.state,
              scope: "city",
              confidence: isSingleWord ? 0.85 : 0.95, // lower confidence for nickname-only matches
              teamId: team.id,
            });
          }
          break; // one keyword match per team is enough
        }
      }
    }

    // Geo-lookup matching
    const cityMatches = findCityMatches(title, description);
    const stateMatches = findStateMatches(title, description);
    const regionalMatches = findRegionalMatches(title, description);

    const allMatches = [...teamMatches, ...cityMatches, ...stateMatches, ...regionalMatches];

    if (allMatches.length > 0) {
      // Deduplicate by city+state+teamId, keeping highest confidence
      const deduped = deduplicateMatches(allMatches);
      await writeGeoProfiles(prisma, podcast.id, deduped, "keyword");
      pass1Matched++;
    } else {
      // Unmatched Sports podcasts are candidates for LLM pass
      if (isSports) {
        unmatchedSports.push(podcast);
      }
    }

    // Mark as geo-processed regardless of match
    await prisma.podcast.update({
      where: { id: podcast.id },
      data: { geoProcessedAt: new Date() },
    });
  }

  // ── Pass 2: LLM classification for unmatched Sports podcasts ──
  let pass2Matched = 0;
  const pass2Attempted = unmatchedSports.length;

  if (unmatchedSports.length > 0) {
    const llmProviderId = await getConfig<string>(
      prisma,
      "geoClassification.llmProviderId",
      ""
    );

    if (llmProviderId) {
      // Resolve the LLM provider from AiProvider table
      const aiProvider = await prisma.aiProvider.findUnique({
        where: { id: llmProviderId },
      });

      if (aiProvider) {
        const provider = getLlmProviderImpl(aiProvider.provider);
        const model = aiProvider.providerModelId;

        for (const podcast of unmatchedSports) {
          try {
            const result = await provider.complete(
              [
                {
                  role: "user",
                  content: buildGeoClassificationPrompt(
                    podcast.title ?? "",
                    podcast.description ?? ""
                  ),
                },
              ],
              model,
              256,
              env,
              {
                system:
                  "You classify podcasts by US geographic market. Return valid JSON only.",
              }
            );

            const parsed = parseGeoClassificationResponse(result.text);
            if (parsed.length > 0) {
              await writeGeoProfiles(prisma, podcast.id, parsed, "llm");
              pass2Matched++;
            }
          } catch (err) {
            await logger.warn("geo_tagging_llm_error", {
              podcastId: podcast.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } else {
        await logger.warn("geo_tagging_no_provider", {
          llmProviderId,
          message: "AiProvider not found",
        });
      }
    } else {
      await logger.info("geo_tagging_llm_skipped", {
        unmatchedSports: unmatchedSports.length,
        message: "No LLM provider configured for geo classification",
      });
    }
  }

  await logger.info("geo_tagging_complete", {
    processed: podcasts.length,
    pass1Matched,
    pass2Matched,
    pass2Attempted,
  });

  return {
    processed: podcasts.length,
    pass1Matched,
    pass2Matched,
    pass2Attempted,
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

function buildGeoClassificationPrompt(title: string, description: string): string {
  return `Analyze this podcast and determine if it targets a specific US geographic market.

Title: ${title}
Description: ${description}

If this podcast targets a specific US city or region, return JSON:
[{"city": "<city name>", "state": "<full state name>", "scope": "city"|"state"|"regional", "confidence": 0.0-1.0}]

For state-level matches, set city to an empty string "".

Examples:
- City-level: [{"city": "Chicago", "state": "Illinois", "scope": "city", "confidence": 0.9}]
- State-level: [{"city": "", "state": "Texas", "scope": "state", "confidence": 0.7}]

If the podcast is NOT geographically specific, return: []`;
}

function parseGeoClassificationResponse(text: string): GeoMatch[] {
  try {
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
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
  } catch {
    return [];
  }
}
