import { describe, it, expect, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import {
  recomputeEntitlement,
  upsertBillingSubscription,
  markBillingSubscriptionStatus,
} from "../entitlement";

const plans = {
  free: { id: "plan_free", sortOrder: 0, isDefault: true },
  pro: { id: "plan_pro", sortOrder: 10, isDefault: false },
  proPlus: { id: "plan_pro_plus", sortOrder: 20, isDefault: false },
};

describe("recomputeEntitlement", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it("picks the highest-tier ACTIVE row", async () => {
    prisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "u1", planId: plans.pro.id, status: "ACTIVE", currentPeriodEnd: null, plan: plans.pro },
      { userId: "u1", planId: plans.proPlus.id, status: "ACTIVE", currentPeriodEnd: null, plan: plans.proPlus },
    ]);

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { planId: plans.proPlus.id, subscriptionEndsAt: null },
    });
  });

  it("falls back to default plan when no entitling rows exist", async () => {
    prisma.billingSubscription.findMany.mockResolvedValueOnce([]);
    prisma.plan.findFirst.mockResolvedValueOnce({ id: plans.free.id, isDefault: true });

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { planId: plans.free.id, subscriptionEndsAt: null },
    });
  });

  it("ignores EXPIRED and REFUNDED rows (findMany filter is passed via status IN)", async () => {
    // Simulates Prisma filtering — the helper requests status: in [ACTIVE, CANCELLED_PENDING_EXPIRY, GRACE_PERIOD].
    // If findMany returns nothing, helper should fall back to default.
    prisma.billingSubscription.findMany.mockResolvedValueOnce([]);
    prisma.plan.findFirst.mockResolvedValueOnce({ id: plans.free.id, isDefault: true });

    await recomputeEntitlement(prisma, "u1");

    const callArgs = prisma.billingSubscription.findMany.mock.calls[0][0];
    expect(callArgs.where.status.in).toEqual([
      "ACTIVE",
      "CANCELLED_PENDING_EXPIRY",
      "GRACE_PERIOD",
    ]);
  });

  it("mirrors currentPeriodEnd to subscriptionEndsAt when winning row is CANCELLED_PENDING_EXPIRY", async () => {
    const endDate = new Date("2026-06-01");
    prisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "u1", planId: plans.pro.id, status: "CANCELLED_PENDING_EXPIRY", currentPeriodEnd: endDate, plan: plans.pro },
    ]);

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { planId: plans.pro.id, subscriptionEndsAt: endDate },
    });
  });

  it("does NOT mirror subscriptionEndsAt when winning row is ACTIVE (even if another row is pending cancel)", async () => {
    // Stripe CANCELLED_PENDING_EXPIRY at Pro, Apple ACTIVE at Pro+ → Pro+ wins, no end date
    const stripeEndDate = new Date("2026-06-01");
    prisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "u1", planId: plans.pro.id, status: "CANCELLED_PENDING_EXPIRY", currentPeriodEnd: stripeEndDate, plan: plans.pro },
      { userId: "u1", planId: plans.proPlus.id, status: "ACTIVE", currentPeriodEnd: null, plan: plans.proPlus },
    ]);

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { planId: plans.proPlus.id, subscriptionEndsAt: null },
    });
  });

  it("treats GRACE_PERIOD as entitling", async () => {
    prisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "u1", planId: plans.pro.id, status: "GRACE_PERIOD", currentPeriodEnd: null, plan: plans.pro },
    ]);

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { planId: plans.pro.id, subscriptionEndsAt: null },
    });
  });

  it("no-ops when no default plan exists and no entitling rows", async () => {
    prisma.billingSubscription.findMany.mockResolvedValueOnce([]);
    prisma.plan.findFirst.mockResolvedValueOnce(null);

    await recomputeEntitlement(prisma, "u1");

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("upsertBillingSubscription", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.billingSubscription.upsert.mockResolvedValue({ id: "bs_1" });
  });

  it("upserts keyed on (source, externalId) with both create and update shapes", async () => {
    const periodEnd = new Date("2026-06-01");
    await upsertBillingSubscription(prisma, {
      userId: "u1",
      source: "STRIPE",
      externalId: "sub_456",
      productExternalId: "price_pro_monthly",
      planId: plans.pro.id,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
      willRenew: true,
      rawPayload: { some: "event" },
    });

    expect(prisma.billingSubscription.upsert).toHaveBeenCalledWith({
      where: { source_externalId: { source: "STRIPE", externalId: "sub_456" } },
      create: expect.objectContaining({
        userId: "u1",
        source: "STRIPE",
        externalId: "sub_456",
        productExternalId: "price_pro_monthly",
        planId: plans.pro.id,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        willRenew: true,
      }),
      update: expect.objectContaining({
        userId: "u1",
        productExternalId: "price_pro_monthly",
        planId: plans.pro.id,
        status: "ACTIVE",
      }),
    });
  });
});

describe("markBillingSubscriptionStatus", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.billingSubscription.update.mockResolvedValue({ id: "bs_1" });
  });

  it("updates status and optional fields only when provided", async () => {
    await markBillingSubscriptionStatus(prisma, "STRIPE", "sub_456", "EXPIRED", { willRenew: false });

    expect(prisma.billingSubscription.update).toHaveBeenCalledWith({
      where: { source_externalId: { source: "STRIPE", externalId: "sub_456" } },
      data: { status: "EXPIRED", willRenew: false },
    });
  });

  it("supports APPLE source", async () => {
    await markBillingSubscriptionStatus(prisma, "APPLE", "txn_999", "REFUNDED");
    expect(prisma.billingSubscription.update).toHaveBeenCalledWith({
      where: { source_externalId: { source: "APPLE", externalId: "txn_999" } },
      data: { status: "REFUNDED" },
    });
  });
});
