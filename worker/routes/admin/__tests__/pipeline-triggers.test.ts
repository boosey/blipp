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

const { pipelineRoutes } = await import("../pipeline");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Pipeline Trigger Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/pipeline", pipelineRoutes);

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

  describe("POST /pipeline/trigger/feed-refresh", () => {
    it("enqueues feed refresh for a specific podcast", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce({ id: "pod-1" });

      const res = await app.request("/pipeline/trigger/feed-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId: "pod-1" }),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(env.FEED_REFRESH_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        podcastId: "pod-1",
      });
    });

    it("returns 404 when podcast not found", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/pipeline/trigger/feed-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId: "missing" }),
      }, env, mockExCtx);

      expect(res.status).toBe(404);
    });

    it("enqueues feed refresh for all active podcasts when no podcastId", async () => {
      mockPrisma.podcast.findMany.mockResolvedValueOnce([
        { id: "pod-1" },
        { id: "pod-2" },
      ]);

      const res = await app.request("/pipeline/trigger/feed-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(2);
      expect(env.FEED_REFRESH_QUEUE.sendBatch).toHaveBeenCalled();
    });
  });

  describe("POST /pipeline/trigger/stage/:stage", () => {
    it("stage TRANSCRIPTION: enqueues transcription for unprocessed episodes", async () => {
      mockPrisma.episode.findMany.mockResolvedValueOnce([
        { id: "ep-1", transcriptUrl: "https://example.com/ep1.vtt" },
      ]);

      const res = await app.request("/pipeline/trigger/stage/2", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
    });

    it("stage 4: enqueues narrative generation for completed distillations without clips", async () => {
      mockPrisma.distillation.findMany.mockResolvedValueOnce([
        { id: "dist-1", episodeId: "ep-1" },
      ]);

      const res = await app.request("/pipeline/trigger/stage/4", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        episodeId: "ep-1",
      });
    });

    it("invalid stage: returns 400", async () => {
      const res = await app.request("/pipeline/trigger/stage/99", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("Invalid stage");
    });
  });

  describe("POST /pipeline/trigger/episode/:id", () => {
    it("auto-detects: enqueues transcription when no distillation exists", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: null,
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(body.data.message).toContain("Transcription");
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalled();
    });

    it("auto-detects: enqueues narrative generation when distillation is completed but no clips", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: { id: "dist-1", status: "COMPLETED" },
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(body.data.message).toContain("Narrative generation");
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalled();
    });

    it("returns 404 when episode not found", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/pipeline/trigger/episode/missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);

      expect(res.status).toBe(404);
    });

    it("explicit stage DISTILLATION: enqueues distillation", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: null,
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "DISTILLATION" }),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(env.DISTILLATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ episodeId: "ep-1" })
      );
    });

    it("explicit stage DISTILLATION: returns 400 when no transcriptUrl", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: null,
        distillation: null,
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "DISTILLATION" }),
      }, env, mockExCtx);

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("transcriptUrl");
    });

    it("explicit stage NARRATIVE_GENERATION: enqueues narrative generation", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: { id: "dist-1", status: "COMPLETED" },
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "NARRATIVE_GENERATION" }),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(1);
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalled();
    });

    it("explicit stage NARRATIVE_GENERATION: returns 400 when no completed distillation", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: { id: "dist-1", status: "FAILED" },
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "NARRATIVE_GENERATION" }),
      }, env, mockExCtx);

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("No completed distillation");
    });

    it("explicit invalid stage: returns 400", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: null,
        clips: [],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "INVALID" }),
      }, env, mockExCtx);

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("Invalid stage");
    });

    it("auto-detect: skips when episode is fully processed", async () => {
      mockPrisma.episode.findUnique.mockResolvedValueOnce({
        id: "ep-1",
        transcriptUrl: "https://example.com/ep1.vtt",
        distillation: { id: "dist-1", status: "COMPLETED" },
        clips: [{ id: "clip-1" }],
      });

      const res = await app.request("/pipeline/trigger/episode/ep-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.enqueued).toBe(0);
      expect(body.data.skipped).toBe(1);
    });
  });

  describe("POST /pipeline/jobs/:id/retry (queue dispatch)", () => {
    it("dispatches TRANSCRIPTION job to transcription queue", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValueOnce({
        id: "job-1",
        currentStage: "TRANSCRIPTION",
        status: "FAILED",
        episodeId: "ep-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValueOnce({
        id: "job-1",
        status: "PENDING",
      });

      const res = await app.request("/pipeline/jobs/job-1/retry", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        jobId: "job-1",
        episodeId: "ep-1",
      });
    });

    it("dispatches DISTILLATION job to distillation queue", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValueOnce({
        id: "job-1",
        currentStage: "DISTILLATION",
        status: "FAILED",
        episodeId: "ep-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValueOnce({
        id: "job-1",
        status: "PENDING",
      });

      const res = await app.request("/pipeline/jobs/job-1/retry", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(env.DISTILLATION_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        jobId: "job-1",
        episodeId: "ep-1",
      });
    });

    it("dispatches NARRATIVE_GENERATION job to narrative generation queue", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValueOnce({
        id: "job-1",
        currentStage: "NARRATIVE_GENERATION",
        status: "FAILED",
        episodeId: "ep-1",
        durationTier: 5,
      });
      mockPrisma.pipelineJob.update.mockResolvedValueOnce({
        id: "job-1",
        status: "PENDING",
      });

      const res = await app.request("/pipeline/jobs/job-1/retry", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        jobId: "job-1",
        episodeId: "ep-1",
        durationTier: 5,
      });
    });

    it("dispatches AUDIO_GENERATION job to audio generation queue", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValueOnce({
        id: "job-1",
        currentStage: "AUDIO_GENERATION",
        status: "FAILED",
        episodeId: "ep-1",
        durationTier: 5,
      });
      mockPrisma.pipelineJob.update.mockResolvedValueOnce({
        id: "job-1",
        status: "PENDING",
      });

      const res = await app.request("/pipeline/jobs/job-1/retry", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        jobId: "job-1",
        episodeId: "ep-1",
        durationTier: 5,
      });
    });

    it("dispatches BRIEFING_ASSEMBLY job to briefing assembly queue", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValueOnce({
        id: "job-1",
        currentStage: "BRIEFING_ASSEMBLY",
        status: "FAILED",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValueOnce({
        id: "job-1",
        status: "PENDING",
      });

      const res = await app.request("/pipeline/jobs/job-1/retry", {
        method: "POST",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith({
        type: "manual",
        requestId: "req-1",
      });
    });
  });
});
