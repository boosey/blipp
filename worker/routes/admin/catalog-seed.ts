import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const ACTIVE_STATUSES = ["pending", "discovering", "upserting"];

const catalogSeedRoutes = new Hono<{ Bindings: Env }>();

// ── GET / — List jobs (paginated) ──
catalogSeedRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const statusFilter = c.req.query("status") ?? "all"; // active | completed | failed | cancelled | all
  const archivedFilter = c.req.query("archived") ?? "false"; // false | true | all

  const where: Record<string, unknown> = {};

  // Status filter
  if (statusFilter === "active") {
    where.status = { in: ACTIVE_STATUSES };
  } else if (statusFilter === "completed") {
    where.status = "complete";
  } else if (statusFilter === "failed") {
    where.status = "failed";
  } else if (statusFilter === "cancelled") {
    where.status = "cancelled";
  }

  // Archived filter
  if (archivedFilter === "false") {
    where.archivedAt = null;
  } else if (archivedFilter === "true") {
    where.archivedAt = { not: null };
  }
  // "all" — no archivedAt filter

  const [data, total] = await Promise.all([
    prisma.catalogSeedJob.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: pageSize,
      include: { _count: { select: { errors: true } } },
    }),
    prisma.catalogSeedJob.count({ where }),
  ]);

  const jobs = data.map((j: any) => ({
    id: j.id,
    mode: j.mode,
    source: j.source,
    trigger: j.trigger,
    status: j.status,
    podcastsDiscovered: j.podcastsDiscovered,
    error: j.error,
    archivedAt: j.archivedAt?.toISOString() ?? null,
    startedAt: j.startedAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
    errorCount: j._count.errors,
  }));

  return c.json(paginatedResponse(jobs, total, page, pageSize));
});

// ── GET /active — Backward compat alias → redirects to latest active job detail ──
catalogSeedRoutes.get("/active", async (c) => {
  const prisma = c.get("prisma") as any;

  let job = await prisma.catalogSeedJob.findFirst({
    where: { status: { in: ACTIVE_STATUSES } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!job) {
    job = await prisma.catalogSeedJob.findFirst({
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
  }
  if (!job) return c.json({ job: null });

  // Inline the detail logic rather than redirecting (avoids CORS/fetch issues)
  return getJobDetail(c, prisma, job.id);
});

// ── GET /:id — Single job detail with derived progress ──
catalogSeedRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  return getJobDetail(c, prisma, id);
});

// ── GET /:id/errors — Paginated error list ──
catalogSeedRoutes.get("/:id/errors", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const { page, pageSize, skip } = parsePagination(c);
  const phaseFilter = c.req.query("phase"); // optional: "discovery"

  const where: Record<string, unknown> = { jobId: id };
  if (phaseFilter) where.phase = phaseFilter;

  const [errors, total] = await Promise.all([
    prisma.catalogJobError.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.catalogJobError.count({ where }),
  ]);

  // Batch-load podcast/episode titles for display
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

// ── POST / — Create a new seed job ──
catalogSeedRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));

  const source = body.source ?? "apple";
  const trigger = body.trigger ?? "admin";
  const mode = body.mode === "destructive" ? "destructive" : "additive";

  const job = await prisma.catalogSeedJob.create({
    data: { mode, source, trigger },
  });

  // For podcast-index source: queue to CATALOG_REFRESH_QUEUE
  if (source === "podcast-index") {
    await c.env.CATALOG_REFRESH_QUEUE.send({
      action: "seed",
      mode,
      source,
      seedJobId: job.id,
    });
  }
  // For source=apple with trigger=script: just create job record (script handles discovery)
  // For source=apple with trigger=admin: also queue to CATALOG_REFRESH_QUEUE
  if (source === "apple" && trigger === "admin") {
    await c.env.CATALOG_REFRESH_QUEUE.send({
      action: "seed",
      mode,
      source,
      seedJobId: job.id,
    });
  }

  return c.json({ status: "queued", jobId: job.id });
});

// ── POST /trigger-apple — Trigger GitHub Action for Apple discovery ──
catalogSeedRoutes.post("/trigger-apple", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = c.env.GITHUB_TOKEN;
  if (!token) {
    return c.json({ error: "GITHUB_TOKEN not configured" }, 500);
  }

  const owner = "PodBlipp";
  const repo = "blipp";

  // Detect environment from request origin or APP_ORIGIN
  const host = c.req.header("host") ?? "";
  const isProduction = host.includes("podblipp.com") || c.env.APP_ORIGIN?.includes("podblipp.com");
  const environment = body.environment ?? (isProduction ? "production" : "staging");

  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/apple-discover.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "blipp-api",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          environment,
          country: body.country ?? "us",
          limit: String(body.limit ?? 200),
        },
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    return c.json({ error: `GitHub API error: ${resp.status}`, details: text }, resp.status as any);
  }

  return c.json({ triggered: true });
});

// ── POST /:id/ingest — Accept chunked discovered podcasts from external script ──
// Auth handled by requireAdmin middleware (Bearer CLERK_SECRET_KEY or admin session)
catalogSeedRoutes.post("/:id/ingest", async (c) => {

  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const body = await c.req.json();
  const { podcasts, final } = body as {
    podcasts: Array<{
      feedUrl: string;
      title: string;
      description?: string;
      imageUrl?: string;
      author?: string;
      appleId?: string;
      podcastIndexId?: string;
      categories?: { genreId: string; name: string }[];
      appleMetadata?: Record<string, unknown>;
    }>;
    final: boolean;
  };

  const job = await prisma.catalogSeedJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (!["pending", "discovering", "upserting"].includes(job.status)) {
    return c.json({ error: `Cannot ingest into job in '${job.status}' status` }, 409);
  }

  // Transition to discovering if pending
  if (job.status === "pending") {
    await prisma.catalogSeedJob.update({ where: { id }, data: { status: "discovering" } });
  }

  // Upsert categories from this chunk
  const categoryIdMap = await upsertCategories(prisma, podcasts);

  // Additive upsert of podcasts
  let chunkUpsertedCount = 0;
  const errors: Array<{ message: string; podcastTitle?: string }> = [];

  for (const podcast of podcasts) {
    if (!podcast.feedUrl) continue;

    const categoryNames = (podcast.categories ?? [])
      .filter((cat) => cat.genreId !== "26")
      .map((cat) => cat.name);

    try {
      const data = {
        title: podcast.title,
        description: podcast.description,
        imageUrl: podcast.imageUrl,
        author: podcast.author,
        appleId: podcast.appleId,
        podcastIndexId: podcast.podcastIndexId,
        categories: categoryNames,
        appleMetadata: podcast.appleMetadata ?? undefined,
        language: "en",
        source: job.source || "apple",
      };

      const upserted = await prisma.podcast.upsert({
        where: { feedUrl: podcast.feedUrl },
        update: { ...data, status: undefined },
        create: { ...data, feedUrl: podcast.feedUrl, status: "active" },
      });

      // Category join records
      const catJoins: { podcastId: string; categoryId: string }[] = [];
      for (const cat of podcast.categories ?? []) {
        if (cat.genreId === "26") continue;
        const catId = categoryIdMap.get(cat.genreId);
        if (catId) catJoins.push({ podcastId: upserted.id, categoryId: catId });
      }
      if (catJoins.length > 0) {
        // Clear existing and replace
        await prisma.podcastCategory.deleteMany({ where: { podcastId: upserted.id } });
        await prisma.podcastCategory.createMany({ data: catJoins, skipDuplicates: true });
      }

      chunkUpsertedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ message: msg, podcastTitle: podcast.title });
    }
  }

  // Write CatalogJobErrors for individual failures
  if (errors.length > 0) {
    await prisma.catalogJobError.createMany({
      data: errors.map((e) => ({
        jobId: id,
        phase: "discovery",
        message: `Upsert failed for "${e.podcastTitle}": ${e.message}`,
      })),
    });
  }

  // Update discovered count
  await prisma.catalogSeedJob.update({
    where: { id },
    data: {
      status: "upserting",
      podcastsDiscovered: { increment: podcasts.length },
    },
  });

  // If final chunk: mark seed complete, create EpisodeRefreshJob, queue feed refresh
  if (final) {
    const allPodcasts = await prisma.podcast.findMany({
      where: { createdAt: { gte: job.startedAt } },
      select: { id: true },
    });
    const allIds = allPodcasts.map((p: any) => p.id);

    // Create EpisodeRefreshJob to track feed refresh progress
    let refreshJobId: string | undefined;
    if (allIds.length > 0) {
      const refreshJob = await prisma.episodeRefreshJob.create({
        data: {
          trigger: "seed",
          scope: "seed",
          status: "refreshing",
          podcastsTotal: allIds.length,
          catalogSeedJobId: id,
        },
      });
      refreshJobId = refreshJob.id;
    }

    // Mark CatalogSeedJob as complete (discovery is done)
    await prisma.catalogSeedJob.update({
      where: { id },
      data: { status: "complete", completedAt: new Date() },
    });

    // Queue feed refresh in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      const batch = allIds.slice(i, i + BATCH_SIZE);
      await c.env.FEED_REFRESH_QUEUE.sendBatch(
        batch.map((podcastId: string) => ({
          body: { podcastId, type: "manual" as const, ...(refreshJobId && { refreshJobId }) },
        }))
      );
    }

    return c.json({
      upserted: chunkUpsertedCount,
      errors: errors.length,
      final: true,
      refreshJobId: refreshJobId ?? null,
    });
  }

  return c.json({
    upserted: chunkUpsertedCount,
    errors: errors.length,
    final: false,
  });
});

// ── POST /archive-bulk — Bulk archive by status (must be before /:id routes) ──
catalogSeedRoutes.post("/archive-bulk", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));
  const status = body.status; // "complete" | "failed"

  if (!["complete", "failed"].includes(status)) {
    return c.json({ error: "status must be 'complete' or 'failed'" }, 400);
  }

  const result = await prisma.catalogSeedJob.updateMany({
    where: { status, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return c.json({ archived: result.count });
});

// ── POST /:id/archive — Archive a completed/failed job ──
catalogSeedRoutes.post("/:id/archive", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.catalogSeedJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (ACTIVE_STATUSES.includes(job.status)) {
    return c.json({ error: `Cannot archive active job in '${job.status}' status` }, 409);
  }

  const updated = await prisma.catalogSeedJob.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  return c.json({ job: updated });
});

// ── POST /:id/cancel — Cancel an active seed job ──
catalogSeedRoutes.post("/:id/cancel", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();

  const job = await prisma.catalogSeedJob.findUnique({ where: { id } });
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (!["discovering", "upserting"].includes(job.status)) {
    return c.json({ error: `Cannot cancel job in '${job.status}' status` }, 409);
  }

  const updated = await prisma.catalogSeedJob.update({
    where: { id },
    data: { status: "cancelled", completedAt: new Date() },
  });

  return c.json({ job: updated });
});

// ── DELETE /catalog — Wipe all catalog data ──
catalogSeedRoutes.delete("/catalog", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json().catch(() => ({}));
  if (!body.confirm) {
    return c.json({ error: "Confirmation required. Send { confirm: true }." }, 400);
  }

  // Delete in FK order (sequential — FK constraints prevent parallel deletion)
  const feedItems = await prisma.feedItem.deleteMany({});
  const briefingRequests = await prisma.briefingRequest.deleteMany({});
  const briefings = await prisma.briefing.deleteMany({});
  const clips = await prisma.clip.deleteMany({});
  const workProducts = await prisma.workProduct.deleteMany({});
  const episodes = await prisma.episode.deleteMany({});
  const podcastCategories = await prisma.podcastCategory.deleteMany({});
  const podcasts = await prisma.podcast.deleteMany({});
  const categories = await prisma.category.deleteMany({});

  // Clear R2 under wp/ and clips/ prefixes
  let r2Deleted = 0;
  for (const prefix of ["wp/", "clips/"]) {
    let cursor: string | undefined;
    do {
      const listed = await c.env.R2.list({ prefix, cursor, limit: 500 });
      if (listed.objects.length > 0) {
        await Promise.all(listed.objects.map((obj) => c.env.R2.delete(obj.key)));
        r2Deleted += listed.objects.length;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  // Archive all existing CatalogSeedJobs
  await prisma.catalogSeedJob.updateMany({
    where: { archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return c.json({
    deleted: {
      feedItems: feedItems.count,
      briefingRequests: briefingRequests.count,
      briefings: briefings.count,
      clips: clips.count,
      workProducts: workProducts.count,
      episodes: episodes.count,
      podcastCategories: podcastCategories.count,
      podcasts: podcasts.count,
      categories: categories.count,
      r2Objects: r2Deleted,
    },
  });
});

// ── Shared helper: full job detail with derived counts ──
async function getJobDetail(c: any, prisma: any, jobId: string) {
  const PAGE_SIZE = 50;
  const podcastPage = Math.max(1, parseInt(c.req.query("podcastPage") ?? "1", 10) || 1);

  const job = await prisma.catalogSeedJob.findUnique({ where: { id: jobId } });
  if (!job) return c.json({ error: "Job not found" }, 404);

  const watermark = job.startedAt;

  // Derived counts + error counts + linked refresh job
  const [podcastsInserted, errorCounts, refreshJob] =
    await Promise.all([
      prisma.podcast.count({ where: { createdAt: { gte: watermark } } }),
      prisma.catalogJobError.groupBy({
        by: ["phase"],
        where: { jobId: job.id },
        _count: true,
      }),
      prisma.episodeRefreshJob.findFirst({
        where: { catalogSeedJobId: job.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      }),
    ]);

  // Build error counts object
  const errorCountsObj: Record<string, number> = { discovery: 0, total: 0 };
  for (const g of errorCounts) {
    errorCountsObj[g.phase] = g._count;
    errorCountsObj.total += g._count;
  }

  // Paginated podcast list
  const recentPodcasts = await prisma.podcast.findMany({
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
  });

  return c.json({
    job: {
      id: job.id,
      mode: job.mode,
      source: job.source,
      trigger: job.trigger,
      status: job.status,
      podcastsDiscovered: job.podcastsDiscovered,
      error: job.error,
      archivedAt: job.archivedAt?.toISOString() ?? null,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    },
    podcastsInserted,
    errorCounts: errorCountsObj,
    refreshJob: refreshJob ? { id: refreshJob.id, status: refreshJob.status } : null,
    pagination: {
      pageSize: PAGE_SIZE,
      podcastPage,
      podcastTotal: podcastsInserted,
    },
    recentPodcasts,
  });
}

// ── Shared helper: upsert categories from discovered podcasts ──
async function upsertCategories(
  prisma: any,
  podcasts: Array<{ categories?: { genreId: string; name: string }[] }>
): Promise<Map<string, string>> {
  const genreMap = new Map<string, string>();
  for (const podcast of podcasts) {
    for (const cat of podcast.categories ?? []) {
      if (cat.genreId && cat.genreId !== "26") {
        genreMap.set(cat.genreId, cat.name);
      }
    }
  }

  const categoryIdMap = new Map<string, string>();
  for (const [genreId, name] of genreMap) {
    const category = await prisma.category.upsert({
      where: { appleGenreId: genreId },
      update: { name },
      create: { appleGenreId: genreId, name },
    });
    categoryIdMap.set(genreId, category.id);
  }
  return categoryIdMap;
}

export { catalogSeedRoutes };
