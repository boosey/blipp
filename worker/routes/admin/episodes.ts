import { Hono } from "hono";
import type { Env } from "../../types";
import { PIPELINE_STAGE_NAMES } from "../../lib/constants";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { slugify, uniqueSlug } from "../../lib/slugify";
import type { BriefingRequestItem, OrchestratorMessage } from "../../lib/queue-messages";

const episodesRoutes = new Hono<{ Bindings: Env }>();

episodesRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - Paginated episode list
episodesRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const podcastId = c.req.query("podcastId");
  const search = c.req.query("search");
  const orderBy = parseSort(c, "publishedAt", ["publishedAt", "title", "createdAt", "durationSeconds"]);

  const where: Record<string, unknown> = {};
  if (podcastId) where.podcastId = podcastId;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [episodes, total] = await Promise.all([
    prisma.episode.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        podcast: { select: { title: true, imageUrl: true } },
        distillation: { select: { status: true } },
        _count: { select: { clips: true } },
      },
    }),
    prisma.episode.count({ where }),
  ]);

  const data = episodes.map((e: any) => {
    let pipelineStatus: string = "pending";
    if (e.distillation) {
      const ds = e.distillation.status;
      if (ds === "COMPLETED") pipelineStatus = e._count.clips > 0 ? "completed" : "generating_clips";
      else if (ds === "FAILED") pipelineStatus = "failed";
      else if (ds === "FETCHING_TRANSCRIPT") pipelineStatus = "transcribing";
      else if (ds === "EXTRACTING_CLAIMS") pipelineStatus = "distilling";
    }

    return {
      id: e.id,
      podcastId: e.podcastId,
      podcastTitle: e.podcast.title,
      podcastImageUrl: e.podcast.imageUrl,
      title: e.title,
      description: e.description,
      audioUrl: e.audioUrl,
      publishedAt: e.publishedAt.toISOString(),
      durationSeconds: e.durationSeconds,
      transcriptUrl: e.transcriptUrl,
      pipelineStatus,
      clipCount: e._count.clips,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  });

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id - Episode detail
episodesRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const episode = await prisma.episode.findUnique({
    where: { id: c.req.param("id") },
    include: {
      podcast: { select: { id: true, title: true, imageUrl: true } },
      distillation: {
        include: {
          clips: {
            orderBy: { durationTier: "asc" },
          },
        },
      },
      clips: { orderBy: { durationTier: "asc" } },
    },
  });

  if (!episode) return c.json({ error: "Episode not found" }, 404);

  // Find feed item deliveries for this episode
  const feedItemDeliveries = await prisma.feedItem.findMany({
    where: { episodeId: episode.id },
    select: {
      id: true,
      userId: true,
      status: true,
      source: true,
      durationTier: true,
      listened: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get pipeline trace - jobs + steps for this episode
  let pipelineJobs: any[] = [];
  try {
    pipelineJobs = await prisma.pipelineJob.findMany({
      where: { episodeId: episode.id },
      orderBy: { createdAt: "desc" },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
  } catch {
    // PipelineJob table may not exist
  }

  // Build stage trace from steps across all jobs for this episode
  const stageKeys = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"] as const;
  const stages = stageKeys.map((stage) => {
    // Find the most recent step for this stage across all jobs
    let latestStep: any | undefined;
    for (const job of pipelineJobs) {
      const step = job.steps.find((s: any) => s.stage === stage);
      if (step && (!latestStep || step.createdAt > latestStep.createdAt)) {
        latestStep = step;
      }
    }

    if (!latestStep) {
      return {
        stage,
        name: PIPELINE_STAGE_NAMES[stage] ?? stage,
        status: "pending" as const,
      };
    }

    return {
      stage,
      name: PIPELINE_STAGE_NAMES[stage] ?? stage,
      status: latestStep.status === "COMPLETED" ? "completed" as const
        : latestStep.status === "FAILED" ? "failed" as const
        : latestStep.status === "IN_PROGRESS" ? "in_progress" as const
        : latestStep.status === "SKIPPED" ? "skipped" as const
        : "pending" as const,
      startedAt: latestStep.startedAt?.toISOString(),
      completedAt: latestStep.completedAt?.toISOString(),
      durationMs: latestStep.durationMs ?? undefined,
      cost: latestStep.cost ?? undefined,
      model: latestStep.model ?? undefined,
      inputTokens: latestStep.inputTokens ?? undefined,
      outputTokens: latestStep.outputTokens ?? undefined,
    };
  });

  return c.json({
    data: {
      id: episode.id,
      podcastId: episode.podcastId,
      podcastTitle: episode.podcast.title,
      podcastImageUrl: episode.podcast.imageUrl,
      title: episode.title,
      description: episode.description,
      audioUrl: episode.audioUrl,
      publishedAt: episode.publishedAt.toISOString(),
      durationSeconds: episode.durationSeconds,
      transcriptUrl: episode.transcriptUrl,
      createdAt: episode.createdAt.toISOString(),
      updatedAt: episode.updatedAt.toISOString(),
      distillation: episode.distillation
        ? {
            id: episode.distillation.id,
            status: episode.distillation.status,
            createdAt: episode.distillation.createdAt.toISOString(),
          }
        : null,
      clips: episode.clips.map((cl: any) => ({
        id: cl.id,
        durationTier: cl.durationTier,
        status: cl.status,
        wordCount: cl.wordCount,
        actualSeconds: cl.actualSeconds,
        audioUrl: cl.audioUrl,
        createdAt: cl.createdAt.toISOString(),
      })),
      feedItemDeliveries: feedItemDeliveries.map((fi: any) => ({
        id: fi.id,
        userId: fi.userId,
        status: fi.status,
        source: fi.source,
        durationTier: fi.durationTier,
        listened: fi.listened,
        createdAt: fi.createdAt.toISOString(),
      })),
      pipelineTrace: { episodeId: episode.id, stages },
    },
  });
});

// POST /:id/reprocess - Dispatch episode to transcription queue for reprocessing
episodesRoutes.post("/:id/reprocess", async (c) => {
  const prisma = c.get("prisma") as any;
  const episode = await prisma.episode.findUnique({
    where: { id: c.req.param("id") },
    select: { id: true },
  });

  if (!episode) return c.json({ error: "Episode not found" }, 404);

  try {
    await c.env.TRANSCRIPTION_QUEUE.send({
      type: "manual",
      episodeId: episode.id,
    });

    return c.json({ data: { episodeId: episode.id, status: "dispatched" } }, 201);
  } catch {
    return c.json({ error: "Transcription queue not available" }, 503);
  }
});

// GET /aging-candidates - List episodes eligible for deletion
episodesRoutes.get("/aging-candidates", async (c) => {
  const prisma = c.get("prisma") as any;
  const maxAgeDays = parseInt(c.req.query("maxAgeDays") ?? "180");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const candidates = await prisma.episode.findMany({
    where: {
      publishedAt: { lt: cutoff },
      feedItems: { none: { status: { in: ["PENDING", "PROCESSING"] } } },
    },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      durationSeconds: true,
      podcast: { select: { title: true } },
      _count: { select: { clips: true, feedItems: true } },
    },
    orderBy: { publishedAt: "asc" },
    take: 100,
  });

  const data = candidates.map((ep: any) => ({
    id: ep.id,
    title: ep.title,
    podcastTitle: ep.podcast.title,
    publishedAt: ep.publishedAt.toISOString(),
    ageDays: Math.floor((Date.now() - ep.publishedAt.getTime()) / (1000 * 60 * 60 * 24)),
    clipCount: ep._count.clips,
    feedItemCount: ep._count.feedItems,
  }));

  return c.json({ data });
});

// POST /aging-execute - Hard delete selected episodes + R2 cleanup
episodesRoutes.post("/aging-execute", async (c) => {
  const prisma = c.get("prisma") as any;
  const { episodeIds } = await c.req.json<{ episodeIds: string[] }>();

  if (!episodeIds?.length) {
    return c.json({ error: "episodeIds required" }, 400);
  }

  // Collect R2 keys before deletion
  const workProducts = await prisma.workProduct.findMany({
    where: { episodeId: { in: episodeIds } },
    select: { r2Key: true },
  });

  const clips = await prisma.clip.findMany({
    where: { episodeId: { in: episodeIds } },
    select: { audioKey: true },
  });

  const r2Keys = [
    ...workProducts.map((wp: any) => wp.r2Key).filter(Boolean),
    ...clips.map((cl: any) => cl.audioKey).filter(Boolean),
  ];

  // Delete R2 objects
  let r2Deleted = 0;
  for (const key of r2Keys) {
    try {
      await c.env.R2.delete(key);
      r2Deleted++;
    } catch {
      // Best-effort R2 cleanup
    }
  }

  // Delete episodes (Prisma cascades: distillations, clips, feedItems, pipelineJobs, workProducts)
  const result = await prisma.episode.deleteMany({
    where: { id: { in: episodeIds } },
  });

  return c.json({
    data: {
      episodesDeleted: result.count,
      r2ObjectsDeleted: r2Deleted,
    },
  });
});

// POST /public-pages/bulk - Bulk toggle publicPage on episodes
episodesRoutes.post("/public-pages/bulk", async (c) => {
  const prisma = c.get("prisma") as any;
  const { episodeIds, publicPage } = await c.req.json<{ episodeIds: string[]; publicPage: boolean }>();

  if (!episodeIds?.length || typeof publicPage !== "boolean") {
    return c.json({ error: "episodeIds (string[]) and publicPage (boolean) required" }, 400);
  }

  const result = await prisma.episode.updateMany({
    where: { id: { in: episodeIds } },
    data: { publicPage },
  });

  return c.json({ data: { updated: result.count } });
});

// POST /public-pages/bulk-by-podcast - Enable publicPage for all episodes of given podcasts that have completed clips with narrativeText
episodesRoutes.post("/public-pages/bulk-by-podcast", async (c) => {
  const prisma = c.get("prisma") as any;
  const { podcastIds, publicPage } = await c.req.json<{ podcastIds: string[]; publicPage?: boolean }>();

  if (!podcastIds?.length) {
    return c.json({ error: "podcastIds (string[]) required" }, 400);
  }

  const enable = publicPage !== false;

  if (enable) {
    // Only enable for episodes that have at least one COMPLETED clip with narrativeText
    const eligibleEpisodes = await prisma.episode.findMany({
      where: {
        podcastId: { in: podcastIds },
        publicPage: false,
        slug: { not: null },
        clips: { some: { status: "COMPLETED", narrativeText: { not: null } } },
      },
      select: { id: true },
    });

    if (eligibleEpisodes.length === 0) {
      return c.json({ data: { updated: 0 } });
    }

    const result = await prisma.episode.updateMany({
      where: { id: { in: eligibleEpisodes.map((e: any) => e.id) } },
      data: { publicPage: true },
    });

    return c.json({ data: { updated: result.count } });
  } else {
    // Disable all public pages for these podcasts
    const result = await prisma.episode.updateMany({
      where: { podcastId: { in: podcastIds }, publicPage: true },
      data: { publicPage: false },
    });

    return c.json({ data: { updated: result.count } });
  }
});

// POST /backfill-slugs - Self-heal any podcast/episode rows missing a slug
// (ingestion writes slugs automatically in feed-refresh; this covers stragglers)
// then flip publicPage=true for episodes eligible for an SEO page.
//
// Bounded concurrency keeps this under the Worker CPU budget. For large
// backfills, prefer scripts/backfill-slugs-prod.ts from a local machine.
episodesRoutes.post("/backfill-slugs", async (c) => {
  const prisma = c.get("prisma") as any;
  const CONCURRENCY = 10;
  const MAX_EPISODES = 5000; // safety cap per invocation

  async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
    let idx = 0;
    const runners = Array.from({ length: CONCURRENCY }, async () => {
      while (idx < items.length) {
        const i = idx++;
        await worker(items[i]!);
      }
    });
    await Promise.all(runners);
  }

  // 1. Podcast slugs
  const podcastsWithoutSlug: Array<{ id: string; title: string }> = await prisma.podcast.findMany({
    where: { slug: null },
    select: { id: true, title: true },
  });
  const existingPodcastSlugs: Array<{ slug: string }> = await prisma.podcast.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });
  const podcastSlugSet = new Set<string>(existingPodcastSlugs.map((p) => p.slug));
  const podcastWrites = podcastsWithoutSlug.map((p) => {
    const slug = uniqueSlug(p.title, podcastSlugSet, p.id);
    podcastSlugSet.add(slug);
    return { id: p.id, slug };
  });
  await runPool(podcastWrites, async ({ id, slug }) => {
    await prisma.podcast.update({ where: { id }, data: { slug } });
  });

  // 2. Episode slugs (scoped per podcast, capped)
  const episodesWithoutSlug: Array<{ id: string; title: string; podcastId: string }> =
    await prisma.episode.findMany({
      where: { slug: null },
      select: { id: true, title: true, podcastId: true },
      take: MAX_EPISODES,
    });

  const affectedPodcastIds = [...new Set(episodesWithoutSlug.map((e) => e.podcastId))];
  const existingEpisodeSlugs: Array<{ podcastId: string; slug: string }> =
    affectedPodcastIds.length > 0
      ? await prisma.episode.findMany({
          where: { podcastId: { in: affectedPodcastIds }, slug: { not: null } },
          select: { podcastId: true, slug: true },
        })
      : [];

  const byPodcast = new Map<string, Set<string>>();
  for (const r of existingEpisodeSlugs) {
    let set = byPodcast.get(r.podcastId);
    if (!set) { set = new Set(); byPodcast.set(r.podcastId, set); }
    set.add(r.slug);
  }

  const episodeWrites = episodesWithoutSlug.map((e) => {
    let set = byPodcast.get(e.podcastId);
    if (!set) { set = new Set(); byPodcast.set(e.podcastId, set); }
    const slug = uniqueSlug(e.title, set, e.id);
    set.add(slug);
    return { id: e.id, slug };
  });
  await runPool(episodeWrites, async ({ id, slug }) => {
    await prisma.episode.update({ where: { id }, data: { slug } });
  });

  // 3. Flip publicPage=true for eligible episodes (distillation is the gate)
  const result = await prisma.episode.updateMany({
    where: {
      publicPage: false,
      slug: { not: null },
      podcast: { slug: { not: null }, deliverable: true },
      OR: [
        { distillation: { status: "COMPLETED" } },
        { clips: { some: { status: "COMPLETED" } } },
      ],
    },
    data: { publicPage: true },
  });

  return c.json({
    data: {
      podcastSlugsBackfilled: podcastWrites.length,
      episodeSlugsBackfilled: episodeWrites.length,
      mayHaveMoreEpisodes: episodesWithoutSlug.length === MAX_EPISODES,
      publicPagesEnabled: result.count,
    },
  });
});

// POST /distill-apple-latest - One-time SEO backfill: for every deliverable
// Apple-sourced podcast, run the latest 3 episodes through transcription +
// distillation so SEO pages get enabled. Uses a seoOnly BriefingRequest that
// short-circuits the pipeline at distillation (no narrative/audio/assembly).
// Skips episodes with a COMPLETED distillation. Safe to re-run.
episodesRoutes.post("/distill-apple-latest", async (c) => {
  const prisma = c.get("prisma") as any;
  const PODCAST_LIMIT = 500;
  const EPISODES_PER_PODCAST = 3;
  const PODCASTS_PER_REQUEST = 10; // small batches (~30 items) to avoid queue stampede
  const STAGGER_DELAY_MS = 30_000; // 30s between batches — lets transcription drain

  const adminUser: { id: string } | null = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) return c.json({ error: "No admin user found to own the backfill request" }, 400);

  const podcasts: Array<{ id: string }> = await prisma.podcast.findMany({
    where: {
      appleId: { not: null },
      deliverable: true,
      slug: { not: null },
    },
    select: { id: true },
    take: PODCAST_LIMIT,
    orderBy: { createdAt: "asc" },
  });

  const items: BriefingRequestItem[] = [];
  let podcastsWithNoEligibleEpisodes = 0;
  let episodesSkipped = 0;

  for (const pod of podcasts) {
    const episodes: Array<{ id: string; distillation: { status: string } | null }> =
      await prisma.episode.findMany({
        where: { podcastId: pod.id, slug: { not: null } },
        select: { id: true, distillation: { select: { status: true } } },
        orderBy: { publishedAt: "desc" },
        take: EPISODES_PER_PODCAST,
      });

    let added = 0;
    for (const ep of episodes) {
      if (ep.distillation?.status === "COMPLETED") {
        episodesSkipped++;
        continue;
      }
      items.push({
        podcastId: pod.id,
        episodeId: ep.id,
        durationTier: 5,
        useLatest: false,
      });
      added++;
    }
    if (added === 0) podcastsWithNoEligibleEpisodes++;
  }

  if (items.length === 0) {
    return c.json({
      data: {
        podcastsScanned: podcasts.length,
        requestsCreated: 0,
        episodesQueued: 0,
        episodesSkipped,
        podcastLimitReached: podcasts.length === PODCAST_LIMIT,
      },
    });
  }

  // Chunk items into multiple BriefingRequests, grouped by podcast so each
  // request covers ~PODCASTS_PER_REQUEST podcasts. This keeps each orchestrator
  // evaluate message bounded and avoids piling up too many jobs in one txn.
  const itemsByPodcast = new Map<string, BriefingRequestItem[]>();
  for (const it of items) {
    let list = itemsByPodcast.get(it.podcastId);
    if (!list) { list = []; itemsByPodcast.set(it.podcastId, list); }
    list.push(it);
  }
  const podcastIds = [...itemsByPodcast.keys()];
  const requestIds: string[] = [];
  const chunks: Array<{ reqId: string; itemCount: number }> = [];

  // Create all BriefingRequests up front so we can return IDs immediately
  for (let i = 0; i < podcastIds.length; i += PODCASTS_PER_REQUEST) {
    const chunkPodcasts = podcastIds.slice(i, i + PODCASTS_PER_REQUEST);
    const chunkItems = chunkPodcasts.flatMap((pid) => itemsByPodcast.get(pid)!);

    const req = await prisma.briefingRequest.create({
      data: {
        userId: adminUser.id,
        status: "PENDING",
        targetMinutes: 5,
        items: chunkItems as any,
        seoOnly: true,
      },
      select: { id: true },
    });
    requestIds.push(req.id);
    chunks.push({ reqId: req.id, itemCount: chunkItems.length });
  }

  // Send first batch immediately, stagger the rest via waitUntil so the
  // HTTP response returns right away while batches trickle into the queue.
  const sendBatch = async (reqId: string) => {
    const msg: OrchestratorMessage = {
      requestId: reqId,
      action: "evaluate",
      correlationId: reqId,
    };
    await c.env.ORCHESTRATOR_QUEUE.send(msg);
  };

  // First batch — send now
  await sendBatch(chunks[0].reqId);

  // Remaining batches — stagger with delays in the background
  if (chunks.length > 1) {
    c.executionCtx.waitUntil(
      (async () => {
        for (let i = 1; i < chunks.length; i++) {
          await new Promise((r) => setTimeout(r, STAGGER_DELAY_MS * i));
          await sendBatch(chunks[i].reqId);
        }
      })()
    );
  }

  return c.json({
    data: {
      podcastsScanned: podcasts.length,
      podcastsWithNoEligibleEpisodes,
      requestsCreated: requestIds.length,
      episodesQueued: items.length,
      episodesSkipped,
      requestIds,
      staggerDelayMs: STAGGER_DELAY_MS,
      estimatedCompletionMinutes: Math.ceil((chunks.length * STAGGER_DELAY_MS) / 60_000),
      podcastLimitReached: podcasts.length === PODCAST_LIMIT,
    },
  });
});

export { episodesRoutes };
