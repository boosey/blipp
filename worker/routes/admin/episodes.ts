import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

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

    // Get pipeline trace - jobs related to this episode
    let pipelineJobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany>> = [];
    try {
      pipelineJobs = await prisma.pipelineJob.findMany({
        where: { entityId: episode.id, entityType: "episode" },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      // PipelineJob table may not exist
    }

    const stages = [1, 2, 3, 4, 5].map((stage) => {
      const stageJobs = pipelineJobs.filter((j) => j.stage === stage);
      const latest = stageJobs[0];
      const stageNames: Record<number, string> = {
        1: "Feed Refresh", 2: "Transcription", 3: "Distillation",
        4: "Clip Generation", 5: "Briefing Assembly",
      };

      if (!latest) {
        return {
          stage,
          name: stageNames[stage] ?? `Stage ${stage}`,
          status: "pending" as const,
        };
      }

      return {
        stage,
        name: stageNames[stage] ?? `Stage ${stage}`,
        status: latest.status === "COMPLETED" ? "completed" as const
          : latest.status === "FAILED" ? "failed" as const
          : latest.status === "IN_PROGRESS" ? "in_progress" as const
          : "pending" as const,
        startedAt: latest.startedAt?.toISOString(),
        completedAt: latest.completedAt?.toISOString(),
        durationMs: latest.durationMs ?? undefined,
        cost: latest.cost ?? undefined,
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

// POST /:id/reprocess - Create new pipeline job for episode
episodesRoutes.post("/:id/reprocess", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: c.req.param("id") },
      select: { id: true },
    });

    if (!episode) return c.json({ error: "Episode not found" }, 404);

    try {
      const job = await prisma.pipelineJob.create({
        data: {
          type: "TRANSCRIPTION",
          status: "PENDING",
          entityId: episode.id,
          entityType: "episode",
          stage: 2,
        },
      });

      return c.json({ data: { jobId: job.id, status: job.status } }, 201);
    } catch {
      return c.json({ error: "Pipeline jobs not available" }, 503);
    }
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { episodesRoutes };
