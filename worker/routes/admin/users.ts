import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const usersRoutes = new Hono<{ Bindings: Env }>();

usersRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET /segments - User segment counts
usersRoutes.get("/segments", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      all,
      powerUsers,
      neverActive,
    ] = await Promise.all([
      prisma.user.count(),
      // Power users: more than 50 briefings
      prisma.user.count({
        where: {
          briefings: { some: {} },
          // Count via raw-ish approach: users who have many briefings
        },
      }),
      // Never active: no briefings at all
      prisma.user.count({
        where: { briefings: { none: {} } },
      }),
    ]);

    // Power users: need to count users with >50 briefings
    // Use a more targeted query
    const usersWithBriefingCounts = await prisma.user.findMany({
      select: {
        id: true,
        tier: true,
        createdAt: true,
        _count: { select: { briefings: true } },
      },
    });

    const powerUserCount = usersWithBriefingCounts.filter((u) => u._count.briefings > 50).length;

    // At risk: users who had briefings before but none in last 7 days
    const atRiskUsers = usersWithBriefingCounts.filter((u) => u._count.briefings > 0);
    // We need to check last briefing date for at-risk
    const recentBriefingUsers = await prisma.briefing.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const recentUserIds = new Set(recentBriefingUsers.map((b) => b.userId));
    const atRiskCount = atRiskUsers.filter(
      (u) => u._count.briefings > 0 && !recentUserIds.has(u.id)
    ).length;

    // Trial ending: FREE users created > 7 days ago who have used the service
    const trialEndingCount = usersWithBriefingCounts.filter(
      (u) => u.tier === "FREE" && u._count.briefings > 0 && u.createdAt < sevenDaysAgo
    ).length;

    // Recently cancelled: users who downgraded (we approximate as FREE users who had activity in last 30 days but tier changed)
    // Simplified: FREE users with recent briefings (past 30 days) who might be downgraded
    const recentlyCancelledCount = 0; // Not easily derivable without tier change history

    return c.json({
      data: {
        all,
        power_users: powerUserCount,
        at_risk: atRiskCount,
        trial_ending: trialEndingCount,
        recently_cancelled: recentlyCancelledCount,
        never_active: neverActive,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET / - Paginated user list
usersRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const tier = c.req.query("tier");
    const search = c.req.query("search");
    const segment = c.req.query("segment");
    const sort = c.req.query("sort") ?? "createdAt:desc";

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
      where.briefings = { some: {} };
    } else if (segment === "never_active") {
      where.briefings = { none: {} };
    }

    const [sortField, sortDir] = sort.split(":");
    const orderBy: Record<string, string> = { [sortField || "createdAt"]: sortDir || "desc" };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          _count: { select: { subscriptions: true, briefings: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Get last briefing dates for activity status
    const userIds = users.map((u) => u.id);
    const lastBriefings = userIds.length > 0
      ? await prisma.briefing.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["userId"],
          select: { userId: true, createdAt: true },
        })
      : [];
    const lastBriefingMap = new Map(lastBriefings.map((b) => [b.userId, b.createdAt]));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const data = users.map((u) => {
      const lastActive = lastBriefingMap.get(u.id);
      let status: "active" | "inactive" | "churned" = "inactive";
      if (lastActive) {
        if (lastActive >= sevenDaysAgo) status = "active";
        else if (lastActive >= thirtyDaysAgo) status = "inactive";
        else status = "churned";
      }

      const badges: string[] = [];
      if (u._count.briefings > 50) badges.push("power_user");
      if (status === "inactive" && u._count.briefings > 0) badges.push("at_risk");
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
        podcastCount: u._count.subscriptions,
        lastActiveAt: lastActive?.toISOString(),
        createdAt: u.createdAt.toISOString(),
        badges,
      };
    });

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /:id - User detail
usersRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUnique({
      where: { id: c.req.param("id") },
      include: {
        subscriptions: {
          include: { podcast: { select: { title: true } } },
        },
        briefings: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { segments: true } },
          },
        },
        _count: { select: { subscriptions: true, briefings: true } },
      },
    });

    if (!user) return c.json({ error: "User not found" }, 404);

    const lastBriefing = user.briefings[0];
    const lastActive = lastBriefing?.createdAt;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let status: "active" | "inactive" | "churned" = "inactive";
    if (lastActive) {
      if (lastActive >= sevenDaysAgo) status = "active";
      else if (lastActive >= thirtyDaysAgo) status = "inactive";
      else status = "churned";
    }

    const badges: string[] = [];
    if (user._count.briefings > 50) badges.push("power_user");
    if (status === "inactive" && user._count.briefings > 0) badges.push("at_risk");
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
        podcastCount: user._count.subscriptions,
        lastActiveAt: lastActive?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        badges,
        stripeCustomerId: user.stripeCustomerId,
        briefingLengthMinutes: user.briefingLengthMinutes,
        briefingTime: user.briefingTime,
        timezone: user.timezone,
        subscriptions: user.subscriptions.map((s) => ({
          podcastId: s.podcastId,
          podcastTitle: s.podcast.title,
          createdAt: s.createdAt.toISOString(),
        })),
        recentBriefings: user.briefings.map((b) => ({
          id: b.id,
          userId: b.userId,
          userEmail: user.email,
          userTier: user.tier,
          status: b.status,
          targetMinutes: b.targetMinutes,
          actualSeconds: b.actualSeconds,
          audioUrl: b.audioUrl,
          errorMessage: b.errorMessage,
          segmentCount: b._count.segments,
          podcastCount: 0, // simplified - would need another join
          createdAt: b.createdAt.toISOString(),
        })),
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// PATCH /:id - Update user
usersRoutes.patch("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
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
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { usersRoutes };
