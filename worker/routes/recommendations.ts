import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { getConfig } from "../lib/config";
import { scoreRecommendations, cosineSimilarity } from "../lib/recommendations";

export const recommendations = new Hono<{ Bindings: Env }>();

recommendations.use("*", requireAuth);

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

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.computedAt).getTime();
    if (cacheAge < 3600000) { // 1 hour cache validity
      // Hydrate with podcast data
      const podcastIds = (cached.podcasts as any[]).map((r: any) => r.podcastId);
      const podcasts = await prisma.podcast.findMany({
        where: { id: { in: podcastIds } },
        select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true },
      });
      const podcastMap = new Map(podcasts.map((p: any) => [p.id, p]));

      const recs = (cached.podcasts as any[])
        .filter((r: any) => podcastMap.has(r.podcastId))
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
    where: { id: { in: podcastIds } },
    select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true },
  });
  const podcastMap = new Map(podcasts.map((p: any) => [p.id, p]));

  const recs = result.recommendations
    .filter((r) => podcastMap.has(r.podcastId))
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
    include: { podcast: { select: { id: true, title: true, author: true, description: true, imageUrl: true, feedUrl: true, categories: true, episodeCount: true } } },
  });

  const sourceWeights = profile.categoryWeights as Record<string, number>;

  const scored = allProfiles
    .map((p: any) => ({
      podcast: p.podcast,
      score: cosineSimilarity(sourceWeights, p.categoryWeights as Record<string, number>),
    }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  return c.json({ similar: scored });
});
