import { Hono } from "hono";
import type { Env } from "../../types";
import { createStripeClient } from "../../lib/stripe";

/**
 * Stripe webhook route handler.
 * Processes subscription lifecycle events and updates user plans.
 *
 * Handles:
 * - `checkout.session.completed` — Assigns user to the purchased plan
 * - `customer.subscription.deleted` — Reverts user to the default (free) plan
 *
 * Uses `constructEventAsync` for Workers-compatible webhook verification.
 */
export const stripeWebhooks = new Hono<{ Bindings: Env }>();

/**
 * Looks up a Plan by its Stripe price ID (monthly or annual).
 * Returns null if no matching plan is found.
 */
async function planFromPriceId(priceId: string, prisma: any) {
  const plan = await prisma.plan.findFirst({
    where: {
      OR: [
        { stripePriceIdMonthly: priceId },
        { stripePriceIdAnnual: priceId },
      ],
    },
  });
  return plan;
}

/**
 * POST / — Receive Stripe webhook events.
 * Body must be raw (arrayBuffer) for signature verification.
 */
stripeWebhooks.post("/", async (c) => {
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await c.req.raw.arrayBuffer();
  const body = new TextDecoder().decode(rawBody);

  let event;
  try {
    // Workers require the async variant — sync constructEvent uses Node.js crypto
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(
      "[SECURITY] Stripe webhook signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  const prisma = c.get("prisma") as any;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const stripeCustomerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      // Fetch the subscription to get the price ID
      const subscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;

      if (!priceId) break;

      // Try plan from price ID, then from checkout metadata, then fall back to default
      let plan = await planFromPriceId(priceId, prisma);

      if (!plan && session.metadata?.planId) {
        plan = await prisma.plan.findUnique({
          where: { id: session.metadata.planId },
        });
      }

      if (!plan) {
        plan = await prisma.plan.findFirst({ where: { isDefault: true } });
      }

      if (plan) {
        await prisma.user.update({
          where: { stripeCustomerId },
          data: { planId: plan.id },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;

      const defaultPlan = await prisma.plan.findFirst({
        where: { isDefault: true },
      });

      if (defaultPlan) {
        await prisma.user.update({
          where: { stripeCustomerId },
          data: { planId: defaultPlan.id },
        });
      }
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});
