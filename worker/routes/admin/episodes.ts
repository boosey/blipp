import { Hono } from "hono";
import type { Env } from "../../types";
import { PIPELINE_STAGE_NAMES } from "../../lib/constants";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { slugify, uniqueSlug } from "../../lib/slugify";

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

// POST /backfill-slugs - Generate slugs for all podcasts/episodes missing them, then set publicPage for eligible episodes
episodesRoutes.post("/backfill-slugs", async (c) => {
  const prisma = c.get("prisma") as any;

  // 1. Backfill podcast slugs
  const podcastsWithoutSlug = await prisma.podcast.findMany({
    where: { slug: null },
    select: { id: true, title: true },
  });
  const existingPodcastSlugs = await prisma.podcast.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });
  const podcastSlugSet = new Set(existingPodcastSlugs.map((p: any) => p.slug as string));

  let podcastsUpdated = 0;
  for (const podcast of podcastsWithoutSlug) {
    const slug = uniqueSlug(podcast.title, podcastSlugSet);
    await prisma.podcast.update({ where: { id: podcast.id }, data: { slug } });
    podcastSlugSet.add(slug);
    podcastsUpdated++;
  }

  // 2. Backfill episode slugs (per podcast)
  const podcastsWithEpisodes = await prisma.podcast.findMany({
    select: { id: true },
  });

  let episodeSlugsUpdated = 0;
  for (const podcast of podcastsWithEpisodes) {
    const episodes = await prisma.episode.findMany({
      where: { podcastId: podcast.id },
      select: { id: true, title: true, slug: true },
    });
    const epSlugSet = new Set(episodes.map((e: any) => e.slug).filter(Boolean) as string[]);

    for (const ep of episodes) {
      if (ep.slug) continue;
      const slug = uniqueSlug(ep.title, epSlugSet);
      await prisma.episode.update({ where: { id: ep.id }, data: { slug } });
      epSlugSet.add(slug);
      episodeSlugsUpdated++;
    }
  }

  // 3. Set publicPage=true for episodes with completed clips + narrative text + slug
  const eligible = await prisma.episode.findMany({
    where: {
      publicPage: false,
      slug: { not: null },
      clips: { some: { status: "COMPLETED", narrativeText: { not: null } } },
      podcast: { slug: { not: null }, deliverable: true },
    },
    select: { id: true },
  });

  let publicPagesEnabled = 0;
  if (eligible.length > 0) {
    const result = await prisma.episode.updateMany({
      where: { id: { in: eligible.map((e: any) => e.id) } },
      data: { publicPage: true },
    });
    publicPagesEnabled = result.count;
  }

  return c.json({
    data: {
      podcastSlugsBackfilled: podcastsUpdated,
      episodeSlugsBackfilled: episodeSlugsUpdated,
      publicPagesEnabled,
    },
  });
});

export { episodesRoutes };
