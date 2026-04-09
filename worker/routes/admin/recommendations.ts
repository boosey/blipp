import { Hono } from "hono";
import type { Env } from "../../types";
import { computePodcastProfiles, recomputeUserProfile } from "../../lib/recommendations";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";
import { getConfig } from "../../lib/config";

export const recommendationsRoutes = new Hono<{ Bindings: Env }>();

// GET /stats
recommendationsRoutes.get("/stats", async (c) => {
  const prisma = c.get("prisma") as any;

  const [usersWithProfiles, podcastsWithProfiles, totalUsers, cacheCount, lastProfile] = await Promise.all([
    prisma.userRecommendationProfile.count(),
    prisma.podcastProfile.count(),
    prisma.user.count(),
    prisma.recommendationCache.count(),
    prisma.podcastProfile.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);

  return c.json({
    data: {
      usersWithProfiles,
      podcastsWithProfiles,
      cacheHitRate: totalUsers > 0 ? cacheCount / totalUsers : 0,
      lastComputeAt: lastProfile?.computedAt ?? null,
    },
  });
});

// POST /recompute — processes one batch per call; returns cursor for next batch
recommendationsRoutes.post("/recompute", async (c) => {
  const prisma = c.get("prisma") as any;
  const cursor = c.req.query("cursor") || null;
  const result = await computePodcastProfiles(prisma, undefined, cursor);
  return c.json({ data: { processed: result.processed, cursor: result.cursor } });
});

// GET /users
recommendationsRoutes.get("/users", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        recommendationProfile: {
          select: { categoryWeights: true, listenCount: true, computedAt: true },
        },
        recommendationCache: {
          select: { computedAt: true, podcasts: true },
        },
        _count: { select: { subscriptions: true } },
      },
    }),
    prisma.user.count(),
  ]);

  const data = users.map((user: any) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    imageUrl: user.imageUrl,
    hasProfile: !!user.recommendationProfile,
    listenCount: user.recommendationProfile?.listenCount ?? 0,
    categoryCount: Object.keys(user.recommendationProfile?.categoryWeights ?? {}).length,
    subscriptionCount: user._count.subscriptions,
    cacheAge: user.recommendationCache
      ? Date.now() - new Date(user.recommendationCache.computedAt).getTime()
      : null,
    cachedRecommendationCount: user.recommendationCache
      ? (user.recommendationCache.podcasts as any[]).length
      : 0,
    profileComputedAt: user.recommendationProfile?.computedAt?.toISOString() ?? null,
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /users/:userId
recommendationsRoutes.get("/users/:userId", async (c) => {
  const prisma = c.get("prisma") as any;
  const { userId } = c.req.param();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      recommendationProfile: {
        select: { categoryWeights: true, listenCount: true, computedAt: true },
      },
      recommendationCache: {
        select: { computedAt: true, podcasts: true },
      },
      _count: { select: { subscriptions: true, podcastFavorites: true } },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  let cache = null;
  if (user.recommendationCache) {
    const cachedPodcasts = user.recommendationCache.podcasts as any[];
    const podcastIds = cachedPodcasts.map((p: any) => p.podcastId);

    const podcasts = await prisma.podcast.findMany({
      where: { id: { in: podcastIds } },
      select: {
        id: true,
        title: true,
        author: true,
        imageUrl: true,
        categories: true,
        episodeCount: true,
      },
    });

    const podcastMap = new Map(podcasts.map((p: any) => [p.id, p]));

    cache = {
      computedAt: user.recommendationCache.computedAt,
      recommendations: cachedPodcasts.map((entry: any) => ({
        podcast: podcastMap.get(entry.podcastId) ?? null,
        score: entry.score,
        reasons: entry.reasons,
      })),
    };
  }

  return c.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
      subscriptionCount: user._count.subscriptions,
      favoriteCount: user._count.podcastFavorites,
      profile: user.recommendationProfile
        ? {
            categoryWeights: user.recommendationProfile.categoryWeights,
            listenCount: user.recommendationProfile.listenCount,
            computedAt: user.recommendationProfile.computedAt,
          }
        : null,
      cache,
    },
  });
});

// POST /users/:userId/recompute
recommendationsRoutes.post("/users/:userId/recompute", async (c) => {
  const prisma = c.get("prisma") as any;
  const { userId } = c.req.param();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await recomputeUserProfile(userId, prisma);

  return c.json({ data: { userId, recomputed: true } });
});

// GET /podcast-profiles
recommendationsRoutes.get("/podcast-profiles", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const [profiles, total] = await Promise.all([
    prisma.podcastProfile.findMany({
      skip,
      take: pageSize,
      orderBy: { popularity: "desc" },
      include: {
        podcast: { select: { id: true, title: true, imageUrl: true, categories: true } },
      },
    }),
    prisma.podcastProfile.count(),
  ]);

  const data = profiles.map((profile: any) => ({
    id: profile.id,
    podcastId: profile.podcastId,
    podcastTitle: profile.podcast.title,
    podcastImageUrl: profile.podcast.imageUrl,
    categories: profile.podcast.categories,
    categoryWeights: profile.categoryWeights,
    popularity: profile.popularity,
    freshness: profile.freshness,
    subscriberCount: profile.subscriberCount,
    computedAt: profile.computedAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /topics — Topic browser
recommendationsRoutes.get("/topics", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const search = c.req.query("search") || null;

  const where: any = {};
  if (search) {
    where.OR = [
      { podcast: { title: { contains: search, mode: "insensitive" } } },
      { topicTags: { has: search } },
    ];
  }

  const [profiles, total] = await Promise.all([
    prisma.podcastProfile.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { computedAt: "desc" },
      include: {
        podcast: {
          select: { id: true, title: true, imageUrl: true, categories: true },
        },
      },
    }),
    prisma.podcastProfile.count({ where }),
  ]);

  const data = profiles.map((p: any) => ({
    podcastId: p.podcastId,
    podcastTitle: p.podcast?.title ?? "Unknown",
    podcastImageUrl: p.podcast?.imageUrl ?? null,
    categories: p.podcast?.categories ?? [],
    topicTags: p.topicTags ?? [],
    topicCount: (p.topicTags ?? []).length,
    computedAt: p.computedAt?.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /topics/:podcastId/episodes — Episode-level topics for a podcast
recommendationsRoutes.get("/topics/:podcastId/episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const podcastId = c.req.param("podcastId");

  const episodes = await prisma.episode.findMany({
    where: { podcastId, topicTags: { isEmpty: false } },
    select: { id: true, title: true, publishedAt: true, topicTags: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return c.json({
    data: episodes.map((ep: any) => ({
      id: ep.id,
      title: ep.title,
      publishedAt: ep.publishedAt?.toISOString(),
      topicTags: ep.topicTags,
    })),
  });
});

// GET /embeddings/status
recommendationsRoutes.get("/embeddings/status", async (c) => {
  const prisma = c.get("prisma") as any;

  const enabled = await getConfig(prisma, "recommendations.embeddings.enabled", false);

  const [podcastsWithEmbeddings, podcastsTotal, usersWithEmbeddings, usersTotal] = await Promise.all([
    prisma.podcastProfile.count({ where: { embedding: { not: null } } }),
    prisma.podcastProfile.count(),
    prisma.userRecommendationProfile.count({ where: { embedding: { not: null } } }),
    prisma.userRecommendationProfile.count(),
  ]);

  const lastProfile = await prisma.podcastProfile.findFirst({
    where: { embedding: { not: null } },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });

  return c.json({
    data: {
      enabled,
      model: "@cf/baai/bge-base-en-v1.5",
      podcastsWithEmbeddings,
      podcastsTotal,
      usersWithEmbeddings,
      usersTotal,
      lastComputeAt: lastProfile?.computedAt?.toISOString() ?? null,
    },
  });
});

// POST /embeddings/recompute
recommendationsRoutes.post("/embeddings/recompute", async (c) => {
  const prisma = c.get("prisma") as any;

  await prisma.platformConfig.upsert({
    where: { key: "recommendations.embeddings.enabled" },
    create: { key: "recommendations.embeddings.enabled", value: true, description: "Enable embedding computation" },
    update: { value: true },
  });

  const result = await computePodcastProfiles(prisma);

  return c.json({ data: { processed: result.processed, cursor: result.cursor, message: "First batch recomputed. Remaining batches will be processed by cron. Embeddings will be computed on next cron run with AI binding." } });
});

// GET /config — All recommendation config keys
recommendationsRoutes.get("/config", async (c) => {
  const prisma = c.get("prisma") as any;

  const configs = await prisma.platformConfig.findMany({
    where: { key: { startsWith: "recommendations." } },
    orderBy: { key: "asc" },
  });

  const defaults: Record<string, { value: unknown; description: string }> = {
    "recommendations.enabled": { value: true, description: "Master enable for recommendations" },
    "recommendations.embeddings.enabled": { value: false, description: "Enable embedding computation via Workers AI" },
    "recommendations.weights.category": { value: 0.25, description: "Weight for category affinity" },
    "recommendations.weights.topic": { value: 0.15, description: "Weight for topic Jaccard similarity" },
    "recommendations.weights.embedding": { value: 0.15, description: "Weight for embedding cosine similarity" },
    "recommendations.weights.popularity": { value: 0.20, description: "Weight for podcast popularity" },
    "recommendations.weights.freshness": { value: 0.10, description: "Weight for content freshness" },
    "recommendations.weights.subscriberOverlap": { value: 0.15, description: "Weight for subscriber overlap" },
    "recommendations.coldStart.minSubscriptions": { value: 3, description: "Min subscriptions before personalization" },
    "recommendations.cache.maxResults": { value: 20, description: "Max cached recommendations per user" },
  };

  const dbMap = new Map<string, any>(configs.map((cfg: any) => [cfg.key, cfg]));

  const data = Object.entries(defaults).map(([key, def]) => {
    const db = dbMap.get(key);
    return {
      key,
      value: db ? db.value : def.value,
      description: db?.description ?? def.description,
      isDefault: !db,
      updatedAt: db?.updatedAt?.toISOString() ?? null,
    };
  });

  return c.json({ data });
});

// PATCH /config — Update recommendation config
recommendationsRoutes.patch("/config", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ updates: { key: string; value: unknown }[] }>();

  if (!body.updates?.length) return c.json({ error: "updates required" }, 400);

  let updated = 0;
  for (const { key, value } of body.updates) {
    if (!key.startsWith("recommendations.")) continue;
    await prisma.platformConfig.upsert({
      where: { key },
      create: { key, value, description: `Recommendation config: ${key}` },
      update: { value },
    });
    updated++;
  }

  return c.json({ data: { updated } });
});
