import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

const pipelineRoutes = new Hono<{ Bindings: Env }>();

pipelineRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /jobs - Paginated list of pipeline jobs
pipelineRoutes.get("/jobs", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const stage = c.req.query("stage");
    const status = c.req.query("status");
    const type = c.req.query("type");
    const search = c.req.query("search");

    const where: Record<string, unknown> = {};
    if (stage) where.stage = parseInt(stage);
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { entityId: { contains: search, mode: "insensitive" } },
        { errorMessage: { contains: search, mode: "insensitive" } },
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
        }),
        prisma.pipelineJob.count({ where }),
      ]);
    } catch {
      // PipelineJob table may not exist
      return c.json({ data: [], total: 0, page, pageSize, totalPages: 0 });
    }

    // Resolve related entity names
    const episodeIds = jobs.filter((j) => j.entityType === "episode").map((j) => j.entityId);
    const podcastIds = jobs.filter((j) => j.entityType === "podcast").map((j) => j.entityId);

    const [episodes, podcasts] = await Promise.all([
      episodeIds.length > 0
        ? prisma.episode.findMany({
            where: { id: { in: episodeIds } },
            select: { id: true, title: true, podcast: { select: { title: true, imageUrl: true } } },
          })
        : [],
      podcastIds.length > 0
        ? prisma.podcast.findMany({
            where: { id: { in: podcastIds } },
            select: { id: true, title: true, imageUrl: true },
          })
        : [],
    ]);

    const episodeMap = new Map(episodes.map((e) => [e.id, e]));
    const podcastMap = new Map(podcasts.map((p) => [p.id, p]));

    const data = jobs.map((job) => {
      let podcastTitle: string | undefined;
      let podcastImageUrl: string | undefined;
      let episodeTitle: string | undefined;

      if (job.entityType === "episode") {
        const ep = episodeMap.get(job.entityId);
        episodeTitle = ep?.title;
        podcastTitle = ep?.podcast?.title;
        podcastImageUrl = ep?.podcast?.imageUrl ?? undefined;
      } else if (job.entityType === "podcast") {
        const p = podcastMap.get(job.entityId);
        podcastTitle = p?.title;
        podcastImageUrl = p?.imageUrl ?? undefined;
      }

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        entityId: job.entityId,
        entityType: job.entityType,
        stage: job.stage,
        errorMessage: job.errorMessage,
        cost: job.cost,
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        durationMs: job.durationMs,
        retryCount: job.retryCount,
        createdAt: job.createdAt.toISOString(),
        podcastTitle,
        podcastImageUrl,
        episodeTitle,
      };
    });

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /jobs/:id - Single job detail
pipelineRoutes.get("/jobs/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let job;
    try {
      job = await prisma.pipelineJob.findUnique({
        where: { id: c.req.param("id") },
      });
    } catch {
      // PipelineJob table may not exist
      return c.json({ error: "Pipeline jobs not available" }, 404);
    }

    if (!job) return c.json({ error: "Job not found" }, 404);

    return c.json({
      data: {
        ...job,
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
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

      const updated = await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "RETRYING",
          retryCount: { increment: 1 },
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          durationMs: null,
        },
      });

      // Dispatch to the correct queue based on job type
      switch (job.type) {
        case "FEED_REFRESH": {
          await c.env.FEED_REFRESH_QUEUE.send({ type: "manual", podcastId: job.entityId });
          break;
        }
        case "DISTILLATION": {
          const episode = await prisma.episode.findUnique({
            where: { id: job.entityId },
            select: { id: true, transcriptUrl: true },
          });
          if (episode) {
            await c.env.DISTILLATION_QUEUE.send({ episodeId: episode.id, transcriptUrl: episode.transcriptUrl });
          }
          break;
        }
        case "CLIP_GENERATION": {
          const distillation = await prisma.distillation.findFirst({
            where: { episodeId: job.entityId, status: "COMPLETED" },
            select: { id: true, episodeId: true },
          });
          if (distillation) {
            await c.env.CLIP_GENERATION_QUEUE.send({
              episodeId: distillation.episodeId,
              distillationId: distillation.id,
            });
          }
          break;
        }
        case "BRIEFING_ASSEMBLY": {
          const briefing = await prisma.briefing.findUnique({
            where: { id: job.entityId },
            select: { id: true, userId: true },
          });
          if (briefing) {
            await c.env.BRIEFING_ASSEMBLY_QUEUE.send({ briefingId: briefing.id, userId: briefing.userId });
          }
          break;
        }
      }

      return c.json({ data: { id: updated.id, status: updated.status, retryCount: updated.retryCount } });
    } catch {
      // PipelineJob table may not exist
      return c.json({ error: "Pipeline jobs not available" }, 404);
    }
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /jobs/bulk/retry - Bulk retry
pipelineRoutes.post("/jobs/bulk/retry", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{ ids: string[] }>();
    if (!body.ids?.length) return c.json({ error: "ids required" }, 400);

    try {
      const result = await prisma.pipelineJob.updateMany({
        where: { id: { in: body.ids } },
        data: {
          status: "RETRYING",
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          durationMs: null,
        },
      });

      // Increment retry counts individually since updateMany doesn't support increment
      await Promise.all(
        body.ids.map((id) =>
          prisma.pipelineJob.update({
            where: { id },
            data: { retryCount: { increment: 1 } },
          })
        )
      );

      return c.json({ data: { retriedCount: result.count } });
    } catch {
      // PipelineJob table may not exist
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

// POST /trigger/stage/:stage - Trigger a specific pipeline stage
pipelineRoutes.post("/trigger/stage/:stage", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const stage = parseInt(c.req.param("stage"));

    if (stage === 1) {
      // Feed refresh: enqueue all active podcasts
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
    }

    if (stage === 2) {
      // Distillation: episodes with transcriptUrl but no completed distillation
      const episodes = await prisma.episode.findMany({
        where: {
          transcriptUrl: { not: null },
          OR: [
            { distillation: null },
            { distillation: { status: { not: "COMPLETED" } } },
          ],
        },
        select: { id: true, transcriptUrl: true },
        take: 50,
      });

      for (const ep of episodes) {
        await c.env.DISTILLATION_QUEUE.send({ episodeId: ep.id, transcriptUrl: ep.transcriptUrl });
      }

      return c.json({
        data: { enqueued: episodes.length, skipped: 0, message: `Distillation enqueued for ${episodes.length} episodes` },
      });
    }

    if (stage === 3) {
      // Clip generation: distillations completed with no clips
      const distillations = await prisma.distillation.findMany({
        where: {
          status: "COMPLETED",
          clips: { none: {} },
        },
        select: { id: true, episodeId: true },
        take: 50,
      });

      for (const d of distillations) {
        await c.env.CLIP_GENERATION_QUEUE.send({ episodeId: d.episodeId, distillationId: d.id });
      }

      return c.json({
        data: { enqueued: distillations.length, skipped: 0, message: `Clip generation enqueued for ${distillations.length} episodes` },
      });
    }

    if (stage === 4) {
      return c.json({ error: "Briefing assembly is user-triggered and cannot be bulk-triggered" }, 400);
    }

    return c.json({ error: `Invalid stage: ${stage}. Valid stages are 1-4.` }, 400);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /trigger/episode/:id - Trigger pipeline for a specific episode
pipelineRoutes.post("/trigger/episode/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const episodeId = c.req.param("id");
    const body: { stage?: number } = await c.req.json().catch(() => ({}));

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
      if (body.stage === 2) {
        if (!episode.transcriptUrl) {
          return c.json({ error: "Episode has no transcriptUrl, cannot enqueue distillation" }, 400);
        }
        await c.env.DISTILLATION_QUEUE.send({ episodeId: episode.id, transcriptUrl: episode.transcriptUrl });
        return c.json({ data: { enqueued: 1, skipped: 0, message: "Distillation enqueued" } });
      }
      if (body.stage === 3) {
        const distillation = episode.distillation;
        if (!distillation || distillation.status !== "COMPLETED") {
          return c.json({ error: "No completed distillation found for this episode" }, 400);
        }
        await c.env.CLIP_GENERATION_QUEUE.send({ episodeId: episode.id, distillationId: distillation.id });
        return c.json({ data: { enqueued: 1, skipped: 0, message: "Clip generation enqueued" } });
      }
      return c.json({ error: `Invalid stage: ${body.stage}. Valid stages for episodes are 2 (distillation) and 3 (clip generation).` }, 400);
    }

    // Auto-detect what's needed next
    if (!episode.distillation || (episode.distillation.status !== "COMPLETED" && episode.distillation.status !== "FETCHING_TRANSCRIPT" && episode.distillation.status !== "EXTRACTING_CLAIMS")) {
      if (!episode.transcriptUrl) {
        return c.json({ data: { enqueued: 0, skipped: 1, message: "Episode has no transcriptUrl, nothing to enqueue" } });
      }
      await c.env.DISTILLATION_QUEUE.send({ episodeId: episode.id, transcriptUrl: episode.transcriptUrl });
      return c.json({ data: { enqueued: 1, skipped: 0, message: "Distillation enqueued" } });
    }

    if (episode.distillation.status === "COMPLETED" && episode.clips.length === 0) {
      await c.env.CLIP_GENERATION_QUEUE.send({ episodeId: episode.id, distillationId: episode.distillation.id });
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
    const STAGE_ICONS: Record<number, string> = {
      1: "rss", 2: "file-audio", 3: "brain", 4: "scissors", 5: "package",
    };

    let statusGroups, avgDurations, costGroups;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      [statusGroups, avgDurations, costGroups] = await Promise.all([
        prisma.pipelineJob.groupBy({
          by: ["stage", "status"],
          _count: true,
        }),
        prisma.pipelineJob.groupBy({
          by: ["stage"],
          _avg: { durationMs: true },
          where: { durationMs: { not: null } },
        }),
        prisma.pipelineJob.groupBy({
          by: ["stage"],
          _sum: { cost: true },
          where: { createdAt: { gte: todayStart }, cost: { not: null } },
        }),
      ]);
    } catch {
      // PipelineJob table may not exist
      const data = [1, 2, 3, 4, 5].map((stage) => ({
        stage,
        name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
        icon: STAGE_ICONS[stage] ?? "circle",
        activeJobs: 0,
        successRate: 100,
        avgProcessingTime: 0,
        todayCost: 0,
        perUnitCost: 0,
      }));
      return c.json({ data });
    }

    const stageData = new Map<number, {
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

    const data = [1, 2, 3, 4, 5].map((stage) => {
      const s = stageData.get(stage) ?? { active: 0, total: 0, completed: 0, avgDuration: 0, todayCost: 0 };
      return {
        stage,
        name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
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
