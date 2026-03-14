import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";

export const clips = new Hono<{ Bindings: Env }>();

clips.use("*", requireAuth);

/**
 * GET /:episodeId/:durationTier.mp3 — Stream clip audio from R2.
 */
clips.get("/:episodeId/:durationTier", async (c) => {
  const episodeId = c.req.param("episodeId");
  const durationTier = c.req.param("durationTier").replace(/\.mp3$/, "");
  const prisma = c.get("prisma") as any;

  // Resolve authenticated user
  const clerkId = getAuth(c)!.userId!;
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  // Check if user is admin (admins can access any clip for debugging)
  if (!user.isAdmin) {
    // Verify user has a FeedItem for this episode+durationTier
    const feedItem = await prisma.feedItem.findFirst({
      where: {
        userId: user.id,
        episodeId,
        durationTier: parseInt(durationTier, 10),
      },
    });

    if (!feedItem) {
      return c.json({ error: "Clip not found" }, 404);
    }
  }

  // Try new WorkProduct path first, fall back to legacy path for pre-migration clips
  const wpPath = `wp/clip/${episodeId}/${durationTier}/default.mp3`;
  const legacyPath = `clips/${episodeId}/${durationTier}.mp3`;

  let obj = await c.env.R2.get(wpPath);
  if (!obj) {
    obj = await c.env.R2.get(legacyPath);
  }
  if (!obj) {
    return c.json({ error: "Clip not found" }, 404);
  }

  const body = await obj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
