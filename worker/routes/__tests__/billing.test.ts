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
const mockCheckoutCreate = vi.fn();
const mockPortalCreate = vi.fn();
vi.mock("../../lib/stripe", () => ({
  createStripeClient: vi.fn(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
  })),
}));

// Mock Clerk auth
const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

// Mock Clerk client for getCurrentUser fallback
vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: { getUser: vi.fn() },
  })),
}));

// Import after mocks
const { billing } = await import("../billing");
const { classifyHttpError } = await import("../../lib/errors");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Billing Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/billing", billing);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });

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

  describe("POST /billing/checkout", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_pro", interval: "monthly" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should return 400 for missing planId", async () => {
      const res = await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: "monthly" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.details).toBeDefined();
    });

    it("should return 400 for invalid interval", async () => {
      const res = await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_pro", interval: "weekly" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.details).toBeDefined();
    });

    it("should return 400 for invalid plan", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);

      const res = await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_invalid", interval: "monthly" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("Invalid");
    });

    it("should create checkout session and return URL", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        email: "test@example.com",
        stripeCustomerId: null,
      };

      mockPrisma.plan.findUnique.mockResolvedValueOnce({
        id: "plan_pro",
        slug: "pro",
        name: "Pro",
        stripePriceIdMonthly: "price_pro_monthly",
        stripePriceIdAnnual: "price_pro_annual",
        active: true,
      });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockCheckoutCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session_123",
        customer: "cus_new",
      });

      const res = await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_pro", interval: "monthly" }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.url).toBe("https://checkout.stripe.com/session_123");
    });

    it("should reuse existing stripeCustomerId when available", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        email: "test@example.com",
        stripeCustomerId: "cus_existing",
      };

      mockPrisma.plan.findUnique.mockResolvedValueOnce({
        id: "plan_proplus",
        slug: "pro-plus",
        name: "Pro Plus",
        stripePriceIdMonthly: "price_proplus_monthly",
        stripePriceIdAnnual: "price_proplus_annual",
        active: true,
      });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockCheckoutCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session_456",
        customer: "cus_existing",
      });

      await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_proplus", interval: "monthly" }),
        },
        env,
        mockExCtx
      );

      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: "cus_existing",
        })
      );
    });

    it("should save stripeCustomerId on first checkout", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        email: "test@example.com",
        stripeCustomerId: null,
      };

      mockPrisma.plan.findUnique.mockResolvedValueOnce({
        id: "plan_pro",
        slug: "pro",
        name: "Pro",
        stripePriceIdMonthly: "price_pro_monthly",
        stripePriceIdAnnual: null,
        active: true,
      });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockCheckoutCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/session_789",
        customer: "cus_new",
      });

      await app.request(
        "/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: "plan_pro", interval: "monthly" }),
        },
        env,
        mockExCtx
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stripeCustomerId: "cus_new" },
        })
      );
    });
  });

  describe("POST /billing/portal", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/billing/portal",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should return 400 when user has no stripeCustomerId", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        stripeCustomerId: null,
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);

      const res = await app.request(
        "/billing/portal",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("No active subscription");
    });

    it("should create portal session and return URL", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        stripeCustomerId: "cus_123",
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPortalCreate.mockResolvedValueOnce({
        url: "https://billing.stripe.com/portal_123",
      });

      const res = await app.request(
        "/billing/portal",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.url).toBe("https://billing.stripe.com/portal_123");
    });
  });
});
