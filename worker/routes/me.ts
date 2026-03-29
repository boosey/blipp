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
    include: { plan: true },
  });

  const flags = await getActiveFlags(prisma, {
    userId: fullUser.clerkId,
    planSlug: fullUser.plan?.slug,
  });

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
      isAdmin: fullUser.isAdmin,
      onboardingComplete: fullUser.onboardingComplete,
      defaultDurationTier: fullUser.defaultDurationTier,
      defaultVoicePresetId: fullUser.defaultVoicePresetId,
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

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return c.json({
    data: {
      defaultDurationTier: updated.defaultDurationTier,
      defaultVoicePresetId: updated.defaultVoicePresetId,
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
