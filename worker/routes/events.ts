import { Hono } from "hono";
import type { Env } from "../types";
import { getCurrentUser } from "../lib/admin-helpers";

const events = new Hono<{ Bindings: Env }>();

/**
 * POST / — Track a user event (fire-and-forget from the client).
 * Body: { event: string, episodeId?: string, podcastId?: string, metadata?: object }
 */
events.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const { event, episodeId, podcastId, metadata } = await c.req.json();

  if (!event || typeof event !== "string") {
    return c.json({ error: "event is required" }, 400);
  }

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      event,
      episodeId: episodeId ?? null,
      podcastId: podcastId ?? null,
      metadata: metadata ?? null,
    },
  });

  return c.json({ ok: true });
});

export { events };
