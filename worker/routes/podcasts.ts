import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getUserWithPlan, checkDurationLimit, checkSubscriptionLimit } from "../lib/plan-limits";
import { DURATION_TIERS } from "../lib/constants";
import { getConfig } from "../lib/config";
import { getCatalogSource } from "../lib/catalog-sources";
import { recomputeUserProfile } from "../lib/recommendations";
import { checkVoicePresetAccess } from "../lib/voice-presets";
import { validateBody } from "../lib/validation";

/* ── Zod schemas ─────────────────────────────────────────── */

const SearchSchema = z.object({ query: z.string().min(2).max(200) });

const SubscribeSchema = z.object({
  feedUrl: z.string().min(1),
  title: z.string().min(1),
  durationTier: z.number().refine(v => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }),
  voicePresetId: z.string().nullish(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  podcastIndexId: z.string().nullish(),
  author: z.string().nullish(),
});

const UpdateSubscriptionSchema = z.object({
  durationTier: z.number().refine(v => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }).optional(),
  voicePresetId: z.string().nullable().optional(),
});

const FavoritesSchema = z.object({ podcastIds: z.array(z.string().min(1)) });

const RequestSchema = z.object({ feedUrl: z.string().min(1), title: z.string().optional() });

const VoteSchema = z.object({ vote: z.number().int().min(-1).max(1).optional() });

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
        categories: true,
        _count: { select: { episodes: true, subscriptions: true } },
      },
    }),
    prisma.podcast.count({ where }),
  ]);

  return c.json({
    podcasts: podcasts.map((p: any) => ({
      ...p,
      episodeCount: p._count.episodes,
      subscriberCount: p._count.subscriptions,
      _count: undefined,
    })),
    total,
    page,
    pageSize,
  });
});

/**
 * POST /search-podcasts — Search external podcast directories.
 * Body: { query: string }
 * Returns discovered podcasts with inCatalog flag.
 */
podcasts.post("/search-podcasts", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await validateBody(c, SearchSchema);

  const sourceId = await getConfig(prisma, "catalog.source", "podcast-index") as string;
  const source = getCatalogSource(sourceId);
  const results = await source.search(body.query.trim(), c.env);

  // Check which results are already in catalog
  const feedUrls = results.map(r => r.feedUrl);
  const existing = await prisma.podcast.findMany({
    where: { feedUrl: { in: feedUrls } },
    select: { id: true, feedUrl: true },
  });
  const catalogMap = new Map(existing.map((p: any) => [p.feedUrl, p.id]));

  const data = results.map(r => ({
    ...r,
    inCatalog: catalogMap.has(r.feedUrl),
    podcastId: catalogMap.get(r.feedUrl) ?? null,
  }));

  return c.json({ data });
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
  const body = await validateBody(c, SubscribeSchema);

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

  // Resolve voice preset: explicit param > user default > null
  const voicePresetId = body.voicePresetId !== undefined
    ? body.voicePresetId
    : user.defaultVoicePresetId ?? null;

  // Enforce plan access for voice preset
  const voiceError = await checkVoicePresetAccess(prisma, user.planId, voicePresetId);
  if (voiceError) return c.json({ error: voiceError }, 403);

  // Create/update subscription with durationTier + voicePresetId
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
      voicePresetId,
    },
    update: {
      durationTier: body.durationTier,
      voicePresetId,
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

    // Reset failed feed items so the user can retry
    if (feedItem.status === "FAILED") {
      await prisma.feedItem.update({
        where: { id: feedItem.id },
        data: { status: "PENDING", requestId: null, briefingId: null },
      });
      feedItem.status = "PENDING";
    }

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
  }

  // Recompute recommendations (fire-and-forget, never fail the request)
  try {
    await recomputeUserProfile(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "subscribe", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
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
  const body = await validateBody(c, UpdateSubscriptionSchema);

  const prisma = c.get("prisma") as any;
  const user = await getUserWithPlan(c, prisma);

  // Enforce duration limit if provided
  if (body.durationTier !== undefined) {
    const durationError = checkDurationLimit(body.durationTier, user.plan.maxDurationMinutes);
    if (durationError) return c.json({ error: durationError }, 403);
  }

  // Enforce plan access for voice preset if changing it
  if (body.voicePresetId !== undefined) {
    const voiceError = await checkVoicePresetAccess(prisma, user.planId, body.voicePresetId);
    if (voiceError) return c.json({ error: voiceError }, 403);
  }

  const data: any = {};
  if (body.durationTier !== undefined) data.durationTier = body.durationTier;
  if (body.voicePresetId !== undefined) data.voicePresetId = body.voicePresetId;

  const subscription = await prisma.subscription.update({
    where: {
      userId_podcastId: {
        userId: user.id,
        podcastId,
      },
    },
    data,
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

  // Recompute recommendations (fire-and-forget, never fail the request)
  try {
    await recomputeUserProfile(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "unsubscribe", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

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
 * GET /favorites — List the authenticated user's favorited podcasts.
 */
podcasts.get("/favorites", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const favorites = await prisma.podcastFavorite.findMany({
    where: { userId: user.id },
    include: { podcast: { select: { id: true, title: true, imageUrl: true, author: true } } },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ data: favorites.map((f: any) => f.podcast) });
});

/**
 * POST /favorites — Set the user's podcast favorites (replaces all).
 * Body: { podcastIds: string[] }
 */
podcasts.post("/favorites", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const { podcastIds } = await validateBody(c, FavoritesSchema);

  // Replace all favorites atomically
  await prisma.podcastFavorite.deleteMany({ where: { userId: user.id } });

  if (podcastIds.length > 0) {
    await prisma.podcastFavorite.createMany({
      data: podcastIds.map((podcastId: string) => ({
        userId: user.id,
        podcastId,
      })),
      skipDuplicates: true,
    });
  }

  // Recompute recommendations (fire-and-forget, never fail the request)
  try {
    await recomputeUserProfile(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "favorites_set", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ data: { count: podcastIds.length } });
});

/**
 * POST /favorites/:podcastId — Add a single podcast to favorites.
 */
podcasts.post("/favorites/:podcastId", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const podcastId = c.req.param("podcastId");

  await prisma.podcastFavorite.upsert({
    where: { userId_podcastId: { userId: user.id, podcastId } },
    create: { userId: user.id, podcastId },
    update: {},
  });

  // Recompute recommendations (fire-and-forget, never fail the request)
  try {
    await recomputeUserProfile(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "favorite_add", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ data: { favorited: true } }, 201);
});

/**
 * DELETE /favorites/:podcastId — Remove a podcast from favorites.
 */
podcasts.delete("/favorites/:podcastId", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const podcastId = c.req.param("podcastId");

  await prisma.podcastFavorite.deleteMany({
    where: { userId: user.id, podcastId },
  });

  // Recompute recommendations (fire-and-forget, never fail the request)
  try {
    await recomputeUserProfile(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "favorite_remove", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ data: { favorited: false } });
});

/**
 * POST /request — Submit a podcast request.
 * Body: { feedUrl: string, title?: string }
 */
podcasts.post("/request", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const body = await validateBody(c, RequestSchema);

  const requestsEnabled = await getConfig(prisma, "catalog.requests.enabled", true);
  if (!requestsEnabled) return c.json({ error: "Podcast requests are currently disabled" }, 403);

  // Check if already in catalog
  const existing = await prisma.podcast.findFirst({ where: { feedUrl: body.feedUrl } });
  if (existing) {
    return c.json({ error: "This podcast is already in our catalog", podcastId: existing.id }, 409);
  }

  // Check max pending requests
  const maxPerUser = await getConfig(prisma, "catalog.requests.maxPerUser", 5);
  const pendingCount = await prisma.podcastRequest.count({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pendingCount >= (maxPerUser as number)) {
    return c.json({ error: `Maximum ${maxPerUser} pending requests allowed` }, 429);
  }

  // Check for duplicate request
  const existingRequest = await prisma.podcastRequest.findUnique({
    where: { userId_feedUrl: { userId: user.id, feedUrl: body.feedUrl } },
  });
  if (existingRequest) {
    return c.json({ error: "You already have a request for this podcast", requestId: existingRequest.id }, 409);
  }

  const request = await prisma.podcastRequest.create({
    data: {
      userId: user.id,
      feedUrl: body.feedUrl,
      title: body.title,
    },
  });

  return c.json({ data: { id: request.id, status: request.status } }, 201);
});

/**
 * GET /requests — List user's own podcast requests.
 */
podcasts.get("/requests", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const requests = await prisma.podcastRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { podcast: { select: { id: true, title: true } } },
  });

  return c.json({
    data: requests.map((r: any) => ({
      id: r.id,
      feedUrl: r.feedUrl,
      title: r.title,
      status: r.status,
      podcastId: r.podcastId,
      podcastTitle: r.podcast?.title,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

/**
 * DELETE /request/:id — Cancel a pending request.
 */
podcasts.delete("/request/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const id = c.req.param("id");

  const request = await prisma.podcastRequest.findFirst({
    where: { id, userId: user.id, status: "PENDING" },
  });

  if (!request) return c.json({ error: "Request not found or not cancellable" }, 404);

  await prisma.podcastRequest.delete({ where: { id } });
  return c.json({ data: { deleted: true } });
});

/**
 * GET /categories — List all categories with podcast counts.
 * Returns categories filtered to active English-language podcasts.
 */
podcasts.get("/categories", async (c) => {
  const prisma = c.get("prisma") as any;

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });

  const counts = await prisma.podcastCategory.groupBy({
    by: ["categoryId"],
    where: {
      podcast: { status: "active", language: "en" },
    },
    _count: true,
  });

  const countMap = new Map(counts.map((row: any) => [row.categoryId, row._count]));

  return c.json({
    categories: categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      appleGenreId: cat.appleGenreId,
      podcastCount: countMap.get(cat.id) ?? 0,
    })),
  });
});

/**
 * POST /vote/:podcastId — Vote on a podcast (thumbs up/down).
 * Body: { vote: 1 | -1 } — pass 0 or omit to remove vote.
 */
podcasts.post("/vote/:podcastId", async (c) => {
  const podcastId = c.req.param("podcastId");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const { vote } = await validateBody(c, VoteSchema);

  if (vote === 0 || vote === undefined || vote === null) {
    await prisma.podcastVote.deleteMany({
      where: { userId: user.id, podcastId },
    });
    // Recompute recommendations (fire-and-forget)
    try { await recomputeUserProfile(user.id, prisma); } catch (err) {
      console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "podcast_vote_remove", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
    }
    return c.json({ vote: 0 });
  }

  const v = vote > 0 ? 1 : -1;
  await prisma.podcastVote.upsert({
    where: { userId_podcastId: { userId: user.id, podcastId } },
    create: { userId: user.id, podcastId, vote: v },
    update: { vote: v },
  });

  // Recompute recommendations (fire-and-forget)
  try { await recomputeUserProfile(user.id, prisma); } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "podcast_vote", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ vote: v });
});

/**
 * GET /episodes/vote/:episodeId — Get user's vote on an episode.
 */
podcasts.get("/episodes/vote/:episodeId", async (c) => {
  const episodeId = c.req.param("episodeId");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const existing = await prisma.episodeVote.findUnique({
    where: { userId_episodeId: { userId: user.id, episodeId } },
  });

  return c.json({ vote: existing?.vote ?? 0 });
});

/**
 * POST /episodes/vote/:episodeId — Vote on an episode (thumbs up/down).
 * Body: { vote: 1 | -1 } — pass 0 or omit to remove vote.
 */
podcasts.post("/episodes/vote/:episodeId", async (c) => {
  const episodeId = c.req.param("episodeId");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const { vote } = await validateBody(c, VoteSchema);

  if (vote === 0 || vote === undefined || vote === null) {
    await prisma.episodeVote.deleteMany({
      where: { userId: user.id, episodeId },
    });
    // Recompute recommendations (fire-and-forget)
    try { await recomputeUserProfile(user.id, prisma); } catch (err) {
      console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "episode_vote_remove", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
    }
    return c.json({ vote: 0 });
  }

  const v = vote > 0 ? 1 : -1;
  await prisma.episodeVote.upsert({
    where: { userId_episodeId: { userId: user.id, episodeId } },
    create: { userId: user.id, episodeId, vote: v },
    update: { vote: v },
  });

  // Recompute recommendations (fire-and-forget)
  try { await recomputeUserProfile(user.id, prisma); } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "episode_vote", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ vote: v });
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

  const [podcast, subscription, vote] = await Promise.all([
    prisma.podcast.findUniqueOrThrow({ where: { id: podcastId } }),
    prisma.subscription.findFirst({ where: { userId: user.id, podcastId } }),
    prisma.podcastVote.findUnique({ where: { userId_podcastId: { userId: user.id, podcastId } } }),
  ]);

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
      subscriptionVoicePresetId: subscription?.voicePresetId ?? null,
      userVote: vote?.vote ?? 0,
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
  const user = await getCurrentUser(c, prisma);

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

  // Batch-fetch user's episode votes + feed item status
  const episodeIds = episodes.map((e: any) => e.id);
  const [votes, feedItems] = await Promise.all([
    prisma.episodeVote.findMany({
      where: { userId: user.id, episodeId: { in: episodeIds } },
      select: { episodeId: true, vote: true },
    }),
    prisma.feedItem.findMany({
      where: { userId: user.id, episodeId: { in: episodeIds } },
      select: { episodeId: true, status: true, listened: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const voteMap = new Map(votes.map((v: any) => [v.episodeId, v.vote]));

  // Build blipp status per episode (use most recent feed item)
  const blippMap = new Map<string, { status: string; listened: boolean }>();
  for (const fi of feedItems as any[]) {
    if (!blippMap.has(fi.episodeId)) {
      blippMap.set(fi.episodeId, { status: fi.status, listened: fi.listened });
    }
  }

  return c.json({
    episodes: episodes.map((e: any) => ({
      ...e,
      userVote: voteMap.get(e.id) ?? 0,
      blippStatus: blippMap.get(e.id) ?? null,
    })),
  });
});
