import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { buildUserExport, deleteUserAccount } from "../lib/user-data";
import { getActiveFlags } from "../lib/feature-flags";
import { getUserUsage } from "../lib/plan-limits";
import { validateBody } from "../lib/validation";
import { DURATION_TIERS } from "../lib/constants";
import { checkVoicePresetAccess } from "../lib/voice-presets";
import { createStripeClient } from "../lib/stripe";
import { computeUserProfile, recomputeRecommendationCache } from "../lib/recommendations";

const OnboardingCompleteSchema = z.object({
  reset: z.boolean().optional(),
});

const PreferencesSchema = z.object({
  defaultDurationTier: z
    .number()
    .refine((n) => (DURATION_TIERS as readonly number[]).includes(n), {
      message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
    })
    .optional(),
  defaultVoicePresetId: z.string().nullable().optional(),
  acceptAnyVoice: z.boolean().optional(),
  preferredCategories: z.array(z.string()).max(10).optional(),
  excludedCategories: z.array(z.string()).max(10).optional(),
  preferredTopics: z.array(z.string().max(50)).max(20).optional(),
  excludedTopics: z.array(z.string().max(50)).max(20).optional(),
  dmaCode: z.string().max(10).nullable().optional(),
});

const DeleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
});

const PushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const PushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});

export const me = new Hono<{ Bindings: Env }>();

me.use("*", requireAuth);

/**
 * GET / — Return the current user's DB record, creating it if needed.
 * Called on app load to ensure the user exists in the database.
 */
me.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      plan: true,
      sportsTeams: { include: { team: { select: { id: true, name: true, nickname: true, abbreviation: true } } } },
    },
  });

  // Opportunistically store DMA code from Cloudflare IP geolocation —
  // only when user has no dmaCode yet (first visit). Once set (by auto-detect
  // or user choice), we don't overwrite so the user's explicit selection sticks.
  const cf = (c.req.raw as any).cf;
  const detectedDma = cf?.metroCode != null ? String(cf.metroCode) : undefined;
  if (detectedDma && !fullUser.dmaCode) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { dmaCode: detectedDma },
      });
      fullUser.dmaCode = detectedDma;
    } catch { /* non-critical */ }
  }

  const flags = await getActiveFlags(prisma, {
    userId: fullUser.clerkId,
    planSlug: fullUser.plan?.slug,
  });

  // Fetch live cancellation status from Stripe (webhook may not have fired yet)
  let subscriptionEndsAt: string | null = fullUser.subscriptionEndsAt?.toISOString() ?? null;
  if (fullUser.stripeCustomerId && c.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({
        customer: fullUser.stripeCustomerId,
        status: "active",
        limit: 1,
      });
      const activeSub = subs.data[0];
      console.log(JSON.stringify({
        action: "me_stripe_check",
        stripeCustomerId: fullUser.stripeCustomerId,
        hasActiveSub: !!activeSub,
        cancelAtPeriodEnd: activeSub?.cancel_at_period_end ?? null,
        cancelAt: activeSub?.cancel_at ?? null,
        dbSubscriptionEndsAt: subscriptionEndsAt,
      }));
      if (activeSub?.cancel_at) {
        // cancel_at is set by either cancel_at_period_end or scheduled cancellation
        subscriptionEndsAt = new Date(activeSub.cancel_at * 1000).toISOString();
      } else if (activeSub && !activeSub.cancel_at_period_end) {
        subscriptionEndsAt = null;
      }
    } catch (err) {
      console.error(JSON.stringify({
        action: "me_stripe_check_error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return c.json({
    user: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      imageUrl: fullUser.imageUrl,
      plan: fullUser.plan
        ? {
            id: fullUser.plan.id,
            name: fullUser.plan.name,
            slug: fullUser.plan.slug,
          }
        : null,
      subscriptionEndsAt,
      isAdmin: fullUser.isAdmin,
      onboardingComplete: fullUser.onboardingComplete,
      defaultDurationTier: fullUser.defaultDurationTier,
      defaultVoicePresetId: fullUser.defaultVoicePresetId,
      acceptAnyVoice: fullUser.acceptAnyVoice,
      preferredCategories: fullUser.preferredCategories ?? [],
      excludedCategories: fullUser.excludedCategories ?? [],
      preferredTopics: fullUser.preferredTopics ?? [],
      excludedTopics: fullUser.excludedTopics ?? [],
      profileCompletedAt: fullUser.profileCompletedAt?.toISOString() ?? null,
      dmaCode: fullUser.dmaCode ?? null,
      sportsTeams: (fullUser.sportsTeams ?? []).map((st: any) => st.team),
      featureFlags: flags,
    },
  });
});

/**
 * PATCH /onboarding-complete — Mark onboarding as complete (or reset for admins).
 * Body (optional): { reset: true } — resets onboarding (admin only)
 */
me.patch("/onboarding-complete", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const body = await validateBody(c, OnboardingCompleteSchema);
  const complete = body.reset && user.isAdmin ? false : true;

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingComplete: complete },
  });

  return c.json({ data: { onboardingComplete: complete } });
});

/**
 * PATCH /preferences — Update user preferences.
 * Body: { defaultDurationTier?: number, defaultVoicePresetId?: string | null }
 */
me.patch("/preferences", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const body = await validateBody(c, PreferencesSchema);

  // Enforce plan access for voice preset
  if (body.defaultVoicePresetId !== undefined && body.defaultVoicePresetId !== null) {
    const voiceError = await checkVoicePresetAccess(prisma, user.planId, body.defaultVoicePresetId);
    if (voiceError) return c.json({ error: voiceError }, 403);

  }

  const data: any = {};
  if (body.defaultDurationTier !== undefined) data.defaultDurationTier = body.defaultDurationTier;
  if (body.defaultVoicePresetId !== undefined) data.defaultVoicePresetId = body.defaultVoicePresetId;
  if (body.acceptAnyVoice !== undefined) data.acceptAnyVoice = body.acceptAnyVoice;
  if (body.preferredCategories !== undefined) data.preferredCategories = body.preferredCategories;
  if (body.excludedCategories !== undefined) data.excludedCategories = body.excludedCategories;
  if (body.preferredTopics !== undefined) data.preferredTopics = body.preferredTopics;
  if (body.excludedTopics !== undefined) data.excludedTopics = body.excludedTopics;
  if (body.dmaCode !== undefined) data.dmaCode = body.dmaCode;

  // Mark profile as completed if any interest prefs are being set
  const hasInterestUpdate = body.preferredCategories !== undefined
    || body.excludedCategories !== undefined
    || body.preferredTopics !== undefined
    || body.excludedTopics !== undefined;
  if (hasInterestUpdate) data.profileCompletedAt = new Date();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  // Recompute recommendation profile in background when interests or location change
  if (hasInterestUpdate || body.dmaCode !== undefined) {
    try {
      await computeUserProfile(user.id, prisma);
      await recomputeRecommendationCache(user.id, prisma);
    } catch (err) {
      console.error(JSON.stringify({
        action: "recompute_after_prefs_error",
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return c.json({
    data: {
      defaultDurationTier: updated.defaultDurationTier,
      defaultVoicePresetId: updated.defaultVoicePresetId,
      acceptAnyVoice: updated.acceptAnyVoice,
      preferredCategories: updated.preferredCategories,
      excludedCategories: updated.excludedCategories,
      preferredTopics: updated.preferredTopics,
      excludedTopics: updated.excludedTopics,
      dmaCode: updated.dmaCode,
    },
  });
});

/**
 * GET /usage — Return the current user's usage metering data.
 */
me.get("/usage", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const usage = await getUserUsage(user.id, prisma);
  return c.json({ data: usage });
});

/**
 * GET /export — Export all user data (GDPR Article 20 — data portability).
 */
me.get("/export", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const exportData = await buildUserExport(prisma, user.id);

  return c.json({ data: exportData }, 200, {
    "Content-Disposition": `attachment; filename="blipp-export-${new Date().toISOString().split("T")[0]}.json"`,
  });
});

/**
 * DELETE / — Delete user account and all data (GDPR Article 17 — right to erasure).
 * Requires { confirm: "DELETE" } in request body.
 */
me.delete("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  await validateBody(c, DeleteAccountSchema);

  const { r2Deleted } = await deleteUserAccount(
    prisma,
    c.env,
    user.id,
    user.clerkId
  );

  console.log(
    JSON.stringify({
      level: "info",
      action: "user_account_deleted",
      userId: user.id,
      r2Deleted,
      ts: new Date().toISOString(),
    })
  );

  return new Response(null, { status: 204 });
});

/**
 * POST /push/subscribe — Register a push notification subscription.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
me.post("/push/subscribe", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const body = await validateBody(c, PushSubscribeSchema);

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    update: {
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
  });

  return c.json({ data: { id: subscription.id } }, 201);
});

/**
 * DELETE /push/subscribe — Unregister a push subscription.
 * Body: { endpoint }
 */
me.delete("/push/subscribe", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const body = await validateBody(c, PushUnsubscribeSchema);

  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, endpoint: body.endpoint },
  });

  return c.json({ data: { deleted: true } });
});

/**
 * GET /push/vapid-key — Get the VAPID public key for subscription.
 */
me.get("/push/vapid-key", async (c) => {
  const key = c.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return c.json({ error: "Push notifications not configured" }, 503);
  }
  return c.json({ data: { publicKey: key } });
});

/**
 * GET /sports-teams — Browse available sports teams + user's selections.
 * Query params: ?search=chiefs — filter teams by name/city/nickname
 * Returns: { selected, local, leagues }
 */
me.get("/sports-teams", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const search = c.req.query("search")?.trim().toLowerCase();

  // Fetch user's current selections
  const userTeams = await prisma.userSportsTeam.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  });
  const selectedIds = new Set(userTeams.map((t: any) => t.teamId));

  // Fetch user's DMA for local teams
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { dmaCode: true },
  });

  // Resolve local team IDs from DMA
  let localTeamIds = new Set<string>();
  if (fullUser?.dmaCode) {
    const markets = await prisma.sportsTeamMarket.findMany({
      where: { dmaCode: fullUser.dmaCode },
      select: { teamId: true },
    });
    localTeamIds = new Set(markets.map((m: any) => m.teamId));
  }

  // Fetch all teams with league info
  const teams = await prisma.sportsTeam.findMany({
    include: {
      league: { select: { id: true, name: true, sport: true } },
    },
    orderBy: [{ league: { name: "asc" } }, { city: "asc" }],
  });

  // Apply search filter
  const filtered = search
    ? teams.filter((t: any) =>
        t.name.toLowerCase().includes(search) ||
        t.city.toLowerCase().includes(search) ||
        t.nickname.toLowerCase().includes(search) ||
        t.abbreviation.toLowerCase().includes(search)
      )
    : teams;

  // Build response
  const mapTeam = (t: any) => ({
    id: t.id,
    name: t.name,
    city: t.city,
    nickname: t.nickname,
    abbreviation: t.abbreviation,
    leagueId: t.leagueId,
    leagueName: t.league?.name,
    selected: selectedIds.has(t.id),
  });

  const local = filtered.filter((t: any) => localTeamIds.has(t.id)).map(mapTeam);

  // Group remaining by league
  const leagueMap = new Map<string, { id: string; name: string; sport: string; teams: any[] }>();
  for (const team of filtered) {
    const lid = team.league?.id;
    if (!lid) continue;
    if (!leagueMap.has(lid)) {
      leagueMap.set(lid, {
        id: lid,
        name: team.league.name,
        sport: team.league.sport,
        teams: [],
      });
    }
    leagueMap.get(lid)!.teams.push(mapTeam(team));
  }

  const selected = filtered.filter((t: any) => selectedIds.has(t.id)).map(mapTeam);

  return c.json({
    data: {
      selected,
      local,
      leagues: [...leagueMap.values()],
    },
  });
});

const SportsTeamsSchema = z.object({
  teamIds: z.array(z.string()).max(50),
});

/**
 * PUT /sports-teams — Set user's selected sports teams.
 * Body: { teamIds: string[] }
 */
me.put("/sports-teams", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const body = await validateBody(c, SportsTeamsSchema);

  // Delete all existing selections and create new ones
  await prisma.userSportsTeam.deleteMany({ where: { userId: user.id } });

  if (body.teamIds.length > 0) {
    await prisma.userSportsTeam.createMany({
      data: body.teamIds.map((teamId: string) => ({ userId: user.id, teamId })),
      skipDuplicates: true,
    });
  }

  // Recompute recommendations since team preferences changed
  try {
    await recomputeRecommendationCache(user.id, prisma);
  } catch (err) {
    console.error(JSON.stringify({
      action: "recompute_after_sports_teams_error",
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  return c.json({ data: { teamIds: body.teamIds } });
});
