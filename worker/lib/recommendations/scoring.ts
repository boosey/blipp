import { getConfig } from "../config";
import { cosineSimilarityVec } from "../embeddings";
import { 
  cosineSimilarity, 
  jaccardSimilarity, 
  subscriberOverlap, 
  type CategoryWeights 
} from "./similarity";
import { computeUserProfile } from "./profiles";

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

export interface RecommendationResult {
  recommendations: ScoredRecommendation[];
  source: "personalized" | "popular";
}

/**
 * Score recommendations for a user.
 */
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

  const userCity = userRecord?.city;
  const userState = userRecord?.state;
  let geoProfileMap = new Map<string, number>();
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

  const hasExplicitPrefs =
    (userRecord?.preferredCategories?.length ?? 0) >= (explicitMinCats as number) ||
    (userRecord?.preferredTopics?.length ?? 0) >= (explicitMinTopics as number);

  if (subscribedIds.size < (minSubs as number)) {
    if (hasExplicitPrefs) {
      const preferredCats = new Set<string>(userRecord?.preferredCategories ?? []);

      const candidates = await prisma.podcastProfile.findMany({
        where: { podcastId: { notIn: [...excludeIds] }, podcast: { deliverable: true } },
        include: { podcast: { select: { title: true, categories: true } } },
      });

      const scored: ScoredRecommendation[] = [];
      for (const profile of candidates) {
        const podcastCats: string[] = profile.podcast?.categories ?? [];
        if (podcastCats.length > 0 && podcastCats.every((c: string) => excludedCategorySet.has(c))) continue;

        const reasons: string[] = [];
        const podcastWeights = profile.categoryWeights as CategoryWeights;

        const syntheticWeights: CategoryWeights = {};
        for (const cat of preferredCats) syntheticWeights[cat] = 1.0;
        const catAffinity = cosineSimilarity(syntheticWeights, podcastWeights);
        if (catAffinity > 0.3) {
          const matchedCat = podcastCats.find((c: string) => preferredCats.has(c));
          if (matchedCat) reasons.push(`Matches your interest in ${matchedCat}`);
        }

        const podcastTopics = (profile.topicTags as string[]) || [];
        const topicOverlap = userExplicitTopics.filter((t) => new Set(podcastTopics).has(t)).length;
        const topicScore = userExplicitTopics.length > 0 ? topicOverlap / userExplicitTopics.length : 0;
        if (topicScore > 0) {
          const matchedTopic = userExplicitTopics.find((t) => new Set(podcastTopics).has(t));
          if (matchedTopic) reasons.push(`Covers ${matchedTopic}`);
        }

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

    const ranked = await prisma.podcast.findMany({
      where: { id: { notIn: [...excludeIds] }, deliverable: true, appleRank: { not: null } },
      orderBy: { appleRank: "asc" },
      take: limit * 3,
      select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, appleRank: true },
    });

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

  const userProfile = await prisma.userRecommendationProfile.findUnique({
    where: { userId },
  });

  if (!userProfile) {
    await computeUserProfile(userId, prisma);
    return scoreRecommendations(userId, prisma, maxResults);
  }

  const podcastProfiles = await prisma.podcastProfile.findMany({
    where: { podcastId: { notIn: [...excludeIds] }, podcast: { deliverable: true } },
    include: { podcast: { select: { title: true, categories: true, subscriptions: { select: { userId: true } } } } },
  });

  const subscriberSets = new Map<string, Set<string>>();
  for (const profile of podcastProfiles) {
    subscriberSets.set(
      profile.podcastId,
      new Set((profile.podcast?.subscriptions || []).map((s: any) => s.userId))
    );
  }
  const userSubProfiles = await prisma.podcast.findMany({
    where: { id: { in: subscribedPodcastIds } },
    select: { id: true, subscriptions: { select: { userId: true } } },
  });
  for (const p of userSubProfiles) {
    subscriberSets.set(p.id, new Set(p.subscriptions.map((s: any) => s.userId)));
  }

  const maxBoostPercent = await getConfig(prisma, "recommendations.engagement.maxBoostPercent", 30) as number;
  const maxBoostListens = await getConfig(prisma, "recommendations.engagement.maxBoostListens", 167) as number;
  const listenCount = userProfile.listenCount ?? 0;
  const engagementMultiplier = 1.0 + Math.min(maxBoostPercent / 100, listenCount / maxBoostListens);

  const scored: ScoredRecommendation[] = [];
  const userWeights = userProfile.categoryWeights as CategoryWeights;

  for (const profile of podcastProfiles) {
    const podcastCats: string[] = profile.podcast?.categories ?? [];
    if (excludedCategorySet.size > 0 && podcastCats.length > 0 && podcastCats.every((c: string) => excludedCategorySet.has(c))) {
      continue;
    }

    const podcastWeights = profile.categoryWeights as CategoryWeights;
    const reasons: string[] = [];

    const catAffinityThreshold = await getConfig(prisma, "recommendations.categoryAffinityThreshold", 0.5) as number;
    const catAffinity = cosineSimilarity(userWeights, podcastWeights) * engagementMultiplier;
    if (catAffinity > catAffinityThreshold) {
      const topCat = Object.entries(podcastWeights).sort(([,a],[,b]) => (b as number) - (a as number))[0];
      if (topCat) reasons.push(`Matches your interest in ${topCat[0]}`);
    }

    if (profile.popularity > 0.7) reasons.push("Trending podcast");
    if (profile.freshness > 0.8) reasons.push("Recently updated");

    const candidateSubs = subscriberSets.get(profile.podcastId) || new Set<string>();
    const overlapScore = subscriberOverlap(candidateSubs, subscribedPodcastIds, subscriberSets);
    if (overlapScore > 0.1) reasons.push("Popular with listeners like you");

    const userTopics = (userProfile.topicTags as string[]) || [];
    const podcastTopics = (profile.topicTags as string[]) || [];
    const topicScore = jaccardSimilarity(userTopics, podcastTopics);
    if (topicScore > 0.1) {
      const overlap = userTopics.filter(t => new Set(podcastTopics).has(t));
      if (overlap[0]) reasons.push(`Both cover ${overlap[0]}`);
    }

    const userEmb = userProfile.embedding as number[] | null;
    const podcastEmb = profile.embedding as number[] | null;
    let embScore = 0;
    const hasEmbedding = !!(userEmb && podcastEmb);
    if (hasEmbedding) {
      embScore = cosineSimilarityVec(userEmb, podcastEmb) ?? 0;
      if (embScore > 0.7) reasons.push("Semantically similar to podcasts you enjoy");
    }

    let localBoost = 0;
    const geoConfidence = geoProfileMap.get(profile.podcastId);
    if (geoConfidence) {
      localBoost = (wLocalBoost as number) * geoConfidence;
      reasons.push("Local to your area");
    }

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

/**
 * Score episode-level recommendations for a user.
 */
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
  const listenCount = userProfile.listenCount ?? 0;
  const engagementMultiplier = 1.0 + Math.min(0.3, listenCount / 167);

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
