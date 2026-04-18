import { Hono } from "hono";
import type { Env } from "../../types";
import { createStripeClient } from "../../lib/stripe";
import { resolveApiKey } from "../../lib/service-key-resolver";
import {
  recomputeEntitlement,
  upsertBillingSubscription,
  markBillingSubscriptionStatus,
} from "../../lib/entitlement";

export const stripeWebhooks = new Hono<{ Bindings: Env }>();

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

async function userFromStripeCustomer(stripeCustomerId: string, prisma: any) {
  return prisma.user.findFirst({ where: { stripeCustomerId } });
}

function stripeTsToDate(ts: number | null | undefined): Date | null {
  return ts ? new Date(ts * 1000) : null;
}

stripeWebhooks.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const stripe = createStripeClient(
    await resolveApiKey(prisma, c.env, "STRIPE_SECRET_KEY", "billing.stripe")
  );
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await c.req.raw.arrayBuffer();
  const body = new TextDecoder().decode(rawBody);

  let event;
  try {
    const webhookSecret = await resolveApiKey(
      prisma,
      c.env,
      "STRIPE_WEBHOOK_SECRET",
      "billing.stripe-webhook"
    );
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error(
      "[SECURITY] Stripe webhook signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  const eventObj = event.data.object as any;
  console.log(
    JSON.stringify({
      action: "stripe_webhook_received",
      eventType: event.type,
      subscriptionStatus: eventObj.status ?? null,
      cancelAtPeriodEnd: eventObj.cancel_at_period_end ?? null,
      cancelAt: eventObj.cancel_at ?? null,
      customer: eventObj.customer ?? eventObj.customer_email ?? null,
      ts: new Date().toISOString(),
    })
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const stripeCustomerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId) break;

      let plan = await planFromPriceId(priceId, prisma);
      if (!plan && session.metadata?.planId) {
        plan = await prisma.plan.findUnique({ where: { id: session.metadata.planId } });
      }
      if (!plan) {
        plan = await prisma.plan.findFirst({ where: { isDefault: true } });
      }
      if (!plan) break;

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { stripeCustomerId },
            ...(session.metadata?.clerkId ? [{ clerkId: session.metadata.clerkId }] : []),
          ],
        },
      });

      if (!user) {
        console.error(
          JSON.stringify({
            level: "error",
            action: "checkout_user_not_found",
            stripeCustomerId,
            clerkId: session.metadata?.clerkId,
            ts: new Date().toISOString(),
          })
        );
        break;
      }

      if (user.stripeCustomerId !== stripeCustomerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId },
        });
      }

      await upsertBillingSubscription(prisma, {
        userId: user.id,
        source: "STRIPE",
        externalId: subscription.id,
        productExternalId: priceId,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: stripeTsToDate((subscription as any).current_period_end),
        willRenew: !subscription.cancel_at_period_end && !subscription.cancel_at,
        rawPayload: subscription,
      });
      await recomputeEntitlement(prisma, user.id);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer as string;
      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId) break;

      const user = await userFromStripeCustomer(stripeCustomerId, prisma);
      if (!user) break;

      const plan = await planFromPriceId(priceId, prisma);
      if (!plan) break;

      const isCancelling = Boolean(
        subscription.cancel_at_period_end || subscription.cancel_at
      );
      const endsAt = subscription.cancel_at
        ? stripeTsToDate(subscription.cancel_at)
        : stripeTsToDate((subscription as any).current_period_end);

      await upsertBillingSubscription(prisma, {
        userId: user.id,
        source: "STRIPE",
        externalId: subscription.id,
        productExternalId: priceId,
        planId: plan.id,
        status: isCancelling ? "CANCELLED_PENDING_EXPIRY" : "ACTIVE",
        currentPeriodEnd: endsAt,
        willRenew: !isCancelling,
        rawPayload: subscription,
      });
      await recomputeEntitlement(prisma, user.id);

      console.log(
        JSON.stringify({
          level: "info",
          action: isCancelling ? "subscription_cancellation_scheduled" : "subscription_plan_changed",
          stripeCustomerId,
          subscriptionId: subscription.id,
          newPlanId: plan.id,
          cancelAt: subscription.cancel_at ?? null,
          ts: new Date().toISOString(),
        })
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer as string;
      const subscriptionId = (invoice as any).subscription as string | null;
      const attemptCount = invoice.attempt_count;

      console.error(
        JSON.stringify({
          level: "error",
          action: "payment_failed",
          stripeCustomerId,
          subscriptionId,
          attemptCount,
          amountDue: invoice.amount_due,
          ts: new Date().toISOString(),
        })
      );

      if (attemptCount >= 3 && subscriptionId) {
        const existing = await prisma.billingSubscription.findUnique({
          where: {
            source_externalId: { source: "STRIPE", externalId: subscriptionId },
          },
        });
        if (existing) {
          await markBillingSubscriptionStatus(
            prisma,
            "STRIPE",
            subscriptionId,
            "EXPIRED",
            { willRenew: false, rawPayload: invoice }
          );
          await recomputeEntitlement(prisma, existing.userId);
          console.log(
            JSON.stringify({
              level: "warn",
              action: "user_downgraded_payment_failure",
              stripeCustomerId,
              subscriptionId,
              ts: new Date().toISOString(),
            })
          );
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const existing = await prisma.billingSubscription.findUnique({
        where: {
          source_externalId: { source: "STRIPE", externalId: subscription.id },
        },
      });

      if (existing) {
        await markBillingSubscriptionStatus(
          prisma,
          "STRIPE",
          subscription.id,
          "EXPIRED",
          { willRenew: false, rawPayload: subscription }
        );
        await recomputeEntitlement(prisma, existing.userId);
      } else {
        // Fallback: no BillingSubscription row yet — resolve by customer and downgrade directly.
        const stripeCustomerId = subscription.customer as string;
        const user = await userFromStripeCustomer(stripeCustomerId, prisma);
        if (user) await recomputeEntitlement(prisma, user.id);
      }
      break;
    }

    default:
      break;
  }

  return c.json({ received: true });
});
