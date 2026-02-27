import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";
import { createStripeClient } from "../lib/stripe";

/**
 * Billing routes for Stripe subscription management.
 * All routes require Clerk authentication.
 */
export const billing = new Hono<{ Bindings: Env }>();

billing.use("*", requireAuth);

/**
 * POST /checkout — Creates a Stripe Checkout session for subscription upgrade.
 * Body: `{ tier: "PRO" | "PRO_PLUS" }`
 *
 * @returns `{ url: string }` — The Stripe Checkout URL to redirect the user
 * @throws 400 if tier is invalid, missing, or has no Stripe price
 * @throws 401 if not authenticated
 */
billing.post("/checkout", async (c) => {
  const userId = getAuth(c)!.userId!;
  const { tier } = await c.req.json<{ tier: string }>();

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    // Look up plan and its Stripe price from the database
    const plan = await prisma.plan.findFirst({
      where: { tier: tier as any, active: true },
    });

    if (!plan || !plan.stripePriceId) {
      return c.json({ error: "Invalid or unavailable plan" }, 400);
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);

    const origin = c.req.header("origin") ?? "https://blipp.app";

    const sessionParams: Record<string, unknown> = {
      mode: "subscription" as const,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: { clerkId: userId },
    };

    // Reuse existing Stripe customer if available
    if (user.stripeCustomerId) {
      sessionParams.customer = user.stripeCustomerId;
    } else {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    // Save stripeCustomerId if this is the user's first checkout
    if (!user.stripeCustomerId && session.customer) {
      await prisma.user.update({
        where: { clerkId: userId },
        data: { stripeCustomerId: session.customer as string },
      });
    }

    return c.json({ url: session.url });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * POST /portal — Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * @returns `{ url: string }` — The portal URL to redirect the user
 * @throws 400 if user has no stripeCustomerId (never subscribed)
 * @throws 401 if not authenticated
 */
billing.post("/portal", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    if (!user.stripeCustomerId) {
      return c.json({ error: "No active subscription found" }, 400);
    }

    const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
    const origin = c.req.header("origin") ?? "https://blipp.app";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    return c.json({ url: session.url });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
