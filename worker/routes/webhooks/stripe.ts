import { Hono } from "hono";
import type { Env } from "../../types";
import { createPrismaClient } from "../../lib/db";
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
 * Maps a Stripe Price ID to the corresponding UserTier.
 *
 * @param priceId - The Stripe price ID from the subscription
 * @param env - Worker environment bindings containing price ID mappings
 * @returns The matching UserTier, or "FREE" if no match
 */
function tierFromPriceId(priceId: string, env: Env): string {
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId === env.STRIPE_PRO_PLUS_PRICE_ID) return "PRO_PLUS";
  return "FREE";
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

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
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

        const tier = tierFromPriceId(priceId, c.env);

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
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
