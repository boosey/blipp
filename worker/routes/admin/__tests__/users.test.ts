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
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // all
        .mockResolvedValueOnce(30)  // with briefings (power user candidates)
        .mockResolvedValueOnce(20); // never active
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: "u1", tier: "PRO", createdAt: new Date("2025-01-01"), _count: { briefings: 60 } },
        { id: "u2", tier: "FREE", createdAt: new Date("2025-12-01"), _count: { briefings: 5 } },
      ]);
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
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
          imageUrl: null, tier: "PRO", isAdmin: true,
          createdAt: now, updatedAt: now,
          _count: { subscriptions: 5, briefings: 60 },
        },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
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
    it("returns user detail with subscriptions and briefings", async () => {
      const now = new Date();
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "u1", clerkId: "ck1", email: "user@test.com", name: "User",
        imageUrl: null, tier: "PRO", isAdmin: false,
        stripeCustomerId: "cus_123", briefingLengthMinutes: 5,
        briefingTime: "08:00", timezone: "US/Eastern",
        createdAt: now, updatedAt: now,
        _count: { subscriptions: 2, briefings: 10 },
        subscriptions: [
          { podcastId: "pod1", podcast: { title: "Podcast 1" }, createdAt: now },
        ],
        briefings: [
          {
            id: "br1", userId: "u1", status: "COMPLETED",
            targetMinutes: 5, actualSeconds: 290,
            audioUrl: "http://a.mp3", errorMessage: null, createdAt: now,
            _count: { segments: 3 },
          },
        ],
      });

      const res = await app.request("/users/u1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("u1");
      expect(body.data.subscriptions).toHaveLength(1);
      expect(body.data.recentBriefings).toHaveLength(1);
      expect(body.data).toHaveProperty("badges");
    });

    it("returns 404 when not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/users/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /users/:id", () => {
    it("updates tier and isAdmin", async () => {
      mockPrisma.user.update.mockResolvedValueOnce({ id: "u1", tier: "PRO_PLUS", isAdmin: true });

      const res = await app.request("/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRO_PLUS", isAdmin: true }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.tier).toBe("PRO_PLUS");
      expect(body.data.isAdmin).toBe(true);
    });

    it("calls $disconnect", async () => {
      mockPrisma.user.update.mockResolvedValueOnce({ id: "u1", tier: "PRO", isAdmin: false });
      await app.request("/users/u1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRO" }),
      }, env, mockExCtx);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});
