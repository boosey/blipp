import { getConfig } from "../config";
import { extractTopicsFromText, type TopicExtractionConfig } from "../topic-extraction";
import { buildEmbeddingText, computeEmbedding, averageEmbeddings } from "../embeddings";
import type { CategoryWeights } from "./similarity";

export interface ProfileBatchResult {
  processed: number;
  cursor: string | null; // null = batch complete, all podcasts processed
}

/**
 * Compute recommendation profiles for a batch of podcasts.
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

  // Get max subs across all active podcasts
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

  const profileUpserts: Promise<any>[] = [];

  for (const podcast of podcasts) {
    const categoryWeights: CategoryWeights = {};
    const cats = podcast.categories || [];
    if (cats.length > 0) {
      const weight = 1.0 / cats.length;
      for (const cat of cats) {
        categoryWeights[cat] = weight;
      }
    }

    const votes = podcast.votes || [];
    const netVotes = votes.reduce((sum: number, v: any) => sum + v.vote, 0);
    const voteSentiment = votes.length > 0 ? netVotes / votes.length : 0;

    const rawPopularity = podcast._count.subscriptions / maxSubs;
    const popularity = Math.max(0, Math.min(1, rawPopularity + voteSentiment * 0.15));

    let freshness = 0;
    if (podcast.episodes.length > 0) {
      const daysSince = (Date.now() - new Date(podcast.episodes[0].publishedAt).getTime()) / 86400000;
      freshness = Math.max(0, 1 - daysSince / 30);
    }

    const claimsTopicWeights = new Map<string, number>();
    for (let i = 0; i < podcast.episodes.length; i++) {
      const tags: string[] = podcast.episodes[i].topicTags || [];
      const recencyWeight = 1.0 - (i / Math.max(1, podcast.episodes.length)) * 0.5;
      for (const tag of tags) {
        claimsTopicWeights.set(tag, (claimsTopicWeights.get(tag) || 0) + recencyWeight);
      }
    }

    const textInputs: { text: string; weight: number }[] = [];
    if (podcast.description) {
      textInputs.push({ text: podcast.description, weight: 2.0 });
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

  await Promise.all(profileUpserts);

  const nextCursor = podcasts.length < batchSize ? null : podcasts[podcasts.length - 1].id;
  return { processed: podcasts.length, cursor: nextCursor };
}

/**
 * Compute a single user's recommendation profile.
 */
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

  const explicitPreferred = userRecord?.preferredCategories ?? [];
  const explicitExcluded = userRecord?.excludedCategories ?? [];
  for (const cat of explicitPreferred) {
    categoryWeights[cat] = (categoryWeights[cat] || 0) + 1.0;
  }
  for (const cat of explicitExcluded) {
    categoryWeights[cat] = 0;
  }

  for (const key of Object.keys(categoryWeights)) {
    if (categoryWeights[key] < 0) categoryWeights[key] = 0;
  }
  const maxWeight = Math.max(1, ...Object.values(categoryWeights));
  for (const key of Object.keys(categoryWeights)) {
    categoryWeights[key] /= maxWeight;
  }

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
      let weight = 0;
      if (subscribedSet.has(profile.podcastId)) weight += 1.0;
      if (upvotedSet.has(profile.podcastId)) weight += 0.7;

      for (const tag of tags) {
        topicWeights.set(tag, (topicWeights.get(tag) || 0) + weight);
      }
    }

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

    userTopics = [...topicWeights.entries()]
      .filter(([topic]) => !excludedTopicSet.has(topic))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([topic]) => topic);

    const subscribedEmbeddings = profiles
      .filter((p: any) => subscribedSet.has(p.podcastId) && p.embedding)
      .map((p: any) => p.embedding as number[]);

    if (subscribedEmbeddings.length > 0) {
      userEmbedding = averageEmbeddings(subscribedEmbeddings);
    }
  } else {
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
      userId,
      categoryWeights,
      topicTags: userTopics,
      listenCount,
      ...(userEmbedding ? { embedding: userEmbedding } : {}),
      computedAt: new Date(),
    },
  });
}
