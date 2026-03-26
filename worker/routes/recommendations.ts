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
  userId: string,
  prisma: any,
  genre: string | null
): Promise<CuratedRow[]> {
  const rows: CuratedRow[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

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
    const where: any = {
      publishedAt: { not: null, gte: fourteenDaysAgo },
      podcast: {
        id: { notIn: [...excludeIds] },
        ...(genre ? { categories: { has: genre } } : {}),
      },
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
    const episodes = diversifyEpisodes(rawEpisodes, 2, 15);
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
        const where: any = {
          publishedAt: { gte: fourteenDaysAgo },
          topicTags: { hasSome: topicTags },
          podcast: {
            id: { notIn: [...excludeIds] },
            ...(genre ? { categories: { has: genre } } : {}),
          },
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
        const episodes = diversifyEpisodes(rawTopicEpisodes, 2, 15);
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
      const where: any = {
        publishedAt: { gte: fourteenDaysAgo },
        podcast: {
          id: { notIn: [...excludeIds, sourcePodcast.id] },
          categories: { hasSome: sourcePodcast.categories },
          ...(genre ? { categories: { has: genre } } : {}),
        },
      };
      const episodes = await prisma.episode.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: 15,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          durationSeconds: true,
          topicTags: true,
          podcast: { select: { id: true, title: true, author: true, imageUrl: true, categories: true } },
        },
      });
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

// GET /curated — Netflix-style curated rows
recommendations.get("/curated", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;

  const rows = await generateCuratedRows(user.id, prisma, genre);
  return c.json({ rows, podcastSuggestions: [] });
});

// GET /episodes — browse recent episodes across catalog
recommendations.get("/episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const genre = c.req.query("genre") || null;
  const search = c.req.query("search") || null;
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = Math.min(parseInt(c.req.query("pageSize") || "20", 10), 50);
  const skip = (page - 1) * pageSize;

  // Exclude downvoted podcasts from episode browsing
  const userDownvotes = await prisma.podcastVote.findMany({
    where: { userId: user.id, vote: -1 },
    select: { podcastId: true },
  });
  const userDownvotedIds = userDownvotes.map((d: any) => d.podcastId);

  const where: any = {};
  if (genre) {
    where.podcast = { ...(where.podcast || {}), categories: { has: genre } };
  }
  if (userDownvotedIds.length > 0) {
    where.podcast = { ...(where.podcast || {}), id: { notIn: userDownvotedIds } };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { podcast: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  // Over-fetch to allow diversity filtering (3x page size)
  const [rawEpisodes, total] = await Promise.all([
    prisma.episode.findMany({
      where,
      skip,
      take: pageSize * 3,
      orderBy: { publishedAt: "desc" },
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

  // Filter bad dates + diversify: max 3 episodes per podcast per page
  const episodes = diversifyEpisodes(rawEpisodes, 3, pageSize);

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
