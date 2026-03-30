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

  // Log every webhook event for debugging
  const eventObj = event.data.object as any;
  console.log(JSON.stringify({
    action: "stripe_webhook_received",
    eventType: event.type,
    subscriptionStatus: eventObj.status ?? null,
    cancelAtPeriodEnd: eventObj.cancel_at_period_end ?? null,
    cancelAt: eventObj.cancel_at ?? null,
    customer: eventObj.customer ?? eventObj.customer_email ?? null,
    ts: new Date().toISOString(),
  }));

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
        // Try by stripeCustomerId first, fall back to clerkId from metadata
        // (first checkout: stripeCustomerId may not be saved on user yet)
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { stripeCustomerId },
              ...(session.metadata?.clerkId ? [{ clerkId: session.metadata.clerkId }] : []),
            ],
          },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { planId: plan.id, stripeCustomerId },
          });
        } else {
          console.error(JSON.stringify({
            level: "error",
            action: "checkout_user_not_found",
            stripeCustomerId,
            clerkId: session.metadata?.clerkId,
            ts: new Date().toISOString(),
          }));
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;
      const priceId = subscription.items.data[0]?.price.id;

      if (!priceId) break;

      // Check if subscription is being cancelled (cancel_at_period_end)
      if (subscription.cancel_at_period_end) {
        const endsAt = subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000)
          : null;
        await prisma.user.update({
          where: { stripeCustomerId },
          data: { subscriptionEndsAt: endsAt },
        });
        console.log(JSON.stringify({
          level: "info",
          action: "subscription_cancellation_scheduled",
          stripeCustomerId,
          cancelAt: subscription.cancel_at,
          ts: new Date().toISOString(),
        }));
        // Don't downgrade yet — they paid through the period
        break;
      }

      // Plan change or reactivation — update plan and clear any pending cancellation
      const plan = await planFromPriceId(priceId, prisma);
      if (plan) {
        await prisma.user.update({
          where: { stripeCustomerId },
          data: { planId: plan.id, subscriptionEndsAt: null },
        });
        console.log(JSON.stringify({
          level: "info",
          action: "subscription_plan_changed",
          stripeCustomerId,
          newPlanId: plan.id,
          ts: new Date().toISOString(),
        }));
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer as string;
      const attemptCount = invoice.attempt_count;

      console.error(JSON.stringify({
        level: "error",
        action: "payment_failed",
        stripeCustomerId,
        attemptCount,
        amountDue: invoice.amount_due,
        ts: new Date().toISOString(),
      }));

      // After 3 failed attempts, downgrade to free plan
      if (attemptCount >= 3) {
        const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
        if (defaultPlan) {
          await prisma.user.update({
            where: { stripeCustomerId },
            data: { planId: defaultPlan.id },
          });
          console.log(JSON.stringify({
            level: "warn",
            action: "user_downgraded_payment_failure",
            stripeCustomerId,
            ts: new Date().toISOString(),
          }));
        }
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
          data: { planId: defaultPlan.id, subscriptionEndsAt: null },
        });
      }
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});
