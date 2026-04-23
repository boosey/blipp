import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { writeAuditLog } from "../../lib/audit-log";
import { getAuth } from "../../middleware/auth";
import { recomputeEntitlement, recordBillingEvent } from "../../lib/entitlement";
import { validateBody } from "../../lib/validation";
import { deleteUserAccount } from "../../lib/user-data";

const AdminDeleteUserSchema = z.object({
  confirm: z.literal("DELETE"),
  reason: z.string().min(5, "reason must be at least 5 characters").max(500),
});

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

// GET /pending-welcome - New users who have not yet received a welcome email,
// with an activity summary so support can personalize the email.
usersRoutes.get("/pending-welcome", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  // Optional: only consider users created within the last N days (default 30)
  const sinceDays = Number(c.req.query("sinceDays") ?? 30);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const where = {
    welcomeEmailSentAt: null,
    createdAt: { gte: since },
    status: "active",
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            subscriptions: true,
            feedItems: true,
            briefings: true,
            podcastFavorites: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = users.map((u: any) => u.id);

  const [lastFeedItems, topSubscriptions, topFavorites] = userIds.length > 0
    ? await Promise.all([
        prisma.feedItem.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["userId"],
          select: { userId: true, createdAt: true },
        }),
        prisma.subscription.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "desc" },
          take: userIds.length * 5,
          include: { podcast: { select: { title: true } } },
        }),
        prisma.podcastFavorite.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "desc" },
          take: userIds.length * 5,
          include: { podcast: { select: { title: true } } },
        }),
      ])
    : [[], [], []];

  const lastActivityMap = new Map(lastFeedItems.map((f: any) => [f.userId, f.createdAt]));

  const subsByUser = new Map<string, string[]>();
  for (const s of topSubscriptions as any[]) {
    const list = subsByUser.get(s.userId) ?? [];
    if (list.length < 5 && s.podcast?.title) list.push(s.podcast.title);
    subsByUser.set(s.userId, list);
  }

  const favsByUser = new Map<string, string[]>();
  for (const f of topFavorites as any[]) {
    const list = favsByUser.get(f.userId) ?? [];
    if (list.length < 5 && f.podcast?.title) list.push(f.podcast.title);
    favsByUser.set(f.userId, list);
  }

  const data = users.map((u: any) => {
    const lastActive = lastActivityMap.get(u.id) as Date | undefined;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      imageUrl: u.imageUrl,
      plan: { id: u.plan.id, name: u.plan.name, slug: u.plan.slug },
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: lastActive?.toISOString(),
      onboardingComplete: u.onboardingComplete,
      profileCompletedAt: u.profileCompletedAt?.toISOString(),
      city: u.city,
      state: u.state,
      country: u.country,
      preferredCategories: u.preferredCategories,
      preferredTopics: u.preferredTopics,
      activity: {
        feedItemCount: u._count.feedItems,
        briefingCount: u._count.briefings,
        subscriptionCount: u._count.subscriptions,
        favoriteCount: u._count.podcastFavorites,
        topSubscriptions: subsByUser.get(u.id) ?? [],
        topFavorites: favsByUser.get(u.id) ?? [],
      },
    };
  });

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// POST /:id/mark-welcomed - Record that a welcome email has been sent
usersRoutes.post("/:id/mark-welcomed", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, welcomeEmailSentAt: true },
  });
  if (!existing) return c.json({ error: "User not found" }, 404);

  const updated = await prisma.user.update({
    where: { id },
    data: { welcomeEmailSentAt: new Date() },
    select: { id: true, welcomeEmailSentAt: true },
  });

  const auth = getAuth(c);
  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: "user.welcome_email.sent",
    entityType: "User",
    entityId: id,
    before: { welcomeEmailSentAt: existing.welcomeEmailSentAt },
    after: { welcomeEmailSentAt: updated.welcomeEmailSentAt },
  }).catch(() => {});

  return c.json({
    data: {
      id: updated.id,
      welcomeEmailSentAt: updated.welcomeEmailSentAt?.toISOString(),
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
      billingSubscriptions: {
        where: { source: "MANUAL", status: "ACTIVE" },
        include: { plan: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
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
      activeGrant: user.billingSubscriptions?.[0]
        ? {
            id: user.billingSubscriptions[0].id,
            plan: {
              id: user.billingSubscriptions[0].plan.id,
              name: user.billingSubscriptions[0].plan.name,
              slug: user.billingSubscriptions[0].plan.slug,
            },
            endsAt: user.billingSubscriptions[0].currentPeriodEnd?.toISOString() ?? null,
            reason: (user.billingSubscriptions[0].rawPayload as any)?.reason ?? null,
            grantedAt: user.billingSubscriptions[0].createdAt.toISOString(),
          }
        : null,
    },
  });
});

// PATCH /:id - Update user (status / onboarding only; plan changes go through grants)
usersRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ isAdmin?: boolean; status?: string; onboardingComplete?: boolean }>();

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

  const existingUser = await prisma.user.findUnique({
    where: { id: c.req.param("id") },
    select: { status: true, onboardingComplete: true },
  });

  const updated = await prisma.user.update({
    where: { id: c.req.param("id") },
    data,
    include: { plan: { select: { id: true, name: true, slug: true } } },
  });

  const auth = getAuth(c);
  const auditAction = body.onboardingComplete !== undefined ? "user.onboarding.reset" : "user.status.change";
  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: auditAction,
    entityType: "User",
    entityId: c.req.param("id"),
    before: { status: existingUser?.status, onboardingComplete: existingUser?.onboardingComplete },
    after: { status: body.status, onboardingComplete: body.onboardingComplete },
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

// POST /:id/grants - Create or replace a manual plan grant
usersRoutes.post("/:id/grants", async (c) => {
  const prisma = c.get("prisma") as any;
  const userId = c.req.param("id");
  const body = await c.req.json<{ planId?: string; endsAt?: string; reason?: string }>();

  if (!body.planId || !body.endsAt) {
    return c.json({ error: "planId and endsAt are required" }, 400);
  }

  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return c.json({ error: "endsAt must be a valid ISO date" }, 400);
  }
  if (endsAt <= new Date()) {
    return c.json({ error: "endsAt must be in the future" }, 400);
  }

  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.plan.findUnique({ where: { id: body.planId }, select: { id: true } }),
  ]);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (!plan) return c.json({ error: "Plan not found" }, 404);

  const auth = getAuth(c);
  const grantPayload = {
    grantedBy: auth!.userId!,
    grantedAt: new Date().toISOString(),
    reason: body.reason ?? null,
  };

  // Upsert on (MANUAL, userId) — one active grant per user; replaces any prior MANUAL row.
  const grant = await prisma.billingSubscription.upsert({
    where: { source_externalId: { source: "MANUAL", externalId: userId } },
    create: {
      userId,
      source: "MANUAL",
      externalId: userId,
      productExternalId: "admin-grant",
      planId: body.planId,
      status: "ACTIVE",
      currentPeriodEnd: endsAt,
      willRenew: false,
      rawPayload: grantPayload as any,
    },
    update: {
      planId: body.planId,
      status: "ACTIVE",
      currentPeriodEnd: endsAt,
      willRenew: false,
      rawPayload: grantPayload as any,
    },
    include: { plan: { select: { id: true, name: true, slug: true } } },
  });

  await recomputeEntitlement(prisma, userId);

  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: "user.grant.create",
    entityType: "User",
    entityId: userId,
    before: null,
    after: { planId: body.planId, endsAt: endsAt.toISOString(), reason: body.reason ?? null },
  }).catch(() => {});

  await recordBillingEvent(prisma, {
    userId,
    source: "MANUAL",
    eventType: "manual_grant_created",
    externalId: grant.id,
    productExternalId: "admin-grant",
    status: "APPLIED",
    rawPayload: { planId: body.planId, endsAt: endsAt.toISOString(), ...grantPayload },
  });

  return c.json({
    data: {
      id: grant.id,
      plan: { id: grant.plan.id, name: grant.plan.name, slug: grant.plan.slug },
      endsAt: grant.currentPeriodEnd?.toISOString() ?? null,
      reason: body.reason ?? null,
      grantedAt: grant.createdAt.toISOString(),
    },
  });
});

// DELETE /:id/grants - Revoke the user's active manual grant
usersRoutes.delete("/:id/grants", async (c) => {
  const prisma = c.get("prisma") as any;
  const userId = c.req.param("id");

  const existing = await prisma.billingSubscription.findUnique({
    where: { source_externalId: { source: "MANUAL", externalId: userId } },
  });
  if (!existing || existing.status !== "ACTIVE") {
    return c.json({ error: "No active manual grant for this user" }, 404);
  }

  await prisma.billingSubscription.update({
    where: { source_externalId: { source: "MANUAL", externalId: userId } },
    data: { status: "EXPIRED" },
  });

  await recomputeEntitlement(prisma, userId);

  const auth = getAuth(c);
  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: "user.grant.revoke",
    entityType: "User",
    entityId: userId,
    before: { planId: existing.planId, endsAt: existing.currentPeriodEnd?.toISOString() ?? null },
    after: null,
  }).catch(() => {});

  await recordBillingEvent(prisma, {
    userId,
    source: "MANUAL",
    eventType: "manual_grant_revoked",
    externalId: existing.id,
    productExternalId: "admin-grant",
    status: "APPLIED",
    rawPayload: {
      revokedBy: auth!.userId!,
      revokedAt: new Date().toISOString(),
      priorPlanId: existing.planId,
      priorEndsAt: existing.currentPeriodEnd?.toISOString() ?? null,
    },
  });

  return c.json({ data: { revoked: true } });
});

// POST /:id/reset-billing - Admin override: expire all of the user's billing
// subscriptions (Apple, Stripe, Manual grant) and recompute their plan back to
// the default. Used during testing to drop a user back to Free.
usersRoutes.post("/:id/reset-billing", async (c) => {
  const prisma = c.get("prisma") as any;
  const userId = c.req.param("id");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return c.json({ error: "User not found" }, 404);

  // Snapshot active rows for the audit payload before we mutate them.
  const activeBefore = await prisma.billingSubscription.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED_PENDING_EXPIRY", "GRACE_PERIOD"] },
    },
    select: { id: true, source: true, externalId: true, productExternalId: true, planId: true, status: true },
  });

  const updated = await prisma.billingSubscription.updateMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED_PENDING_EXPIRY", "GRACE_PERIOD"] },
    },
    data: { status: "EXPIRED", willRenew: false },
  });

  await recomputeEntitlement(prisma, userId);

  const auth = getAuth(c);
  writeAuditLog(prisma, {
    actorId: auth!.userId!,
    action: "user.billing.reset",
    entityType: "User",
    entityId: userId,
    before: { activeRows: activeBefore },
    after: { activeRows: [] },
  }).catch(() => {});

  await recordBillingEvent(prisma, {
    userId,
    source: "MANUAL",
    eventType: "admin_billing_reset",
    status: "APPLIED",
    rawPayload: {
      resetBy: auth!.userId!,
      resetAt: new Date().toISOString(),
      expiredRows: activeBefore,
    },
  });

  return c.json({ data: { reset: true, expiredCount: updated.count } });
});

// GET /:id/billing-events - Paginated audit log of billing events for this user
usersRoutes.get("/:id/billing-events", async (c) => {
  const prisma = c.get("prisma") as any;
  const userId = c.req.param("id");
  const { page, pageSize, skip } = parsePagination(c);

  const [events, total] = await Promise.all([
    prisma.billingEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.billingEvent.count({ where: { userId } }),
  ]);

  return c.json(paginatedResponse(events, total, page, pageSize));
});

// DELETE /:id - Delete a user account on their behalf (GDPR Art. 17 / CCPA right to erasure)
// Requires { confirm: "DELETE", reason: string } in body.
// Refuses admin targets and self-deletion; use manual removal for those.
usersRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const userId = c.req.param("id");
  const body = await validateBody(c, AdminDeleteUserSchema);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      createdAt: true,
      planId: true,
      stripeCustomerId: true,
      isAdmin: true,
    },
  });
  if (!target) return c.json({ error: "User not found" }, 404);

  const auth = getAuth(c);
  const actorClerkId = auth!.userId!;

  if (target.isAdmin) {
    return c.json(
      { error: "Cannot delete admin accounts through this endpoint. Revoke admin status first, or remove manually." },
      400
    );
  }
  if (target.clerkId === actorClerkId) {
    return c.json({ error: "Use the self-serve delete flow in Settings to delete your own account." }, 400);
  }

  const snapshot = {
    id: target.id,
    clerkId: target.clerkId,
    email: target.email,
    name: target.name,
    createdAt: target.createdAt instanceof Date ? target.createdAt.toISOString() : target.createdAt,
    planId: target.planId,
    stripeCustomerId: target.stripeCustomerId,
  };

  const { r2Deleted } = await deleteUserAccount(prisma, c.env, target.id, target.clerkId);

  writeAuditLog(prisma, {
    actorId: actorClerkId,
    action: "user.delete",
    entityType: "User",
    entityId: target.id,
    before: snapshot,
    after: null,
    metadata: { initiatedBy: "admin", reason: body.reason, r2Deleted },
  }).catch(() => {});

  console.log(
    JSON.stringify({
      level: "info",
      action: "admin_user_account_deleted",
      actorClerkId,
      targetUserId: target.id,
      targetEmail: target.email,
      reason: body.reason,
      r2Deleted,
      ts: new Date().toISOString(),
    })
  );

  return new Response(null, { status: 204 });
});

export { usersRoutes };
