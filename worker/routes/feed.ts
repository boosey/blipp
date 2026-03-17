import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

export const feed = new Hono<{ Bindings: Env }>();

feed.use("*", requireAuth);

function mapClip(clip: any) {
  if (!clip) return null;
  return {
    audioUrl: clip.audioKey ? `/api/clips/${clip.audioKey.replace(/^clips\//, "")}` : null,
    actualSeconds: clip.actualSeconds,
  };
}

function mapBriefing(briefing: any) {
  if (!briefing) return null;
  return {
    id: briefing.id,
    clip: mapClip(briefing.clip),
    adAudioUrl: briefing.adAudioUrl,
  };
}

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

  const sort = c.req.query("sort");

  const where: any = {
    userId: user.id,
    episode: { contentStatus: { not: "NOT_DELIVERABLE" } },
  };
  if (status) where.status = status;
  if (listened !== undefined && listened !== "") {
    where.listened = listened === "true";
  }

  const orderBy = sort === "listenedAt" ? { listenedAt: "desc" as const } : { createdAt: "desc" as const };

  const [items, total] = await Promise.all([
    prisma.feedItem.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        podcast: { select: { id: true, title: true, imageUrl: true } },
        episode: { select: { id: true, title: true, publishedAt: true, durationSeconds: true } },
        briefing: {
          include: {
            clip: { select: { id: true, audioKey: true, actualSeconds: true } },
          },
        },
      },
    }),
    prisma.feedItem.count({ where }),
  ]);

  const data = items.map((item: any) => ({
    id: item.id,
    source: item.source,
    status: item.status,
    listened: item.listened,
    listenedAt: item.listenedAt,
    durationTier: item.durationTier,
    createdAt: item.createdAt,
    errorMessage: item.errorMessage ?? null,
    podcast: item.podcast,
    episode: item.episode,
    briefing: mapBriefing(item.briefing),
  }));

  return c.json({ items: data, total });
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
      briefing: {
        include: {
          clip: { select: { id: true, audioKey: true, actualSeconds: true } },
        },
      },
    },
  });

  if (!item) {
    return c.json({ error: "Feed item not found" }, 404);
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
      errorMessage: item.errorMessage ?? null,
      podcast: item.podcast,
      episode: item.episode,
      briefing: mapBriefing(item.briefing),
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

/**
 * DELETE /:id — Remove a feed item.
 */
feed.delete("/:id", async (c) => {
  const feedItemId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const result = await prisma.feedItem.deleteMany({
    where: { id: feedItemId, userId: user.id },
  });

  if (result.count === 0) {
    return c.json({ error: "Feed item not found" }, 404);
  }

  return c.json({ success: true });
});
