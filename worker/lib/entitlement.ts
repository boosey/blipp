export type BillingSourceLiteral = "STRIPE" | "APPLE";
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
