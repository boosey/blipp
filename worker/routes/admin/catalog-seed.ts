import { Hono } from "hono";
import type { Env } from "../../types";

const catalogSeedRoutes = new Hono<{ Bindings: Env }>();

// POST / — Start a new catalog seed job
catalogSeedRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));

  if (!body.confirm) {
    return c.json({ error: "Confirmation required. Send { confirm: true }." }, 400);
  }

  // Reject if a job is already active
  const active = await prisma.catalogSeedJob.findFirst({
    where: { status: { in: ["pending", "discovering", "upserting", "feed_refresh"] } },
  });
  if (active) {
    return c.json({ error: "A seed job is already active.", activeJobId: active.id }, 409);
  }

  const job = await prisma.catalogSeedJob.create({ data: {} });

  await c.env.CATALOG_REFRESH_QUEUE.send({ action: "seed", seedJobId: job.id });

  return c.json({ status: "queued", jobId: job.id });
});

// GET /active — Return active/most-recent job with derived progress
catalogSeedRoutes.get("/active", async (c) => {
  const prisma = c.get("prisma") as any;

  const PAGE_SIZE = 50;
  const podcastPage = Math.max(1, parseInt(c.req.query("podcastPage") ?? "1", 10) || 1);
  const episodePage = Math.max(1, parseInt(c.req.query("episodePage") ?? "1", 10) || 1);
  const prefetchPage = Math.max(1, parseInt(c.req.query("prefetchPage") ?? "1", 10) || 1);

  // Find active or most recent job
  let job = await prisma.catalogSeedJob.findFirst({
    where: { status: { in: ["pending", "discovering", "upserting", "feed_refresh"] } },
    orderBy: { startedAt: "desc" },
  });

  if (!job) {
    job = await prisma.catalogSeedJob.findFirst({
      orderBy: { startedAt: "desc" },
    });
  }

  if (!job) {
    return c.json({ job: null });
  }

  // Lazy completion detection
  const isActive = ["pending", "discovering", "upserting", "feed_refresh"].includes(job.status);
  if (
    isActive &&
    job.status === "feed_refresh" &&
    job.feedsTotal > 0 &&
    job.feedsCompleted >= job.feedsTotal &&
    job.prefetchCompleted >= job.prefetchTotal
  ) {
    job = await prisma.catalogSeedJob.update({
      where: { id: job.id },
      data: { status: "complete", completedAt: new Date() },
    });
  }

  const watermark = job.startedAt;

  // Derived counts
  const [podcastsInserted, episodesDiscovered, prefetchBreakdown, prefetchTotal] = await Promise.all([
    prisma.podcast.count({ where: { createdAt: { gte: watermark } } }),
    prisma.episode.count({ where: { createdAt: { gte: watermark } } }),
    prisma.episode.groupBy({
      by: ["contentStatus"],
      where: { createdAt: { gte: watermark }, contentStatus: { not: "PENDING" } },
      _count: true,
    }),
    prisma.episode.count({ where: { createdAt: { gte: watermark }, contentStatus: { not: "PENDING" } } }),
  ]);

  // Paginated items for accordions
  const [recentPodcasts, recentEpisodes, recentPrefetch] = await Promise.all([
    prisma.podcast.findMany({
      where: { createdAt: { gte: watermark } },
      orderBy: { createdAt: "desc" },
      skip: (podcastPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        author: true,
        imageUrl: true,
        categories: true,
        createdAt: true,
      },
    }),
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
    prisma.episode.findMany({
      where: { createdAt: { gte: watermark }, contentStatus: { not: "PENDING" } },
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
  ]);

  return c.json({
    job: {
      id: job.id,
      status: job.status,
      podcastsDiscovered: job.podcastsDiscovered,
      feedsTotal: job.feedsTotal,
      feedsCompleted: job.feedsCompleted,
      prefetchTotal: job.prefetchTotal,
      prefetchCompleted: job.prefetchCompleted,
      error: job.error,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    },
    podcastsInserted,
    episodesDiscovered,
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
      podcastTotal: podcastsInserted,
      episodePage,
      episodeTotal: episodesDiscovered,
      prefetchPage,
      prefetchTotal,
    },
    recentPodcasts,
    recentEpisodes: recentEpisodes.map((e: any) => ({
      ...e,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    recentPrefetch: recentPrefetch.map((e: any) => ({
      ...e,
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
});

export { catalogSeedRoutes };
