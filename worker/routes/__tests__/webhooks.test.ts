import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

// Mock Prisma deps so Vite doesn't try to resolve the generated client
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

// Mock createPrismaClient (may still be transitively imported)
const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

// Mock Stripe client
const mockConstructEventAsync = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
vi.mock("../../lib/stripe", () => ({
  createStripeClient: vi.fn(() => ({
    webhooks: { constructEventAsync: mockConstructEventAsync },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  })),
}));

// Mock Clerk webhook verification
const mockVerifyWebhook = vi.fn();
vi.mock("@clerk/backend/webhooks", () => ({
  verifyWebhook: (...args: any[]) => mockVerifyWebhook(...args),
}));

// Import after mocks
const { clerkWebhooks } = await import("../webhooks/clerk");
const { stripeWebhooks } = await import("../webhooks/stripe");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Clerk Webhooks", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/webhooks/clerk", clerkWebhooks);

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

  it("should create user on user.created event", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      type: "user.created",
      data: {
        id: "clerk_123",
        email_addresses: [{ email_address: "test@example.com" }],
        first_name: "John",
        last_name: "Doe",
        image_url: "https://example.com/avatar.jpg",
      },
    });

    mockPrisma.user.create.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk_123",
        email: "test@example.com",
        name: "John Doe",
        imageUrl: "https://example.com/avatar.jpg",
      },
    });
  });

  it("should update user on user.updated event", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      type: "user.updated",
      data: {
        id: "clerk_123",
        email_addresses: [{ email_address: "new@example.com" }],
        first_name: "Jane",
        last_name: null,
        image_url: null,
      },
    });

    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { clerkId: "clerk_123" },
      data: {
        email: "new@example.com",
        name: "Jane",
        imageUrl: null,
      },
    });
  });

  it("should delete user on user.deleted event", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      type: "user.deleted",
      data: { id: "clerk_123" },
    });

    mockPrisma.user.delete.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { clerkId: "clerk_123" },
    });
  });

  it("should return 400 when signature verification fails", async () => {
    mockVerifyWebhook.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBe("Invalid webhook signature");
  });

  it("should pass raw request and signing secret to verifyWebhook", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      type: "session.created",
      data: { id: "sess_123" },
    });

    await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(mockVerifyWebhook).toHaveBeenCalledTimes(1);
    const [rawReq, options] = mockVerifyWebhook.mock.calls[0];
    expect(rawReq).toBeInstanceOf(Request);
    expect(options).toEqual({ signingSecret: env.CLERK_WEBHOOK_SECRET });
  });

  it("should handle unrecognized event types gracefully", async () => {
    mockVerifyWebhook.mockResolvedValueOnce({
      type: "session.created",
      data: { id: "sess_123" },
    });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.received).toBe(true);
  });
});

describe("Stripe Webhooks", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/webhooks/stripe", stripeWebhooks);

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

  it("should return 400 when stripe-signature header is missing", async () => {
    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toContain("Missing stripe-signature");
  });

  it("should return 400 on invalid signature", async () => {
    mockConstructEventAsync.mockRejectedValueOnce(
      new Error("Invalid signature")
    );

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "bad_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toContain("Invalid webhook signature");
  });

  it("should update user planId on checkout.session.completed", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_456",
          metadata: {},
        },
      },
    });

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { id: "price_pro_monthly" } }],
      },
    });

    // planFromPriceId uses findFirst with OR on stripePriceIdMonthly/stripePriceIdAnnual
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", slug: "pro", name: "Pro" });
    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1", planId: "plan_pro" });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      data: { planId: "plan_pro" },
    });
  });

  it("should update planId on customer.subscription.updated with plan change", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: "price_pro_annual" } }],
          },
        },
      },
    });

    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_pro", slug: "pro", name: "Pro" });
    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1", planId: "plan_pro" });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      data: { planId: "plan_pro" },
    });
  });

  it("should not change plan when subscription cancellation is scheduled", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          cancel_at_period_end: true,
          cancel_at: 1700000000,
          items: {
            data: [{ price: { id: "price_pro_monthly" } }],
          },
        },
      },
    });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("should log but not downgrade on first payment failure", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
          attempt_count: 1,
          amount_due: 1999,
        },
      },
    });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("should downgrade to default plan after 3 failed payment attempts", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
          attempt_count: 3,
          amount_due: 1999,
        },
      },
    });

    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free", slug: "free", name: "Free" });
    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1", planId: "plan_free" });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      data: { planId: "plan_free" },
    });
  });

  it("should revert to default plan on customer.subscription.deleted", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });

    // Source looks up default plan with findFirst({ where: { isDefault: true } })
    mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free", slug: "free", name: "Free" });
    mockPrisma.user.update.mockResolvedValueOnce({
      id: "usr_1",
      planId: "plan_free",
    });

    const res = await app.request(
      "/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "valid_sig",
        },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      data: { planId: "plan_free" },
    });
  });
});
