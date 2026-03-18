import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getUserWithPlan, checkDurationLimit, checkWeeklyBriefingLimit } from "../lib/plan-limits";
import { DURATION_TIERS, isValidDurationTier } from "../lib/constants";

/**
 * Briefing routes — on-demand briefing generation only.
 * Subscription-based briefings are handled automatically via feed refresh.
 */
export const briefings = new Hono<{ Bindings: Env }>();

briefings.use("*", requireAuth);

/**
 * POST /generate — Create an on-demand briefing for a specific episode or podcast.
 *
 * Body: { podcastId, episodeId?, durationTier }
 * - podcastId: required
 * - episodeId: optional — if omitted, uses latest episode for the podcast
 * - durationTier: required — must be one of the valid duration tiers
 *
 * Creates a FeedItem and dispatches to the pipeline.
 */
briefings.post("/generate", async (c) => {
  const body = await c.req.json<{
    podcastId: string;
    episodeId?: string;
    durationTier: number;
  }>();

  if (!body.podcastId) {
    return c.json({ error: "podcastId is required" }, 400);
  }

  if (!body.durationTier || !isValidDurationTier(body.durationTier)) {
    return c.json({ error: `durationTier is required and must be one of: ${DURATION_TIERS.join(", ")}` }, 400);
  }

  const prisma = c.get("prisma") as any;
  const user = await getUserWithPlan(c, prisma);

  // Enforce plan limits
  const durationError = checkDurationLimit(body.durationTier, user.plan.maxDurationMinutes);
  if (durationError) return c.json({ error: durationError }, 403);

  const weeklyError = await checkWeeklyBriefingLimit(user.id, user.plan.briefingsPerWeek, prisma);
  if (weeklyError) return c.json({ error: weeklyError }, 403);

  // Resolve episode
  let episodeId = body.episodeId;
  let podcastId = body.podcastId;

  if (episodeId) {
    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: episodeId },
    });
    podcastId = episode.podcastId;
  } else {
    const episode = await prisma.episode.findFirst({
      where: { podcastId: body.podcastId },
      orderBy: { publishedAt: "desc" },
    });
    if (!episode) {
      return c.json({ error: "No episodes found for this podcast" }, 404);
    }
    episodeId = episode.id;
  }

  // Create FeedItem (upsert prevents duplicates, but re-queues failed ones)
  const feedItem = await prisma.feedItem.upsert({
    where: {
      userId_episodeId_durationTier: {
        userId: user.id,
        episodeId,
        durationTier: body.durationTier,
      },
    },
    create: {
      userId: user.id,
      episodeId,
      podcastId,
      durationTier: body.durationTier,
      source: "ON_DEMAND",
      status: "PENDING",
    },
    update: {},
  });

  // Reset failed feed items so the user can retry
  if (feedItem.status === "FAILED") {
    await prisma.feedItem.update({
      where: { id: feedItem.id },
      data: { status: "PENDING", requestId: null, briefingId: null },
    });
    feedItem.status = "PENDING";
  }

  // Only dispatch pipeline if not already processed
  if (feedItem.status === "PENDING") {
    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes: body.durationTier,
        items: [{
          podcastId,
          episodeId,
          durationTier: body.durationTier,
          useLatest: false,
        }],
        isTest: false,
        status: "PENDING",
      },
    });

    await prisma.feedItem.update({
      where: { id: feedItem.id },
      data: { requestId: request.id, status: "PROCESSING" },
    });

    await c.env.ORCHESTRATOR_QUEUE.send({
      requestId: request.id,
      action: "evaluate",
    });
  }

  return c.json({ feedItem }, 201);
});

/**
 * GET /:id/audio — Stream raw clip audio from R2.
 * User-scoped: only the briefing owner can access.
 */
briefings.get("/:id/audio", async (c) => {
  const briefingId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const briefing = await prisma.briefing.findFirst({
    where: { id: briefingId, userId: user.id },
    include: {
      clip: { select: { audioKey: true } },
    },
  });

  if (!briefing) {
    return c.json({ error: "Briefing not found" }, 404);
  }

  if (!briefing.clip?.audioKey) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const clipObj = await c.env.R2.get(briefing.clip.audioKey);
  if (!clipObj) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const body = await clipObj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
