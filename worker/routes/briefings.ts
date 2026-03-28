import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getUserWithPlan, checkDurationLimit, checkWeeklyBriefingLimit, checkPastEpisodesLimit } from "../lib/plan-limits";
import { DURATION_TIERS } from "../lib/constants";
import { validateBody } from "../lib/validation";

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
const generateSchema = z.object({
  podcastId: z.string().min(1),
  episodeId: z.string().optional(),
  durationTier: z.number().refine((v) => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }),
  voicePresetId: z.string().nullable().optional(),
});

briefings.post("/generate", async (c) => {
  const body = await validateBody(c, generateSchema);

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

  // Enforce past episodes limit
  const pastError = await checkPastEpisodesLimit(episodeId!, user.plan.pastEpisodesLimit, prisma);
  if (pastError) return c.json({ error: pastError }, 403);

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

  // Resolve voice preset: explicit param > user default > null
  const voicePresetId = body.voicePresetId !== undefined
    ? body.voicePresetId
    : user.defaultVoicePresetId ?? null;

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
          voicePresetId: voicePresetId ?? undefined,
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
      clip: { select: { audioKey: true, audioContentType: true } },
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

  const headers: Record<string, string> = {
    "Content-Type": briefing.clip.audioContentType || "audio/mpeg",
    "Content-Length": String(clipObj.size),
    "Cache-Control": "public, max-age=604800, immutable",
    "Accept-Ranges": "bytes",
  };
  if (clipObj.etag) headers["ETag"] = clipObj.etag;

  // Handle range requests for streaming/seeking
  const range = c.req.header("Range");
  if (range) {
    const body = await clipObj.arrayBuffer();
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

  return new Response(clipObj.body, { headers });
});
