import { 
  computePodcastProfiles, 
  computeUserProfile,
  type ProfileBatchResult 
} from "./profiles";
import { 
  scoreRecommendations, 
  scoreEpisodeRecommendations,
  type ScoredRecommendation,
  type ScoredEpisode,
  type RecommendationResult
} from "./scoring";
import { 
  cosineSimilarity, 
  jaccardSimilarity,
  type CategoryWeights 
} from "./similarity";

export {
  computePodcastProfiles,
  computeUserProfile,
  scoreRecommendations,
  scoreEpisodeRecommendations,
  cosineSimilarity,
  jaccardSimilarity,
};

export type {
  ProfileBatchResult,
  ScoredRecommendation,
  ScoredEpisode,
  RecommendationResult,
  CategoryWeights,
};

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
      userId,
      podcasts: result.recommendations,
      computedAt: new Date(),
    },
  });
}
