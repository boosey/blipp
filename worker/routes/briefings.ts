import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";
import { nearestTier } from "../lib/time-fitting";

/**
 * Briefing routes for generating and managing daily podcast briefings.
 * All routes require Clerk authentication.
 */
export const briefings = new Hono<{ Bindings: Env }>();

briefings.use("*", requireAuth);

/** Maximum briefings per week for free-tier users */
const FREE_WEEKLY_LIMIT = 3;
/** Maximum briefing length in minutes for free-tier users */
const FREE_MAX_MINUTES = 5;

/**
 * GET / — List the user's briefings (last 30, newest first).
 *
 * @returns Array of briefing records ordered by creation date descending
 */
briefings.get("/", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const list = await prisma.briefing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return c.json({ briefings: list });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /today — Get today's briefing for the authenticated user.
 * Returns the most recent briefing created today (in UTC).
 *
 * @returns The briefing object, or null if none exists for today
 */
briefings.get("/today", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const briefing = await prisma.briefing.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: startOfDay },
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json({ briefing: briefing ?? null });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * POST /generate — Generate a new briefing.
 * Enforces tier limits: FREE users get 3/week and max 5 minutes.
 * Queues the briefing for assembly via BRIEFING_ASSEMBLY_QUEUE.
 *
 * @returns The created briefing record
 * @throws 429 if free-tier user exceeds weekly limit
 */
briefings.post("/generate", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    let targetMinutes = user.briefingLengthMinutes;

    // Enforce free-tier limits
    if (user.tier === "FREE") {
      targetMinutes = Math.min(targetMinutes, FREE_MAX_MINUTES);

      // Count briefings in the last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const weeklyCount = await prisma.briefing.count({
        where: {
          userId: user.id,
          createdAt: { gte: oneWeekAgo },
        },
      });

      if (weeklyCount >= FREE_WEEKLY_LIMIT) {
        return c.json(
          {
            error: "Free tier limit reached: 3 briefings per week",
            limit: FREE_WEEKLY_LIMIT,
            used: weeklyCount,
          },
          429
        );
      }
    }

    // Get user's podcast subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      select: { podcastId: true },
    });
    if (!subscriptions.length) {
      return c.json({ error: "No podcast subscriptions found" }, 400);
    }

    // Build items from subscriptions (useLatest for all, equal time split)
    const perEpisodeTier = nearestTier(targetMinutes / subscriptions.length);
    const items = subscriptions.map((s: { podcastId: string }) => ({
      podcastId: s.podcastId,
      episodeId: null,
      durationTier: perEpisodeTier,
      useLatest: true,
    }));

    // Create a BriefingRequest and dispatch to orchestrator
    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes,
        items: items as any,
        isTest: false,
        status: "PENDING",
      },
    });

    await c.env.ORCHESTRATOR_QUEUE.send({
      requestId: request.id,
      action: "evaluate",
    });

    return c.json({ request: { id: request.id, status: "PENDING", targetMinutes } }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /preferences — Retrieve briefing preferences and tier.
 *
 * @returns The user's briefing preferences and current tier
 */
briefings.get("/preferences", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    return c.json({
      briefingLength: user.briefingLengthMinutes,
      briefingTime: user.briefingTime,
      timezone: user.timezone,
      tier: user.tier,
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * PATCH /preferences — Update briefing preferences.
 * Accepts: briefingLengthMinutes, briefingTime, timezone.
 *
 * @returns The updated user record
 */
briefings.patch("/preferences", async (c) => {
  const userId = getAuth(c)!.userId!;
  const body = await c.req.json<{
    briefingLengthMinutes?: number;
    briefingTime?: string;
    timezone?: string;
  }>();

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const updateData: Record<string, unknown> = {};

    if (body.briefingLengthMinutes !== undefined) {
      updateData.briefingLengthMinutes = body.briefingLengthMinutes;
    }
    if (body.briefingTime !== undefined) {
      updateData.briefingTime = body.briefingTime;
    }
    if (body.timezone !== undefined) {
      updateData.timezone = body.timezone;
    }

    const user = await prisma.user.update({
      where: { clerkId: userId },
      data: updateData,
    });

    return c.json({
      preferences: {
        briefingLengthMinutes: user.briefingLengthMinutes,
        briefingTime: user.briefingTime,
        timezone: user.timezone,
        tier: user.tier,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
