import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const geoTaggingRoutes = new Hono<{ Bindings: Env }>();

// GET / — paginated geo profiles with podcast info
geoTaggingRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const state = c.req.query("state") || undefined;
  const city = c.req.query("city") || undefined;
  const source = c.req.query("source") || undefined;
  const scope = c.req.query("scope") || undefined;
  const search = c.req.query("search") || undefined;

  const where: any = {};
  if (state) where.state = state;
  if (city) where.city = city;
  if (source) where.source = source;
  if (scope) where.scope = scope;
  if (search) {
    where.podcast = { title: { contains: search, mode: "insensitive" } };
  }

  const [items, total] = await Promise.all([
    prisma.podcastGeoProfile.findMany({
      where,
      include: {
        podcast: { select: { id: true, title: true, imageUrl: true, categories: true } },
        team: { select: { id: true, name: true, nickname: true } },
      },
      orderBy: [{ confidence: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.podcastGeoProfile.count({ where }),
  ]);

  return c.json(paginatedResponse(items, total, page, pageSize));
});

// GET /stats — aggregate stats
geoTaggingRoutes.get("/stats", async (c) => {
  const prisma = c.get("prisma") as any;

  const [totalProfiles, bySource, byScope, topStates, unprocessed] = await Promise.all([
    prisma.podcastGeoProfile.count(),
    prisma.podcastGeoProfile.groupBy({ by: ["source"], _count: true }),
    prisma.podcastGeoProfile.groupBy({ by: ["scope"], _count: true }),
    prisma.$queryRaw`
      SELECT "state", COUNT(*)::int as count
      FROM "PodcastGeoProfile"
      GROUP BY "state"
      ORDER BY count DESC
      LIMIT 15
    `,
    prisma.podcast.count({ where: { geoProcessedAt: null, status: "active" } }),
  ]);

  return c.json({
    data: {
      totalProfiles,
      bySource: Object.fromEntries(bySource.map((r: any) => [r.source, r._count])),
      byScope: Object.fromEntries(byScope.map((r: any) => [r.scope, r._count])),
      topStates,
      unprocessed,
    },
  });
});

// GET /costs — recent cron run costs from CronRun result JSON
geoTaggingRoutes.get("/costs", async (c) => {
  const prisma = c.get("prisma") as any;

  const runs = await prisma.cronRun.findMany({
    where: { jobKey: "geo-tagging" },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
      status: true,
      result: true,
      errorMessage: true,
    },
  });

  return c.json({ data: runs });
});

// PATCH /:id — edit a geo profile (marks as manual to prevent cron overwrite)
geoTaggingRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();

  const data: any = { source: "manual" };
  if (body.city !== undefined) data.city = body.city;
  if (body.state !== undefined) data.state = body.state;
  if (body.scope !== undefined) data.scope = body.scope;
  if (body.confidence !== undefined) data.confidence = body.confidence;

  const updated = await prisma.podcastGeoProfile.update({
    where: { id },
    data,
  });

  return c.json({ data: updated });
});

// DELETE /:id — delete a geo profile and leave a manual suppression marker
// so the cron never re-tags this podcast for the same city/state
geoTaggingRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  // Read the profile before deleting so we can create a suppression marker
  const profile = await prisma.podcastGeoProfile.findUnique({ where: { id } });
  if (!profile) return c.json({ error: "Not found" }, 404);

  // Replace with a zero-confidence manual marker — cron skips manual-source
  // profiles, and the /local endpoint filters by confidence >= 0.7
  await prisma.podcastGeoProfile.update({
    where: { id },
    data: { source: "manual", confidence: 0 },
  });

  return c.json({ success: true });
});

export { geoTaggingRoutes };
