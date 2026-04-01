import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

export const publisherReportsRoutes = new Hono<{ Bindings: Env }>();

/** GET /api/admin/publisher-reports — List all report batches, newest first */
publisherReportsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const publisherId = c.req.query("publisherId");
  const where = publisherId ? { publisherId } : {};

  const [batches, total] = await Promise.all([
    prisma.publisherReportBatch.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.publisherReportBatch.count({ where }),
  ]);

  return c.json(paginatedResponse(batches, total, page, pageSize));
});

/** GET /api/admin/publisher-reports/:batchId — Detailed breakdown for a single batch */
publisherReportsRoutes.get("/:batchId", async (c) => {
  const prisma = c.get("prisma") as any;
  const { batchId } = c.req.param();

  const batch = await prisma.publisherReportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) {
    return c.json({ error: "Batch not found" }, 404);
  }

  // Get top blipps by conversion for this batch
  const topBlipps = await prisma.listenOriginalEvent.groupBy({
    by: ["blippId"],
    where: { reportBatchId: batchId },
    _count: { id: true },
    _avg: { timeToClickSec: true, blippCompletionPct: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  return c.json({
    batch,
    topBlipps: topBlipps.map((b: any) => ({
      blippId: b.blippId,
      eventCount: b._count.id,
      avgTimeToClickSec: b._avg.timeToClickSec,
      avgBlippCompletionPct: b._avg.blippCompletionPct,
    })),
  });
});

/** GET /api/admin/publisher-reports/publishers/:publisherId/summary — Conversion rate summary */
publisherReportsRoutes.get("/publishers/:publisherId/summary", async (c) => {
  const prisma = c.get("prisma") as any;
  const { publisherId } = c.req.param();

  const [clicks, starts, completes, uniqueUsers] = await Promise.all([
    prisma.listenOriginalEvent.count({
      where: { publisherId, eventType: "listen_original_click" },
    }),
    prisma.listenOriginalEvent.count({
      where: { publisherId, eventType: "listen_original_start" },
    }),
    prisma.listenOriginalEvent.count({
      where: { publisherId, eventType: "listen_original_complete" },
    }),
    prisma.listenOriginalEvent.groupBy({
      by: ["userId"],
      where: { publisherId },
    }).then((rows: any[]) => rows.length),
  ]);

  return c.json({
    publisherId,
    totalClicks: clicks,
    totalStarts: starts,
    totalCompletes: completes,
    uniqueUsers,
    clickToStartRate: clicks > 0 ? starts / clicks : 0,
    startToCompleteRate: starts > 0 ? completes / starts : 0,
  });
});
