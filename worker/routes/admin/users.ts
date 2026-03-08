import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

const usersRoutes = new Hono<{ Bindings: Env }>();

usersRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /segments - User segment counts
usersRoutes.get("/segments", async (c) => {
  const prisma = c.get("prisma") as any;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const all = await prisma.user.count();

  const usersWithFeedItemCounts = await prisma.user.findMany({
    select: {
      id: true,
      tier: true,
      createdAt: true,
      _count: { select: { feedItems: true } },
    },
  });

  const powerUserCount = usersWithFeedItemCounts.filter((u: any) => u._count.feedItems > 50).length;
  const neverActive = usersWithFeedItemCounts.filter((u: any) => u._count.feedItems === 0).length;

  // At risk: users who had feed items before but none in last 7 days
  const atRiskCandidates = usersWithFeedItemCounts.filter((u: any) => u._count.feedItems > 0);
  const recentFeedItemUsers = await prisma.feedItem.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recentUserIds = new Set(recentFeedItemUsers.map((f: any) => f.userId));
  const atRiskCount = atRiskCandidates.filter(
    (u: any) => !recentUserIds.has(u.id)
  ).length;

  // Trial ending: FREE users created > 7 days ago who have used the service
  const trialEndingCount = usersWithFeedItemCounts.filter(
    (u: any) => u.tier === "FREE" && u._count.feedItems > 0 && u.createdAt < sevenDaysAgo
  ).length;

  return c.json({
    data: {
      all,
      power_users: powerUserCount,
      at_risk: atRiskCount,
      trial_ending: trialEndingCount,
      recently_cancelled: 0,
      never_active: neverActive,
    },
  });
});

// GET / - Paginated user list
usersRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const tier = c.req.query("tier");
  const search = c.req.query("search");
  const segment = c.req.query("segment");
  const orderBy = parseSort(c);

  const where: Record<string, unknown> = {};
  if (tier) where.tier = tier;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  // Segment filters
  if (segment === "power_users") {
    where.feedItems = { some: {} };
  } else if (segment === "never_active") {
    where.feedItems = { none: {} };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        _count: { select: { subscriptions: true, feedItems: true, briefings: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Get last feed item dates for activity status
  const userIds = users.map((u: any) => u.id);
  const lastFeedItems = userIds.length > 0
    ? await prisma.feedItem.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["userId"],
        select: { userId: true, createdAt: true },
      })
    : [];
  const lastActivityMap = new Map(lastFeedItems.map((f: any) => [f.userId, f.createdAt]));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const data = users.map((u: any) => {
    const lastActive = lastActivityMap.get(u.id);
    let status: "active" | "inactive" | "churned" = "inactive";
    if (lastActive) {
      if (lastActive >= sevenDaysAgo) status = "active";
      else if (lastActive >= thirtyDaysAgo) status = "inactive";
      else status = "churned";
    }

    const badges: string[] = [];
    if (u._count.feedItems > 50) badges.push("power_user");
    if (status === "inactive" && u._count.feedItems > 0) badges.push("at_risk");
    if (u.isAdmin) badges.push("admin");

    return {
      id: u.id,
      clerkId: u.clerkId,
      email: u.email,
      name: u.name,
      imageUrl: u.imageUrl,
      tier: u.tier,
      isAdmin: u.isAdmin,
      status,
      briefingCount: u._count.briefings,
      feedItemCount: u._count.feedItems,
      podcastCount: u._count.subscriptions,
      lastActiveAt: lastActive?.toISOString(),
      createdAt: u.createdAt.toISOString(),
      badges,
    };
  });

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id - User detail
usersRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await prisma.user.findUnique({
    where: { id: c.req.param("id") },
    include: {
      subscriptions: {
        include: { podcast: { select: { title: true } } },
      },
      feedItems: {
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          podcast: { select: { title: true, imageUrl: true } },
          episode: { select: { title: true } },
        },
      },
      _count: { select: { subscriptions: true, feedItems: true, briefings: true } },
    },
  });

  if (!user) return c.json({ error: "User not found" }, 404);

  const lastFeedItem = user.feedItems[0];
  const lastActive = lastFeedItem?.createdAt;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let status: "active" | "inactive" | "churned" = "inactive";
  if (lastActive) {
    if (lastActive >= sevenDaysAgo) status = "active";
    else if (lastActive >= thirtyDaysAgo) status = "inactive";
    else status = "churned";
  }

  const badges: string[] = [];
  if (user._count.feedItems > 50) badges.push("power_user");
  if (status === "inactive" && user._count.feedItems > 0) badges.push("at_risk");
  if (user.isAdmin) badges.push("admin");

  return c.json({
    data: {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      tier: user.tier,
      isAdmin: user.isAdmin,
      status,
      briefingCount: user._count.briefings,
      feedItemCount: user._count.feedItems,
      podcastCount: user._count.subscriptions,
      lastActiveAt: lastActive?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      badges,
      stripeCustomerId: user.stripeCustomerId,
      subscriptions: user.subscriptions.map((s: any) => ({
        podcastId: s.podcastId,
        podcastTitle: s.podcast.title,
        durationTier: s.durationTier,
        createdAt: s.createdAt.toISOString(),
      })),
      recentFeedItems: user.feedItems.map((fi: any) => ({
        id: fi.id,
        status: fi.status,
        source: fi.source,
        durationTier: fi.durationTier,
        listened: fi.listened,
        podcastTitle: fi.podcast?.title,
        podcastImageUrl: fi.podcast?.imageUrl,
        episodeTitle: fi.episode?.title,
        createdAt: fi.createdAt.toISOString(),
      })),
    },
  });
});

// PATCH /:id - Update user
usersRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ tier?: string; isAdmin?: boolean }>();

  const updated = await prisma.user.update({
    where: { id: c.req.param("id") },
    data: {
      ...(body.tier !== undefined && { tier: body.tier as "FREE" | "PRO" | "PRO_PLUS" }),
      ...(body.isAdmin !== undefined && { isAdmin: body.isAdmin }),
    },
  });

  return c.json({
    data: { id: updated.id, tier: updated.tier, isAdmin: updated.isAdmin },
  });
});

export { usersRoutes };
