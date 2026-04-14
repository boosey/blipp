import { getConfig } from "./config";
import { extractTopicsFromText, type TopicExtractionConfig } from "./topic-extraction";
import { buildEmbeddingText, computeEmbedding, averageEmbeddings, cosineSimilarityVec } from "./embeddings";

// Types
interface CategoryWeights {
  [category: string]: number;
}

export interface ScoredRecommendation {
  podcastId: string;
  score: number;
  reasons: string[];
}

export interface ScoredEpisode {
  episodeId: string;
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

// Jaccard similarity between two string arrays
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export interface ProfileBatchResult {
  processed: number;
  cursor: string | null; // null = batch complete, all podcasts processed
}

/**
 * Compute recommendation profiles for a batch of podcasts.
 * Called repeatedly by the cron job with cursor-based pagination.
 * Each call processes `batchSize` podcasts and returns a cursor for the next batch.
 * When cursor is null, all podcasts have been processed and the cycle resets.
 */
export async function computePodcastProfiles(
  prisma: any,
  env?: any,
  cursor?: string | null,
): Promise<ProfileBatchResult> {
  const batchSize = await getConfig(prisma, "recommendations.profileBatchSize", 25) as number;

  const podcasts = await prisma.podcast.findMany({
    where: {
      status: "active",
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: batchSize,
    select: {
      id: true,
      title: true,
      description: true,
      categories: true,
      _count: { select: { subscriptions: true } },
      votes: { select: { vote: true } },
      episodes: {
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: { id: true, title: true, description: true, publishedAt: true, topicTags: true },
      },
    },
  });

  if (podcasts.length === 0) {
    return { processed: 0, cursor: null };
  }

  // Get max subs across all active podcasts (cached query, not per-batch)
  const maxSubsResult = await prisma.subscription.groupBy({
    by: ["podcastId"],
    _count: true,
    orderBy: { _count: { podcastId: "desc" } },
    take: 1,
  });
  const maxSubs = Math.max(1, maxSubsResult[0]?._count ?? 1);

  // Check if embeddings are enabled
  const embeddingsEnabled = env?.AI
    ? await getConfig(prisma, "recommendations.embeddings.enabled", false)
    : false;

  // Read topic extraction config
  const topicConfig: TopicExtractionConfig = {
    maxTopics: await getConfig(prisma, "topicExtraction.maxTopics", 20) as number,
    minTokenLength: await getConfig(prisma, "topicExtraction.minTokenLength", 3) as number,
  };

  // Process all podcasts and collect DB writes
  const profileUpserts: Promise<any>[] = [];

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

    // Vote sentiment: net upvotes / total votes, 0 if no votes
    const votes = podcast.votes || [];
    const netVotes = votes.reduce((sum: number, v: any) => sum + v.vote, 0);
    const voteSentiment = votes.length > 0 ? netVotes / votes.length : 0; // -1 to 1

    // Popularity: normalized subscriber count, boosted/penalized by vote sentiment
    const rawPopularity = podcast._count.subscriptions / maxSubs;
    const popularity = Math.max(0, Math.min(1, rawPopularity + voteSentiment * 0.15));

    // Freshness: 1 - daysSinceLastEpisode/30, clamped to [0, 1]
    let freshness = 0;
    if (podcast.episodes.length > 0) {
      const daysSince = (Date.now() - new Date(podcast.episodes[0].publishedAt).getTime()) / 86400000;
      freshness = Math.max(0, 1 - daysSince / 30);
    }

    // Topic extraction: merge claims-based topicTags (if available) with description-based extraction
    // 1. Collect any existing claims-based topicTags from episodes (already computed by pipeline)
    const claimsTopicWeights = new Map<string, number>();
    for (let i = 0; i < podcast.episodes.length; i++) {
      const tags: string[] = podcast.episodes[i].topicTags || [];
      const recencyWeight = 1.0 - (i / Math.max(1, podcast.episodes.length)) * 0.5;
      for (const tag of tags) {
        claimsTopicWeights.set(tag, (claimsTopicWeights.get(tag) || 0) + recencyWeight);
      }
    }

    // 2. Extract topics from podcast + episode descriptions (always available)
    const textInputs: { text: string; weight: number }[] = [];
    if (podcast.description) {
      textInputs.push({ text: podcast.description, weight: 2.0 }); // podcast description weighted highest
    }
    if (podcast.title) {
      textInputs.push({ text: podcast.title, weight: 1.5 });
    }
    for (let i = 0; i < podcast.episodes.length; i++) {
      const ep = podcast.episodes[i];
      const recencyWeight = 1.0 - (i / Math.max(1, podcast.episodes.length)) * 0.5;
      if (ep.title) textInputs.push({ text: ep.title, weight: recencyWeight });
      if (ep.description) textInputs.push({ text: ep.description, weight: recencyWeight * 0.5 });
    }
    const descriptionTopics = extractTopicsFromText(textInputs, topicConfig);

    // 3. Merge: claims-based topics get a boost since they're higher quality
    const mergedWeights = new Map<string, number>();
    for (const t of descriptionTopics) {
      mergedWeights.set(t.topic, t.weight);
    }
    for (const [tag, w] of claimsTopicWeights) {
      mergedWeights.set(tag, (mergedWeights.get(tag) || 0) + w * 2.0);
    }

    const podcastTopics = [...mergedWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([topic]) => topic);

    // Embedding computation
    let embedding: number[] | null = null;
    if (embeddingsEnabled && env?.AI && podcastTopics.length > 0) {
      const text = buildEmbeddingText(podcast.title, podcast.description, podcastTopics);
      embedding = await computeEmbedding(env.AI, text);
    }

    profileUpserts.push(prisma.podcastProfile.upsert({
      where: { podcastId: podcast.id },
      create: {
        podcastId: podcast.id,
        categoryWeights,
        topicTags: podcastTopics,
        popularity,
        freshness,
        subscriberCount: podcast._count.subscriptions,
        ...(embedding ? { embedding } : {}),
        computedAt: new Date(),
      },
      update: {
        categoryWeights,
        topicTags: podcastTopics,
        popularity,
        freshness,
        subscriberCount: podcast._count.subscriptions,
        ...(embedding ? { embedding } : {}),
        computedAt: new Date(),
      },
    }));
  }

  // Execute all profile upserts in parallel
  await Promise.all(profileUpserts);

  // Return cursor: last podcast ID in this batch, or null if we got fewer than batchSize (done)
  const nextCursor = podcasts.length < batchSize ? null : podcasts[podcasts.length - 1].id;
  return { processed: podcasts.length, cursor: nextCursor };
}

/** Compute Jaccard overlap between a candidate podcast's subscribers and the user's co-subscribers. */
function subscriberOverlap(
  candidateSubscribers: Set<string>,
  userSubscribedPodcastIds: string[],
  subscriberSets: Map<string, Set<string>>,
): number {
  if (candidateSubscribers.size === 0 || userSubscribedPodcastIds.length === 0) return 0;
  // Union of all subscribers across user's subscribed podcasts
  const userCoSubscribers = new Set<string>();
  for (const pid of userSubscribedPodcastIds) {
    const subs = subscriberSets.get(pid);
    if (subs) for (const uid of subs) userCoSubscribers.add(uid);
  }
  if (userCoSubscribers.size === 0) return 0;
  // Jaccard: |intersection| / |union|
  let intersection = 0;
  for (const uid of candidateSubscribers) {
    if (userCoSubscribers.has(uid)) intersection++;
  }
  const union = new Set([...candidateSubscribers, ...userCoSubscribers]).size;
  return union > 0 ? intersection / union : 0;
}

// Compute a single user's recommendation profile
export async function computeUserProfile(userId: string, prisma: any): Promise<void> {
  const [subscriptions, favorites, podcastVotes, episodeVotes, listenCount, userRecord] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId },
      include: { podcast: { select: { categories: true } } },
    }),
    prisma.podcastFavorite.findMany({
      where: { userId },
      include: { podcast: { select: { categories: true } } },
    }),
    prisma.podcastVote.findMany({
      where: { userId },
      include: { podcast: { select: { categories: true } } },
    }),
    prisma.episodeVote.findMany({
      where: { userId },
      include: { episode: { select: { podcast: { select: { categories: true } } } } },
    }),
    prisma.feedItem.count({
      where: { userId, listened: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        preferredCategories: true,
        excludedCategories: true,
        preferredTopics: true,
        excludedTopics: true,
      },
    }),
  ]);

  // Aggregate category weights from signals:
  //   subscriptions: +1.0, favorites: +0.5,
  //   podcast upvote: +0.7, podcast downvote: -0.7,
  //   episode upvote: +0.3, episode downvote: -0.3
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
  for (const pv of podcastVotes) {
    const w = pv.vote > 0 ? 0.7 : -0.7;
    for (const cat of (pv.podcast.categories || [])) {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + w;
    }
  }
  for (const ev of episodeVotes) {
    const w = ev.vote > 0 ? 0.3 : -0.3;
    for (const cat of (ev.episode?.podcast?.categories || [])) {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + w;
    }
  }

  // Blend explicit category preferences (before normalization)
  const explicitPreferred = userRecord?.preferredCategories ?? [];
  const explicitExcluded = userRecord?.excludedCategories ?? [];
  for (const cat of explicitPreferred) {
    categoryWeights[cat] = (categoryWeights[cat] || 0) + 1.0;
  }
  for (const cat of explicitExcluded) {
    categoryWeights[cat] = 0;
  }

  // Normalize weights to 0-1 range (clamp negatives to 0)
  for (const key of Object.keys(categoryWeights)) {
    if (categoryWeights[key] < 0) categoryWeights[key] = 0;
  }
  const maxWeight = Math.max(1, ...Object.values(categoryWeights));
  for (const key of Object.keys(categoryWeights)) {
    categoryWeights[key] /= maxWeight;
  }

  // Aggregate topics from podcast profiles
  const subscribedPodcastIds = subscriptions.map((s: any) => s.podcastId);
  const upvotedPodcastIds = podcastVotes
    .filter((pv: any) => pv.vote > 0)
    .map((pv: any) => pv.podcastId);
  const allRelevantIds = [...new Set([...subscribedPodcastIds, ...upvotedPodcastIds])];

  let userTopics: string[] = [];
  let userEmbedding: number[] | null = null;

  if (allRelevantIds.length > 0) {
    const profiles = await prisma.podcastProfile.findMany({
      where: { podcastId: { in: allRelevantIds } },
      select: { podcastId: true, topicTags: true, embedding: true },
    });

    const topicWeights = new Map<string, number>();
    const subscribedSet = new Set(subscribedPodcastIds);
    const upvotedSet = new Set(upvotedPodcastIds);

    for (const profile of profiles) {
      const tags: string[] = profile.topicTags || [];
      // Subscription topics weight 1.0, upvote topics weight 0.7
      let weight = 0;
      if (subscribedSet.has(profile.podcastId)) weight += 1.0;
      if (upvotedSet.has(profile.podcastId)) weight += 0.7;

      for (const tag of tags) {
        topicWeights.set(tag, (topicWeights.get(tag) || 0) + weight);
      }
    }

    // Inject explicit topic preferences with guaranteed high weight
    const explicitTopics = userRecord?.preferredTopics ?? [];
    const excludedTopicSet = new Set(userRecord?.excludedTopics ?? []);
    if (explicitTopics.length > 0) {
      const maxImplicit = topicWeights.size > 0 ? Math.max(...topicWeights.values()) : 1.0;
      const explicitWeight = maxImplicit * 1.5;
      for (const topic of explicitTopics) {
        const existing = topicWeights.get(topic) || 0;
        topicWeights.set(topic, Math.max(existing, explicitWeight));
      }
    }

    // Take top 30 user topics, filtering out excluded topics
    userTopics = [...topicWeights.entries()]
      .filter(([topic]) => !excludedTopicSet.has(topic))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([topic]) => topic);

    // Compute user embedding as centroid of subscribed podcast embeddings
    const subscribedEmbeddings = profiles
      .filter((p: any) => subscribedSet.has(p.podcastId) && p.embedding)
      .map((p: any) => p.embedding as number[]);

    if (subscribedEmbeddings.length > 0) {
      userEmbedding = averageEmbeddings(subscribedEmbeddings);
    }
  } else {
    // No subscriptions/upvotes — use explicit topics only (cold-start with prefs)
    const explicitTopics = userRecord?.preferredTopics ?? [];
    const excludedTopicSet = new Set(userRecord?.excludedTopics ?? []);
    userTopics = explicitTopics.filter((t: string) => !excludedTopicSet.has(t)).slice(0, 30);
  }

  await prisma.userRecommendationProfile.upsert({
    where: { userId },
    create: {
      userId,
      categoryWeights,
      topicTags: userTopics,
      listenCount,
      ...(userEmbedding ? { embedding: userEmbedding } : {}),
      computedAt: new Date(),
    },
    update: {
      categoryWeights,
      topicTags: userTopics,
      listenCount,
      ...(userEmbedding ? { embedding: userEmbedding } : {}),
      computedAt: new Date(),
    },
  });
}

// Score recommendations for a user
export async function scoreRecommendations(
  userId: string,
  prisma: any,
  maxResults?: number,
): Promise<RecommendationResult> {
  const configMax = await getConfig(prisma, "recommendations.cache.maxResults", 20);
  const limit = maxResults ?? (configMax as number);
  const minSubs = await getConfig(prisma, "recommendations.coldStart.minSubscriptions", 3);
  const wCategory = await getConfig(prisma, "recommendations.weights.category", 0.25);
  const wPopularity = await getConfig(prisma, "recommendations.weights.popularity", 0.20);
  const wFreshness = await getConfig(prisma, "recommendations.weights.freshness", 0.10);
  const wOverlap = await getConfig(prisma, "recommendations.weights.subscriberOverlap", 0.15);
  const wTopic = await getConfig(prisma, "recommendations.weights.topic", 0.15);
  const wEmbedding = await getConfig(prisma, "recommendations.weights.embedding", 0.15);
  const wLocalBoost = await getConfig(prisma, "recommendations.weights.localBoost", 0.10);
  const wExplicitTopic = await getConfig(prisma, "recommendations.weights.explicitTopicBonus", 0.05);
  const exclusionTopicPenalty = await getConfig(prisma, "recommendations.exclusion.topicPenalty", 0.3);
  const explicitMinCats = await getConfig(prisma, "recommendations.coldStart.explicitMinCategories", 2);
  const explicitMinTopics = await getConfig(prisma, "recommendations.coldStart.explicitMinTopics", 3);

  // Load user's explicit preferences for filtering and scoring
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      preferredCategories: true,
      excludedCategories: true,
      preferredTopics: true,
      excludedTopics: true,
      city: true,
      state: true,
    },
  });
  const excludedCategorySet = new Set<string>(userRecord?.excludedCategories ?? []);
  const excludedTopicSet = new Set<string>(userRecord?.excludedTopics ?? []);
  const userExplicitTopics: string[] = userRecord?.preferredTopics ?? [];

  // Load geo-profiles for user's city/state (pre-computed by cron)
  const userCity = userRecord?.city;
  const userState = userRecord?.state;
  let geoProfileMap = new Map<string, number>(); // podcastId → max confidence
  if (userCity && userState) {
    const [cityProfiles, stateProfiles] = await Promise.all([
      prisma.podcastGeoProfile.findMany({
        where: { city: userCity, state: userState },
        select: { podcastId: true, confidence: true },
      }),
      prisma.podcastGeoProfile.findMany({
        where: { state: userState, NOT: { city: userCity } },
        select: { podcastId: true, confidence: true },
      }),
    ]);
    for (const gp of cityProfiles) {
      const existing = geoProfileMap.get(gp.podcastId) || 0;
      geoProfileMap.set(gp.podcastId, Math.max(existing, gp.confidence));
    }
    for (const gp of stateProfiles) {
      const existing = geoProfileMap.get(gp.podcastId) || 0;
      geoProfileMap.set(gp.podcastId, Math.max(existing, gp.confidence * 0.4));
    }
  }

  // Get user's subscribed, downvoted, and dismissed podcast IDs to exclude
  const [subscriptions, downvotes, dismissals] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId },
      select: { podcastId: true },
    }),
    prisma.podcastVote.findMany({
      where: { userId, vote: -1 },
      select: { podcastId: true },
    }),
    prisma.recommendationDismissal.findMany({
      where: { userId },
      select: { podcastId: true },
    }),
  ]);
  const subscribedIds = new Set<string>(subscriptions.map((s: any) => s.podcastId));
  const subscribedPodcastIds: string[] = [...subscribedIds];
  const downvotedIds = new Set(downvotes.map((d: any) => d.podcastId));
  const dismissedIds = new Set(dismissals.map((d: any) => d.podcastId));
  const excludeIds = new Set([...subscribedIds, ...downvotedIds, ...dismissedIds]);

  // Cold start: if user has fewer than minSubs subscriptions
  const hasExplicitPrefs =
    (userRecord?.preferredCategories?.length ?? 0) >= (explicitMinCats as number) ||
    (userRecord?.preferredTopics?.length ?? 0) >= (explicitMinTopics as number);

  if (subscribedIds.size < (minSubs as number)) {
    if (hasExplicitPrefs) {
      // Explicit-preferences cold start: use declared interests to personalize
      const preferredCats = new Set<string>(userRecord?.preferredCategories ?? []);

      const candidates = await prisma.podcastProfile.findMany({
        where: { podcastId: { notIn: [...excludeIds] }, podcast: { deliverable: true } },
        include: { podcast: { select: { title: true, categories: true } } },
      });

      const scored: ScoredRecommendation[] = [];
      for (const profile of candidates) {
        const podcastCats: string[] = profile.podcast?.categories ?? [];
        // Hard-filter: skip if all categories are excluded
        if (podcastCats.length > 0 && podcastCats.every((c: string) => excludedCategorySet.has(c))) continue;

        const reasons: string[] = [];
        const podcastWeights = profile.categoryWeights as CategoryWeights;

        // Synthetic category weights from explicit preferences
        const syntheticWeights: CategoryWeights = {};
        for (const cat of preferredCats) syntheticWeights[cat] = 1.0;
        const catAffinity = cosineSimilarity(syntheticWeights, podcastWeights);
        if (catAffinity > 0.3) {
          const matchedCat = podcastCats.find((c: string) => preferredCats.has(c));
          if (matchedCat) reasons.push(`Matches your interest in ${matchedCat}`);
        }

        // Topic matching
        const podcastTopics = (profile.topicTags as string[]) || [];
        const topicOverlap = userExplicitTopics.filter((t) => new Set(podcastTopics).has(t)).length;
        const topicScore = userExplicitTopics.length > 0 ? topicOverlap / userExplicitTopics.length : 0;
        if (topicScore > 0) {
          const matchedTopic = userExplicitTopics.find((t) => new Set(podcastTopics).has(t));
          if (matchedTopic) reasons.push(`Covers ${matchedTopic}`);
        }

        // Excluded topic penalty
        const excludedOverlap = podcastTopics.filter((t: string) => excludedTopicSet.has(t)).length;
        let penalty = 1;
        if (excludedOverlap > 0) penalty = Math.max(0.1, 1 - excludedOverlap * (exclusionTopicPenalty as number));

        const score = (
          0.35 * catAffinity +
          0.25 * topicScore +
          0.20 * profile.popularity +
          0.10 * profile.freshness +
          0.10 * (userExplicitTopics.length > 0 ? topicScore : 0)
        ) * penalty;

        if (reasons.length === 0) reasons.push("Based on your preferences");
        scored.push({ podcastId: profile.podcastId, score, reasons });
      }

      scored.sort((a, b) => b.score - a.score);
      return { recommendations: scored.slice(0, limit), source: "personalized" };
    }

    // No explicit prefs: prefer Apple chart rank ordering, fall back to popularity
    const ranked = await prisma.podcast.findMany({
      where: { id: { notIn: [...excludeIds] }, deliverable: true, appleRank: { not: null } },
      orderBy: { appleRank: "asc" },
      take: limit * 3, // over-fetch to allow exclusion filtering
      select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, appleRank: true },
    });

    // Filter out excluded categories even in chart fallback
    let results = ranked
      .filter((p: any) => {
        const cats: string[] = p.categories ?? [];
        if (cats.length > 0 && cats.every((c: string) => excludedCategorySet.has(c))) return false;
        return true;
      })
      .slice(0, limit)
      .map((p: any) => ({
        podcastId: p.id,
        score: 1 - (p.appleRank - 1) / 200,
        reasons: [`#${p.appleRank} on Apple Podcasts`],
      }));

    if (results.length < limit) {
      const rankedIds = new Set(ranked.map((p: any) => p.id));
      const backfillExclude = [...excludeIds, ...rankedIds];
      const backfill = await prisma.podcastProfile.findMany({
        where: { podcastId: { notIn: backfillExclude }, podcast: { deliverable: true } },
        orderBy: { popularity: "desc" },
        take: limit - results.length,
      });
      results = results.concat(backfill.map((p: any) => ({
        podcastId: p.podcastId,
        score: p.popularity,
        reasons: ["Popular podcast"],
      })));
    }

    return {
      recommendations: results,
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
    where: { podcastId: { notIn: [...excludeIds] }, podcast: { deliverable: true } },
    include: { podcast: { select: { title: true, categories: true, subscriptions: { select: { userId: true } } } } },
  });

  // Build subscriber sets for overlap computation
  const subscriberSets = new Map<string, Set<string>>();
  for (const profile of podcastProfiles) {
    subscriberSets.set(
      profile.podcastId,
      new Set((profile.podcast?.subscriptions || []).map((s: any) => s.userId))
    );
  }
  // Also need subscriber sets for user's own subscriptions
  const userSubProfiles = await prisma.podcast.findMany({
    where: { id: { in: subscribedPodcastIds } },
    select: { id: true, subscriptions: { select: { userId: true } } },
  });
  for (const p of userSubProfiles) {
    subscriberSets.set(p.id, new Set(p.subscriptions.map((s: any) => s.userId)));
  }

  // Engagement multiplier: users who listen more get sharper personalization
  const maxBoostPercent = await getConfig(prisma, "recommendations.engagement.maxBoostPercent", 30) as number;
  const maxBoostListens = await getConfig(prisma, "recommendations.engagement.maxBoostListens", 167) as number;
  const listenCount = userProfile.listenCount ?? 0;
  const engagementMultiplier = 1.0 + Math.min(maxBoostPercent / 100, listenCount / maxBoostListens);

  const scored: ScoredRecommendation[] = [];
  const userWeights = userProfile.categoryWeights as CategoryWeights;

  for (const profile of podcastProfiles) {
    // Hard exclusion: skip if all categories are in the excluded set
    const podcastCats: string[] = profile.podcast?.categories ?? [];
    if (excludedCategorySet.size > 0 && podcastCats.length > 0 && podcastCats.every((c: string) => excludedCategorySet.has(c))) {
      continue;
    }

    const podcastWeights = profile.categoryWeights as CategoryWeights;
    const reasons: string[] = [];

    // Category affinity (boosted by engagement)
    const catAffinityThreshold = await getConfig(prisma, "recommendations.categoryAffinityThreshold", 0.5) as number;
    const catAffinity = cosineSimilarity(userWeights, podcastWeights) * engagementMultiplier;
    if (catAffinity > catAffinityThreshold) {
      const topCat = Object.entries(podcastWeights).sort(([,a],[,b]) => (b as number) - (a as number))[0];
      if (topCat) reasons.push(`Matches your interest in ${topCat[0]}`);
    }

    // Popularity
    if (profile.popularity > 0.7) reasons.push("Trending podcast");

    // Freshness
    if (profile.freshness > 0.8) reasons.push("Recently updated");

    // Subscriber overlap: Jaccard similarity between candidate's subscribers and user's co-subscriber pool
    const candidateSubs = subscriberSets.get(profile.podcastId) || new Set<string>();
    const overlapScore = subscriberOverlap(candidateSubs, subscribedPodcastIds, subscriberSets);
    if (overlapScore > 0.1) reasons.push("Popular with listeners like you");

    // Topic similarity (Jaccard)
    const userTopics = (userProfile.topicTags as string[]) || [];
    const podcastTopics = (profile.topicTags as string[]) || [];
    const topicScore = jaccardSimilarity(userTopics, podcastTopics);
    if (topicScore > 0.1) {
      const overlap = userTopics.filter(t => new Set(podcastTopics).has(t));
      if (overlap[0]) reasons.push(`Both cover ${overlap[0]}`);
    }

    // Embedding similarity
    const userEmb = userProfile.embedding as number[] | null;
    const podcastEmb = profile.embedding as number[] | null;
    let embScore = 0;
    const hasEmbedding = !!(userEmb && podcastEmb);
    if (hasEmbedding) {
      embScore = cosineSimilarityVec(userEmb, podcastEmb) ?? 0;
      if (embScore > 0.7) reasons.push("Semantically similar to podcasts you enjoy");
    }

    // Local content boost (geo-profile based)
    let localBoost = 0;
    const geoConfidence = geoProfileMap.get(profile.podcastId);
    if (geoConfidence) {
      localBoost = (wLocalBoost as number) * geoConfidence;
      reasons.push("Local to your area");
    }

    // Explicit topic bonus (additive, like localBoost)
    let explicitTopicBonus = 0;
    if (userExplicitTopics.length > 0) {
      const podcastTopicSet = new Set(podcastTopics);
      const matchCount = userExplicitTopics.filter((t) => podcastTopicSet.has(t)).length;
      explicitTopicBonus = (wExplicitTopic as number) * (matchCount / userExplicitTopics.length);
      if (matchCount > 0 && !reasons.some(r => r.startsWith("Both cover"))) {
        const matchedTopic = userExplicitTopics.find((t) => podcastTopicSet.has(t));
        if (matchedTopic) reasons.push(`Covers your interest in ${matchedTopic}`);
      }
    }

    // Excluded topic penalty
    let excludedTopicPenalty = 1;
    if (excludedTopicSet.size > 0) {
      const excludedOverlap = podcastTopics.filter((t: string) => excludedTopicSet.has(t)).length;
      if (excludedOverlap > 0) {
        excludedTopicPenalty = Math.max(0.1, 1 - excludedOverlap * (exclusionTopicPenalty as number));
      }
    }

    let score: number;
    if (hasEmbedding) {
      score =
        (wCategory as number) * Math.min(1, catAffinity) +
        (wTopic as number) * topicScore +
        (wEmbedding as number) * embScore +
        (wPopularity as number) * profile.popularity +
        (wFreshness as number) * profile.freshness +
        (wOverlap as number) * overlapScore +
        localBoost +
        explicitTopicBonus;
    } else {
      // Redistribute embedding weight proportionally to other signals
      const totalOther = (wCategory as number) + (wTopic as number) + (wPopularity as number) + (wFreshness as number) + (wOverlap as number);
      const scale = totalOther > 0 ? (totalOther + (wEmbedding as number)) / totalOther : 1;
      score =
        (wCategory as number) * scale * Math.min(1, catAffinity) +
        (wTopic as number) * scale * topicScore +
        (wPopularity as number) * scale * profile.popularity +
        (wFreshness as number) * scale * profile.freshness +
        (wOverlap as number) * scale * overlapScore +
        localBoost +
        explicitTopicBonus;
    }

    // Apply excluded topic penalty
    score *= excludedTopicPenalty;

    if (reasons.length === 0) reasons.push("Recommended for you");

    scored.push({ podcastId: profile.podcastId, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    recommendations: scored.slice(0, limit),
    source: "personalized",
  };
}

// Score episode-level recommendations for a user
export async function scoreEpisodeRecommendations(
  userId: string,
  prisma: any,
  maxResults = 20
): Promise<{ episodes: ScoredEpisode[]; podcastSuggestions: ScoredRecommendation[] }> {
  const userProfile = await prisma.userRecommendationProfile.findUnique({
    where: { userId },
  });

  if (!userProfile) {
    await computeUserProfile(userId, prisma);
    return scoreEpisodeRecommendations(userId, prisma, maxResults);
  }

  // Get user's subscribed + excluded podcast IDs
  const [subscriptions, downvotes, dismissals] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId },
      select: { podcastId: true },
    }),
    prisma.podcastVote.findMany({
      where: { userId, vote: -1 },
      select: { podcastId: true },
    }),
    prisma.recommendationDismissal.findMany({
      where: { userId },
      select: { podcastId: true },
    }),
  ]);
  const subscribedIds = new Set<string>(subscriptions.map((s: any) => s.podcastId));
  const excludeIds = new Set([
    ...subscribedIds,
    ...downvotes.map((d: any) => d.podcastId),
    ...dismissals.map((d: any) => d.podcastId),
  ]);

  // Query recent episodes from non-subscribed, non-excluded podcasts that have topicTags
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const episodes = await prisma.episode.findMany({
    where: {
      publishedAt: { gte: thirtyDaysAgo },
      podcast: { id: { notIn: [...excludeIds] } },
      topicTags: { isEmpty: false },
    },
    select: {
      id: true,
      podcastId: true,
      topicTags: true,
      publishedAt: true,
      podcast: { select: { id: true, title: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });

  const userTopics = (userProfile.topicTags as string[]) || [];

  // Engagement multiplier
  const listenCount = userProfile.listenCount ?? 0;
  const engagementMultiplier = 1.0 + Math.min(0.3, listenCount / 167);

  // Score each episode
  const scoredEpisodes: ScoredEpisode[] = [];
  const podcastHitCounts = new Map<string, number>();

  for (const ep of episodes) {
    const epTopics = (ep.topicTags as string[]) || [];
    const topicScore = jaccardSimilarity(userTopics, epTopics) * engagementMultiplier;

    if (topicScore > 0) {
      const reasons: string[] = [];
      const overlap = userTopics.filter((t: string) => new Set(epTopics).has(t));
      if (overlap[0]) reasons.push(`Covers ${overlap[0]}`);
      if (reasons.length === 0) reasons.push("Matches your interests");

      scoredEpisodes.push({
        episodeId: ep.id,
        podcastId: ep.podcastId,
        score: topicScore,
        reasons,
      });

      podcastHitCounts.set(ep.podcastId, (podcastHitCounts.get(ep.podcastId) || 0) + 1);
    }
  }

  scoredEpisodes.sort((a, b) => b.score - a.score);

  // Podcasts with 3+ matched episodes become podcast suggestions
  const podcastSuggestions: ScoredRecommendation[] = [];
  for (const [podcastId, count] of podcastHitCounts) {
    if (count >= 3) {
      const epScores = scoredEpisodes.filter(e => e.podcastId === podcastId);
      const avgScore = epScores.reduce((s, e) => s + e.score, 0) / epScores.length;
      podcastSuggestions.push({
        podcastId,
        score: avgScore,
        reasons: [`${count} recent episodes match your interests`],
      });
    }
  }
  podcastSuggestions.sort((a, b) => b.score - a.score);

  return {
    episodes: scoredEpisodes.slice(0, maxResults),
    podcastSuggestions,
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
