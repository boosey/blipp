import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

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
 * - durationTier: required — must be 1, 2, 3, 5, 7, 10, or 15
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

  if (!body.durationTier || ![1, 2, 3, 5, 7, 10, 15].includes(body.durationTier)) {
    return c.json({ error: "durationTier is required and must be 1, 2, 3, 5, 7, 10, or 15" }, 400);
  }

  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

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

  // Create FeedItem (upsert prevents duplicates)
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
