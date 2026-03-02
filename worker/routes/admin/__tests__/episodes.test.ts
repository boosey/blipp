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

const { episodesRoutes } = await import("../episodes");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Episodes Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.route("/episodes", episodesRoutes);

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

  describe("GET /episodes/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/episodes/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /episodes/", () => {
    it("returns paginated episode list with pipeline status", async () => {
      const now = new Date();
      mockPrisma.episode.findMany.mockResolvedValueOnce([
        {
          id: "ep1", podcastId: "pod1", title: "Episode 1", description: "desc",
          audioUrl: "http://audio.mp3", publishedAt: now, durationSeconds: 600,
          transcriptUrl: null, createdAt: now, updatedAt: now,
          podcast: { title: "Test Pod", imageUrl: null },
          distillation: { status: "COMPLETED" },
          _count: { clips: 3 },
        },
      ]);
      mockPrisma.episode.count.mockResolvedValueOnce(1);

      const res = await app.request("/episodes", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].pipelineStatus).toBe("completed");
      expect(body.data[0].clipCount).toBe(3);
      expect(body.total).toBe(1);
    });

    it("derives pipeline status from distillation", async () => {
      const now = new Date();
      mockPrisma.episode.findMany.mockResolvedValueOnce([
        {
          id: "ep1", podcastId: "pod1", title: "Ep", description: "d",
          audioUrl: "http://a.mp3", publishedAt: now, durationSeconds: 300,
          transcriptUrl: null, createdAt: now, updatedAt: now,
          podcast: { title: "Pod", imageUrl: null },
          distillation: { status: "FAILED" },
          _count: { clips: 0 },
        },
      ]);
      mockPrisma.episode.count.mockResolvedValueOnce(1);

      const res = await app.request("/episodes", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data[0].pipelineStatus).toBe("failed");
    });
  });

  describe("GET /episodes/:id", () => {
    it("returns episode detail with clips and pipeline trace", async () => {
      const now = new Date();
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep1", podcastId: "pod1", title: "Episode 1", description: "desc",
        audioUrl: "http://audio.mp3", publishedAt: now, durationSeconds: 600,
        transcriptUrl: null, createdAt: now, updatedAt: now,
        podcast: { id: "pod1", title: "Test Pod", imageUrl: null },
        distillation: { id: "dist1", status: "COMPLETED", createdAt: now, clips: [] },
        clips: [
          { id: "cl1", durationTier: 3, status: "READY", wordCount: 500, actualSeconds: 180, audioUrl: "http://c.mp3", createdAt: now },
        ],
      });
      mockPrisma.briefingSegment.findMany.mockResolvedValueOnce([]);
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/episodes/ep1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("ep1");
      expect(body.data.clips).toHaveLength(1);
      expect(body.data).toHaveProperty("pipelineTrace");
      expect(body.data.pipelineTrace.stages).toHaveLength(5);
    });

    it("returns 404 when not found", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/episodes/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /episodes/:id/reprocess", () => {
    it("creates TRANSCRIPTION job and returns 201", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({ id: "ep1" });
      mockPrisma.pipelineJob.create.mockResolvedValueOnce({ id: "job1", status: "PENDING" });

      const res = await app.request("/episodes/ep1/reprocess", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.jobId).toBe("job1");
    });

    it("returns 404 when episode not found", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/episodes/missing/reprocess", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("returns 503 when PipelineJob table missing", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({ id: "ep1" });
      mockPrisma.pipelineJob.create.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/episodes/ep1/reprocess", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(503);
    });

    it("calls $disconnect", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({ id: "ep1" });
      mockPrisma.pipelineJob.create.mockResolvedValueOnce({ id: "job1", status: "PENDING" });
      await app.request("/episodes/ep1/reprocess", { method: "POST" }, env, mockExCtx);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});
