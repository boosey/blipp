import { Hono } from "hono";
import type { Env } from "../../types";
import { computePodcastProfiles } from "../../lib/recommendations";

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
