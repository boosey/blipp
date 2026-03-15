import { Hono } from "hono";
import type { Env } from "../types";

const ALLOWED_ASSETS = new Set([
  "jingles/intro.mp3",
  "jingles/outro.mp3",
]);

const assetsRoutes = new Hono<{ Bindings: Env }>();

assetsRoutes.get("/:path{.+}", async (c) => {
  const path = c.req.param("path");

  if (!ALLOWED_ASSETS.has(path)) {
    return c.json({ error: "Not found" }, 404);
  }

  const obj = await c.env.R2.get(`assets/${path}`);
  if (!obj) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await obj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export { assetsRoutes };
