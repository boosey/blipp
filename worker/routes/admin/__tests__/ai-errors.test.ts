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

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

const { aiErrorsRoutes } = await import("../ai-errors");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

const mockError = {
  id: "err_1",
  service: "stt",
  provider: "openai",
  model: "whisper-1",
  operation: "transcribe",
  correlationId: "corr-123",
  jobId: "job-1",
  stepId: null,
  episodeId: "ep-1",
  category: "rate_limit",
  severity: "transient",
  httpStatus: 429,
  errorMessage: "Too many requests",
  rawResponse: null,
  requestDurationMs: 150,
  timestamp: new Date("2026-03-14T12:00:00Z"),
  retryCount: 0,
  maxRetries: 3,
  willRetry: true,
  resolved: false,
  rateLimitRemaining: 0,
  rateLimitResetAt: new Date("2026-03-14T12:01:00Z"),
  createdAt: new Date("2026-03-14T12:00:00Z"),
};

describe("Admin AI Errors Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/ai-errors", aiErrorsRoutes);

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

  describe("GET /", () => {
    it("returns paginated results", async () => {
      mockPrisma.aiServiceError.findMany.mockResolvedValueOnce([mockError]);
      mockPrisma.aiServiceError.count.mockResolvedValueOnce(1);

      const res = await app.request("/ai-errors", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].service).toBe("stt");
      expect(body.total).toBe(1);
    });

    it("filters by service", async () => {
      mockPrisma.aiServiceError.findMany.mockResolvedValueOnce([]);
      mockPrisma.aiServiceError.count.mockResolvedValueOnce(0);

      const res = await app.request("/ai-errors?service=stt", {}, env, mockExCtx);
      expect(res.status).toBe(200);

      const findManyCall = mockPrisma.aiServiceError.findMany.mock.calls[0][0];
      expect(findManyCall.where.service).toBe("stt");
    });

    it("filters by search", async () => {
      mockPrisma.aiServiceError.findMany.mockResolvedValueOnce([]);
      mockPrisma.aiServiceError.count.mockResolvedValueOnce(0);

      const res = await app.request("/ai-errors?search=timeout", {}, env, mockExCtx);
      expect(res.status).toBe(200);

      const findManyCall = mockPrisma.aiServiceError.findMany.mock.calls[0][0];
      expect(findManyCall.where.errorMessage).toEqual({ contains: "timeout", mode: "insensitive" });
    });
  });

  describe("GET /summary", () => {
    it("returns aggregate counts", async () => {
      mockPrisma.aiServiceError.count
        .mockResolvedValueOnce(10)   // totalErrors
        .mockResolvedValueOnce(3)    // last1h
        .mockResolvedValueOnce(50);  // last7d
      mockPrisma.aiServiceError.groupBy
        .mockResolvedValueOnce([{ service: "stt", _count: 5 }])      // byService
        .mockResolvedValueOnce([{ provider: "openai", _count: 7 }])  // byProvider
        .mockResolvedValueOnce([{ category: "rate_limit", _count: 4 }]) // byCategory
        .mockResolvedValueOnce([{ severity: "transient", _count: 8 }])  // bySeverity
        .mockResolvedValueOnce([]);  // topErrors

      const res = await app.request("/ai-errors/summary", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.totalErrors).toBe(10);
      expect(body.data.errorRate.last1h).toBe(3);
      expect(body.data.byService.stt).toBe(5);
    });
  });

  describe("GET /:id", () => {
    it("returns 404 for nonexistent ID", async () => {
      mockPrisma.aiServiceError.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/ai-errors/nonexistent", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("returns full error detail for valid ID", async () => {
      mockPrisma.aiServiceError.findUnique.mockResolvedValueOnce(mockError);

      const res = await app.request("/ai-errors/err_1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("err_1");
      expect(body.data.service).toBe("stt");
    });
  });
});
