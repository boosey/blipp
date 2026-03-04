import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation",
};

const STAGE_ICONS: Record<string, string> = {
  TRANSCRIPTION: "file-audio",
  DISTILLATION: "brain",
  CLIP_GENERATION: "scissors",
};

const PIPELINE_STAGES = ["TRANSCRIPTION", "DISTILLATION", "CLIP_GENERATION"] as const;

const pipelineRoutes = new Hono<{ Bindings: Env }>();

pipelineRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /jobs - Paginated list of pipeline jobs
pipelineRoutes.get("/jobs", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const currentStage = c.req.query("currentStage");
    const status = c.req.query("status");
    const requestId = c.req.query("requestId");
    const search = c.req.query("search");

    const where: Record<string, unknown> = {};
    if (currentStage) where.currentStage = currentStage;
    if (status) where.status = status;
    if (requestId) where.requestId = requestId;
    if (search) {
      where.OR = [
        { errorMessage: { contains: search, mode: "insensitive" } },
        { episode: { title: { contains: search, mode: "insensitive" } } },
        { episode: { podcast: { title: { contains: search, mode: "insensitive" } } } },
      ];
    }

    let jobs, total;
    try {
      [jobs, total] = await Promise.all([
        prisma.pipelineJob.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            episode: {
              include: { podcast: { select: { title: true, imageUrl: true } } },
            },
          },
        }),
        prisma.pipelineJob.count({ where }),
      ]);
    } catch {
      return c.json({ data: [], total: 0, page, pageSize, totalPages: 0 });
    }

    const data = jobs.map((job) => ({
      id: job.id,
      requestId: job.requestId,
      episodeId: job.episodeId,
      durationTier: job.durationTier,
      status: job.status,
      currentStage: job.currentStage,
      distillationId: job.distillationId,
      clipId: job.clipId,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      episodeTitle: job.episode?.title,
      podcastTitle: job.episode?.podcast?.title,
      podcastImageUrl: job.episode?.podcast?.imageUrl ?? undefined,
    }));

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /jobs/:id - Enriched job detail with steps and request context
pipelineRoutes.get("/jobs/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let job;
    try {
      job = await prisma.pipelineJob.findUnique({
        where: { id: c.req.param("id") },
        include: {
          episode: {
            include: { podcast: { select: { title: true, imageUrl: true } } },
          },
          steps: { orderBy: { createdAt: "asc" } },
          request: {
            select: {
              id: true,
              userId: true,
              targetMinutes: true,
              status: true,
              createdAt: true,
              user: { select: { email: true } },
            },
          },
        },
      });
    } catch {
      return c.json({ error: "Pipeline jobs not available" }, 404);
    }

    if (!job) return c.json({ error: "Job not found" }, 404);

    // Queue position for PENDING jobs
    let queuePosition: number | undefined;
    if (job.status === "PENDING") {
      queuePosition = await prisma.pipelineJob.count({
        where: {
          currentStage: job.currentStage,
          status: "PENDING",
          createdAt: { lt: job.createdAt },
        },
      });
    }

    const requestContext = job.request
      ? {
          requestId: job.request.id,
          userId: job.request.userId,
          userEmail: job.request.user?.email,
          targetMinutes: job.request.targetMinutes,
          status: job.request.status,
          createdAt: job.request.createdAt.toISOString(),
        }
      : undefined;

    const steps = job.steps.map((s) => ({
      id: s.id,
      jobId: s.jobId,
      stage: s.stage,
      status: s.status,
      cached: s.cached,
      errorMessage: s.errorMessage,
      startedAt: s.startedAt?.toISOString(),
      completedAt: s.completedAt?.toISOString(),
      durationMs: s.durationMs,
      cost: s.cost,
      retryCount: s.retryCount,
      createdAt: s.createdAt.toISOString(),
    }));

    return c.json({
      data: {
        id: job.id,
        requestId: job.requestId,
        episodeId: job.episodeId,
        durationTier: job.durationTier,
        status: job.status,
        currentStage: job.currentStage,
        distillationId: job.distillationId,
        clipId: job.clipId,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        episodeTitle: job.episode?.title,
        podcastTitle: job.episode?.podcast?.title,
        podcastImageUrl: job.episode?.podcast?.imageUrl ?? undefined,
        steps,
        requestContext,
        queuePosition,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /jobs/:id/retry - Retry a failed job (dispatches to the correct queue)
pipelineRoutes.post("/jobs/:id/retry", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    try {
      const job = await prisma.pipelineJob.findUnique({
        where: { id: c.req.param("id") },
      });

      if (!job) return c.json({ error: "Job not found" }, 404);

      await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          errorMessage: null,
          completedAt: null,
        },
      });

      // Dispatch to the correct queue based on currentStage
      switch (job.currentStage) {
        case "TRANSCRIPTION": {
          await c.env.TRANSCRIPTION_QUEUE.send({
            type: "manual",
            jobId: job.id,
            episodeId: job.episodeId,
          });
          break;
        }
        case "DISTILLATION": {
          await c.env.DISTILLATION_QUEUE.send({
            type: "manual",
            jobId: job.id,
            episodeId: job.episodeId,
          });
          break;
        }
        case "CLIP_GENERATION": {
          await c.env.CLIP_GENERATION_QUEUE.send({
            type: "manual",
            jobId: job.id,
            episodeId: job.episodeId,
            durationTier: job.durationTier,
          });
          break;
        }
      }

      return c.json({ data: { id: job.id, status: "PENDING", currentStage: job.currentStage } });
    } catch {
      return c.json({ error: "Pipeline jobs not available" }, 404);
    }
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /jobs/bulk/retry - Bulk retry failed jobs
pipelineRoutes.post("/jobs/bulk/retry", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{ ids: string[] }>();
    if (!body.ids?.length) return c.json({ error: "ids required" }, 400);

    try {
      // Fetch jobs to dispatch to correct queues
      const jobs = await prisma.pipelineJob.findMany({
        where: { id: { in: body.ids } },
      });

      // Reset status
      await prisma.pipelineJob.updateMany({
        where: { id: { in: body.ids } },
        data: {
          status: "PENDING",
          errorMessage: null,
          completedAt: null,
        },
      });

      // Dispatch each job to its correct queue
      for (const job of jobs) {
        switch (job.currentStage) {
          case "TRANSCRIPTION":
            await c.env.TRANSCRIPTION_QUEUE.send({
              type: "manual",
              jobId: job.id,
              episodeId: job.episodeId,
            });
            break;
          case "DISTILLATION":
            await c.env.DISTILLATION_QUEUE.send({
              type: "manual",
              jobId: job.id,
              episodeId: job.episodeId,
            });
            break;
          case "CLIP_GENERATION":
            await c.env.CLIP_GENERATION_QUEUE.send({
              type: "manual",
              jobId: job.id,
              episodeId: job.episodeId,
              durationTier: job.durationTier,
            });
            break;
        }
      }

      return c.json({ data: { retriedCount: jobs.length } });
    } catch {
      return c.json({ error: "Pipeline jobs not available" }, 404);
    }
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /trigger/feed-refresh - Trigger feed refresh for one or all podcasts
pipelineRoutes.post("/trigger/feed-refresh", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body: { podcastId?: string } = await c.req.json().catch(() => ({}));

    if (body.podcastId) {
      const podcast = await prisma.podcast.findUnique({
        where: { id: body.podcastId },
        select: { id: true },
      });
      if (!podcast) return c.json({ error: "Podcast not found" }, 404);

      await c.env.FEED_REFRESH_QUEUE.send({ type: "manual", podcastId: body.podcastId });
      return c.json({ data: { enqueued: 1, skipped: 0, message: "Feed refresh enqueued for 1 podcast" } });
    }

    // Refresh all active podcasts
    const podcasts = await prisma.podcast.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    for (const p of podcasts) {
      await c.env.FEED_REFRESH_QUEUE.send({ type: "manual", podcastId: p.id });
    }

    return c.json({
      data: { enqueued: podcasts.length, skipped: 0, message: `Feed refresh enqueued for ${podcasts.length} podcasts` },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /trigger/stage/:stage - Trigger a specific pipeline stage for eligible episodes
pipelineRoutes.post("/trigger/stage/:stage", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const stage = c.req.param("stage");

    if (stage === "TRANSCRIPTION" || stage === "2") {
      // Transcription: episodes with no completed transcription pipeline step
      const episodes = await prisma.episode.findMany({
        where: {
          transcriptUrl: { not: null },
          OR: [
            { distillation: null },
            { distillation: { status: { not: "COMPLETED" } } },
          ],
        },
        select: { id: true },
        take: 50,
      });

      for (const ep of episodes) {
        await c.env.TRANSCRIPTION_QUEUE.send({ type: "manual", episodeId: ep.id });
      }

      return c.json({
        data: { enqueued: episodes.length, skipped: 0, message: `Transcription enqueued for ${episodes.length} episodes` },
      });
    }

    if (stage === "DISTILLATION" || stage === "3") {
      const episodes = await prisma.episode.findMany({
        where: {
          transcriptUrl: { not: null },
          OR: [
            { distillation: null },
            { distillation: { status: { not: "COMPLETED" } } },
          ],
        },
        select: { id: true },
        take: 50,
      });

      for (const ep of episodes) {
        await c.env.DISTILLATION_QUEUE.send({ type: "manual", episodeId: ep.id });
      }

      return c.json({
        data: { enqueued: episodes.length, skipped: 0, message: `Distillation enqueued for ${episodes.length} episodes` },
      });
    }

    if (stage === "CLIP_GENERATION" || stage === "4") {
      const distillations = await prisma.distillation.findMany({
        where: {
          status: "COMPLETED",
          clips: { none: {} },
        },
        select: { id: true, episodeId: true },
        take: 50,
      });

      for (const d of distillations) {
        await c.env.CLIP_GENERATION_QUEUE.send({ type: "manual", episodeId: d.episodeId });
      }

      return c.json({
        data: { enqueued: distillations.length, skipped: 0, message: `Clip generation enqueued for ${distillations.length} episodes` },
      });
    }

    return c.json({ error: `Invalid stage: ${stage}. Valid stages: TRANSCRIPTION, DISTILLATION, CLIP_GENERATION` }, 400);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /trigger/episode/:id - Trigger pipeline for a specific episode
pipelineRoutes.post("/trigger/episode/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const episodeId = c.req.param("id");
    const body: { stage?: string } = await c.req.json().catch(() => ({}));

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        transcriptUrl: true,
        distillation: { select: { id: true, status: true } },
        clips: { select: { id: true } },
      },
    });

    if (!episode) return c.json({ error: "Episode not found" }, 404);

    // If stage explicitly provided, force that stage
    if (body.stage !== undefined) {
      if (body.stage === "TRANSCRIPTION") {
        await c.env.TRANSCRIPTION_QUEUE.send({ type: "manual", episodeId: episode.id });
        return c.json({ data: { enqueued: 1, skipped: 0, message: "Transcription enqueued" } });
      }
      if (body.stage === "DISTILLATION") {
        if (!episode.transcriptUrl) {
          return c.json({ error: "Episode has no transcriptUrl, cannot enqueue distillation" }, 400);
        }
        await c.env.DISTILLATION_QUEUE.send({ type: "manual", episodeId: episode.id });
        return c.json({ data: { enqueued: 1, skipped: 0, message: "Distillation enqueued" } });
      }
      if (body.stage === "CLIP_GENERATION") {
        const distillation = episode.distillation;
        if (!distillation || distillation.status !== "COMPLETED") {
          return c.json({ error: "No completed distillation found for this episode" }, 400);
        }
        await c.env.CLIP_GENERATION_QUEUE.send({ type: "manual", episodeId: episode.id });
        return c.json({ data: { enqueued: 1, skipped: 0, message: "Clip generation enqueued" } });
      }
      return c.json({ error: `Invalid stage: ${body.stage}. Valid stages: TRANSCRIPTION, DISTILLATION, CLIP_GENERATION` }, 400);
    }

    // Auto-detect what's needed next
    if (!episode.distillation || (episode.distillation.status !== "COMPLETED" && episode.distillation.status !== "FETCHING_TRANSCRIPT" && episode.distillation.status !== "EXTRACTING_CLAIMS")) {
      await c.env.TRANSCRIPTION_QUEUE.send({ type: "manual", episodeId: episode.id });
      return c.json({ data: { enqueued: 1, skipped: 0, message: "Transcription enqueued" } });
    }

    if (episode.distillation.status === "COMPLETED" && episode.clips.length === 0) {
      await c.env.CLIP_GENERATION_QUEUE.send({ type: "manual", episodeId: episode.id });
      return c.json({ data: { enqueued: 1, skipped: 0, message: "Clip generation enqueued" } });
    }

    return c.json({ data: { enqueued: 0, skipped: 1, message: "Episode is already fully processed or in progress" } });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /stages - Aggregate stats per stage
pipelineRoutes.get("/stages", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let statusGroups, avgDurations, costGroups;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      [statusGroups, avgDurations, costGroups] = await Promise.all([
        prisma.pipelineStep.groupBy({
          by: ["stage", "status"],
          _count: true,
          where: { stage: { in: [...PIPELINE_STAGES] } },
        }),
        prisma.pipelineStep.groupBy({
          by: ["stage"],
          _avg: { durationMs: true },
          where: { durationMs: { not: null }, stage: { in: [...PIPELINE_STAGES] } },
        }),
        prisma.pipelineStep.groupBy({
          by: ["stage"],
          _sum: { cost: true },
          where: { createdAt: { gte: todayStart }, cost: { not: null }, stage: { in: [...PIPELINE_STAGES] } },
        }),
      ]);
    } catch {
      const data = PIPELINE_STAGES.map((stage) => ({
        stage,
        name: STAGE_NAMES[stage] ?? stage,
        icon: STAGE_ICONS[stage] ?? "circle",
        activeJobs: 0,
        successRate: 100,
        avgProcessingTime: 0,
        todayCost: 0,
        perUnitCost: 0,
      }));
      return c.json({ data });
    }

    const stageData = new Map<string, {
      active: number; total: number; completed: number;
      avgDuration: number; todayCost: number;
    }>();

    for (const row of statusGroups) {
      if (!stageData.has(row.stage)) {
        stageData.set(row.stage, { active: 0, total: 0, completed: 0, avgDuration: 0, todayCost: 0 });
      }
      const s = stageData.get(row.stage)!;
      s.total += row._count;
      if (row.status === "COMPLETED") s.completed += row._count;
      if (row.status === "IN_PROGRESS") s.active += row._count;
    }

    for (const row of avgDurations) {
      const s = stageData.get(row.stage);
      if (s) s.avgDuration = Math.round(row._avg.durationMs ?? 0);
    }

    for (const row of costGroups) {
      const s = stageData.get(row.stage);
      if (s) s.todayCost = Math.round((row._sum.cost ?? 0) * 100) / 100;
    }

    const data = PIPELINE_STAGES.map((stage) => {
      const s = stageData.get(stage) ?? { active: 0, total: 0, completed: 0, avgDuration: 0, todayCost: 0 };
      return {
        stage,
        name: STAGE_NAMES[stage] ?? stage,
        icon: STAGE_ICONS[stage] ?? "circle",
        activeJobs: s.active,
        successRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 100,
        avgProcessingTime: s.avgDuration,
        todayCost: s.todayCost,
        perUnitCost: s.completed > 0 ? Math.round((s.todayCost / s.completed) * 100) / 100 : 0,
      };
    });

    return c.json({ data });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { pipelineRoutes };
