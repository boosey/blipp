import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

export const feed = new Hono<{ Bindings: Env }>();

feed.use("*", requireAuth);

/**
 * GET / — List the user's feed items.
 * Supports filtering by status and listened state.
 *
 * Query: ?status=READY&listened=false&limit=30&offset=0
 */
feed.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const status = c.req.query("status");
  const listened = c.req.query("listened");
  const limit = Math.min(parseInt(c.req.query("limit") || "30", 10), 100);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const where: any = { userId: user.id };
  if (status) where.status = status;
  if (listened !== undefined && listened !== "") {
    where.listened = listened === "true";
  }

  const [items, total] = await Promise.all([
    prisma.feedItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        podcast: { select: { id: true, title: true, imageUrl: true } },
        episode: { select: { id: true, title: true, publishedAt: true, durationSeconds: true } },
      },
    }),
    prisma.feedItem.count({ where }),
  ]);

  // Resolve clip audio URLs for items with clipId
  const enrichedItems = await Promise.all(
    items.map(async (item: any) => {
      let clip = null;
      if (item.clipId) {
        clip = await prisma.clip.findUnique({
          where: { id: item.clipId },
          select: { audioUrl: true, actualSeconds: true },
        });
      }
      return {
        id: item.id,
        source: item.source,
        status: item.status,
        listened: item.listened,
        listenedAt: item.listenedAt,
        durationTier: item.durationTier,
        createdAt: item.createdAt,
        podcast: item.podcast,
        episode: item.episode,
        clip,
      };
    })
  );

  return c.json({ items: enrichedItems, total });
});

/**
 * GET /counts — Feed item counts for UI badges.
 */
feed.get("/counts", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const [total, unlistened, pending] = await Promise.all([
    prisma.feedItem.count({ where: { userId: user.id } }),
    prisma.feedItem.count({ where: { userId: user.id, listened: false, status: "READY" } }),
    prisma.feedItem.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } } }),
  ]);

  return c.json({ total, unlistened, pending });
});

/**
 * GET /:id — Get a single feed item detail.
 */
feed.get("/:id", async (c) => {
  const feedItemId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const item = await prisma.feedItem.findFirst({
    where: { id: feedItemId, userId: user.id },
    include: {
      podcast: { select: { id: true, title: true, imageUrl: true } },
      episode: { select: { id: true, title: true, publishedAt: true, durationSeconds: true } },
    },
  });

  if (!item) {
    return c.json({ error: "Feed item not found" }, 404);
  }

  let clip = null;
  if (item.clipId) {
    clip = await prisma.clip.findUnique({
      where: { id: item.clipId },
      select: { audioUrl: true, actualSeconds: true },
    });
  }

  return c.json({
    item: {
      id: item.id,
      source: item.source,
      status: item.status,
      listened: item.listened,
      listenedAt: item.listenedAt,
      durationTier: item.durationTier,
      createdAt: item.createdAt,
      podcast: item.podcast,
      episode: item.episode,
      clip,
    },
  });
});

/**
 * PATCH /:id/listened — Mark a feed item as listened.
 */
feed.patch("/:id/listened", async (c) => {
  const feedItemId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const result = await prisma.feedItem.updateMany({
    where: { id: feedItemId, userId: user.id },
    data: { listened: true, listenedAt: new Date() },
  });

  if (result.count === 0) {
    return c.json({ error: "Feed item not found" }, 404);
  }

  return c.json({ success: true });
});
