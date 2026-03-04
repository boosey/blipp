import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation",
};

const episodesRoutes = new Hono<{ Bindings: Env }>();

episodesRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - Paginated episode list
episodesRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const podcastId = c.req.query("podcastId");
    const search = c.req.query("search");
    const sort = c.req.query("sort") ?? "publishedAt:desc";

    const where: Record<string, unknown> = {};
    if (podcastId) where.podcastId = podcastId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [sortField, sortDir] = sort.split(":");
    const orderBy: Record<string, string> = { [sortField || "publishedAt"]: sortDir || "desc" };

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

    const data = episodes.map((e) => {
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

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /:id - Episode detail
episodesRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
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

    // Find briefing appearances via BriefingSegment -> Clip
    const clipIds = episode.clips.map((cl) => cl.id);
    const briefingSegments = clipIds.length > 0
      ? await prisma.briefingSegment.findMany({
          where: { clipId: { in: clipIds } },
          include: {
            briefing: {
              select: { id: true, userId: true, status: true, createdAt: true },
            },
          },
        })
      : [];

    // Get pipeline trace - jobs + steps for this episode
    let pipelineJobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany<{ include: { steps: true } }>>> = [];
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
    const stageKeys = ["TRANSCRIPTION", "DISTILLATION", "CLIP_GENERATION"] as const;
    const stages = stageKeys.map((stage) => {
      // Find the most recent step for this stage across all jobs
      let latestStep: (typeof pipelineJobs)[number]["steps"][number] | undefined;
      for (const job of pipelineJobs) {
        const step = job.steps.find((s) => s.stage === stage);
        if (step && (!latestStep || step.createdAt > latestStep.createdAt)) {
          latestStep = step;
        }
      }

      if (!latestStep) {
        return {
          stage,
          name: STAGE_NAMES[stage] ?? stage,
          status: "pending" as const,
        };
      }

      return {
        stage,
        name: STAGE_NAMES[stage] ?? stage,
        status: latestStep.status === "COMPLETED" ? "completed" as const
          : latestStep.status === "FAILED" ? "failed" as const
          : latestStep.status === "IN_PROGRESS" ? "in_progress" as const
          : latestStep.status === "SKIPPED" ? "skipped" as const
          : "pending" as const,
        startedAt: latestStep.startedAt?.toISOString(),
        completedAt: latestStep.completedAt?.toISOString(),
        durationMs: latestStep.durationMs ?? undefined,
        cost: latestStep.cost ?? undefined,
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
        clips: episode.clips.map((cl) => ({
          id: cl.id,
          durationTier: cl.durationTier,
          status: cl.status,
          wordCount: cl.wordCount,
          actualSeconds: cl.actualSeconds,
          audioUrl: cl.audioUrl,
          createdAt: cl.createdAt.toISOString(),
        })),
        briefingAppearances: briefingSegments.map((seg) => ({
          briefingId: seg.briefing.id,
          userId: seg.briefing.userId,
          status: seg.briefing.status,
          createdAt: seg.briefing.createdAt.toISOString(),
        })),
        pipelineTrace: { episodeId: episode.id, stages },
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /:id/reprocess - Dispatch episode to transcription queue for reprocessing
episodesRoutes.post("/:id/reprocess", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
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
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { episodesRoutes };
