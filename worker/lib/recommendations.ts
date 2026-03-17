import { getConfig } from "./config";

// Types
interface CategoryWeights {
  [category: string]: number;
}

interface ScoredRecommendation {
  podcastId: string;
  score: number;
  reasons: string[];
}

interface RecommendationResult {
  recommendations: ScoredRecommendation[];
  source: "personalized" | "popular";
}

// Cosine similarity between two category weight objects
export function cosineSimilarity(a: CategoryWeights, b: CategoryWeights): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const key of keys) {
    const va = a[key] || 0;
    const vb = b[key] || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Compute profiles for ALL podcasts (run weekly via cron)
export async function computePodcastProfiles(prisma: any): Promise<number> {
  const podcasts = await prisma.podcast.findMany({
    where: { status: "active" },
    select: {
      id: true,
      categories: true,
      _count: { select: { subscriptions: true } },
      episodes: {
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { publishedAt: true },
      },
    },
  });

  if (podcasts.length === 0) return 0;

  const maxSubs = Math.max(1, ...podcasts.map((p: any) => p._count.subscriptions));

  for (const podcast of podcasts) {
    // Category weights: equal weight for each category
    const categoryWeights: CategoryWeights = {};
    const cats = podcast.categories || [];
    if (cats.length > 0) {
      const weight = 1.0 / cats.length;
      for (const cat of cats) {
        categoryWeights[cat] = weight;
      }
    }

    // Popularity: normalized subscriber count
    const popularity = podcast._count.subscriptions / maxSubs;

    // Freshness: 1 - daysSinceLastEpisode/30, clamped to [0, 1]
    let freshness = 0;
    if (podcast.episodes.length > 0) {
      const daysSince = (Date.now() - new Date(podcast.episodes[0].publishedAt).getTime()) / 86400000;
      freshness = Math.max(0, 1 - daysSince / 30);
    }

    await prisma.podcastProfile.upsert({
      where: { podcastId: podcast.id },
      create: {
        podcastId: podcast.id,
        categoryWeights,
        popularity,
        freshness,
        subscriberCount: podcast._count.subscriptions,
        computedAt: new Date(),
      },
      update: {
        categoryWeights,
        popularity,
        freshness,
        subscriberCount: podcast._count.subscriptions,
        computedAt: new Date(),
      },
    });
  }

  return podcasts.length;
}

// Compute a single user's recommendation profile
export async function computeUserProfile(userId: string, prisma: any): Promise<void> {
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    include: { podcast: { select: { categories: true } } },
  });

  const favorites = await prisma.podcastFavorite.findMany({
    where: { userId },
    include: { podcast: { select: { categories: true } } },
  });

  const listenCount = await prisma.feedItem.count({
    where: { userId, listened: true },
  });

  // Aggregate category weights from subscriptions (weight 1.0) and favorites (weight 0.5)
  const categoryWeights: CategoryWeights = {};
  for (const sub of subscriptions) {
    for (const cat of (sub.podcast.categories || [])) {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + 1.0;
    }
  }
  for (const fav of favorites) {
    for (const cat of (fav.podcast.categories || [])) {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + 0.5;
    }
  }

  // Normalize weights to 0-1 range
  const maxWeight = Math.max(1, ...Object.values(categoryWeights));
  for (const key of Object.keys(categoryWeights)) {
    categoryWeights[key] /= maxWeight;
  }

  await prisma.userRecommendationProfile.upsert({
    where: { userId },
    create: { userId, categoryWeights, listenCount, computedAt: new Date() },
    update: { categoryWeights, listenCount, computedAt: new Date() },
  });
}

// Score recommendations for a user
export async function scoreRecommendations(
  userId: string,
  prisma: any,
  maxResults?: number
): Promise<RecommendationResult> {
  const configMax = await getConfig(prisma, "recommendations.cache.maxResults", 20);
  const limit = maxResults ?? (configMax as number);
  const minSubs = await getConfig(prisma, "recommendations.coldStart.minSubscriptions", 3);
  const wCategory = await getConfig(prisma, "recommendations.weights.category", 0.40);
  const wPopularity = await getConfig(prisma, "recommendations.weights.popularity", 0.35);
  const wFreshness = await getConfig(prisma, "recommendations.weights.freshness", 0.15);
  const wOverlap = await getConfig(prisma, "recommendations.weights.subscriberOverlap", 0.10);

  // Get user's subscribed podcast IDs to exclude
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    select: { podcastId: true },
  });
  const subscribedIds = new Set(subscriptions.map((s: any) => s.podcastId));

  // Cold start: if user has fewer than minSubs subscriptions, return popular
  if (subscribedIds.size < (minSubs as number)) {
    const popular = await prisma.podcastProfile.findMany({
      where: { podcastId: { notIn: [...subscribedIds] } },
      orderBy: { popularity: "desc" },
      take: limit,
      include: { podcast: { select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true } } },
    });

    return {
      recommendations: popular.map((p: any) => ({
        podcastId: p.podcastId,
        score: p.popularity,
        reasons: ["Popular podcast"],
      })),
      source: "popular",
    };
  }

  // Full scoring
  const userProfile = await prisma.userRecommendationProfile.findUnique({
    where: { userId },
  });

  if (!userProfile) {
    // Compute on the fly if missing
    await computeUserProfile(userId, prisma);
    return scoreRecommendations(userId, prisma, maxResults);
  }

  const podcastProfiles = await prisma.podcastProfile.findMany({
    where: { podcastId: { notIn: [...subscribedIds] } },
  });

  const scored: ScoredRecommendation[] = [];
  const userWeights = userProfile.categoryWeights as CategoryWeights;

  for (const profile of podcastProfiles) {
    const podcastWeights = profile.categoryWeights as CategoryWeights;
    const reasons: string[] = [];

    // Category affinity
    const catAffinity = cosineSimilarity(userWeights, podcastWeights);
    if (catAffinity > 0.5) {
      const topCat = Object.entries(podcastWeights).sort(([,a],[,b]) => (b as number) - (a as number))[0];
      if (topCat) reasons.push(`Matches your interest in ${topCat[0]}`);
    }

    // Popularity
    if (profile.popularity > 0.7) reasons.push("Trending podcast");

    // Freshness
    if (profile.freshness > 0.8) reasons.push("Recently updated");

    // Subscriber overlap (simplified: fraction of this podcast's subscribers who also subscribe to user's podcasts)
    // For Phase 1, use a simpler heuristic
    const overlapScore = Math.min(1, profile.subscriberCount / 10);

    const score =
      (wCategory as number) * catAffinity +
      (wPopularity as number) * profile.popularity +
      (wFreshness as number) * profile.freshness +
      (wOverlap as number) * overlapScore;

    if (reasons.length === 0) reasons.push("Recommended for you");

    scored.push({ podcastId: profile.podcastId, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    recommendations: scored.slice(0, limit),
    source: "personalized",
  };
}

// Convenience: recompute user profile + cache
export async function recomputeUserProfile(userId: string, prisma: any): Promise<void> {
  await computeUserProfile(userId, prisma);
  await recomputeRecommendationCache(userId, prisma);
}

// Recompute and cache recommendations
export async function recomputeRecommendationCache(userId: string, prisma: any): Promise<void> {
  const result = await scoreRecommendations(userId, prisma);
  await prisma.recommendationCache.upsert({
    where: { userId },
    create: {
      userId,
      podcasts: result.recommendations,
      computedAt: new Date(),
    },
    update: {
      podcasts: result.recommendations,
      computedAt: new Date(),
    },
  });
}
