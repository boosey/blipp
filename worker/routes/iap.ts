import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { validateBody } from "../lib/validation";
import { resolveApiKey } from "../lib/service-key-resolver";
import {
  recomputeEntitlement,
  upsertBillingSubscription,
} from "../lib/entitlement";

/**
 * IAP routes for Apple In-App Purchase flows.
 * The client calls these in addition to the RevenueCat webhook on the backend.
 * RC webhooks are authoritative for subscription state; these routes exist to:
 *   - expose cross-channel billing status for the client-side collision check
 *   - force an entitlement recompute after a StoreKit purchase lands
 *   - handle the "Restore Purchases" button (Apple guideline 3.1.1 requirement)
 */
export const iap = new Hono<{ Bindings: Env }>();

iap.use("*", requireAuth);

const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/**
 * GET /billing-status — summarize the user's active billing sources.
 *
 * Returns the information needed to decide whether to offer an IAP upgrade
 * CTA on iOS, or whether to show a "Manage on web" pointer instead.
 */
iap.get("/billing-status", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const activeRows = await prisma.billingSubscription.findMany({
    where: {
      userId: user.id,
      status: { in: ["ACTIVE", "CANCELLED_PENDING_EXPIRY", "GRACE_PERIOD"] },
    },
    select: {
      source: true,
      status: true,
      currentPeriodEnd: true,
      willRenew: true,
    },
  });

  const activeSources = [...new Set(activeRows.map((r: any) => r.source))] as Array<"STRIPE" | "APPLE">;
  const hasActiveStripe = activeSources.includes("STRIPE");
  const hasActiveApple = activeSources.includes("APPLE");

  return c.json({
    data: {
      activeSources,
      canPurchaseIAP: !hasActiveStripe && !hasActiveApple,
      subscriptionSource: hasActiveApple ? "APPLE" : hasActiveStripe ? "STRIPE" : null,
      manageUrl: hasActiveApple ? APPLE_MANAGE_URL : null,
      rows: activeRows,
    },
  });
});

/**
 * POST /link — verify a StoreKit purchase against RevenueCat and recompute entitlement.
 *
 * Called by the client right after Purchases.purchase() succeeds. RC's webhook is
 * authoritative, but webhooks have latency; this endpoint lets the client force
 * a synchronous entitlement update for a responsive UI.
 *
 * Body: { productId, originalTransactionId }
 */
const linkSchema = z.object({
  productId: z.string().min(1),
  originalTransactionId: z.string().min(1),
});

iap.post("/link", async (c) => {
  const { productId, originalTransactionId } = await validateBody(c, linkSchema);
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const apiKey = await resolveApiKey(
    prisma,
    c.env,
    "REVENUECAT_REST_API_KEY",
    "billing.revenuecat-rest"
  );
  if (!apiKey) {
    return c.json({ error: "IAP backend not configured" }, 500);
  }

  const rcResp = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.clerkId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }
  );
  if (!rcResp.ok) {
    const text = await rcResp.text().catch(() => "");
    console.error(
      JSON.stringify({
        level: "error",
        action: "iap_link_revenuecat_error",
        userId: user.id,
        status: rcResp.status,
        body: text.slice(0, 500),
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: "Failed to verify purchase with RevenueCat" }, 502);
  }

  const rcData = (await rcResp.json()) as any;
  const subscriptions = rcData?.subscriber?.subscriptions ?? {};
  const entry = subscriptions[productId];
  if (!entry) {
    return c.json({ error: "Purchase not found on RevenueCat subscriber" }, 404);
  }
  if (entry.original_transaction_id && entry.original_transaction_id !== originalTransactionId) {
    return c.json({ error: "Purchase token mismatch" }, 400);
  }

  const plan = await prisma.plan.findFirst({
    where: {
      OR: [
        { appleProductIdMonthly: productId },
        { appleProductIdAnnual: productId },
      ],
    },
  });
  if (!plan) {
    return c.json({ error: "Unknown product id" }, 400);
  }

  const expiresMs = entry.expires_date ? new Date(entry.expires_date).getTime() : null;
  const unsubscribeDetectedAt = entry.unsubscribe_detected_at
    ? new Date(entry.unsubscribe_detected_at)
    : null;
  const billingIssueAt = entry.billing_issues_detected_at
    ? new Date(entry.billing_issues_detected_at)
    : null;

  let status: "ACTIVE" | "CANCELLED_PENDING_EXPIRY" | "GRACE_PERIOD" | "EXPIRED" = "ACTIVE";
  let willRenew = true;
  if (expiresMs !== null && expiresMs < Date.now()) {
    status = "EXPIRED";
    willRenew = false;
  } else if (billingIssueAt) {
    status = "GRACE_PERIOD";
  } else if (unsubscribeDetectedAt) {
    status = "CANCELLED_PENDING_EXPIRY";
    willRenew = false;
  }

  await upsertBillingSubscription(prisma, {
    userId: user.id,
    source: "APPLE",
    externalId: originalTransactionId,
    productExternalId: productId,
    planId: plan.id,
    status,
    currentPeriodEnd: expiresMs ? new Date(expiresMs) : null,
    willRenew,
    rawPayload: entry,
  });
  await recomputeEntitlement(prisma, user.id);

  return c.json({ data: { linked: true, planId: plan.id, status } });
});

/**
 * POST /restore — recompute entitlement after client calls Purchases.restorePurchases().
 * The RC SDK syncs any receipts it finds, and RC fires webhooks for them. This endpoint
 * is a no-op if the webhook already landed, but forces a recompute either way so the
 * client can refetch /me/usage and reflect the restored entitlement immediately.
 */
iap.post("/restore", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  await recomputeEntitlement(prisma, user.id);
  return c.json({ data: { restored: true } });
});
