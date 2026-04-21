import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

const { revenuecatWebhooks } = await import("../webhooks/revenuecat");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

const WEBHOOK_SECRET = "rcwh_mock";

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "clerk_123",
      product_id: "com.blipp.app.pro.monthly",
      original_transaction_id: "2000000000000001",
      expiration_at_ms: 1800000000000,
      environment: "PRODUCTION",
      ...overrides,
    },
  };
}

function send(app: Hono<{ Bindings: Env }>, env: Env, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    "/webhooks/revenuecat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: WEBHOOK_SECRET,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
    mockExCtx
  );
}

describe("RevenueCat Webhook", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/webhooks/revenuecat", revenuecatWebhooks);

    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });
  });

  it("rejects requests without the webhook secret", async () => {
    const res = await send(app, env, buildEvent(), { Authorization: "wrong" });
    expect(res.status).toBe(401);
  });

  it("accepts requests with Bearer <secret> header format", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst
      .mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 }) // product lookup
      .mockResolvedValueOnce(null); // default plan (not needed here)
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "usr_1", planId: "plan_pro", status: "ACTIVE", currentPeriodEnd: null, plan: { sortOrder: 10 } },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent(), { Authorization: `Bearer ${WEBHOOK_SECRET}` });
    expect(res.status).toBe(200);
  });

  it("upserts BillingSubscription and recomputes entitlement on INITIAL_PURCHASE", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "usr_1", planId: "plan_pro", status: "ACTIVE", currentPeriodEnd: new Date(1800000000000), plan: { sortOrder: 10 } },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent());

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source_externalId: { source: "APPLE", externalId: "2000000000000001" } },
        create: expect.objectContaining({
          source: "APPLE",
          planId: "plan_pro",
          status: "ACTIVE",
          willRenew: true,
          productExternalId: "com.blipp.app.pro.monthly",
        }),
      })
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "usr_1" },
      data: { planId: "plan_pro", subscriptionEndsAt: null },
    });
  });

  it("marks CANCELLED_PENDING_EXPIRY on CANCELLATION event", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      {
        userId: "usr_1",
        planId: "plan_pro",
        status: "CANCELLED_PENDING_EXPIRY",
        currentPeriodEnd: new Date(1800000000000),
        plan: { sortOrder: 10 },
      },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent({ type: "CANCELLATION" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "CANCELLED_PENDING_EXPIRY", willRenew: false }),
      })
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "usr_1" },
      data: { planId: "plan_pro", subscriptionEndsAt: new Date(1800000000000) },
    });
  });

  it("flips to EXPIRED and recomputes on EXPIRATION event", async () => {
    mockPrisma.billingSubscription.findUnique.mockResolvedValueOnce({
      userId: "usr_1",
      source: "APPLE",
      externalId: "2000000000000001",
      planId: "plan_pro",
      status: "ACTIVE",
    });
    mockPrisma.billingSubscription.update.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([]);
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free", isDefault: true });
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent({ type: "EXPIRATION" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source_externalId: { source: "APPLE", externalId: "2000000000000001" } },
        data: expect.objectContaining({ status: "EXPIRED", willRenew: false }),
      })
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "usr_1" },
      data: { planId: "plan_free", subscriptionEndsAt: null },
    });
  });

  it("GRACE_PERIOD on BILLING_ISSUE keeps user entitled", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "usr_1", planId: "plan_pro", status: "GRACE_PERIOD", currentPeriodEnd: null, plan: { sortOrder: 10 } },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent({ type: "BILLING_ISSUE" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "GRACE_PERIOD" }),
      })
    );
  });

  it("routes PRODUCT_CHANGE using new_product_id", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro_plus", sortOrder: 20 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "usr_1", planId: "plan_pro_plus", status: "ACTIVE", currentPeriodEnd: null, plan: { sortOrder: 20 } },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(
      app,
      env,
      buildEvent({
        type: "PRODUCT_CHANGE",
        product_id: "com.blipp.app.pro.monthly",
        new_product_id: "com.blipp.app.proplus.monthly",
      })
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.plan.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { appleProductIdMonthly: "com.blipp.app.proplus.monthly" },
          { appleProductIdAnnual: "com.blipp.app.proplus.monthly" },
        ],
      },
    });
  });

  it("returns 200 with skip reason when app_user_id doesn't match any user", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);

    const res = await send(app, env, buildEvent({ app_user_id: "clerk_unknown" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).not.toHaveBeenCalled();
  });

  it("returns 200 with skip reason when product_id is not mapped to a plan", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce(null);

    const res = await send(app, env, buildEvent({ product_id: "com.unknown.product" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).not.toHaveBeenCalled();
  });

  it("skips sandbox events in production environment", async () => {
    env.WORKER_SCRIPT_NAME = "blipp"; // production
    const res = await send(app, env, buildEvent({ environment: "SANDBOX" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("processes sandbox events in staging environment", async () => {
    env.WORKER_SCRIPT_NAME = "blipp-staging";
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([]);
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free", isDefault: true });
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    const res = await send(app, env, buildEvent({ environment: "SANDBOX" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.billingSubscription.upsert).toHaveBeenCalled();
  });

  it("writes a BillingEvent row with status APPLIED on a successful event", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "usr_1", clerkId: "clerk_123" });
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", sortOrder: 10 });
    mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({});
    mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
      { userId: "usr_1", planId: "plan_pro", status: "ACTIVE", currentPeriodEnd: new Date(1800000000000), plan: { sortOrder: 10 } },
    ]);
    mockPrisma.user.update.mockResolvedValue({ id: "usr_1" });

    await send(app, env, buildEvent());

    expect(mockPrisma.billingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "usr_1",
        source: "APPLE",
        eventType: "INITIAL_PURCHASE",
        environment: "PRODUCTION",
        externalId: "2000000000000001",
        productExternalId: "com.blipp.app.pro.monthly",
        status: "APPLIED",
        skipReason: null,
      }),
    });
  });

  it("writes a BillingEvent row with status SKIPPED when user can't be resolved", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);

    await send(app, env, buildEvent());

    expect(mockPrisma.billingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        source: "APPLE",
        eventType: "INITIAL_PURCHASE",
        status: "SKIPPED",
        skipReason: "user_not_found",
      }),
    });
  });

  it("writes a BillingEvent row with status SKIPPED when sandbox event hits production", async () => {
    env.WORKER_SCRIPT_NAME = "blipp";
    env.ENVIRONMENT = "production";

    await send(app, env, buildEvent({ environment: "SANDBOX" }));

    expect(mockPrisma.billingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "APPLE",
        environment: "SANDBOX",
        status: "SKIPPED",
        skipReason: "sandbox_in_production",
      }),
    });
    expect(mockPrisma.billingSubscription.upsert).not.toHaveBeenCalled();
  });
});
