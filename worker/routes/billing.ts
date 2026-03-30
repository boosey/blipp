import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { createStripeClient } from "../lib/stripe";
import { validateBody } from "../lib/validation";

/**
 * Billing routes for Stripe subscription management.
 * All routes require Clerk authentication.
 */
export const billing = new Hono<{ Bindings: Env }>();

billing.use("*", requireAuth);

/**
 * POST /checkout — Creates a Stripe Checkout session for subscription upgrade.
 * Body: `{ planId: string, interval: "monthly" | "annual" }`
 *
 * @returns `{ url: string }` — The Stripe Checkout URL to redirect the user
 * @throws 400 if plan is invalid, missing, or has no Stripe price for the chosen interval
 * @throws 401 if not authenticated
 */
const checkoutSchema = z.object({
  planId: z.string().min(1),
  interval: z.enum(["monthly", "annual"]),
});

billing.post("/checkout", async (c) => {
  const { planId, interval } = await validateBody(c, checkoutSchema);

  const prisma = c.get("prisma") as any;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });

  if (!plan || !plan.active) {
    return c.json({ error: "Invalid or unavailable plan" }, 400);
  }

  const stripePriceId =
    interval === "annual" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;

  if (!stripePriceId) {
    return c.json(
      { error: `No Stripe price configured for ${interval} billing` },
      400
    );
  }

  const user = await getCurrentUser(c, prisma);

  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);

  const origin = c.req.header("origin") || c.env.APP_ORIGIN;
  if (!origin) {
    return c.json({ error: "Cannot determine app origin — APP_ORIGIN env var is missing and no Origin header" }, 500);
  }

  const sessionParams: Record<string, unknown> = {
    mode: "subscription" as const,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/settings?billing=canceled`,
    metadata: { clerkId: user.clerkId, planId },
  };

  // Reuse existing Stripe customer if available
  if (user.stripeCustomerId) {
    sessionParams.customer = user.stripeCustomerId;
  } else {
    sessionParams.customer_email = user.email;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );
  } catch (err) {
    console.error("[billing/checkout] Stripe error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Checkout failed: ${message}` }, 500);
  }

  // Save stripeCustomerId if this is the user's first checkout
  if (!user.stripeCustomerId && session.customer) {
    await prisma.user.update({
      where: { clerkId: user.clerkId },
      data: { stripeCustomerId: session.customer as string },
    });
  }

  return c.json({ url: session.url });
});

/**
 * POST /portal — Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * @returns `{ url: string }` — The portal URL to redirect the user
 * @throws 400 if user has no stripeCustomerId (never subscribed)
 * @throws 401 if not authenticated
 */
billing.post("/portal", async (c) => {
  const prisma = c.get("prisma") as any;

  const user = await getCurrentUser(c, prisma);

  if (!user.stripeCustomerId) {
    return c.json({ error: "No active subscription found" }, 400);
  }

  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const origin = c.req.header("origin") || c.env.APP_ORIGIN;
  if (!origin) {
    return c.json({ error: "Cannot determine app origin — APP_ORIGIN env var is missing and no Origin header" }, 500);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return c.json({ url: session.url });
});
