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

const { configRoutes } = await import("../config");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Config Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/config", configRoutes);

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

  describe("GET /config/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/config/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /config/", () => {
    it("returns grouped config entries", async () => {
      const now = new Date();
      mockPrisma.platformConfig.findMany.mockResolvedValueOnce([
        { id: "c1", key: "pipeline.timeout", value: 30000, description: "Timeout", updatedAt: now, updatedBy: "u1" },
        { id: "c2", key: "pipeline.retries", value: 3, description: "Retries", updatedAt: now, updatedBy: "u1" },
        { id: "c3", key: "tts.provider", value: "openai", description: "TTS Provider", updatedAt: now, updatedBy: null },
      ]);

      const res = await app.request("/config", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      const pipeline = body.data.find((g: any) => g.category === "pipeline");
      expect(pipeline.entries).toHaveLength(2);
    });

    it("returns empty when table missing", async () => {
      mockPrisma.platformConfig.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe("PATCH /config/:key", () => {
    it("updates existing config", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ id: "c1", key: "pipeline.timeout" });
      mockPrisma.platformConfig.update.mockResolvedValueOnce({ id: "c1", key: "pipeline.timeout", value: 60000 });

      const res = await app.request("/config/pipeline.timeout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: 60000 }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.key).toBe("pipeline.timeout");
    });

    it("creates new config when key not found", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);
      mockPrisma.platformConfig.create.mockResolvedValueOnce({ id: "c_new", key: "new.key", value: "val" });

      const res = await app.request("/config/new.key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "val" }),
      }, env, mockExCtx);
      expect(res.status).toBe(201);
    });

    it("returns 503 when table missing", async () => {
      mockPrisma.platformConfig.findUnique.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/some.key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x" }),
      }, env, mockExCtx);
      expect(res.status).toBe(503);
    });
  });

  describe("GET /config/tiers/duration", () => {
    it("returns duration tiers with clip stats", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({
        value: [
          { minutes: 1, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
          { minutes: 5, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
        ],
      });
      mockPrisma.clip.groupBy.mockResolvedValueOnce([
        { durationTier: 5, _count: 42 },
      ]);

      const res = await app.request("/config/tiers/duration", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(2);
      const tier5 = body.data.find((t: any) => t.minutes === 5);
      expect(tier5.clipsGenerated).toBe(42);
    });

    it("returns defaults when table missing", async () => {
      mockPrisma.platformConfig.findUnique.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/tiers/duration", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(7);
    });
  });

  describe("PUT /config/tiers/duration", () => {
    it("updates duration tiers", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({ key: "tiers.duration" });
      mockPrisma.platformConfig.update.mockResolvedValueOnce({});

      const res = await app.request("/config/tiers/duration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: [{ minutes: 1 }] }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.success).toBe(true);
    });

    it("returns 503 when table missing", async () => {
      mockPrisma.platformConfig.findUnique.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/tiers/duration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: [] }),
      }, env, mockExCtx);
      expect(res.status).toBe(503);
    });
  });

  describe("GET /config/tiers/subscription", () => {
    it("returns plans with user counts", async () => {
      mockPrisma.plan.findMany.mockResolvedValueOnce([
        { tier: "FREE", name: "Free", priceCents: 0, active: true, features: [], highlighted: false, stripePriceId: null },
        { tier: "PRO", name: "Pro", priceCents: 999, active: true, features: ["priority"], highlighted: true, stripePriceId: "price_123" },
      ]);
      mockPrisma.user.groupBy.mockResolvedValueOnce([
        { tier: "FREE", _count: 80 },
        { tier: "PRO", _count: 20 },
      ]);

      const res = await app.request("/config/tiers/subscription", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].userCount).toBe(80);
    });

    it("returns empty when table missing", async () => {
      mockPrisma.plan.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/tiers/subscription", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe("PUT /config/tiers/subscription", () => {
    it("updates a plan", async () => {
      mockPrisma.plan.update.mockResolvedValueOnce({ tier: "PRO", name: "Pro Plus", priceCents: 1499 });

      const res = await app.request("/config/tiers/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRO", name: "Pro Plus", priceCents: 1499 }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
    });

    it("returns 400 when tier missing", async () => {
      const res = await app.request("/config/tiers/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No Tier" }),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("returns 503 when table missing", async () => {
      mockPrisma.plan.update.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/tiers/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRO" }),
      }, env, mockExCtx);
      expect(res.status).toBe(503);
    });
  });

  describe("GET /config/features", () => {
    it("returns feature flags", async () => {
      const now = new Date();
      mockPrisma.platformConfig.findMany.mockResolvedValueOnce([
        {
          id: "f1", key: "feature.dark_mode",
          value: { enabled: true, rolloutPercentage: 50, tierAvailability: ["PRO"] },
          description: "Dark mode",
          updatedAt: now,
        },
      ]);

      const res = await app.request("/config/features", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("dark_mode");
      expect(body.data[0].enabled).toBe(true);
      expect(body.data[0].rolloutPercentage).toBe(50);
    });

    it("returns empty when table missing", async () => {
      mockPrisma.platformConfig.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/features", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe("PUT /config/features/:id", () => {
    it("toggles a feature flag", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce({
        id: "f1", key: "feature.dark_mode",
        value: { enabled: false, rolloutPercentage: 100 },
        description: "Dark mode",
      });
      mockPrisma.platformConfig.update.mockResolvedValueOnce({
        id: "f1", key: "feature.dark_mode",
        value: { enabled: true, rolloutPercentage: 100 },
        description: "Dark mode",
      });

      const res = await app.request("/config/features/f1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enabled).toBe(true);
    });

    it("returns 404 when feature not found", async () => {
      mockPrisma.platformConfig.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/config/features/missing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("returns 503 when table missing", async () => {
      mockPrisma.platformConfig.findUnique.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/config/features/f1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }, env, mockExCtx);
      expect(res.status).toBe(503);
    });

  });
});
