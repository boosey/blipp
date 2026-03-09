import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";

export const clips = new Hono<{ Bindings: Env }>();

clips.use("*", requireAuth);

/**
 * GET /:episodeId/:durationTier.mp3 — Stream clip audio from R2.
 */
clips.get("/:episodeId/:durationTier", async (c) => {
  const episodeId = c.req.param("episodeId");
  const durationTier = c.req.param("durationTier").replace(/\.mp3$/, "");
  const key = `clips/${episodeId}/${durationTier}.mp3`;

  const obj = await c.env.R2.get(key);
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
