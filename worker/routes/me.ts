import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { buildUserExport, deleteUserAccount } from "../lib/user-data";
import { getActiveFlags } from "../lib/feature-flags";
import { getUserUsage } from "../lib/plan-limits";

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
      plan: {
        id: fullUser.plan.id,
        name: fullUser.plan.name,
        slug: fullUser.plan.slug,
      },
      isAdmin: fullUser.isAdmin,
      onboardingComplete: fullUser.onboardingComplete,
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

  let complete = true;
  try {
    const body = await c.req.json<{ reset?: boolean }>();
    if (body.reset && user.isAdmin) {
      complete = false;
    }
  } catch {
    // No body — default to marking complete
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingComplete: complete },
  });

  return c.json({ data: { onboardingComplete: complete } });
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

  const body = await c.req.json<{ confirm?: string }>();
  if (body.confirm !== "DELETE") {
    return c.json(
      { error: 'Request body must contain { confirm: "DELETE" }' },
      400
    );
  }

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
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "endpoint, keys.p256dh, and keys.auth are required" }, 400);
  }

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
  const body = await c.req.json<{ endpoint: string }>();

  if (!body.endpoint) {
    return c.json({ error: "endpoint is required" }, 400);
  }

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
