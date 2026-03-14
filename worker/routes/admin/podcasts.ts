import { Hono } from "hono";
import type { Env } from "../../types";
import { PIPELINE_STAGE_NAMES } from "../../lib/constants";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { getAuth } from "../../middleware/auth";

const podcastsRoutes = new Hono<{ Bindings: Env }>();

podcastsRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /stats - Podcast catalog stats
podcastsRoutes.get("/stats", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

// GET / - Paginated podcast list
podcastsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "50"), 500);
  const skip = (page - 1) * pageSize;
  const search = c.req.query("search");
  const health = c.req.query("health");
  const status = c.req.query("status");
  const orderBy = parseSort(c, "createdAt", ["createdAt", "title", "episodeCount", "status", "lastFetchedAt"]);

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

  const data = podcasts.map((p: any) => ({
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

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id - Podcast detail
podcastsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
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
          clips: {
            orderBy: { durationTier: "asc" },
            select: { id: true, durationTier: true, actualSeconds: true, status: true, audioUrl: true },
          },
          feedItems: {
            select: { id: true, userId: true, source: true, status: true, requestId: true, durationTier: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!podcast) return c.json({ error: "Podcast not found" }, 404);

  // Get recent pipeline activity for this podcast's episodes
  const episodeIds = podcast.episodes.map((e: any) => e.id);
  let recentJobs: any[] = [];
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
  } catch (err) {
    console.error(JSON.stringify({
      level: "warn",
      action: "admin_podcast_pipeline_jobs_failed",
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
  }

  // Aggregate cost per episode
  const episodeCosts = await Promise.all(
    podcast.episodes.map(async (e: any) => {
      try {
        const result = await prisma.pipelineStep.aggregate({
          where: { job: { episodeId: e.id } },
          _sum: { cost: true },
        });
        return { episodeId: e.id, cost: result._sum.cost };
      } catch { return { episodeId: e.id, cost: null }; }
    })
  );
  const costMap = new Map(episodeCosts.map((c) => [c.episodeId, c.cost]));

  const episodes = podcast.episodes.map((e: any) => {
    let pipelineStatus: string = "pending";
    if (e.distillation) {
      const ds = e.distillation.status;
      if (ds === "COMPLETED") pipelineStatus = e._count.clips > 0 ? "completed" : "generating_clips";
      else if (ds === "FAILED") pipelineStatus = "failed";
      else if (ds === "FETCHING_TRANSCRIPT") pipelineStatus = "transcribing";
      else if (ds === "EXTRACTING_CLAIMS") pipelineStatus = "distilling";
      else pipelineStatus = "pending";
    }

    const clips = (e.clips ?? []).map((clip: any) => ({
      id: clip.id,
      durationTier: clip.durationTier,
      actualSeconds: clip.actualSeconds,
      status: clip.status,
      audioUrl: clip.audioUrl,
      feedItems: (e.feedItems ?? [])
        .filter((fi: any) => fi.durationTier === clip.durationTier)
        .map((fi: any) => ({
          id: fi.id,
          userId: fi.userId,
          source: fi.source,
          status: fi.status,
          requestId: fi.requestId,
          createdAt: fi.createdAt.toISOString(),
        })),
    }));

    return {
      id: e.id,
      title: e.title,
      audioUrl: e.audioUrl ?? null,
      publishedAt: e.publishedAt.toISOString(),
      durationSeconds: e.durationSeconds ?? null,
      transcriptUrl: e.transcriptUrl ?? null,
      pipelineStatus,
      clipCount: e._count.clips,
      totalCost: costMap.get(e.id) ?? null,
      clips,
    };
  });

  const recentPipelineActivity = recentJobs.map((job: any) => ({
    id: job.id,
    timestamp: job.createdAt.toISOString(),
    stage: job.currentStage,
    stageName: PIPELINE_STAGE_NAMES[job.currentStage] ?? job.currentStage,
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
});

// GET /cleanup-candidates - Podcasts with 0 subscribers and no recent activity
podcastsRoutes.get("/cleanup-candidates", async (c) => {
  const prisma = c.get("prisma") as any;
  const inactivityDays = parseInt(c.req.query("inactivityDays") ?? "90");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - inactivityDays);

  const candidates = await prisma.podcast.findMany({
    where: {
      status: { not: "archived" },
      subscriptions: { none: {} },
      episodes: { every: { feedItems: { every: { createdAt: { lt: cutoff } } } } },
    },
    select: {
      id: true,
      title: true,
      source: true,
      lastFetchedAt: true,
      createdAt: true,
      _count: { select: { episodes: true, subscriptions: true } },
    },
    orderBy: { lastFetchedAt: "asc" },
    take: 100,
  });

  const data = candidates.map((p: any) => ({
    id: p.id,
    title: p.title,
    source: p.source,
    episodeCount: p._count.episodes,
    subscriberCount: p._count.subscriptions,
    lastFetchedAt: p.lastFetchedAt?.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));

  return c.json({ data });
});

// POST /cleanup-execute - Archive selected podcasts
podcastsRoutes.post("/cleanup-execute", async (c) => {
  const prisma = c.get("prisma") as any;
  const { podcastIds } = await c.req.json<{ podcastIds: string[] }>();

  if (!podcastIds?.length) {
    return c.json({ error: "podcastIds required" }, 400);
  }

  const result = await prisma.podcast.updateMany({
    where: { id: { in: podcastIds } },
    data: { status: "archived" },
  });

  return c.json({ data: { archived: result.count } });
});

// POST /catalog-refresh - Fetch top 200 trending podcasts + their episodes
podcastsRoutes.post("/catalog-refresh", async (c) => {
  const prisma = c.get("prisma") as any;
  const { PodcastIndexClient } = await import("../../lib/podcast-index");

  const client = new PodcastIndexClient(
    c.env.PODCAST_INDEX_KEY,
    c.env.PODCAST_INDEX_SECRET
  );

  // Fetch top 200 trending podcasts
  const feeds = await client.trending(200);

  let created = 0;
  let updated = 0;
  const podcastIds: string[] = [];

  for (const feed of feeds) {
    const podcast = await prisma.podcast.upsert({
      where: { feedUrl: feed.url },
      create: {
        feedUrl: feed.url,
        title: feed.title,
        description: feed.description ?? null,
        imageUrl: feed.image ?? null,
        podcastIndexId: String(feed.id),
        author: feed.author ?? null,
        source: "trending",
      },
      update: {
        title: feed.title,
        description: feed.description ?? undefined,
        imageUrl: feed.image ?? undefined,
        author: feed.author ?? undefined,
        podcastIndexId: String(feed.id),
      },
    });

    podcastIds.push(podcast.id);
    // Detect if newly created (within last 5s)
    if (Date.now() - new Date(podcast.createdAt).getTime() < 5000) {
      created++;
    } else {
      updated++;
    }
  }

  // Fetch last 5 episodes per podcast via Podcast Index API (concurrent batches)
  let episodesCreated = 0;
  let episodeErrors = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    const batch = feeds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        const episodes = await client.episodesByFeedId(feed.id, 5);
        const podcast = await prisma.podcast.findUnique({
          where: { podcastIndexId: String(feed.id) },
          select: { id: true },
        });
        if (!podcast) return 0;

        let count = 0;
        for (const ep of episodes) {
          if (!ep.guid || !ep.enclosureUrl) continue;
          await prisma.episode.upsert({
            where: { podcastId_guid: { podcastId: podcast.id, guid: ep.guid } },
            create: {
              podcastId: podcast.id,
              title: ep.title,
              description: ep.description ?? null,
              audioUrl: ep.enclosureUrl,
              publishedAt: new Date(ep.datePublished * 1000),
              durationSeconds: ep.duration || null,
              guid: ep.guid,
              transcriptUrl: ep.transcriptUrl ?? null,
            },
            update: {},
          });
          count++;
        }

        await prisma.podcast.update({
          where: { id: podcast.id },
          data: { lastFetchedAt: new Date() },
        });
        return count;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") episodesCreated += r.value;
      else episodeErrors++;
    }
  }

  return c.json({
    data: {
      feedsFound: feeds.length,
      created,
      updated,
      episodesCreated,
      episodeErrors,
    },
  });
});

// POST / - Create podcast
podcastsRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

// PATCH /:id - Update podcast
podcastsRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

// DELETE /:id - Soft delete (archive)
podcastsRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const podcast = await prisma.podcast.update({
    where: { id: c.req.param("id") },
    data: { status: "archived" },
  });

  return c.json({ data: { id: podcast.id, status: podcast.status } });
});

// POST /:id/refresh - Enqueue feed refresh
podcastsRoutes.post("/:id/refresh", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

// GET /requests - Paginated list of all podcast requests
podcastsRoutes.get("/requests", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const status = c.req.query("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [requests, total] = await Promise.all([
    prisma.podcastRequest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true, name: true } },
        podcast: { select: { id: true, title: true } },
      },
    }),
    prisma.podcastRequest.count({ where }),
  ]);

  const data = requests.map((r: any) => ({
    id: r.id,
    feedUrl: r.feedUrl,
    title: r.title,
    status: r.status,
    podcastId: r.podcastId,
    podcastTitle: r.podcast?.title,
    adminNote: r.adminNote,
    userEmail: r.user.email,
    userName: r.user.name,
    createdAt: r.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// POST /requests/:id/approve - Approve a podcast request
podcastsRoutes.post("/requests/:id/approve", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const request = await prisma.podcastRequest.findUnique({ where: { id } });
  if (!request) return c.json({ error: "Request not found" }, 404);
  if (request.status !== "PENDING") return c.json({ error: "Request is not pending" }, 409);

  // Upsert podcast from feed URL
  const { parseRssFeed } = await import("../../lib/rss-parser");
  let feedData;
  try {
    const resp = await fetch(request.feedUrl);
    const xml = await resp.text();
    feedData = parseRssFeed(xml);
  } catch (err) {
    return c.json({ error: `Failed to fetch feed: ${err instanceof Error ? err.message : String(err)}` }, 422);
  }

  const podcast = await prisma.podcast.upsert({
    where: { feedUrl: request.feedUrl },
    create: {
      feedUrl: request.feedUrl,
      title: feedData.title || request.title || "Unknown Podcast",
      description: feedData.description || "",
      imageUrl: feedData.imageUrl,
      author: feedData.author,
      source: "user_request",
    },
    update: {
      title: feedData.title || undefined,
      imageUrl: feedData.imageUrl || undefined,
    },
  });

  // Update request
  const auth = getAuth(c);
  await prisma.podcastRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      podcastId: podcast.id,
      reviewedBy: auth?.userId,
      reviewedAt: new Date(),
    },
  });

  return c.json({ data: { id, status: "APPROVED", podcastId: podcast.id } });
});

// POST /requests/:id/reject - Reject a podcast request
podcastsRoutes.post("/requests/:id/reject", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json<{ adminNote?: string }>().catch(() => ({} as { adminNote?: string }));

  const request = await prisma.podcastRequest.findUnique({ where: { id } });
  if (!request) return c.json({ error: "Request not found" }, 404);
  if (request.status !== "PENDING") return c.json({ error: "Request is not pending" }, 409);

  const auth = getAuth(c);
  await prisma.podcastRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      adminNote: body.adminNote,
      reviewedBy: auth?.userId,
      reviewedAt: new Date(),
    },
  });

  return c.json({ data: { id, status: "REJECTED" } });
});

export { podcastsRoutes };
