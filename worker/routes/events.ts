import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { getAuth } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../lib/validation";

const events = new Hono<{ Bindings: Env }>();

const listenOriginalSchema = z.object({
  eventType: z.enum([
    "listen_original_click",
    "listen_original_start",
    "listen_original_complete",
  ]),
  sessionId: z.string().min(1),
  deviceType: z.enum(["mobile", "desktop", "tablet"]),
  platform: z.enum(["ios", "android", "web"]),
  blippId: z.string().min(1),
  blippDurationMs: z.number().int().min(0),
  episodeId: z.string().min(1),
  podcastId: z.string().min(1),
  publisherId: z.string().min(1),
  referralSource: z.enum(["feed", "search", "share", "notification"]),
  timeToClickSec: z.number().min(0),
  blippCompletionPct: z.number().min(0).max(1),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

/**
 * POST /events/listen-original — Record a listen-to-original conversion event.
 * Requires authenticated user.
 */
events.post("/listen-original", requireAuth, async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await validateBody(c, listenOriginalSchema);

  // Resolve internal user ID from Clerk auth
  const user = await prisma.user.findUnique({
    where: { clerkId: auth!.userId! },
    select: { id: true },
  });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const now = new Date();

  const event = await prisma.listenOriginalEvent.create({
    data: {
      eventType: body.eventType,
      timestamp: now,
      userId: user.id,
      sessionId: body.sessionId,
      deviceType: body.deviceType,
      platform: body.platform,
      blippId: body.blippId,
      blippDurationMs: body.blippDurationMs,
      episodeId: body.episodeId,
      podcastId: body.podcastId,
      publisherId: body.publisherId,
      referralSource: body.referralSource,
      timeToClickSec: body.timeToClickSec,
      blippCompletionPct: body.blippCompletionPct,
      utmSource: body.utmSource ?? null,
      utmMedium: body.utmMedium ?? null,
      utmCampaign: body.utmCampaign ?? null,
    },
  });

  return c.json({ success: true, eventId: event.id });
});

/**
 * PATCH /events/listen-original/:eventId/return — Mark that the user returned to PodBlipp.
 * Called when the user comes back after listening to the original.
 */
events.patch("/listen-original/:eventId/return", requireAuth, async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const { eventId } = c.req.param();

  const user = await prisma.user.findUnique({
    where: { clerkId: auth!.userId! },
    select: { id: true },
  });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await prisma.listenOriginalEvent.updateMany({
    where: {
      id: eventId,
      userId: user.id,
    },
    data: { didReturnToBlipp: true },
  });

  return c.json({ success: true });
});

export { events };
