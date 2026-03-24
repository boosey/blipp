import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";
import { getConfig } from "../../lib/config";
import { sendBatchedFeedRefresh } from "../../lib/queue-helpers";

const ACTIVE_STATUSES = ["pending", "refreshing", "paused"];

const episodeRefreshRoutes = new Hono<{ Bindings: Env }>();

// ── GET / — List jobs (paginated) ──
episodeRefreshRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const statusFilter = c.req.query("status") ?? "all";
  const archivedFilter = c.req.query("archived") ?? "false";

  const where: Record<string, unknown> = {};

  if (statusFilter === "active") {
    where.status = { in: ACTIVE_STATUSES };
  } else if (statusFilter === "completed") {
    where.status = "complete";
  } else if (statusFilter === "failed") {
    where.status = "failed";
  } else if (statusFilter === "cancelled") {
    where.status = "cancelled";
  }

  if (archivedFilter === "false") {
    where.archivedAt = null;
  } else if (archivedFilter === "true") {
    where.archivedAt = { not: null };
  }

  const [data, total] = await Promise.all([
    prisma.episodeRefreshJob.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: pageSize,
      include: { _count: { select: { errors: true } } },
    }),
    prisma.episodeRefreshJob.count({ where }),
  ]);

  const jobs = data.map((j: any) => ({
    id: j.id,
    scope: j.scope,
    trigger: j.trigger,
    status: j.status,
    podcastsTotal: j.podcastsTotal,
    podcastsCompleted: j.podcastsCompleted,
    podcastsWithNewEpisodes: j.podcastsWithNewEpisodes,
    episodesDiscovered: j.episodesDiscovered,
    prefetchTotal: j.prefetchTotal,
    prefetchCompleted: j.prefetchCompleted,
    error: j.error,
    archivedAt: j.archivedAt?.toISOString() ?? null,
    startedAt: j.startedAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
    errorCount: j._count.errors,
  }));

  return c.json(paginatedResponse(jobs, total, page, pageSize));
});

// ── GET /:id — Job detail with accordion data ──
episodeRefreshRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  return getJobDetail(c, prisma, id);
});

// ── GET /:id/errors — Paginated errors ──
episodeRefreshRoutes.get("/:id/errors", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const { page, pageSize, skip } = parsePagination(c);
  const phaseFilter = c.req.query("phase");

  const where: Record<string, unknown> = { jobId: id };
  if (phaseFilter) where.phase = phaseFilter;

  const [errors, total] = await Promise.all([
    prisma.episodeRefreshError.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.episodeRefreshError.count({ where }),
  ]);

  const podcastIds = [...new Set(errors.filter((e: any) => e.podcastId).map((e: any) => e.podcastId))];
  const episodeIds = [...new Set(errors.filter((e: any) => e.episodeId).map((e: any) => e.episodeId))];

  const [podcasts, episodes] = await Promise.all([
    podcastIds.length > 0
      ? prisma.podcast.findMany({ where: { id: { in: podcastIds } }, select: { id: true, title: true } })
      : [],
    episodeIds.length > 0
      ? prisma.episode.findMany({ where: { id: { in: episodeIds } }, select: { id: true, title: true } })
      : [],
  ]);

  const podcastMap = new Map(podcasts.map((p: any) => [p.id, p.title]));
  const episodeMap = new Map(episodes.map((e: any) => [e.id, e.title]));

  const data = errors.map((e: any) => ({
    id: e.id,
    phase: e.phase,
    message: e.message,
    podcastId: e.podcastId,
    episodeId: e.episodeId,
    podcastTitle: e.podcastId ? podcastMap.get(e.podcastId) ?? null : null,
    episodeTitle: e.episodeId ? episodeMap.get(e.episodeId) ?? null : null,
    createdAt: e.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// ── POST / — Create job + queue messages ──
episodeRefreshRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));
  const scope = body.scope === "all" ? "all" : "subscribed";

  let podcastIds: string[];
  if (scope === "all") {
    const podcasts = await prisma.podcast.findMany({
      where: { status: { not: "archived" } },
      select: { id: true },
    });
    podcastIds = podcasts.map((p: any) => p.id);
  } else {
    const subscribedPodcastIds = await prisma.subscription.findMany({
      select: { podcastId: true },
      distinct: ["podcastId"],
    });
    podcastIds = subscribedPodcastIds.map((s: any) => s.podcastId);
  }

  const job = await prisma.episodeRefreshJob.create({
    data: {
      trigger: "admin",
      scope,
      status: "refreshing",
      podcastsTotal: podcastIds.length,
    },
  });

  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, podcastIds, batchConcurrency, { refreshJobId: job.id });

  return c.json({ status: "queued", jobId: job.id, podcastsTotal: podcastIds.length });
});

// ── POST /archive-bulk — Bulk archive by status ──
episodeRefreshRoutes.post("/archive-bulk", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));
  const status = body.status;

  if (!["complete", "failed", "cancelled"].includes(status)) {
    return c.json({ error: "status must be 'complete', 'failed', or 'cancelled'" }, 400);
  }

  const result = await prisma.episodeRefreshJob.updateMany({
    where: { status, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return c.json({ archived: result.count });
});

// ── POST /:id/pause — Pause an active job ──
episodeRefreshRoutes.post("/:id/pause", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.episodeRefreshJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (job.status !== "refreshing") {
    return c.json({ error: `Cannot pause job in '${job.status}' status` }, 409);
  }

  const updated = await prisma.episodeRefreshJob.update({
    where: { id },
    data: { status: "paused" },
  });

  return c.json({ job: updated });
});

// ── POST /:id/resume — Resume a paused job ──
episodeRefreshRoutes.post("/:id/resume", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.episodeRefreshJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (job.status !== "paused") {
    return c.json({ error: `Cannot resume job in '${job.status}' status` }, 409);
  }

  // Find podcasts that still need refreshing — those that haven't had episodes created since job start
  const scope = job.scope;
  let targetPodcastIds: string[];

  if (scope === "all") {
    const podcasts = await prisma.podcast.findMany({
      where: { status: { not: "archived" } },
      select: { id: true },
    });
    targetPodcastIds = podcasts.map((p: any) => p.id);
  } else {
    const subscribedPodcastIds = await prisma.subscription.findMany({
      select: { podcastId: true },
      distinct: ["podcastId"],
    });
    targetPodcastIds = subscribedPodcastIds.map((s: any) => s.podcastId);
  }

  // Re-queue pending content prefetches
  const pendingEpisodes = await prisma.episode.findMany({
    where: { createdAt: { gte: job.startedAt }, contentStatus: "PENDING" },
    select: { id: true },
  });

  const updated = await prisma.episodeRefreshJob.update({
    where: { id },
    data: {
      status: "refreshing",
      podcastsCompleted: 0,
      podcastsTotal: targetPodcastIds.length,
      prefetchCompleted: 0,
      prefetchTotal: pendingEpisodes.length,
    },
  });

  const batchConcurrency = (await getConfig(prisma, "pipeline.feedRefresh.batchConcurrency", 10)) as number;
  await sendBatchedFeedRefresh(c.env.FEED_REFRESH_QUEUE, targetPodcastIds, batchConcurrency, { refreshJobId: id });

  const pendingIds = pendingEpisodes.map((e: any) => e.id);
  const CF_BATCH_LIMIT = 100;
  for (let i = 0; i < pendingIds.length; i += CF_BATCH_LIMIT) {
    const batch = pendingIds.slice(i, i + CF_BATCH_LIMIT);
    await c.env.CONTENT_PREFETCH_QUEUE.sendBatch(
      batch.map((episodeId: string) => ({
        body: { episodeId, refreshJobId: id },
      }))
    );
  }

  return c.json({ job: updated });
});

// ── POST /:id/cancel — Cancel active/paused job ──
episodeRefreshRoutes.post("/:id/cancel", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.episodeRefreshJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (!["refreshing", "paused"].includes(job.status)) {
    return c.json({ error: `Cannot cancel job in '${job.status}' status` }, 409);
  }

  const updated = await prisma.episodeRefreshJob.update({
    where: { id },
    data: { status: "cancelled", completedAt: new Date() },
  });

  return c.json({ job: updated });
});

// ── POST /:id/archive — Archive a terminal job ──
episodeRefreshRoutes.post("/:id/archive", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.episodeRefreshJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (ACTIVE_STATUSES.includes(job.status)) {
    return c.json({ error: `Cannot archive active job in '${job.status}' status` }, 409);
  }

  const updated = await prisma.episodeRefreshJob.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  return c.json({ job: updated });
});

// ── DELETE /:id — Delete job + its errors ──
episodeRefreshRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.episodeRefreshJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);

  // Cascade delete handles errors via onDelete: Cascade
  await prisma.episodeRefreshJob.delete({ where: { id } });

  return c.json({ deleted: true });
});

// ── Shared helper: full job detail with derived counts ──
async function getJobDetail(c: any, prisma: any, jobId: string) {
  const PAGE_SIZE = 50;
  const podcastPage = Math.max(1, parseInt(c.req.query("podcastPage") ?? "1", 10) || 1);
  const episodePage = Math.max(1, parseInt(c.req.query("episodePage") ?? "1", 10) || 1);
  const prefetchPage = Math.max(1, parseInt(c.req.query("prefetchPage") ?? "1", 10) || 1);

  let job = await prisma.episodeRefreshJob.findUnique({ where: { id: jobId } });
  if (!job) return c.json({ error: "Job not found" }, 404);

  // Lazy completion detection
  if (
    job.status === "refreshing" &&
    job.podcastsTotal > 0 &&
    job.podcastsCompleted >= job.podcastsTotal &&
    job.prefetchCompleted >= job.prefetchTotal
  ) {
    job = await prisma.episodeRefreshJob.update({
      where: { id: job.id },
      data: { status: "complete", completedAt: new Date() },
    });
  }

  const watermark = job.startedAt;

  // 1. Podcasts with new episodes — group episodes by podcastId
  const podcastsWithEpisodes = await prisma.episode.groupBy({
    by: ["podcastId"],
    where: { createdAt: { gte: watermark } },
    _count: true,
  });

  const podcastsWithNewTotal = podcastsWithEpisodes.length;
  const paginatedPodcastIds = podcastsWithEpisodes
    .slice((podcastPage - 1) * PAGE_SIZE, podcastPage * PAGE_SIZE)
    .map((g: any) => g.podcastId);

  const podcastsForDisplay = paginatedPodcastIds.length > 0
    ? await prisma.podcast.findMany({
        where: { id: { in: paginatedPodcastIds } },
        select: { id: true, title: true, author: true, imageUrl: true },
      })
    : [];

  const episodeCountMap = new Map(
    podcastsWithEpisodes.map((g: any) => [g.podcastId, g._count])
  );

  const podcastsWithNewEpisodesData = podcastsForDisplay.map((p: any) => ({
    ...p,
    newEpisodeCount: episodeCountMap.get(p.id) ?? 0,
  }));

  // 2. New episodes
  const [newEpisodes, newEpisodesTotal] = await Promise.all([
    prisma.episode.findMany({
      where: { createdAt: { gte: watermark } },
      orderBy: { createdAt: "desc" },
      skip: (episodePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        durationSeconds: true,
        createdAt: true,
        podcast: { select: { title: true, imageUrl: true } },
      },
    }),
    prisma.episode.count({ where: { createdAt: { gte: watermark } } }),
  ]);

  // 3. Content prefetch
  const prefetchWhere = {
    updatedAt: { gte: watermark },
    contentStatus: { not: "PENDING" },
  };
  const [prefetchEpisodes, prefetchTotal, prefetchBreakdown] = await Promise.all([
    prisma.episode.findMany({
      where: prefetchWhere,
      orderBy: { updatedAt: "desc" },
      skip: (prefetchPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        contentStatus: true,
        updatedAt: true,
        podcast: { select: { title: true, imageUrl: true } },
      },
    }),
    prisma.episode.count({ where: prefetchWhere }),
    prisma.episode.groupBy({
      by: ["contentStatus"],
      where: prefetchWhere,
      _count: true,
    }),
  ]);

  // Error counts
  const errorCounts = await prisma.episodeRefreshError.groupBy({
    by: ["phase"],
    where: { jobId: job.id },
    _count: true,
  });

  const errorCountsObj: Record<string, number> = { feed_scan: 0, prefetch: 0, total: 0 };
  for (const g of errorCounts) {
    errorCountsObj[g.phase] = g._count;
    errorCountsObj.total += g._count;
  }

  return c.json({
    job: {
      id: job.id,
      scope: job.scope,
      trigger: job.trigger,
      status: job.status,
      podcastsTotal: job.podcastsTotal,
      podcastsCompleted: job.podcastsCompleted,
      podcastsWithNewEpisodes: job.podcastsWithNewEpisodes,
      episodesDiscovered: job.episodesDiscovered,
      prefetchTotal: job.prefetchTotal,
      prefetchCompleted: job.prefetchCompleted,
      error: job.error,
      archivedAt: job.archivedAt?.toISOString() ?? null,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    },
    errorCounts: errorCountsObj,
    prefetchBreakdown: prefetchBreakdown.reduce(
      (acc: Record<string, number>, g: any) => {
        acc[g.contentStatus] = g._count;
        return acc;
      },
      {} as Record<string, number>
    ),
    pagination: {
      pageSize: PAGE_SIZE,
      podcastPage,
      podcastTotal: podcastsWithNewTotal,
      episodePage,
      episodeTotal: newEpisodesTotal,
      prefetchPage,
      prefetchTotal,
    },
    podcastsWithNewEpisodesDetail: podcastsWithNewEpisodesData,
    recentEpisodes: newEpisodes.map((e: any) => ({
      ...e,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    recentPrefetch: prefetchEpisodes.map((e: any) => ({
      ...e,
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

export { episodeRefreshRoutes };
