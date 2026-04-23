import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { createMockEnv, createMockPrisma } from "../../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const { usersRoutes } = await import("../users");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Users Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/users", usersRoutes);

    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });
    mockPrisma.$disconnect.mockResolvedValue(undefined);
  });

  describe("GET /users/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/users/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /users/segments", () => {
    it("returns segment counts", async () => {
      mockPrisma.user.count.mockResolvedValueOnce(100); // all
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: "u1", createdAt: new Date("2025-01-01"), plan: { isDefault: false, priceCentsMonthly: 999 }, _count: { feedItems: 60 } },
        { id: "u2", createdAt: new Date("2025-12-01"), plan: { isDefault: true, priceCentsMonthly: 0 }, _count: { feedItems: 5 } },
      ]);
      mockPrisma.feedItem.findMany.mockResolvedValueOnce([
        { userId: "u2" },
      ]);

      const res = await app.request("/users/segments", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("all");
      expect(body.data).toHaveProperty("power_users");
      expect(body.data).toHaveProperty("at_risk");
      expect(body.data).toHaveProperty("trial_ending");
      expect(body.data).toHaveProperty("never_active");
      expect(body.data.all).toBe(100);
    });
  });

  describe("GET /users/", () => {
    it("returns paginated user list with badges", async () => {
      const now = new Date();
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: "u1", clerkId: "ck1", email: "admin@test.com", name: "Admin",
          imageUrl: null, isAdmin: true,
          plan: { id: "plan_pro", name: "Pro", slug: "pro" },
          createdAt: now, updatedAt: now,
          _count: { subscriptions: 5, feedItems: 60, briefings: 10 },
        },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.feedItem.findMany.mockResolvedValueOnce([
        { userId: "u1", createdAt: new Date() },
      ]);

      const res = await app.request("/users", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty("badges");
      expect(body.data[0].badges).toContain("admin");
      expect(body.data[0].badges).toContain("power_user");
      expect(body.data[0].status).toBe("active");
      expect(body.total).toBe(1);
    });
  });

  describe("GET /users/:id", () => {
    it("returns user detail with subscriptions and feed items", async () => {
      const now = new Date();
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "u1", clerkId: "ck1", email: "user@test.com", name: "User",
        imageUrl: null, isAdmin: false,
        plan: { id: "plan_pro", name: "Pro", slug: "pro" },
        stripeCustomerId: "cus_123",
        onboardingComplete: true,
        createdAt: now, updatedAt: now,
        _count: { subscriptions: 2, feedItems: 10, briefings: 5 },
        subscriptions: [
          { podcastId: "pod1", podcast: { title: "Podcast 1" }, durationTier: 5, createdAt: now },
        ],
        feedItems: [
          {
            id: "fi1", userId: "u1", status: "READY",
            source: "SUBSCRIPTION", durationTier: 5, listened: false,
            podcast: { title: "Podcast 1", imageUrl: null },
            episode: { title: "Episode 1" },
            createdAt: now,
          },
        ],
        podcastFavorites: [],
        billingSubscriptions: [],
      });

      const res = await app.request("/users/u1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("u1");
      expect(body.data.subscriptions).toHaveLength(1);
      expect(body.data.recentFeedItems).toHaveLength(1);
      expect(body.data).toHaveProperty("badges");
      expect(body.data.activeGrant).toBeNull();
    });

    it("returns 404 when not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/users/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /users/:id", () => {
    it("should return 403 when isAdmin is in request body", async () => {
      const res = await app.request("/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: true }),
      }, env, mockExCtx);
      expect(res.status).toBe(403);
      const body: any = await res.json();
      expect(body.error).toBe("Cannot modify admin privileges via this endpoint");
    });

    it("should return 400 for empty body", async () => {
      const res = await app.request("/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toBe("No valid fields to update");
    });
  });

  describe("POST /users/:id/grants", () => {
    it("creates a manual grant and recomputes entitlement", async () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1" });
      mockPrisma.plan.findUnique.mockResolvedValueOnce({ id: "plan_pro" });
      mockPrisma.billingSubscription.upsert.mockResolvedValueOnce({
        id: "grant_1",
        plan: { id: "plan_pro", name: "Pro", slug: "pro" },
        currentPeriodEnd: future,
        createdAt: new Date(),
      });
      // recomputeEntitlement queries
      mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
        { planId: "plan_pro", status: "ACTIVE", currentPeriodEnd: future, plan: { sortOrder: 10 } },
      ]);
      mockPrisma.user.update.mockResolvedValueOnce({});

      const res = await app.request("/users/u1/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "plan_pro", endsAt: future.toISOString(), reason: "beta" }),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.plan.name).toBe("Pro");
      expect(body.data.reason).toBe("beta");
      expect(mockPrisma.billingSubscription.upsert).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when planId is missing", async () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const res = await app.request("/users/u1/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsAt: future.toISOString() }),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("returns 400 when endsAt is in the past", async () => {
      const past = new Date(Date.now() - 1000);
      const res = await app.request("/users/u1/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "plan_pro", endsAt: past.toISOString() }),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("returns 404 when plan does not exist", async () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1" });
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/users/u1/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "nope", endsAt: future.toISOString() }),
      }, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /users/:id/grants", () => {
    it("revokes the active grant and recomputes entitlement", async () => {
      mockPrisma.billingSubscription.findUnique.mockResolvedValueOnce({
        id: "grant_1",
        planId: "plan_pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(),
      });
      mockPrisma.billingSubscription.update.mockResolvedValueOnce({});
      mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([]);
      mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free" });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const res = await app.request("/users/u1/grants", {
        method: "DELETE",
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.revoked).toBe(true);
    });

    it("returns 404 when no active grant exists", async () => {
      mockPrisma.billingSubscription.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/users/u1/grants", {
        method: "DELETE",
      }, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /users/:id/reset-billing", () => {
    it("expires every active billing row and recomputes", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1" });
      mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([
        { id: "bs1", source: "APPLE", externalId: "tx1", productExternalId: "com.x.pro", planId: "plan_pro", status: "ACTIVE" },
        { id: "bs2", source: "MANUAL", externalId: "u1", productExternalId: "admin-grant", planId: "plan_proplus", status: "ACTIVE" },
      ]);
      mockPrisma.billingSubscription.updateMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.billingSubscription.findMany.mockResolvedValueOnce([]); // for recompute
      mockPrisma.plan.findFirst.mockResolvedValueOnce({ id: "plan_free" });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const res = await app.request("/users/u1/reset-billing", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toMatchObject({ reset: true, expiredCount: 2 });

      expect(mockPrisma.billingSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "u1" }),
          data: { status: "EXPIRED", willRenew: false },
        })
      );
      expect(mockPrisma.billingEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u1",
          source: "MANUAL",
          eventType: "admin_billing_reset",
          status: "APPLIED",
        }),
      });
    });

    it("returns 404 when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/users/missing/reset-billing", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(404);
      expect(mockPrisma.billingSubscription.updateMany).not.toHaveBeenCalled();
    });
  });
});
