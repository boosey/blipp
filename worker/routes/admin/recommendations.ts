import { Hono } from "hono";
import type { Env } from "../../types";
import { computePodcastProfiles, recomputeUserProfile } from "../../lib/recommendations";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

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

// POST /recompute
recommendationsRoutes.post("/recompute", async (c) => {
  const prisma = c.get("prisma") as any;
  const count = await computePodcastProfiles(prisma);
  return c.json({ data: { recomputed: count } });
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
