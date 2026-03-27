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

const { analyticsRoutes } = await import("../analytics");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Analytics Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/analytics", analyticsRoutes);

    // Reset all mock methods
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
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  describe("GET /analytics/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/analytics/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /analytics/costs", () => {
    it("returns cost data with breakdown", async () => {
      // Mock $queryRawUnsafe calls in order: dailyRows, totals, prevTotals
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { day: "2026-03-01", stage: "TRANSCRIPTION", total_cost: 0.50 },
          { day: "2026-03-01", stage: "DISTILLATION", total_cost: 0.30 },
        ])
        .mockResolvedValueOnce([{ total_cost: 0.80, unique_days: 1 }])
        .mockResolvedValueOnce([{ total_cost: 0.40 }]);

      const res = await app.request("/analytics/costs?from=2026-03-01&to=2026-03-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("totalCost");
      expect(body.data).toHaveProperty("comparison");
      expect(body.data).toHaveProperty("dailyCosts");
      expect(body.data).toHaveProperty("metrics");
    });

    it("returns zeroed data when table missing", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/analytics/costs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.totalCost).toBe(0);
      expect(body.data.dailyCosts).toEqual([]);
    });
  });

  describe("GET /analytics/costs/by-model", () => {
    it("returns grouped data", async () => {
      mockPrisma.pipelineStep.groupBy
        .mockResolvedValueOnce([
          { model: "whisper-1", _sum: { cost: 0.5, inputTokens: 100, outputTokens: 0 }, _count: 2 },
        ])
        .mockResolvedValueOnce([
          { stage: "TRANSCRIPTION", _sum: { cost: 0.5, inputTokens: 100, outputTokens: 0 }, _count: 2 },
        ]);

      const res = await app.request("/analytics/costs/by-model?from=2026-03-01&to=2026-03-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.models).toHaveLength(1);
      expect(body.data.byStage).toHaveLength(1);
    });
  });

  describe("GET /analytics/usage", () => {
    it("returns usage trends", async () => {
      // Mock all $queryRawUnsafe: feedTrends, episodeTrends, userTrends, feedAgg, peakRows
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ day: "2026-03-01", count: 10 }]) // feedTrends
        .mockResolvedValueOnce([{ day: "2026-03-01", count: 5 }]) // episodeTrends
        .mockResolvedValueOnce([{ day: "2026-03-01", count: 2 }]) // userTrends
        .mockResolvedValueOnce([{ total: 10, avg_duration: 5 }]) // feedAgg
        .mockResolvedValueOnce([{ hour: 8, count: 5 }]); // peakRows

      mockPrisma.user.groupBy.mockResolvedValue([]);
      mockPrisma.plan.findMany.mockResolvedValue([]);

      const res = await app.request("/analytics/usage?from=2026-03-01&to=2026-03-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.metrics).toHaveProperty("feedItems");
      expect(body.data.trends).toHaveLength(1);
      expect(body.data.peakTimes).toHaveLength(1);
    });
  });

  describe("GET /analytics/quality", () => {
    it("returns quality metrics", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ avg_fit: 92.5 }]) // clipAgg
        .mockResolvedValueOnce([{ total: 10, completed: 9 }]) // distAgg
        .mockResolvedValueOnce([{ total: 20, with_transcript: 18 }]) // epAgg
        .mockResolvedValueOnce([{ day: "2026-03-01", score: 92.5 }]) // dailyQuality
        .mockResolvedValueOnce([{ count: 0 }]); // poorFitCount

      mockPrisma.distillation.count.mockResolvedValue(1);

      const res = await app.request("/analytics/quality?from=2026-03-01&to=2026-03-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("overallScore");
      expect(body.data.components).toHaveProperty("timeFitting");
      expect(body.data.components).toHaveProperty("claimCoverage");
      expect(body.data.components).toHaveProperty("transcription");
    });
  });

  describe("GET /analytics/pipeline", () => {
    it("returns pipeline metrics", async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { stage: "TRANSCRIPTION", total: 10, completed: 9 },
        ])
        .mockResolvedValueOnce([{ day: "2026-03-01", avg_ms: 500 }]); // dailySpeed

      mockPrisma.pipelineStep.count
        .mockResolvedValueOnce(100) // completedCount
        .mockResolvedValueOnce(80); // prevCount

      const res = await app.request("/analytics/pipeline?from=2026-03-01&to=2026-03-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("throughput");
      expect(body.data).toHaveProperty("successRates");
      expect(body.data).toHaveProperty("processingSpeed");
    });

    it("returns fallback when table missing", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/analytics/pipeline", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.throughput.episodesPerHour).toBe(0);
    });
  });

  describe("GET /analytics/revenue", () => {
    it("returns revenue metrics", async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5);
      mockPrisma.user.groupBy.mockResolvedValue([
        { planId: "plan1", _count: 50 },
        { planId: "plan2", _count: 50 },
      ]);
      mockPrisma.plan.findMany.mockResolvedValue([
        { id: "plan1", name: "Free", slug: "free", priceCentsMonthly: 0, priceCentsAnnual: null },
        { id: "plan2", name: "Pro", slug: "pro", priceCentsMonthly: 999, priceCentsAnnual: 9990 },
      ]);

      const res = await app.request("/analytics/revenue", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.totalUsers).toBe(100);
      expect(body.data.mrr).toBeGreaterThan(0);
      expect(body.data.byPlan).toHaveLength(2);
    });
  });
});
