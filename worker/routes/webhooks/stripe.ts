import { Hono } from "hono";
import type { Env } from "../../types";
import { createStripeClient } from "../../lib/stripe";

/**
 * Stripe webhook route handler.
 * Processes subscription lifecycle events and updates user tiers.
 *
 * Handles:
 * - `checkout.session.completed` — Upgrades user to PRO or PRO_PLUS
 * - `customer.subscription.deleted` — Reverts user to FREE tier
 *
 * Uses `constructEventAsync` for Workers-compatible webhook verification.
 */
export const stripeWebhooks = new Hono<{ Bindings: Env }>();

/**
 * Looks up the UserTier for a Stripe Price ID from the Plan table.
 * Falls back to FREE if no matching plan is found.
 */
async function tierFromPriceId(
  priceId: string,
  prisma: any
): Promise<string> {
  const plan = await prisma.plan.findUnique({
    where: { stripePriceId: priceId },
  });
  return plan?.tier ?? "FREE";
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
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
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

      const tier = await tierFromPriceId(priceId, prisma);

      await prisma.user.update({
        where: { stripeCustomerId },
        data: { tier: tier as "PRO" | "PRO_PLUS" },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;

      await prisma.user.update({
        where: { stripeCustomerId },
        data: { tier: "FREE" },
      });
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});
