import { Hono } from "hono";
import type { Env } from "../../types";
import { STAGE_DISPLAY_NAMES } from "../../lib/config";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

const episodesRoutes = new Hono<{ Bindings: Env }>();

episodesRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - Paginated episode list
episodesRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const podcastId = c.req.query("podcastId");
  const search = c.req.query("search");
  const orderBy = parseSort(c, "publishedAt");

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
        name: STAGE_DISPLAY_NAMES[stage] ?? stage,
        status: "pending" as const,
      };
    }

    return {
      stage,
      name: STAGE_DISPLAY_NAMES[stage] ?? stage,
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

export { episodesRoutes };
