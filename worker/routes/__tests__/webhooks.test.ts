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
    mockPrisma.user.create.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user.created",
          data: {
            id: "clerk_123",
            email_addresses: [{ email_address: "test@example.com" }],
            first_name: "John",
            last_name: "Doe",
            image_url: "https://example.com/avatar.jpg",
          },
        }),
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
    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user.updated",
          data: {
            id: "clerk_123",
            email_addresses: [{ email_address: "new@example.com" }],
            first_name: "Jane",
            last_name: null,
            image_url: null,
          },
        }),
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
    mockPrisma.user.delete.mockResolvedValueOnce({ id: "usr_1" });

    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user.deleted",
          data: { id: "clerk_123" },
        }),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { clerkId: "clerk_123" },
    });
  });

  it("should return 400 for invalid payload", async () => {
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
  });

  it("should handle unrecognized event types gracefully", async () => {
    const res = await app.request(
      "/webhooks/clerk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "session.created",
          data: { id: "sess_123" },
        }),
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
    expect(body.error).toContain("Invalid signature");
  });

  it("should update user tier on checkout.session.completed", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_456",
        },
      },
    });

    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { id: "price_pro_mock" } }],
      },
    });

    mockPrisma.plan.findUnique.mockResolvedValueOnce({ tier: "PRO" });
    mockPrisma.user.update.mockResolvedValueOnce({ id: "usr_1", tier: "PRO" });

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
      data: { tier: "PRO" },
    });
  });

  it("should revert to FREE on customer.subscription.deleted", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });

    mockPrisma.user.update.mockResolvedValueOnce({
      id: "usr_1",
      tier: "FREE",
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
      data: { tier: "FREE" },
    });
  });
});
