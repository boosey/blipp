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

// Categories where local podcasts naturally have fewer listeners but high relevance
const LOCAL_BIASED_CATEGORIES = new Set([
  "Sports",
  "News",
  "Government",
  "Politics",
  "Society & Culture",
]);

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

/**
 * Apply a soft locality boost to episode results when browsing a category
 * with natural locality bias (Sports, News, etc.). Local pods have fewer
 * listeners nationally but are highly relevant to the user's area.
 *
 * Episodes get a base score from their original rank position, then local
 * pods receive an additive boost scaled by geo confidence. This lifts them
 * in the list without forcing them to the top.
 */
function applyLocalBoost(
  episodes: any[],
  geoProfileMap: Map<string, number>, // podcastId → confidence (0-1)
  boostWeight = 0.20,
): any[] {
  if (geoProfileMap.size === 0 || episodes.length === 0) return episodes;

  const scored = episodes.map((ep, idx) => {
    const pid = ep.podcast?.id ?? ep.podcastId;
    // Base score: 1.0 for first, linearly decreasing
    const baseScore = 1.0 - idx / episodes.length;
    const geoConfidence = geoProfileMap.get(pid) ?? 0;
    const boost = boostWeight * geoConfidence;
    return { ep, score: baseScore + boost };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.ep);
}

// --- Curated rows helper ---

async function generateCuratedRows(
  user: any,
  prisma: any,
  genre: string | null,
  explicit = false
): Promise<CuratedRow[]> {
  const rows: CuratedRow[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
  const userId = user.id;

  // User preference exclusions — skip when user explicitly selected this genre
  const userExcludedCategories: string[] = explicit ? [] : (user.excludedCategories ?? []);
  const userExcludedTopics: string[] = explicit ? [] : (user.excludedTopics ?? []);
  const excludedTopicSet = new Set(userExcludedTopics.map((t: string) => t.toLowerCase()));

  // Load geo profiles for locality boost when browsing locality-biased categories
  let geoProfileMap = new Map<string, number>();
  const applyLocality = genre != null && LOCAL_BIASED_CATEGORIES.has(genre) && user.city && user.state;
  if (applyLocality) {
    const [cityProfiles, stateProfiles] = await Promise.all([
      prisma.podcastGeoProfile.findMany({
        where: { city: user.city, state: user.state },
        select: { podcastId: true, confidence: true },
      }),
      prisma.podcastGeoProfile.findMany({
        where: { state: user.state, NOT: { city: user.city } },
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
      deliverable: true,
      ...(genre ? { categories: { has: genre } } : {}),
    };
    // Filter out podcasts in user's excluded categories
    if (userExcludedCategories.length > 0) {
      podcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
    }
    const where: any = {
      publishedAt: { not: null, gte: fourteenDaysAgo },
      contentStatus: { not: "NOT_DELIVERABLE" },
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
    let filtered = excludedTopicSet.size > 0
      ? rawEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
      : rawEpisodes;
    // Boost local pods when browsing locality-biased categories
    if (applyLocality) filtered = applyLocalBoost(filtered, geoProfileMap);
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
          deliverable: true,
          ...(genre ? { categories: { has: genre } } : {}),
        };
        if (userExcludedCategories.length > 0) {
          topicPodcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
        }
        const where: any = {
          publishedAt: { gte: fourteenDaysAgo },
          contentStatus: { not: "NOT_DELIVERABLE" },
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
        let filteredTopicEpisodes = excludedTopicSet.size > 0
          ? rawTopicEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
          : rawTopicEpisodes;
        if (applyLocality) filteredTopicEpisodes = applyLocalBoost(filteredTopicEpisodes, geoProfileMap);
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
        deliverable: true,
        categories: { hasSome: sourcePodcast.categories },
        ...(genre ? { categories: { has: genre } } : {}),
      };
      if (userExcludedCategories.length > 0) {
        similarPodcastWhere.NOT = { categories: { hasSome: userExcludedCategories } };
      }
      const where: any = {
        publishedAt: { gte: fourteenDaysAgo },
        contentStatus: { not: "NOT_DELIVERABLE" },
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
      let similarFiltered = excludedTopicSet.size > 0
        ? rawSimilarEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
        : rawSimilarEpisodes;
      if (applyLocality) similarFiltered = applyLocalBoost(similarFiltered, geoProfileMap);
      const episodes = similarFiltered.slice(0, 15);
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

// GET /local — local podcasts for user's city/state
recommendations.get("/local", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { city: true, state: true, country: true },
  });

  if (!fullUser?.city || !fullUser?.state) {
    return c.json({ data: { localInterests: [], location: null } });
  }

  // City-level matches only — require confidence >= 0.7 to filter out
  // low-quality state-level matches (e.g. podcasts that just mention the state name)
  const geoProfiles = await prisma.podcastGeoProfile.findMany({
    where: {
      state: fullUser.state,
      confidence: { gte: 0.7 },
      podcast: { deliverable: true },
    },
    include: {
      podcast: { select: { id: true, title: true, imageUrl: true, author: true, categories: true } },
      team: { select: { id: true, name: true, nickname: true, abbreviation: true } },
    },
    orderBy: [{ confidence: "desc" }],
  });

  // Sort: user's city first, then by confidence; deduplicate by podcast ID
  const seen = new Set<string>();
  const sorted = geoProfiles
    .sort((a: any, b: any) => {
      const aIsCity = a.city === fullUser.city ? 1 : 0;
      const bIsCity = b.city === fullUser.city ? 1 : 0;
      if (aIsCity !== bIsCity) return bIsCity - aIsCity;
      return b.confidence - a.confidence;
    })
    .filter((gp: any) => {
      if (seen.has(gp.podcast.id)) return false;
      seen.add(gp.podcast.id);
      return true;
    });

  // Single combined list, capped at 3
  const localInterests = sorted.slice(0, 3).map((gp: any) => ({
    podcast: gp.podcast,
    scope: gp.scope,
    confidence: gp.confidence,
    team: gp.team ?? null,
  }));

  return c.json({ data: { localInterests, location: { city: fullUser.city, state: fullUser.state, country: fullUser.country } } });
});

// GET /curated — Netflix-style curated rows
recommendations.get("/curated", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;
  const explicit = c.req.query("explicit") === "true";

  const rows = await generateCuratedRows(user, prisma, genre, explicit);
  return c.json({ rows, podcastSuggestions: [] });
});

// GET /episodes — browse recent episodes across catalog
recommendations.get("/episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;
  const search = c.req.query("search") || null;
  const sort = c.req.query("sort") || "recent";
  const explicit = c.req.query("explicit") === "true";
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = Math.min(parseInt(c.req.query("pageSize") || "20", 10), 50);
  const skip = (page - 1) * pageSize;

  // Exclude downvoted podcasts from episode browsing
  const userDownvotes = await prisma.podcastVote.findMany({
    where: { userId: user.id, vote: -1 },
    select: { podcastId: true },
  });
  const userDownvotedIds = userDownvotes.map((d: any) => d.podcastId);

  // Skip exclusions when user explicitly selected this genre
  const excludedCategories: string[] = explicit ? [] : (user.excludedCategories ?? []);
  const excludedTopics: string[] = explicit ? [] : (user.excludedTopics ?? []);
  const excludedTopicSet = new Set(excludedTopics.map((t: string) => t.toLowerCase()));

  const where: any = { contentStatus: { not: "NOT_DELIVERABLE" } };
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
  let topicFiltered = excludedTopicSet.size > 0
    ? rawEpisodes.filter((ep: any) => !(ep.topicTags ?? []).some((t: string) => excludedTopicSet.has(t.toLowerCase())))
    : rawEpisodes;

  // Boost local pods when browsing locality-biased categories
  if (genre && LOCAL_BIASED_CATEGORIES.has(genre) && user.city && user.state) {
    const [cityGeo, stateGeo] = await Promise.all([
      prisma.podcastGeoProfile.findMany({
        where: { city: user.city, state: user.state },
        select: { podcastId: true, confidence: true },
      }),
      prisma.podcastGeoProfile.findMany({
        where: { state: user.state, NOT: { city: user.city } },
        select: { podcastId: true, confidence: true },
      }),
    ]);
    const geoMap = new Map<string, number>();
    for (const gp of cityGeo) {
      const existing = geoMap.get(gp.podcastId) || 0;
      geoMap.set(gp.podcastId, Math.max(existing, gp.confidence));
    }
    for (const gp of stateGeo) {
      const existing = geoMap.get(gp.podcastId) || 0;
      geoMap.set(gp.podcastId, Math.max(existing, gp.confidence * 0.4));
    }
    topicFiltered = applyLocalBoost(topicFiltered, geoMap);
  }

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
  const result = await scoreRecommendations(user.id, prisma);

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
    where: { podcastId: { not: podcastId }, podcast: { deliverable: true } },
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
