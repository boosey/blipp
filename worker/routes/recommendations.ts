import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getConfig } from "../lib/config";
import { scoreRecommendations, cosineSimilarity, recomputeUserProfile } from "../lib/recommendations";

export const recommendations = new Hono<{ Bindings: Env }>();

recommendations.use("*", requireAuth);

// --- Types ---

interface CuratedRow {
  title: string;
  type: "episodes" | "podcasts";
  items: any[];
}

/** Cap episodes per podcast and interleave for diversity. */
function diversifyEpisodes(episodes: any[], maxPerPodcast = 2, limit = 15): any[] {
  const byPodcast = new Map<string, any[]>();
  for (const ep of episodes) {
    const pid = ep.podcast?.id ?? ep.podcastId;
    if (!byPodcast.has(pid)) byPodcast.set(pid, []);
    byPodcast.get(pid)!.push(ep);
  }

  // Round-robin across podcasts
  const result: any[] = [];
  const iterators = [...byPodcast.values()].map(eps => ({ eps, idx: 0 }));
  let round = 0;

  while (result.length < limit && iterators.some(it => it.idx < it.eps.length && it.idx < maxPerPodcast)) {
    for (const it of iterators) {
      if (result.length >= limit) break;
      if (it.idx < it.eps.length && it.idx < maxPerPodcast) {
        result.push(it.eps[it.idx]);
        it.idx++;
      }
    }
    round++;
    if (round > limit) break; // safety
  }

  return result;
}

// --- Curated rows helper ---

async function generateCuratedRows(
  user: any,
  prisma: any,
  genre: string | null
): Promise<CuratedRow[]> {
  const rows: CuratedRow[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
  const userId = user.id;

  // User preference exclusions
  const userExcludedCategories: string[] = user.excludedCategories ?? [];
  const userExcludedTopics: string[] = user.excludedTopics ?? [];
  const excludedTopicSet = new Set(userExcludedTopics.map((t: string) => t.toLowerCase()));

  // Get user's subscribed + downvoted podcast IDs to exclude from discovery rows
  const [subscriptions, downvotes] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId },
      select: { podcastId: true },
    }),
    prisma.podcastVote.findMany({
      where: { userId, vote: -1 },
      select: { podcastId: true },
    }),
  ]);
  const subscribedIds = new Set(subscriptions.map((s: any) => s.podcastId));
  const downvotedIds = new Set(downvotes.map((d: any) => d.podcastId));
  const excludeIds = new Set([...subscribedIds, ...downvotedIds]);

  // Row 1: "Trending in {genre}" or "Trending Now"
  {
    const podcastWhere: any = {
      id: { notIn: [...excludeIds] },
      ...(genre ? { categories: { has: genre } } : {}),
    };
    // Filter out podcasts in user's excluded categories
    if (userExcludedCategories.length > 0) {
      podcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
    }
    const where: any = {
      publishedAt: { not: null, gte: fourteenDaysAgo },
      podcast: podcastWhere,
    };
    const rawEpisodes = await prisma.episode.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        durationSeconds: true,
        topicTags: true,
        podcast: { select: { id: true, title: true, author: true, imageUrl: true, categories: true } },
      },
    });
    // Post-filter episodes with excluded topics
    const filtered = excludedTopicSet.size > 0
      ? rawEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
      : rawEpisodes;
    const episodes = diversifyEpisodes(filtered, 2, 15);
    if (episodes.length > 0) {
      rows.push({
        title: genre ? `Trending in ${genre}` : "Trending Now",
        type: "episodes",
        items: episodes.map((ep: any) => ({
          episode: { id: ep.id, title: ep.title, publishedAt: ep.publishedAt, durationSeconds: ep.durationSeconds, topicTags: ep.topicTags },
          podcast: ep.podcast,
          score: 1,
          reasons: ["Trending"],
        })),
      });
    }
  }

  // Row 2: "New on topics you follow"
  {
    const userProfile = await prisma.userRecommendationProfile.findUnique({
      where: { userId },
    });
    if (userProfile) {
      const topicTags: string[] = userProfile.topicTags || [];
      if (topicTags.length > 0) {
        const topicPodcastWhere: any = {
          id: { notIn: [...excludeIds] },
          ...(genre ? { categories: { has: genre } } : {}),
        };
        if (userExcludedCategories.length > 0) {
          topicPodcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
        }
        const where: any = {
          publishedAt: { gte: fourteenDaysAgo },
          topicTags: { hasSome: topicTags },
          podcast: topicPodcastWhere,
        };
        const rawTopicEpisodes = await prisma.episode.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          take: 50,
          select: {
            id: true,
            title: true,
            publishedAt: true,
            durationSeconds: true,
            topicTags: true,
            podcast: { select: { id: true, title: true, author: true, imageUrl: true, categories: true } },
          },
        });
        const filteredTopicEpisodes = excludedTopicSet.size > 0
          ? rawTopicEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
          : rawTopicEpisodes;
        const episodes = diversifyEpisodes(filteredTopicEpisodes, 2, 15);
        if (episodes.length > 0) {
          rows.push({
            title: "New on topics you follow",
            type: "episodes",
            items: episodes.map((ep: any) => ({
              episode: { id: ep.id, title: ep.title, publishedAt: ep.publishedAt, durationSeconds: ep.durationSeconds, topicTags: ep.topicTags },
              podcast: ep.podcast,
              score: 1,
              reasons: ["Matches your topics"],
            })),
          });
        }
      }
    }
  }

  // Row 3: "Popular with listeners like you"
  {
    try {
      const result = await scoreRecommendations(userId, prisma, 15);
      if (result.recommendations.length > 0) {
        // Hydrate podcast data
        const podcastIds = result.recommendations.map((r) => r.podcastId);
        const podcasts = await prisma.podcast.findMany({
          where: { id: { in: podcastIds }, deliverable: true },
          select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, _count: { select: { subscriptions: true } } },
        });
        const podcastMap = new Map(podcasts.map((p: any) => [p.id, { ...p, subscriberCount: p._count.subscriptions, _count: undefined }]));

        const items = result.recommendations
          .filter((r) => podcastMap.has(r.podcastId))
          .map((r) => ({
            podcast: podcastMap.get(r.podcastId),
            score: r.score,
            reasons: r.reasons,
          }));

        if (items.length > 0) {
          rows.push({
            title: "Popular with listeners like you",
            type: "podcasts",
            items,
          });
        }
      }
    } catch {
      // Skip this row on error
    }
  }

  // Row 4: "Because you like {podcastName}"
  {
    // Pick the user's most recent favorited or most-listened podcast
    const favorite = await prisma.podcastFavorite.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { podcast: { select: { id: true, title: true, categories: true } } },
    });

    const sourcePodcast = favorite?.podcast;
    if (sourcePodcast && sourcePodcast.categories?.length > 0) {
      const similarPodcastWhere: any = {
        id: { notIn: [...excludeIds, sourcePodcast.id] },
        categories: { hasSome: sourcePodcast.categories },
        ...(genre ? { categories: { has: genre } } : {}),
      };
      if (userExcludedCategories.length > 0) {
        similarPodcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
      }
      const where: any = {
        publishedAt: { gte: fourteenDaysAgo },
        podcast: similarPodcastWhere,
      };
      const rawSimilarEpisodes = await prisma.episode.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          durationSeconds: true,
          topicTags: true,
          podcast: { select: { id: true, title: true, author: true, imageUrl: true, categories: true } },
        },
      });
      const episodes = excludedTopicSet.size > 0
        ? rawSimilarEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase()))).slice(0, 15)
        : rawSimilarEpisodes.slice(0, 15);
      if (episodes.length > 0) {
        rows.push({
          title: `Because you like ${sourcePodcast.title}`,
          type: "episodes",
          items: episodes.map((ep: any) => ({
            episode: { id: ep.id, title: ep.title, publishedAt: ep.publishedAt, durationSeconds: ep.durationSeconds, topicTags: ep.topicTags },
            podcast: ep.podcast,
            score: 1,
            reasons: [`Similar to ${sourcePodcast.title}`],
          })),
        });
      }
    }
  }

  return rows;
}

// GET /local — local podcasts for user's DMA
recommendations.get("/local", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { dmaCode: true },
  });

  if (!fullUser?.dmaCode) {
    return c.json({ data: { local: [], localSports: [], dmaCode: null } });
  }

  const geoProfiles = await prisma.podcastGeoProfile.findMany({
    where: { dmaCode: fullUser.dmaCode },
    include: {
      podcast: { select: { id: true, title: true, imageUrl: true, author: true, categories: true } },
      team: { select: { id: true, name: true, nickname: true, abbreviation: true } },
    },
    orderBy: [{ confidence: "desc" }],
  });

  const local = geoProfiles.filter((gp: any) => !gp.teamId).map((gp: any) => ({
    podcast: gp.podcast, scope: gp.scope, confidence: gp.confidence,
  }));

  const localSports = geoProfiles.filter((gp: any) => gp.teamId).map((gp: any) => ({
    podcast: gp.podcast, scope: gp.scope, confidence: gp.confidence, team: gp.team,
  }));

  return c.json({ data: { local, localSports, dmaCode: fullUser.dmaCode } });
});

// GET /curated — Netflix-style curated rows
recommendations.get("/curated", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;

  const rows = await generateCuratedRows(user, prisma, genre);
  return c.json({ rows, podcastSuggestions: [] });
});

// GET /episodes — browse recent episodes across catalog
recommendations.get("/episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;
  const search = c.req.query("search") || null;
  const sort = c.req.query("sort") || "recent";
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = Math.min(parseInt(c.req.query("pageSize") || "20", 10), 50);
  const skip = (page - 1) * pageSize;

  // Exclude downvoted podcasts from episode browsing
  const userDownvotes = await prisma.podcastVote.findMany({
    where: { userId: user.id, vote: -1 },
    select: { podcastId: true },
  });
  const userDownvotedIds = userDownvotes.map((d: any) => d.podcastId);

  const excludedCategories: string[] = user.excludedCategories ?? [];
  const excludedTopics: string[] = user.excludedTopics ?? [];
  const excludedTopicSet = new Set(excludedTopics.map((t: string) => t.toLowerCase()));

  const where: any = {};
  if (genre) {
    where.podcast = { ...(where.podcast || {}), categories: { has: genre } };
  }
  if (userDownvotedIds.length > 0) {
    where.podcast = { ...(where.podcast || {}), id: { notIn: userDownvotedIds } };
  }
  if (excludedCategories.length > 0) {
    where.podcast = { ...(where.podcast || {}), NOT: { categories: { hasSome: excludedCategories } } };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { podcast: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const episodeOrderByMap: Record<string, any> = {
    rank: [{ podcast: { appleRank: { sort: "asc", nulls: "last" } } }, { publishedAt: "desc" }],
    popularity: [{ podcast: { feedItems: { _count: "desc" } } }, { publishedAt: "desc" }],
    subscriptions: [{ podcast: { subscriptions: { _count: "desc" } } }, { publishedAt: "desc" }],
    favorites: [{ podcast: { favorites: { _count: "desc" } } }, { publishedAt: "desc" }],
  };
  const episodeOrderBy = episodeOrderByMap[sort] || { publishedAt: "desc" };

  // Over-fetch to allow diversity filtering (3x page size)
  const [rawEpisodes, total] = await Promise.all([
    prisma.episode.findMany({
      where,
      skip,
      take: pageSize * 3,
      orderBy: episodeOrderBy,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        durationSeconds: true,
        topicTags: true,
        podcast: { select: { id: true, title: true, author: true, imageUrl: true, categories: true } },
      },
    }),
    prisma.episode.count({ where }),
  ]);

  // Post-filter episodes with excluded topics, then diversify
  const topicFiltered = excludedTopicSet.size > 0
    ? rawEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
    : rawEpisodes;
  const episodes = diversifyEpisodes(topicFiltered, 3, pageSize);

  return c.json({
    episodes: episodes.map((ep: any) => ({
      episode: { id: ep.id, title: ep.title, publishedAt: ep.publishedAt, durationSeconds: ep.durationSeconds, topicTags: ep.topicTags },
      podcast: ep.podcast,
    })),
    total,
    page,
    pageSize,
  });
});

// GET / — personalized recommendations
recommendations.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const enabled = await getConfig(prisma, "recommendations.enabled", true);
  if (!enabled) {
    return c.json({ recommendations: [], source: "popular" });
  }

  // Check cache first
  const cached = await prisma.recommendationCache.findUnique({
    where: { userId: user.id },
  });

  // Fetch dismissed podcast IDs to filter from results
  const dismissals = await prisma.recommendationDismissal.findMany({
    where: { userId: user.id },
    select: { podcastId: true },
  });
  const dismissedIds = new Set(dismissals.map((d: any) => d.podcastId));

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.computedAt).getTime();
    if (cacheAge < 3600000) { // 1 hour cache validity
      // Hydrate with podcast data, excluding dismissed
      const podcastIds = (cached.podcasts as any[])
        .filter((r: any) => !dismissedIds.has(r.podcastId))
        .map((r: any) => r.podcastId);
      const podcasts = await prisma.podcast.findMany({
        where: { id: { in: podcastIds }, deliverable: true },
        select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, _count: { select: { subscriptions: true } } },
      });
      const podcastMap = new Map(podcasts.map((p: any) => [p.id, { ...p, subscriberCount: p._count.subscriptions, _count: undefined }]));

      const recs = (cached.podcasts as any[])
        .filter((r: any) => podcastMap.has(r.podcastId) && !dismissedIds.has(r.podcastId))
        .map((r: any) => ({
          podcast: podcastMap.get(r.podcastId),
          score: r.score,
          reasons: r.reasons,
        }));

      // Determine source based on user subscriptions
      const subCount = await prisma.subscription.count({ where: { userId: user.id } });
      const minSubs = await getConfig(prisma, "recommendations.coldStart.minSubscriptions", 3);

      return c.json({
        recommendations: recs,
        source: subCount < (minSubs as number) ? "popular" : "personalized",
      });
    }
  }

  // Compute fresh
  const cf = (c.req.raw as any).cf;
  const dmaCode = cf?.metroCode != null ? String(cf.metroCode) : undefined;
  const result = await scoreRecommendations(user.id, prisma, undefined, { dmaCode });

  // Hydrate with podcast data
  const podcastIds = result.recommendations.map((r) => r.podcastId);
  const podcasts = await prisma.podcast.findMany({
    where: { id: { in: podcastIds }, deliverable: true },
    select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, _count: { select: { subscriptions: true } } },
  });
  const podcastMap = new Map(podcasts.map((p: any) => [p.id, { ...p, subscriberCount: p._count.subscriptions, _count: undefined }]));

  const recs = result.recommendations
    .filter((r) => podcastMap.has(r.podcastId) && !dismissedIds.has(r.podcastId))
    .map((r) => ({
      podcast: podcastMap.get(r.podcastId),
      score: r.score,
      reasons: r.reasons,
    }));

  // Cache the result
  await prisma.recommendationCache.upsert({
    where: { userId: user.id },
    create: { userId: user.id, podcasts: result.recommendations, computedAt: new Date() },
    update: { podcasts: result.recommendations, computedAt: new Date() },
  });

  return c.json({ recommendations: recs, source: result.source });
});

// GET /similar/:podcastId — find similar podcasts
recommendations.get("/similar/:podcastId", async (c) => {
  const podcastId = c.req.param("podcastId");
  const prisma = c.get("prisma") as any;

  const enabled = await getConfig(prisma, "recommendations.enabled", true);
  if (!enabled) {
    return c.json({ similar: [] });
  }

  const profile = await prisma.podcastProfile.findUnique({
    where: { podcastId },
  });

  if (!profile) {
    return c.json({ similar: [] });
  }

  const allProfiles = await prisma.podcastProfile.findMany({
    where: { podcastId: { not: podcastId } },
    include: { podcast: { select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true, _count: { select: { subscriptions: true } } } } },
  });

  const sourceWeights = profile.categoryWeights as Record<string, number>;

  const scored = allProfiles
    .map((p: any) => ({
      podcast: { ...p.podcast, subscriberCount: p.podcast._count?.subscriptions ?? 0, _count: undefined },
      score: cosineSimilarity(sourceWeights, p.categoryWeights as Record<string, number>),
    }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  return c.json({ similar: scored });
});

// POST /dismiss/:podcastId — dismiss a recommendation (hide it)
recommendations.post("/dismiss/:podcastId", async (c) => {
  const podcastId = c.req.param("podcastId");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  await prisma.recommendationDismissal.upsert({
    where: { userId_podcastId: { userId: user.id, podcastId } },
    create: { userId: user.id, podcastId },
    update: {},
  });

  // Recompute recommendations (fire-and-forget)
  try { await recomputeUserProfile(user.id, prisma); } catch (err) {
    console.error(JSON.stringify({ level: "warn", action: "recommendation_recompute_failed", userId: user.id, trigger: "dismiss", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() }));
  }

  return c.json({ dismissed: true });
});
