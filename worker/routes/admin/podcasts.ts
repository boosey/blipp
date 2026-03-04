import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation",
};

const podcastsRoutes = new Hono<{ Bindings: Env }>();

podcastsRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /stats - Podcast catalog stats
podcastsRoutes.get("/stats", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let total, byHealth, byStatus, needsAttention;
    try {
      [total, byHealth, byStatus, needsAttention] = await Promise.all([
        prisma.podcast.count({ where: { status: { not: "archived" } } }),
        prisma.podcast.groupBy({
          by: ["feedHealth"],
          _count: true,
          where: { status: { not: "archived" } },
        }),
        prisma.podcast.groupBy({
          by: ["status"],
          _count: true,
        }),
        prisma.podcast.count({
          where: {
            status: { not: "archived" },
            OR: [
              { feedHealth: { in: ["broken", "poor"] } },
              { feedError: { not: null } },
            ],
          },
        }),
      ]);
    } catch {
      // feedHealth/feedError columns may not exist
      return c.json({
        data: { total: 0, byHealth: { excellent: 0, good: 0, fair: 0, poor: 0, broken: 0 }, byStatus: { active: 0, paused: 0, archived: 0 }, needsAttention: 0 },
      });
    }

    const healthMap: Record<string, number> = { excellent: 0, good: 0, fair: 0, poor: 0, broken: 0 };
    for (const row of byHealth) {
      if (row.feedHealth) healthMap[row.feedHealth] = row._count;
    }

    const statusMap: Record<string, number> = { active: 0, paused: 0, archived: 0 };
    for (const row of byStatus) {
      statusMap[row.status] = row._count;
    }

    return c.json({
      data: { total, byHealth: healthMap, byStatus: statusMap, needsAttention },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET / - Paginated podcast list
podcastsRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 500);
    const skip = (page - 1) * pageSize;
    const search = c.req.query("search");
    const health = c.req.query("health");
    const status = c.req.query("status");
    const sort = c.req.query("sort") ?? "createdAt:desc";

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
        { feedUrl: { contains: search, mode: "insensitive" } },
      ];
    }
    if (health) where.feedHealth = health;
    if (status) where.status = status;

    const [sortField, sortDir] = sort.split(":");
    const orderBy: Record<string, string> = { [sortField || "createdAt"]: sortDir || "desc" };

    const [podcasts, total] = await Promise.all([
      prisma.podcast.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          _count: { select: { episodes: true, subscriptions: true } },
        },
      }),
      prisma.podcast.count({ where }),
    ]);

    const data = podcasts.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      feedUrl: p.feedUrl,
      imageUrl: p.imageUrl,
      author: p.author,
      categories: p.categories,
      lastFetchedAt: p.lastFetchedAt?.toISOString(),
      feedHealth: p.feedHealth,
      feedError: p.feedError,
      episodeCount: p._count.episodes,
      status: p.status,
      subscriberCount: p._count.subscriptions,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /:id - Podcast detail
podcastsRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const podcast = await prisma.podcast.findUnique({
      where: { id: c.req.param("id") },
      include: {
        _count: { select: { episodes: true, subscriptions: true } },
        episodes: {
          take: 20,
          orderBy: { publishedAt: "desc" },
          include: {
            _count: { select: { clips: true } },
            distillation: { select: { status: true } },
          },
        },
      },
    });

    if (!podcast) return c.json({ error: "Podcast not found" }, 404);

    // Get recent pipeline activity for this podcast's episodes
    const episodeIds = podcast.episodes.map((e) => e.id);
    let recentJobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany>> = [];
    try {
      if (episodeIds.length > 0) {
        recentJobs = await prisma.pipelineJob.findMany({
          where: {
            episodeId: { in: episodeIds },
          },
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            episode: { select: { title: true, podcast: { select: { title: true } } } },
          },
        });
      }
    } catch {
      // PipelineJob table may not exist
    }

    const episodes = podcast.episodes.map((e) => {
      let pipelineStatus: string = "pending";
      if (e.distillation) {
        const ds = e.distillation.status;
        if (ds === "COMPLETED") pipelineStatus = e._count.clips > 0 ? "completed" : "generating_clips";
        else if (ds === "FAILED") pipelineStatus = "failed";
        else if (ds === "FETCHING_TRANSCRIPT") pipelineStatus = "transcribing";
        else if (ds === "EXTRACTING_CLAIMS") pipelineStatus = "distilling";
        else pipelineStatus = "pending";
      }
      return {
        id: e.id,
        title: e.title,
        publishedAt: e.publishedAt.toISOString(),
        durationSeconds: e.durationSeconds,
        pipelineStatus,
        clipCount: e._count.clips,
      };
    });

    const recentPipelineActivity = recentJobs.map((job) => ({
      id: job.id,
      timestamp: job.createdAt.toISOString(),
      stage: job.currentStage,
      stageName: STAGE_NAMES[job.currentStage] ?? job.currentStage,
      status: job.status.toLowerCase().replace("_", "-"),
      type: job.currentStage,
    }));

    return c.json({
      data: {
        id: podcast.id,
        title: podcast.title,
        description: podcast.description,
        feedUrl: podcast.feedUrl,
        imageUrl: podcast.imageUrl,
        author: podcast.author,
        categories: podcast.categories,
        lastFetchedAt: podcast.lastFetchedAt?.toISOString(),
        feedHealth: podcast.feedHealth,
        feedError: podcast.feedError,
        episodeCount: podcast._count.episodes,
        status: podcast.status,
        subscriberCount: podcast._count.subscriptions,
        createdAt: podcast.createdAt.toISOString(),
        updatedAt: podcast.updatedAt.toISOString(),
        episodes,
        recentPipelineActivity,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST / - Create podcast
podcastsRoutes.post("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{
      feedUrl: string;
      title: string;
      description?: string;
      imageUrl?: string;
      author?: string;
    }>();

    if (!body.feedUrl || !body.title) {
      return c.json({ error: "feedUrl and title are required" }, 400);
    }

    const existing = await prisma.podcast.findUnique({ where: { feedUrl: body.feedUrl } });
    if (existing) {
      return c.json({ error: "Podcast with this feed URL already exists" }, 409);
    }

    const podcast = await prisma.podcast.create({
      data: {
        feedUrl: body.feedUrl,
        title: body.title,
        description: body.description,
        imageUrl: body.imageUrl,
        author: body.author,
      },
    });

    return c.json({ data: podcast }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// PATCH /:id - Update podcast
podcastsRoutes.patch("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{
      status?: string;
      feedHealth?: string;
      feedError?: string;
      title?: string;
      description?: string;
    }>();

    const podcast = await prisma.podcast.update({
      where: { id: c.req.param("id") },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.feedHealth !== undefined && { feedHealth: body.feedHealth }),
        ...(body.feedError !== undefined && { feedError: body.feedError }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
      },
    });

    return c.json({ data: podcast });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// DELETE /:id - Soft delete (archive)
podcastsRoutes.delete("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const podcast = await prisma.podcast.update({
      where: { id: c.req.param("id") },
      data: { status: "archived" },
    });

    return c.json({ data: { id: podcast.id, status: podcast.status } });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /:id/refresh - Enqueue feed refresh
podcastsRoutes.post("/:id/refresh", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const podcast = await prisma.podcast.findUnique({
      where: { id: c.req.param("id") },
      select: { id: true, title: true },
    });

    if (!podcast) return c.json({ error: "Podcast not found" }, 404);

    try {
      // Dispatch directly to the feed refresh queue
      await c.env.FEED_REFRESH_QUEUE.send({ type: "manual", podcastId: podcast.id });

      return c.json({ data: { podcastId: podcast.id, status: "dispatched" } }, 201);
    } catch {
      return c.json({ error: "Feed refresh queue not available" }, 503);
    }
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { podcastsRoutes };
