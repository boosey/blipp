import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getUserWithPlan, checkDurationLimit, checkSubscriptionLimit } from "../lib/plan-limits";
import { DURATION_TIERS } from "../lib/time-fitting";

/**
 * Podcast discovery and subscription routes.
 * All discovery uses the local catalog (populated by admin catalog-refresh).
 */
export const podcasts = new Hono<{ Bindings: Env }>();

// All podcast routes require authentication
podcasts.use("*", requireAuth);

/**
 * GET /catalog?q=...&page=1&pageSize=50 — Browse/search the local podcast catalog.
 *
 * @param q - Optional search query (searches title and author)
 * @param page - Page number (default 1)
 * @param pageSize - Results per page (default 50, max 100)
 * @returns Array of catalog podcasts with episode counts
 */
podcasts.get("/catalog", async (c) => {
  const prisma = c.get("prisma") as any;
  const q = c.req.query("q")?.trim();
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query("pageSize") || "50")));
  const skip = (page - 1) * pageSize;

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { author: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [podcasts, total] = await Promise.all([
    prisma.podcast.findMany({
      where,
      orderBy: { title: "asc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        author: true,
        description: true,
        imageUrl: true,
        feedUrl: true,
        _count: { select: { episodes: true } },
      },
    }),
    prisma.podcast.count({ where }),
  ]);

  return c.json({
    podcasts: podcasts.map((p: any) => ({
      ...p,
      episodeCount: p._count.episodes,
      _count: undefined,
    })),
    total,
    page,
    pageSize,
  });
});

/**
 * POST /subscribe — Subscribe to a podcast with a duration tier.
 * Upserts the podcast record and creates a subscription link.
 * Creates a FeedItem for the latest episode and dispatches to pipeline.
 *
 * Body: `{ feedUrl, title, durationTier, description?, imageUrl?, podcastIndexId?, author? }`
 * @returns The created subscription with podcast data and optional feedItem
 */
podcasts.post("/subscribe", async (c) => {
  const body = await c.req.json<{
    feedUrl: string;
    title: string;
    durationTier: number;
    description?: string;
    imageUrl?: string;
    podcastIndexId?: string;
    author?: string;
  }>();

  if (!body.feedUrl || !body.title) {
    return c.json({ error: "feedUrl and title are required" }, 400);
  }

  if (!body.durationTier || !(DURATION_TIERS as readonly number[]).includes(body.durationTier)) {
    return c.json({ error: `durationTier is required and must be one of: ${DURATION_TIERS.join(", ")}` }, 400);
  }

  const prisma = c.get("prisma") as any;
  const user = await getUserWithPlan(c, prisma);

  // Enforce plan limits
  const durationError = checkDurationLimit(body.durationTier, user.plan.maxDurationMinutes);
  if (durationError) return c.json({ error: durationError }, 403);

  const subError = await checkSubscriptionLimit(user.id, user.plan.maxPodcastSubscriptions, prisma);
  if (subError) {
    // Allow if user is already subscribed (re-subscribe / update, not new)
    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id, podcast: { feedUrl: body.feedUrl } },
    });
    if (!existing) return c.json({ error: subError }, 403);
  }

  // Upsert podcast — create if new, update metadata if exists
  const podcast = await prisma.podcast.upsert({
    where: { feedUrl: body.feedUrl },
    create: {
      feedUrl: body.feedUrl,
      title: body.title,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      podcastIndexId: body.podcastIndexId ?? null,
      author: body.author ?? null,
    },
    update: {
      title: body.title,
      description: body.description ?? undefined,
      imageUrl: body.imageUrl ?? undefined,
      author: body.author ?? undefined,
    },
  });

  // Create/update subscription with durationTier
  const subscription = await prisma.subscription.upsert({
    where: {
      userId_podcastId: {
        userId: user.id,
        podcastId: podcast.id,
      },
    },
    create: {
      userId: user.id,
      podcastId: podcast.id,
      durationTier: body.durationTier,
    },
    update: {
      durationTier: body.durationTier,
    },
  });

  // Find latest episode and create FeedItem + pipeline request
  const latestEpisode = await prisma.episode.findFirst({
    where: { podcastId: podcast.id },
    orderBy: { publishedAt: "desc" },
  });

  let feedItem = null;
  if (latestEpisode) {
    feedItem = await prisma.feedItem.upsert({
      where: {
        userId_episodeId_durationTier: {
          userId: user.id,
          episodeId: latestEpisode.id,
          durationTier: body.durationTier,
        },
      },
      create: {
        userId: user.id,
        episodeId: latestEpisode.id,
        podcastId: podcast.id,
        durationTier: body.durationTier,
        source: "SUBSCRIPTION",
        status: "PENDING",
      },
      update: {},
    });

    // Only dispatch pipeline if the FeedItem isn't already processed
    if (feedItem.status === "PENDING") {
      const request = await prisma.briefingRequest.create({
        data: {
          userId: user.id,
          targetMinutes: body.durationTier,
          items: [{
            podcastId: podcast.id,
            episodeId: latestEpisode.id,
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
  }

  return c.json({ subscription: { ...subscription, podcast }, feedItem }, 201);
});

/**
 * PATCH /subscribe/:podcastId — Update subscription durationTier.
 *
 * @param podcastId - The podcast's database ID
 * Body: `{ durationTier }`
 * @returns The updated subscription
 */
podcasts.patch("/subscribe/:podcastId", async (c) => {
  const podcastId = c.req.param("podcastId");
  const body = await c.req.json<{ durationTier: number }>();

  if (!body.durationTier || !(DURATION_TIERS as readonly number[]).includes(body.durationTier)) {
    return c.json({ error: `durationTier must be one of: ${DURATION_TIERS.join(", ")}` }, 400);
  }

  const prisma = c.get("prisma") as any;
  const user = await getUserWithPlan(c, prisma);

  // Enforce duration limit
  const durationError = checkDurationLimit(body.durationTier, user.plan.maxDurationMinutes);
  if (durationError) return c.json({ error: durationError }, 403);

  const subscription = await prisma.subscription.update({
    where: {
      userId_podcastId: {
        userId: user.id,
        podcastId,
      },
    },
    data: { durationTier: body.durationTier },
  });

  return c.json({ subscription });
});

/**
 * DELETE /subscribe/:podcastId — Unsubscribe from a podcast.
 *
 * @param podcastId - The podcast's database ID
 * @returns Success confirmation
 */
podcasts.delete("/subscribe/:podcastId", async (c) => {
  const podcastId = c.req.param("podcastId");

  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  await prisma.subscription.delete({
    where: {
      userId_podcastId: {
        userId: user.id,
        podcastId,
      },
    },
  });

  return c.json({ success: true });
});

/**
 * POST /refresh — Trigger a feed refresh for the user's subscribed podcasts.
 * Enqueues a feed-refresh job so new episodes are ingested in the background.
 *
 * @returns Success confirmation
 */
podcasts.post("/refresh", async (c) => {
  await c.env.FEED_REFRESH_QUEUE.send({ type: "manual" });
  return c.json({ success: true, message: "Feed refresh queued" });
});

/**
 * GET /subscriptions — List the authenticated user's podcast subscriptions.
 *
 * @returns Array of subscriptions with nested podcast data
 */
podcasts.get("/subscriptions", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id },
    include: { podcast: true },
  });

  return c.json({ subscriptions });
});

/**
 * GET /:id — Get podcast detail with subscription status.
 *
 * @param id - The podcast's database ID
 * @returns Podcast detail with isSubscribed flag
 */
podcasts.get("/:id", async (c) => {
  const podcastId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const podcast = await prisma.podcast.findUniqueOrThrow({
    where: { id: podcastId },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { userId: user.id, podcastId },
  });

  return c.json({
    podcast: {
      id: podcast.id,
      title: podcast.title,
      description: podcast.description,
      feedUrl: podcast.feedUrl,
      imageUrl: podcast.imageUrl,
      author: podcast.author,
      podcastIndexId: podcast.podcastIndexId,
      episodeCount: podcast.episodeCount,
      isSubscribed: !!subscription,
      subscriptionDurationTier: subscription?.durationTier ?? null,
    },
  });
});

/**
 * GET /:id/episodes — List episodes for a podcast.
 * Returns episodes from the local database, ordered by publish date descending.
 *
 * @param id - The podcast's database ID
 * @returns Array of episode summaries
 */
podcasts.get("/:id/episodes", async (c) => {
  const podcastId = c.req.param("id");
  const prisma = c.get("prisma") as any;

  // Verify podcast exists
  await prisma.podcast.findUniqueOrThrow({
    where: { id: podcastId },
  });

  const episodes = await prisma.episode.findMany({
    where: { podcastId },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      description: true,
      publishedAt: true,
      durationSeconds: true,
    },
  });

  return c.json({ episodes });
});
