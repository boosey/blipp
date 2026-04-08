import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

export const digest = new Hono<{ Bindings: Env }>();

digest.use("*", requireAuth);

/**
 * GET /today — Return the user's digest for today (or null if none).
 */
digest.get("/today", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const today = new Date().toISOString().slice(0, 10);

  const delivery = await prisma.digestDelivery.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
    include: {
      episodes: {
        include: {
          episode: {
            select: {
              id: true,
              title: true,
              podcast: { select: { id: true, title: true, imageUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!delivery) {
    return c.json({ data: null });
  }

  return c.json({
    data: {
      id: delivery.id,
      date: delivery.date,
      status: delivery.status,
      episodeCount: delivery.episodeCount,
      actualSeconds: delivery.actualSeconds,
      listened: delivery.listened,
      audioUrl: delivery.audioKey ? `/api/digest/${delivery.id}/audio` : null,
      sources: delivery.sources,
      episodes: delivery.episodes.map((de: any) => ({
        episodeId: de.episodeId,
        sourceType: de.sourceType,
        status: de.status,
        episodeTitle: de.episode?.title ?? null,
        podcastTitle: de.episode?.podcast?.title ?? null,
        podcastImageUrl: de.episode?.podcast?.imageUrl ?? null,
      })),
    },
  });
});

/**
 * GET /:id/audio — Stream digest audio from R2.
 */
digest.get("/:id/audio", async (c) => {
  const deliveryId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const delivery = await prisma.digestDelivery.findFirst({
    where: { id: deliveryId, userId: user.id },
    select: { audioKey: true },
  });

  if (!delivery?.audioKey) {
    return c.json({ error: "Digest audio not found" }, 404);
  }

  const obj = await c.env.R2.get(delivery.audioKey);
  if (!obj) {
    return c.json({ error: "Audio not found in storage" }, 404);
  }

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Content-Length": String(obj.size),
    "Cache-Control": "public, max-age=604800, immutable",
    "Accept-Ranges": "bytes",
  };

  if (obj.etag) {
    headers["ETag"] = obj.etag;
  }

  // Handle range requests for streaming/seeking
  const range = c.req.header("Range");
  if (range) {
    const body = await obj.arrayBuffer();
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : body.byteLength - 1;
      const slice = body.slice(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${body.byteLength}`,
        },
      });
    }
  }

  return new Response(obj.body, { headers });
});

/**
 * PATCH /preferences — Update digest preferences.
 * Body: { digestEnabled?, digestIncludeSubscriptions?, digestIncludeFavorites?, digestIncludeRecommended?, timezone? }
 */
digest.patch("/preferences", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const body = await c.req.json<{
    digestEnabled?: boolean;
    digestIncludeSubscriptions?: boolean;
    digestIncludeFavorites?: boolean;
    digestIncludeRecommended?: boolean;
    timezone?: string | null;
  }>();

  const data: Record<string, unknown> = {};
  if (body.digestEnabled !== undefined) data.digestEnabled = body.digestEnabled;
  if (body.digestIncludeSubscriptions !== undefined) data.digestIncludeSubscriptions = body.digestIncludeSubscriptions;
  if (body.digestIncludeFavorites !== undefined) data.digestIncludeFavorites = body.digestIncludeFavorites;
  if (body.digestIncludeRecommended !== undefined) data.digestIncludeRecommended = body.digestIncludeRecommended;
  if (body.timezone !== undefined) data.timezone = body.timezone;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return c.json({
    data: {
      digestEnabled: updated.digestEnabled,
      digestIncludeSubscriptions: updated.digestIncludeSubscriptions,
      digestIncludeFavorites: updated.digestIncludeFavorites,
      digestIncludeRecommended: updated.digestIncludeRecommended,
      timezone: updated.timezone,
    },
  });
});

/**
 * PATCH /:id/listened — Mark a digest as listened.
 */
digest.patch("/:id/listened", async (c) => {
  const deliveryId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const result = await prisma.digestDelivery.updateMany({
    where: { id: deliveryId, userId: user.id },
    data: { listened: true },
  });

  if (result.count === 0) {
    return c.json({ error: "Digest not found" }, 404);
  }

  return c.json({ success: true });
});
