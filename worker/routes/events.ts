import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { getAuth } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../lib/validation";

const events = new Hono<{ Bindings: Env }>();

const listenOriginalSchema = z.object({
  idempotencyKey: z.string().uuid(),
  eventType: z.enum([
    "listen_original_click",
    "listen_original_start",
    "listen_original_complete",
    "listen_original_return",
  ]),
  timestamp: z.string().datetime(),
  sessionId: z.string().min(1),
  deviceType: z.enum(["mobile", "desktop", "tablet"]),
  platform: z.enum(["ios", "android", "web"]),
  blippId: z.string().min(1),
  blippDurationMs: z.number().int().min(0),
  episodeId: z.string().min(1),
  referralSource: z.enum(["feed", "search", "share", "notification"]),
  timeToClickSec: z.number().min(0),
  blippCompletionPct: z.number().min(0).max(1),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * POST /events/listen-original — Record a listen-to-original conversion event.
 *
 * - Validates user from auth token (never trusts client-supplied userId)
 * - Enriches episode -> podcastId from content catalog
 * - publisherId derived from podcast.author until Publisher model exists
 * - Rejects timestamps >1h from server time (clock-skew guard)
 * - UPSERTs on idempotencyKey for client retry dedup
 */
events.post("/listen-original", requireAuth, async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await validateBody(c, listenOriginalSchema);

  // Validate user from auth token
  const user = await prisma.user.findUnique({
    where: { clerkId: auth!.userId! },
    select: { id: true },
  });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Clock-skew guard: reject if client timestamp >1h from server time
  const clientTimestamp = new Date(body.timestamp);
  const now = new Date();
  if (Math.abs(now.getTime() - clientTimestamp.getTime()) > ONE_HOUR_MS) {
    return c.json(
      { error: "Timestamp rejected: differs from server time by more than 1 hour" },
      400,
    );
  }

  // Enrich: look up episode -> podcast from content catalog
  const episode = await prisma.episode.findUnique({
    where: { id: body.episodeId },
    select: { id: true, podcastId: true },
  });
  if (!episode) {
    return c.json({ error: "Episode not found" }, 404);
  }

  // publisherId: use podcastId as proxy until Publisher model is added
  const podcastId = episode.podcastId;
  const publisherId = podcastId;

  // UPSERT on idempotencyKey for dedup (immutable — no-op on conflict)
  const event = await prisma.listenOriginalEvent.upsert({
    where: { idempotencyKey: body.idempotencyKey },
    update: {},
    create: {
      idempotencyKey: body.idempotencyKey,
      eventType: body.eventType,
      timestamp: clientTimestamp,
      receivedAt: now,
      userId: user.id,
      sessionId: body.sessionId,
      deviceType: body.deviceType,
      platform: body.platform,
      blippId: body.blippId,
      blippDurationMs: body.blippDurationMs,
      episodeId: body.episodeId,
      podcastId,
      publisherId,
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

export { events };
