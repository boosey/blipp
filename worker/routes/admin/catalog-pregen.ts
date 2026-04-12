import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";
import { runCatalogPregenJob } from "../../lib/cron/catalog-pregen";
import { createPipelineLogger } from "../../lib/logger";

const catalogPregenRoutes = new Hono<{ Bindings: Env }>();

// POST /trigger — manually trigger catalog pre-generation for top podcasts
catalogPregenRoutes.post("/trigger", async (c) => {
  const prisma = c.get("prisma") as any;
  const log = await createPipelineLogger({ stage: "catalog-pregen-manual", prisma });

  const logger = {
    debug: async (msg: string, data?: Record<string, unknown>) => { log.debug(msg, data ?? {}); },
    info: async (msg: string, data?: Record<string, unknown>) => { log.info(msg, data ?? {}); },
    warn: async (msg: string, data?: Record<string, unknown>) => { log.info(msg, data ?? {}); },
    error: async (msg: string, data?: Record<string, unknown>) => { log.error(msg, data ?? {}); },
  };

  const result = await runCatalogPregenJob(prisma, logger, c.env);
  return c.json({ data: result });
});

// GET / — list catalog briefings with pagination
catalogPregenRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const stale = c.req.query("stale");

  const where: Record<string, unknown> = {};
  if (stale === "true") where.stale = true;
  if (stale === "false") where.stale = false;

  const [items, total] = await Promise.all([
    prisma.catalogBriefing.findMany({
      where,
      include: {
        podcast: { select: { id: true, title: true, imageUrl: true } },
        episode: { select: { id: true, title: true, publishedAt: true } },
        clip: { select: { id: true, status: true, actualSeconds: true, audioUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.catalogBriefing.count({ where }),
  ]);

  return c.json(paginatedResponse(items, total, page, pageSize));
});

// GET /stats — summary stats for catalog coverage
catalogPregenRoutes.get("/stats", async (c) => {
  const prisma = c.get("prisma") as any;

  const [total, fresh, stale, podcastsCovered] = await Promise.all([
    prisma.catalogBriefing.count(),
    prisma.catalogBriefing.count({ where: { stale: false } }),
    prisma.catalogBriefing.count({ where: { stale: true } }),
    prisma.catalogBriefing.groupBy({
      by: ["podcastId"],
      where: { stale: false },
      _count: true,
    }),
  ]);

  return c.json({
    data: {
      total,
      fresh,
      stale,
      podcastsCovered: podcastsCovered.length,
    },
  });
});

export { catalogPregenRoutes };
