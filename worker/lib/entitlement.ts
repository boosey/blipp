export type BillingSourceLiteral = "STRIPE" | "APPLE" | "MANUAL";
export type BillingStatusLiteral =
  | "ACTIVE"
  | "CANCELLED_PENDING_EXPIRY"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "REFUNDED"
  | "PAUSED";

export interface UpsertBillingSubscriptionInput {
  userId: string;
  source: BillingSourceLiteral;
  externalId: string;
  productExternalId: string;
  planId: string;
  status: BillingStatusLiteral;
  currentPeriodEnd: Date | null;
  willRenew: boolean;
  rawPayload?: unknown;
}

// Statuses that grant plan access to the user.
const ENTITLING_STATUSES: BillingStatusLiteral[] = [
  "ACTIVE",
  "CANCELLED_PENDING_EXPIRY",
  "GRACE_PERIOD",
];

export interface RecordBillingEventInput {
  userId: string | null;
  source: BillingSourceLiteral;
  eventType: string;
  environment?: string | null;
  externalId?: string | null;
  productExternalId?: string | null;
  status: "APPLIED" | "SKIPPED" | "FAILED";
  skipReason?: string | null;
  rawPayload: unknown;
}

/**
 * Append a row to the BillingEvent audit log. Never throws — logging must not
 * break the primary webhook flow, so failures here are swallowed and logged.
 */
export async function recordBillingEvent(
  prisma: any,
  input: RecordBillingEventInput
): Promise<void> {
  try {
    await prisma.billingEvent.create({
      data: {
        userId: input.userId,
        source: input.source,
        eventType: input.eventType,
        environment: input.environment ?? null,
        externalId: input.externalId ?? null,
        productExternalId: input.productExternalId ?? null,
        status: input.status,
        skipReason: input.skipReason ?? null,
        rawPayload: (input.rawPayload ?? null) as any,
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        action: "billing_event_persist_failed",
        source: input.source,
        eventType: input.eventType,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    );
  }
}

export async function upsertBillingSubscription(
  prisma: any,
  input: UpsertBillingSubscriptionInput
): Promise<void> {
  const { userId, source, externalId, rawPayload, ...rest } = input;
  const data = {
    userId,
    ...rest,
    rawPayload: (rawPayload ?? null) as any,
  };
  await prisma.billingSubscription.upsert({
    where: { source_externalId: { source, externalId } },
    create: { source, externalId, ...data },
    update: data,
  });
}

export async function markBillingSubscriptionStatus(
  prisma: any,
  source: BillingSourceLiteral,
  externalId: string,
  status: BillingStatusLiteral,
  extra: { currentPeriodEnd?: Date | null; willRenew?: boolean; rawPayload?: unknown } = {}
): Promise<void> {
  await prisma.billingSubscription.update({
    where: { source_externalId: { source, externalId } },
    data: {
      status,
      ...(extra.currentPeriodEnd !== undefined ? { currentPeriodEnd: extra.currentPeriodEnd } : {}),
      ...(extra.willRenew !== undefined ? { willRenew: extra.willRenew } : {}),
      ...(extra.rawPayload !== undefined ? { rawPayload: extra.rawPayload as any } : {}),
    },
  });
}

/**
 * Recompute User.planId from active BillingSubscription rows.
 * Picks the highest-tier (largest Plan.sortOrder) row among ACTIVE | CANCELLED_PENDING_EXPIRY | GRACE_PERIOD.
 * Falls back to the default plan if no entitling row exists.
 * Mirrors currentPeriodEnd onto User.subscriptionEndsAt when the winning row is CANCELLED_PENDING_EXPIRY.
 */
export async function recomputeEntitlement(prisma: any, userId: string): Promise<void> {
  const rows = await prisma.billingSubscription.findMany({
    where: { userId, status: { in: ENTITLING_STATUSES } },
    include: { plan: true },
  });

  let winningPlanId: string | null = null;
  let winningSortOrder = Number.NEGATIVE_INFINITY;
  let subscriptionEndsAt: Date | null = null;

  for (const row of rows) {
    const sortOrder: number = row.plan?.sortOrder ?? 0;
    if (sortOrder > winningSortOrder) {
      winningSortOrder = sortOrder;
      winningPlanId = row.planId;
      subscriptionEndsAt =
        row.status === "CANCELLED_PENDING_EXPIRY" ? row.currentPeriodEnd ?? null : null;
    }
  }

  if (!winningPlanId) {
    const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
    if (!defaultPlan) return;
    winningPlanId = defaultPlan.id;
    subscriptionEndsAt = null;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { planId: winningPlanId, subscriptionEndsAt },
  });
}
