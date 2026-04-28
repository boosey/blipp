/**
 * Sunday Pulse digest cron handler (Phase 4 / Task 8).
 *
 * Hard editorial gate (Phase 4.0 Rule 6): no-op until ≥6 PUBLISHED PulsePosts
 * AND ≥4 of those have `mode = HUMAN`. The intent is to establish a real
 * human-written editorial voice before any AI-assisted draft enters the queue.
 *
 * On run: clusters claim embeddings from the last 7 days of completed
 * distillations using greedy cosine clustering, picks the largest qualifying
 * cluster, and asks the configured LLM to draft a synthesis post. Output is
 * always created as `status: DRAFT, mode: AI_ASSISTED` — admin must review,
 * edit (3:1 ratio enforcement, 50-word per-source quote cap, 800-1500 word
 * count, Sources footer) before it can be published.
 *
 * Reuses the "narrative" AIStage model chain — Pulse generation is a long-form
 * narrative-style task. If the user later needs Pulse-specific tuning, split
 * to its own stage.
 */
import { cosineSimilarityVec, averageEmbeddings } from "../lib/embeddings";
import { resolveModelChain } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, getWorkProduct } from "../lib/work-products";
import type { CronLogger } from "../lib/cron/runner";
import type { Env } from "../types";

export const PULSE_GATE_MIN_PUBLISHED = 6;
export const PULSE_GATE_MIN_HUMAN_PUBLISHED = 4;
export const PULSE_CLUSTER_COSINE_THRESHOLD = 0.65;
export const PULSE_MIN_CLUSTER_SIZE = 3;
export const PULSE_MAX_SOURCES_PER_POST = 5;
export const PULSE_MAX_CLAIMS_PER_SOURCE = 3;
export const PULSE_LLM_STAGE = "narrative" as const;
export const PULSE_WINDOW_DAYS = 7;

export interface PulseGenerateResult {
  generated: boolean;
  reason?: string;
  postId?: string;
  slug?: string;
  topic?: string;
  clusterSize?: number;
  publishedCount?: number;
  humanPublishedCount?: number;
}

interface SourceEpisode {
  episodeId: string;
  episodeSlug: string | null;
  episodeTitle: string;
  podcastSlug: string | null;
  podcastTitle: string;
  claims: any[];
}

/**
 * Run a single Pulse digest pass. Idempotent against multiple invocations
 * within the same week — caller is expected to gate by cron expression.
 */
export async function runPulseGenerate(
  prisma: any,
  env: Env,
  log: CronLogger
): Promise<Record<string, unknown> & PulseGenerateResult> {
  // 1. Hard editorial gate — Phase 4.0 Rule 6.
  const [publishedCount, humanPublishedCount] = await Promise.all([
    prisma.pulsePost.count({ where: { status: "PUBLISHED" } }),
    prisma.pulsePost.count({ where: { status: "PUBLISHED", mode: "HUMAN" } }),
  ]);

  if (
    publishedCount < PULSE_GATE_MIN_PUBLISHED ||
    humanPublishedCount < PULSE_GATE_MIN_HUMAN_PUBLISHED
  ) {
    await log.info("pulse_generate_gated", {
      publishedCount,
      humanPublishedCount,
      thresholds: {
        published: PULSE_GATE_MIN_PUBLISHED,
        humanPublished: PULSE_GATE_MIN_HUMAN_PUBLISHED,
      },
    });
    return {
      generated: false,
      reason: "editorial_threshold_not_met",
      publishedCount,
      humanPublishedCount,
    };
  }

  // 2. Pick a READY editor to attribute the draft to. The schema requires
  //    `editorId` (FK with onDelete: Restrict) so we cannot create a
  //    placeholder editor here — admin work creates editors, the cron only
  //    attributes drafts to existing ones.
  const editor = await prisma.pulseEditor.findFirst({
    where: { status: "READY" },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true },
  });
  if (!editor) {
    await log.warn("pulse_generate_no_ready_editor");
    return { generated: false, reason: "no_ready_editor" };
  }

  // 3. Load last 7 days of completed distillations that have an embedding.
  const windowStart = new Date(Date.now() - PULSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const distillations = await prisma.distillation.findMany({
    where: {
      status: "COMPLETED",
      updatedAt: { gte: windowStart },
      claimsEmbedding: { not: null },
    },
    select: {
      id: true,
      episodeId: true,
      claimsEmbedding: true,
      updatedAt: true,
      episode: {
        select: {
          id: true,
          slug: true,
          title: true,
          podcast: { select: { slug: true, title: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (distillations.length < PULSE_MIN_CLUSTER_SIZE) {
    await log.info("pulse_generate_insufficient_corpus", {
      distillationCount: distillations.length,
      minRequired: PULSE_MIN_CLUSTER_SIZE,
    });
    return { generated: false, reason: "insufficient_corpus" };
  }

  // 4. Greedy cosine clustering. Each distillation joins the first cluster
  //    whose centroid is within threshold; otherwise it seeds a new cluster.
  type Item = { distillation: (typeof distillations)[number]; vec: number[] };
  type Cluster = { items: Item[]; centroid: number[] };

  const items: Item[] = [];
  for (const d of distillations) {
    const emb = d.claimsEmbedding as unknown;
    if (Array.isArray(emb) && emb.length > 0 && typeof emb[0] === "number") {
      items.push({ distillation: d, vec: emb as number[] });
    }
  }

  const clusters: Cluster[] = [];
  for (const it of items) {
    let placed = false;
    for (const cluster of clusters) {
      const sim = cosineSimilarityVec(cluster.centroid, it.vec);
      if (sim != null && sim >= PULSE_CLUSTER_COSINE_THRESHOLD) {
        cluster.items.push(it);
        const centroid = averageEmbeddings(cluster.items.map((x) => x.vec));
        if (centroid) cluster.centroid = centroid;
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ items: [it], centroid: it.vec });
  }

  clusters.sort((a, b) => b.items.length - a.items.length);
  const winner = clusters[0];
  if (!winner || winner.items.length < PULSE_MIN_CLUSTER_SIZE) {
    await log.info("pulse_generate_no_qualifying_cluster", {
      clusterCount: clusters.length,
      largestSize: winner?.items.length ?? 0,
      minRequired: PULSE_MIN_CLUSTER_SIZE,
    });
    return { generated: false, reason: "no_qualifying_cluster" };
  }

  // 5. Resolve LLM chain. Reuses the "narrative" stage model config.
  const modelChain = await resolveModelChain(prisma, PULSE_LLM_STAGE);
  if (modelChain.length === 0) {
    await log.warn("pulse_generate_no_llm_chain", { stage: PULSE_LLM_STAGE });
    return { generated: false, reason: "no_llm_configured" };
  }
  const resolved = modelChain[0];
  const llm = getLlmProviderImpl(resolved.provider);

  // 6. Hydrate top claims per source from R2.
  const topMembers = winner.items.slice(0, PULSE_MAX_SOURCES_PER_POST);
  const sources: SourceEpisode[] = await Promise.all(
    topMembers.map(async (it) => {
      const r2Key = wpKey({ type: "CLAIMS", episodeId: it.distillation.episodeId });
      let claims: any[] = [];
      try {
        const buf = await getWorkProduct(env.R2, r2Key);
        if (buf) claims = JSON.parse(new TextDecoder().decode(buf)) as any[];
      } catch (err) {
        await log.warn("pulse_generate_claims_load_failed", {
          episodeId: it.distillation.episodeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return {
        episodeId: it.distillation.episodeId,
        episodeSlug: it.distillation.episode?.slug ?? null,
        episodeTitle: it.distillation.episode?.title ?? "Untitled episode",
        podcastSlug: it.distillation.episode?.podcast?.slug ?? null,
        podcastTitle: it.distillation.episode?.podcast?.title ?? "Unknown podcast",
        claims: claims.slice(0, PULSE_MAX_CLAIMS_PER_SOURCE),
      };
    })
  );

  // 7. Build prompt + draft via LLM. The post is a draft — admin rewrites for
  //    voice, ratio, and quote-cap compliance before it can publish.
  const sourcesBlock = sources
    .map((s, i) => {
      const claimList = s.claims
        .map((c) => `- ${String(c?.claim ?? "").trim()}`)
        .filter((line) => line !== "- ")
        .join("\n");
      return `Source ${i + 1}: "${s.episodeTitle}" (from ${s.podcastTitle})\n${claimList || "- (no claims available)"}`;
    })
    .join("\n\n");

  const sourcesIndex = sources
    .map((s) => `- ${s.podcastTitle} / ${s.episodeTitle} → /p/${s.podcastSlug ?? "unknown"}/${s.episodeSlug ?? "unknown"}`)
    .join("\n");

  const system =
    "You are drafting a synthesis post for the Blipp Pulse blog. " +
    "Output is a DRAFT — a human editor will rewrite for voice and accuracy. " +
    "Identify ONE topical thread across the sources and develop it as original analysis. " +
    "Do NOT reproduce transcripts or quote more than ~30 words from any single source. " +
    "Do NOT fabricate claims that aren't present in the sources.";

  const user =
    `Recent podcast episodes covered these topics:\n\n${sourcesBlock}\n\n` +
    `Draft an 800–1500 word markdown post that synthesizes one common thread. ` +
    `Open with a hook (no fluff intro). End with a "## Sources" section listing each source as ` +
    `"- [Episode Title — Podcast](/p/{podcast-slug}/{episode-slug})". Use these slugs:\n` +
    sourcesIndex;

  let llmResult;
  try {
    llmResult = await llm.complete(
      [{ role: "user", content: user }],
      resolved.providerModelId,
      4096,
      env,
      { system }
    );
  } catch (err) {
    await log.error("pulse_generate_llm_failed", {
      provider: resolved.provider,
      model: resolved.providerModelId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { generated: false, reason: "llm_error" };
  }

  // 8. Insert the DRAFT post and link cited episodes.
  const dateStamp = new Date().toISOString().slice(0, 10);
  const uniq = winner.items[0].distillation.episodeId.slice(-6);
  const slug = `pulse-draft-${dateStamp}-${uniq}`;
  const fallbackTitle = `Pulse digest draft — ${dateStamp}`;
  const extractedTitle = extractMarkdownTitle(llmResult.text);
  const title = extractedTitle ?? fallbackTitle;

  const post = await prisma.pulsePost.create({
    data: {
      slug,
      title,
      body: llmResult.text,
      status: "DRAFT",
      mode: "AI_ASSISTED",
      editorId: editor.id,
      topicTags: [],
      generationMeta: {
        mode: "ai_assisted",
        provider: resolved.provider,
        model: llmResult.model,
        inputTokens: llmResult.inputTokens,
        outputTokens: llmResult.outputTokens,
        clusterSize: winner.items.length,
        clusterEpisodeIds: winner.items.map((i) => i.distillation.episodeId),
        sourceEpisodeIds: sources.map((s) => s.episodeId),
        generatedAt: new Date().toISOString(),
        weeklyWindow: { from: windowStart.toISOString(), to: new Date().toISOString() },
        editorialGate: { publishedCount, humanPublishedCount },
      },
    },
    select: { id: true, slug: true, title: true },
  });

  if (sources.length > 0) {
    await prisma.episodePulsePost.createMany({
      data: sources.map((s, i) => ({
        episodeId: s.episodeId,
        pulsePostId: post.id,
        displayOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  await log.info("pulse_generate_drafted", {
    postId: post.id,
    slug: post.slug,
    clusterSize: winner.items.length,
    sourceCount: sources.length,
    provider: resolved.provider,
    model: llmResult.model,
  });

  return {
    generated: true,
    postId: post.id,
    slug: post.slug,
    topic: post.title,
    clusterSize: winner.items.length,
  };
}

function extractMarkdownTitle(md: string): string | null {
  if (!md) return null;
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim().slice(0, 200);
  }
  return null;
}
