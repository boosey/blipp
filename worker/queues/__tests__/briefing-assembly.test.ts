import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
}));
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../../lib/config";

const { handleBriefingAssembly } = await import("../briefing-assembly");

// ── Helpers ──

function createMsg(body: any) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function createBatch(messages: any[], queue = "briefing-assembly") {
  return { queue, messages } as unknown as MessageBatch<any>;
}

function makeCompletedJob(overrides: Record<string, any> = {}) {
  return {
    id: "job-1",
    requestId: "req-1",
    episodeId: "ep-1",
    durationTier: 5,
    status: "COMPLETED",
    clipId: "clip-1",
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: "req-1",
    status: "PROCESSING",
    userId: "user-1",
    targetMinutes: 5,
    ...overrides,
  };
}

describe("handleBriefingAssembly", () => {
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

    // Reset all mock prisma methods
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

    // Defaults
    (getConfig as any).mockResolvedValue(true);
  });

  // ── Stage gate ──

  describe("stage gate", () => {
    it("ACKs without processing when stage 5 is disabled", async () => {
      (getConfig as any).mockResolvedValue(false);

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockPrisma.briefingRequest.findUnique).not.toHaveBeenCalled();
    });

    it("bypasses stage gate for manual messages", async () => {
      (getConfig as any).mockResolvedValue(false);
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(null);

      const msg = createMsg({ requestId: "req-1", type: "manual" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(mockPrisma.briefingRequest.findUnique).toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Request-level guards ──

  describe("request guards", () => {
    it("ACKs when request not found", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(null);

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findMany).not.toHaveBeenCalled();
    });

    it("ACKs when request is already COMPLETED", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(
        makeRequest({ status: "COMPLETED" })
      );

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findMany).not.toHaveBeenCalled();
    });

    it("ACKs when request is already FAILED", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(
        makeRequest({ status: "FAILED" })
      );

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Happy path: FeedItems updated to READY ──

  describe("happy path", () => {
    it("updates FeedItems to READY with clipId on completed jobs", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1", durationTier: 5 }),
      ]);
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // FeedItems updated with clipId and READY status
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: {
          requestId: "req-1",
          episodeId: "ep-1",
          durationTier: 5,
        },
        data: {
          status: "READY",
          clipId: "clip-1",
        },
      });

      // Request marked COMPLETED
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: {
          status: "COMPLETED",
          errorMessage: null,
        },
      });

      expect(msg.ack).toHaveBeenCalled();
    });

    it("handles multiple completed jobs updating different FeedItems", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1", durationTier: 5 }),
        makeCompletedJob({ id: "job-2", episodeId: "ep-2", clipId: "clip-2", durationTier: 3 }),
      ]);
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1", episodeId: "ep-1", durationTier: 5 },
        data: { status: "READY", clipId: "clip-1" },
      });
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1", episodeId: "ep-2", durationTier: 3 },
        data: { status: "READY", clipId: "clip-2" },
      });

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Partial assembly ──

  describe("partial assembly", () => {
    it("updates FeedItems for completed jobs and marks request with partial note", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1", durationTier: 5 }),
        { id: "job-2", requestId: "req-1", episodeId: "ep-2", durationTier: 3, status: "FAILED", clipId: null },
      ]);
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // Only completed job's FeedItems updated
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1", episodeId: "ep-1", durationTier: 5 },
        data: { status: "READY", clipId: "clip-1" },
      });

      // Request marked COMPLETED with partial note
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: {
          status: "COMPLETED",
          errorMessage: "Partial: 1 of 2 jobs failed",
        },
      });

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── All jobs failed ──

  describe("all jobs failed", () => {
    it("marks FeedItems FAILED and request FAILED when zero jobs completed", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job-1", requestId: "req-1", episodeId: "ep-1", durationTier: 5, status: "FAILED", clipId: null },
        { id: "job-2", requestId: "req-1", episodeId: "ep-2", durationTier: 3, status: "FAILED", clipId: null },
      ]);
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // FeedItems marked FAILED
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1" },
        data: {
          status: "FAILED",
          errorMessage: "No completed clips available",
        },
      });

      // Request marked FAILED
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: {
          status: "FAILED",
          errorMessage: "No completed jobs with clips available",
        },
      });

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Error handling ──

  describe("error handling", () => {
    it("marks FeedItems and request FAILED on unexpected error, then retries", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockRejectedValue(new Error("DB error"));
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.briefingRequest.updateMany.mockResolvedValue({ count: 1 });

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // FeedItems marked FAILED
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1" },
        data: { status: "FAILED", errorMessage: "DB error" },
      });

      // Request marked FAILED via updateMany
      expect(mockPrisma.briefingRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: "req-1",
          status: { notIn: ["COMPLETED", "FAILED"] },
        },
        data: { status: "FAILED", errorMessage: "DB error" },
      });

      expect(msg.retry).toHaveBeenCalled();
    });

    it("retries when DB throws during request load", async () => {
      mockPrisma.briefingRequest.findUnique.mockRejectedValue(new Error("DB down"));
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.briefingRequest.updateMany.mockResolvedValue({ count: 0 });

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.retry).toHaveBeenCalled();
    });
  });

  // ── Batch processing ──

  describe("batch processing", () => {
    it("processes multiple messages independently", async () => {
      mockPrisma.briefingRequest.findUnique
        .mockResolvedValueOnce(makeRequest({ id: "req-1" }))
        .mockResolvedValueOnce(null);

      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg1 = createMsg({ requestId: "req-1" });
      const msg2 = createMsg({ requestId: "req-2" });
      await handleBriefingAssembly(createBatch([msg1, msg2]), env, ctx);

      expect(msg1.ack).toHaveBeenCalled();
      expect(msg2.ack).toHaveBeenCalled();
    });
  });

  // ── Cleanup ──

  describe("cleanup", () => {
    it("disconnects prisma via ctx.waitUntil in finally block", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(null);

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(ctx.waitUntil).toHaveBeenCalled();
    });
  });
});
