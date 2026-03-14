import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { writeAuditLog } from "../../lib/audit-log";
import { getAuth } from "../../middleware/auth";

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
      createdAt: true,
      plan: { select: { isDefault: true, priceCentsMonthly: true } },
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

  // Trial ending: users on default/free plan created > 7 days ago who have used the service
  const trialEndingCount = usersWithFeedItemCounts.filter(
    (u: any) => (u.plan.isDefault || u.plan.priceCentsMonthly === 0) && u._count.feedItems > 0 && u.createdAt < sevenDaysAgo
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
  const planId = c.req.query("planId");
  const search = c.req.query("search");
  const segment = c.req.query("segment");
  const orderBy = parseSort(c, "createdAt", ["createdAt", "email", "name", "isAdmin"]);

  const where: Record<string, unknown> = {};
  if (planId) where.planId = planId;
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
        plan: { select: { id: true, name: true, slug: true } },
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
    const lastActive = lastActivityMap.get(u.id) as Date | undefined;
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
      plan: { id: u.plan.id, name: u.plan.name, slug: u.plan.slug },
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
      plan: { select: { id: true, name: true, slug: true } },
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
      podcastFavorites: {
        include: { podcast: { select: { id: true, title: true, imageUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
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
      plan: { id: user.plan.id, name: user.plan.name, slug: user.plan.slug },
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
      favorites: user.podcastFavorites.map((f: any) => ({
        podcastId: f.podcast.id,
        podcastTitle: f.podcast.title,
        podcastImageUrl: f.podcast.imageUrl,
        favoritedAt: f.createdAt.toISOString(),
      })),
      onboardingComplete: user.onboardingComplete,
    },
  });
});

// PATCH /:id - Update user
usersRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ planId?: string; isAdmin?: boolean; status?: string; onboardingComplete?: boolean }>();

  // Block isAdmin changes via this endpoint — requires dedicated super-admin flow
  if (body.isAdmin !== undefined) {
    console.warn(
      `[SECURITY] Admin privilege change attempted via PATCH /admin/users/${c.req.param("id")} — blocked. ` +
      `Requested isAdmin=${body.isAdmin}`
    );
    return c.json(
      { error: "Cannot modify admin privileges via this endpoint" },
      403
    );
  }

  const data: Record<string, unknown> = {};
  if (body.planId !== undefined) {
    // Validate that the plan exists
    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) {
      return c.json({ error: "Plan not found" }, 404);
    }
    data.planId = body.planId;
  }

  if (body.status !== undefined) {
    if (!["active", "suspended", "banned"].includes(body.status)) {
      return c.json({ error: "Invalid status. Must be: active, suspended, or banned" }, 400);
    }
    data.status = body.status;
  }

  if (body.onboardingComplete !== undefined) {
    data.onboardingComplete = !!body.onboardingComplete;
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  // Capture old values before update for audit log
  const existingUser = await prisma.user.findUnique({
    where: { id: c.req.param("id") },
    select: { planId: true, status: true, onboardingComplete: true },
  });

  const updated = await prisma.user.update({
    where: { id: c.req.param("id") },
    data,
    include: { plan: { select: { id: true, name: true, slug: true } } },
  });

  const auth = getAuth(c);
  const auditAction = body.onboardingComplete !== undefined ? "user.onboarding.reset"
    : body.status !== undefined ? "user.status.change" : "user.plan.change";
  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: auditAction,
    entityType: "User",
    entityId: c.req.param("id"),
    before: { planId: existingUser?.planId, status: existingUser?.status },
    after: { planId: body.planId, status: body.status },
  }).catch(() => {});

  return c.json({
    data: {
      id: updated.id,
      plan: { id: updated.plan.id, name: updated.plan.name, slug: updated.plan.slug },
      isAdmin: updated.isAdmin,
      status: updated.status,
    },
  });
});

export { usersRoutes };
