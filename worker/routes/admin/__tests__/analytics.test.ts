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
      const now = new Date();
      mockPrisma.pipelineStep.findMany
        .mockResolvedValueOnce([
          { stage: "TRANSCRIPTION", model: "whisper-1", inputTokens: 100, outputTokens: 0, cost: 0.50, createdAt: now },
          { stage: "DISTILLATION", model: "claude-sonnet", inputTokens: 200, outputTokens: 50, cost: 0.30, createdAt: now },
        ])
        .mockResolvedValueOnce([
          { cost: 0.40 },
        ]);

      const res = await app.request("/analytics/costs?from=2026-01-01&to=2026-01-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("totalCost");
      expect(body.data).toHaveProperty("comparison");
      expect(body.data).toHaveProperty("dailyCosts");
      expect(body.data).toHaveProperty("metrics");
    });

    it("returns zeroed data when table missing", async () => {
      mockPrisma.pipelineStep.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/analytics/costs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.totalCost).toBe(0);
      expect(body.data.dailyCosts).toEqual([]);
    });
  });

  describe("GET /analytics/usage", () => {
    it("returns usage trends", async () => {
      const now = new Date();
      mockPrisma.feedItem.findMany.mockResolvedValueOnce([
        { createdAt: now, durationTier: 5 },
      ]);
      mockPrisma.episode.findMany.mockResolvedValueOnce([
        { createdAt: now },
      ]);
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { createdAt: now },
      ]);
      // groupBy now uses planId
      mockPrisma.user.groupBy.mockResolvedValueOnce([
        { planId: "plan_free", _count: 50 },
        { planId: "plan_pro", _count: 30 },
      ]);
      // The usage route looks up plan names after groupBy
      mockPrisma.plan.findMany.mockResolvedValueOnce([
        { id: "plan_free", name: "Free" },
        { id: "plan_pro", name: "Pro" },
      ]);

      const res = await app.request("/analytics/usage?from=2026-01-01&to=2026-01-01", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("metrics");
      expect(body.data).toHaveProperty("trends");
      expect(body.data).toHaveProperty("byPlan");
      expect(body.data).toHaveProperty("peakTimes");
      expect(body.data.metrics.feedItems).toBe(1);
    });
  });

  describe("GET /analytics/quality", () => {
    it("returns quality metrics", async () => {
      const now = new Date();
      mockPrisma.clip.findMany.mockResolvedValueOnce([
        { durationTier: 5, actualSeconds: 295, createdAt: now },
      ]);
      mockPrisma.distillation.findMany.mockResolvedValueOnce([
        { status: "COMPLETED" },
        { status: "FAILED" },
      ]);
      mockPrisma.episode.findMany.mockResolvedValueOnce([
        { transcriptUrl: "http://t.txt" },
        { transcriptUrl: null },
      ]);

      const res = await app.request("/analytics/quality?from=2026-01-01&to=2026-01-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("overallScore");
      expect(body.data).toHaveProperty("components");
      expect(body.data.components).toHaveProperty("timeFitting");
      expect(body.data.components).toHaveProperty("claimCoverage");
      expect(body.data.components).toHaveProperty("transcription");
      expect(body.data).toHaveProperty("trend");
      expect(body.data).toHaveProperty("recentIssues");
    });
  });

  describe("GET /analytics/pipeline", () => {
    it("returns pipeline performance with bottlenecks", async () => {
      const now = new Date();
      mockPrisma.pipelineStep.findMany.mockResolvedValueOnce([
        { stage: "TRANSCRIPTION", status: "COMPLETED", durationMs: 500, createdAt: now },
        { stage: "TRANSCRIPTION", status: "FAILED", durationMs: null, createdAt: now },
        { stage: "DISTILLATION", status: "COMPLETED", durationMs: 300, createdAt: now },
      ]);
      mockPrisma.pipelineStep.count.mockResolvedValueOnce(5);

      const res = await app.request("/analytics/pipeline?from=2026-01-01&to=2026-01-02", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("throughput");
      expect(body.data).toHaveProperty("successRates");
      expect(body.data.successRates).toHaveLength(5);
      expect(body.data).toHaveProperty("processingSpeed");
      expect(body.data).toHaveProperty("bottlenecks");
    });

    it("returns default data when table missing", async () => {
      mockPrisma.pipelineStep.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/analytics/pipeline", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.throughput.episodesPerHour).toBe(0);
      expect(body.data.successRates).toHaveLength(5);
      expect(body.data.bottlenecks).toEqual([]);
    });

  });
});
