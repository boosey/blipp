import { Hono } from "hono";
import type { Env } from "../../types";
import { resolveApiKey } from "../../lib/service-key-resolver";
import {
  recomputeEntitlement,
  upsertBillingSubscription,
  markBillingSubscriptionStatus,
  recordBillingEvent,
  type BillingStatusLiteral,
} from "../../lib/entitlement";

export const revenuecatWebhooks = new Hono<{ Bindings: Env }>();

interface RCEventPayload {
  type: string;
  id?: string;
  app_user_id?: string;
  aliases?: string[];
  original_app_user_id?: string;
  product_id?: string;
  new_product_id?: string;
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  environment?: "PRODUCTION" | "SANDBOX";
  transaction_id?: string;
  original_transaction_id?: string;
  store?: string;
  auto_resume_at_ms?: number | null;
  cancel_reason?: string | null;
}

interface RCWebhookBody {
  event: RCEventPayload;
  api_version?: string;
}

async function resolveUserFromEvent(prisma: any, event: RCEventPayload) {
  const candidates: string[] = [];
  if (event.app_user_id) candidates.push(event.app_user_id);
  if (event.original_app_user_id) candidates.push(event.original_app_user_id);
  if (event.aliases?.length) candidates.push(...event.aliases);
  if (candidates.length === 0) return null;

  return prisma.user.findFirst({
    where: { OR: candidates.map((clerkId) => ({ clerkId })) },
  });
}

async function planFromAppleProductId(prisma: any, productId: string) {
  return prisma.plan.findFirst({
    where: {
      OR: [
        { appleProductIdMonthly: productId },
        { appleProductIdAnnual: productId },
      ],
    },
  });
}

function isProdEnvironment(env: Env): boolean {
  return env.WORKER_SCRIPT_NAME === "blipp" || env.ENVIRONMENT === "production";
}

type Handled = { ok: true; userId: string } | { ok: false; reason: string; userId?: string };

/**
 * POST / — RevenueCat Server Webhook.
 * Authenticated via Authorization header matching REVENUECAT_WEBHOOK_SECRET.
 * Idempotent — upsert keyed on (source=APPLE, externalId=original_transaction_id).
 */
revenuecatWebhooks.post("/", async (c) => {
  const prisma = c.get("prisma") as any;

  const expectedSecret = await resolveApiKey(
    prisma,
    c.env,
    "REVENUECAT_WEBHOOK_SECRET",
    "billing.revenuecat-webhook"
  );
  if (!expectedSecret) {
    console.error(
      JSON.stringify({
        level: "error",
        action: "revenuecat_webhook_secret_missing",
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: "Webhook not configured" }, 500);
  }

  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization");
  if (authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    console.error(
      JSON.stringify({
        level: "error",
        action: "revenuecat_webhook_auth_failed",
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: RCWebhookBody;
  try {
    body = (await c.req.json()) as RCWebhookBody;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const event = body.event;
  if (!event || !event.type) {
    return c.json({ error: "Missing event payload" }, 400);
  }

  const environment = event.environment ?? "PRODUCTION";
  const skipSandbox = isProdEnvironment(c.env) && environment === "SANDBOX";

  console.log(
    JSON.stringify({
      action: "revenuecat_webhook_received",
      eventType: event.type,
      environment,
      appUserId: event.app_user_id,
      productId: event.product_id,
      originalTransactionId: event.original_transaction_id,
      skipped: skipSandbox,
      ts: new Date().toISOString(),
    })
  );

  if (skipSandbox) {
    await recordBillingEvent(prisma, {
      userId: null,
      source: "APPLE",
      eventType: event.type,
      environment,
      externalId: event.original_transaction_id ?? null,
      productExternalId: event.product_id ?? null,
      status: "SKIPPED",
      skipReason: "sandbox_in_production",
      rawPayload: event as any,
    });
    return c.json({ received: true, skipped: "sandbox_in_production" });
  }

  const result = await handleEvent(prisma, event);
  await recordBillingEvent(prisma, {
    userId: result.userId ?? null,
    source: "APPLE",
    eventType: event.type,
    environment,
    externalId: event.original_transaction_id ?? null,
    productExternalId:
      event.type === "PRODUCT_CHANGE"
        ? event.new_product_id ?? event.product_id ?? null
        : event.product_id ?? null,
    status: result.ok ? "APPLIED" : "SKIPPED",
    skipReason: result.ok ? null : result.reason,
    rawPayload: event as any,
  });
  if (!result.ok) {
    // Non-retryable failures return 200 with a reason so RC stops retrying.
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "revenuecat_webhook_skipped",
        eventType: event.type,
        reason: result.reason,
        appUserId: event.app_user_id,
        productId: event.product_id,
        ts: new Date().toISOString(),
      })
    );
    return c.json({ received: true, skipped: result.reason });
  }

  return c.json({ received: true });
});

async function handleEvent(prisma: any, event: RCEventPayload): Promise<Handled> {
  const externalId = event.original_transaction_id;
  if (!externalId) return { ok: false, reason: "missing_original_transaction_id" };

  // Events that only require a status flip + recompute (no full upsert shape needed).
  // Try these first so we don't require a user/product lookup for simple state changes.
  const statusOnlyMap: Record<string, BillingStatusLiteral> = {
    EXPIRATION: "EXPIRED",
    SUBSCRIPTION_PAUSED: "PAUSED",
    REFUND: "REFUNDED",
  };
  if (statusOnlyMap[event.type]) {
    const existing = await prisma.billingSubscription.findUnique({
      where: { source_externalId: { source: "APPLE", externalId } },
    });
    if (!existing) return { ok: false, reason: "no_matching_subscription" };
    await markBillingSubscriptionStatus(
      prisma,
      "APPLE",
      externalId,
      statusOnlyMap[event.type],
      { willRenew: false, rawPayload: event as any }
    );
    await recomputeEntitlement(prisma, existing.userId);
    return { ok: true, userId: existing.userId };
  }

  // Events that require user + plan resolution (full upsert).
  const user = await resolveUserFromEvent(prisma, event);
  if (!user) return { ok: false, reason: "user_not_found" };

  // PRODUCT_CHANGE carries a new_product_id; all other events use product_id.
  const productId =
    event.type === "PRODUCT_CHANGE" ? event.new_product_id ?? event.product_id : event.product_id;
  if (!productId) return { ok: false, reason: "missing_product_id" };

  const plan = await planFromAppleProductId(prisma, productId);
  if (!plan) return { ok: false, reason: "unknown_product_id" };

  const currentPeriodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

  let status: BillingStatusLiteral;
  let willRenew = true;
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
      status = "ACTIVE";
      willRenew = true;
      break;
    case "CANCELLATION":
      // User turned off auto-renew — still has access until expiration_at_ms.
      status = "CANCELLED_PENDING_EXPIRY";
      willRenew = false;
      break;
    case "BILLING_ISSUE":
      status = "GRACE_PERIOD";
      willRenew = true;
      break;
    case "NON_RENEWING_PURCHASE":
      status = "ACTIVE";
      willRenew = false;
      break;
    case "TRANSFER":
      // Subscription was transferred to this user from another — treat as a fresh active.
      status = "ACTIVE";
      willRenew = true;
      break;
    default:
      return { ok: false, reason: `unhandled_event_type:${event.type}` };
  }

  await upsertBillingSubscription(prisma, {
    userId: user.id,
    source: "APPLE",
    externalId,
    productExternalId: productId,
    planId: plan.id,
    status,
    currentPeriodEnd,
    willRenew,
    rawPayload: event as any,
  });
  await recomputeEntitlement(prisma, user.id);
  return { ok: true, userId: user.id };
}
