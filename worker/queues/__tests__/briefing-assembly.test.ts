import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn().mockReturnValue("wp/briefing/user-1/2026-02-26.mp3"),
  putWorkProduct: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock("../../lib/clip-cache", () => ({
  getClip: vi.fn(),
  putBriefing: vi.fn(),
}));

vi.mock("../../lib/mp3-concat", () => ({
  concatMp3Buffers: vi.fn(),
}));

import { getConfig } from "../../lib/config";
import { getClip, putBriefing } from "../../lib/clip-cache";
import { concatMp3Buffers } from "../../lib/mp3-concat";
import { wpKey, putWorkProduct } from "../../lib/work-products";

const { handleBriefingAssembly } = await import("../briefing-assembly");

// ── Helpers ──

function createMsg(body: any) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function createBatch(messages: any[], queue = "briefing-assembly") {
  return { queue, messages } as unknown as MessageBatch<any>;
}

/** Standard completed job with episode relation. */
function makeCompletedJob(overrides: Record<string, any> = {}) {
  return {
    id: "job-1",
    requestId: "req-1",
    episodeId: "ep-1",
    durationTier: 5,
    status: "COMPLETED",
    clipId: "clip-1",
    episode: { id: "ep-1", title: "Episode 1" },
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: "req-1",
    status: "PROCESSING",
    userId: "user-1",
    targetMinutes: 10,
    user: { id: "user-1" },
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

    // Reset all mock prisma methods (vitest v4: clearAllMocks resets mockResolvedValue)
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

    // Defaults: stage enabled, clip audio present, concat returns audio, putBriefing returns key
    (getConfig as any).mockResolvedValue(true);
    (getClip as any).mockResolvedValue(new ArrayBuffer(1024));
    (concatMp3Buffers as any).mockReturnValue(new ArrayBuffer(4096));
    (putBriefing as any).mockResolvedValue("briefings/user-1/2026-03-05.mp3");
    (wpKey as any).mockReturnValue("wp/briefing/user-1/2026-03-05.mp3");
    (putWorkProduct as any).mockResolvedValue(undefined);
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });
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

      // Should have attempted to load request (bypassed gate)
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

  // ── Happy path ──

  describe("happy path", () => {
    it("assembles briefing from all completed jobs", async () => {
      const jobs = [
        makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1", durationTier: 5, episode: { id: "ep-1", title: "Episode 1" } }),
        makeCompletedJob({ id: "job-2", episodeId: "ep-2", clipId: "clip-2", durationTier: 3, episode: { id: "ep-2", title: "Episode 2" } }),
      ];

      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue(jobs);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefing.create.mockResolvedValue({ id: "brief-1" });
      mockPrisma.briefingSegment.create.mockResolvedValue({});
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // Gathered clip audio from R2 for each completed job
      expect(getClip).toHaveBeenCalledTimes(2);
      expect(getClip).toHaveBeenCalledWith(env.R2, "ep-1", 5);
      expect(getClip).toHaveBeenCalledWith(env.R2, "ep-2", 3);

      // Concatenated audio
      expect(concatMp3Buffers).toHaveBeenCalledWith([
        expect.any(ArrayBuffer),
        expect.any(ArrayBuffer),
      ]);

      // Stored in R2
      expect(putBriefing).toHaveBeenCalledWith(
        env.R2,
        "user-1",
        expect.any(String),
        expect.any(ArrayBuffer)
      );

      // Created Briefing record
      expect(mockPrisma.briefing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          status: "COMPLETED",
          targetMinutes: 10,
          audioKey: "briefings/user-1/2026-03-05.mp3",
        }),
      });

      // Created BriefingSegments per clip
      expect(mockPrisma.briefingSegment.create).toHaveBeenCalledTimes(2);

      // Marked request COMPLETED with briefingId, no errorMessage
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: {
          status: "COMPLETED",
          briefingId: "brief-1",
          errorMessage: null,
        },
      });

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── PipelineStep tracking ──

  describe("pipeline step tracking", () => {
    it("creates PipelineStep with IN_PROGRESS status on first completed job", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefing.create.mockResolvedValue({ id: "brief-1" });
      mockPrisma.briefingSegment.create.mockResolvedValue({});
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobId: "job-1",
          stage: "BRIEFING_ASSEMBLY",
          status: "IN_PROGRESS",
          startedAt: expect.any(Date),
        }),
      });
    });

    it("marks PipelineStep COMPLETED with durationMs and output metadata on success", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefing.create.mockResolvedValue({ id: "brief-1" });
      mockPrisma.briefingSegment.create.mockResolvedValue({});
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
          durationMs: expect.any(Number),
          output: expect.objectContaining({
            audioKey: "briefings/user-1/2026-03-05.mp3",
            briefingId: "brief-1",
            clipCount: 1,
            partial: false,
          }),
        }),
      });
    });
  });

  // ── Partial assembly ──

  describe("partial assembly", () => {
    it("assembles from completed jobs when some have failed", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1" }),
        { id: "job-2", requestId: "req-1", episodeId: "ep-2", durationTier: 5, status: "FAILED", clipId: null, episode: { id: "ep-2", title: "Episode 2" } },
      ]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefing.create.mockResolvedValue({ id: "brief-1" });
      mockPrisma.briefingSegment.create.mockResolvedValue({});
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // Only fetched clip for the completed job
      expect(getClip).toHaveBeenCalledTimes(1);
      expect(getClip).toHaveBeenCalledWith(env.R2, "ep-1", 5);

      // Still created a briefing
      expect(mockPrisma.briefing.create).toHaveBeenCalled();
      expect(mockPrisma.briefingSegment.create).toHaveBeenCalledTimes(1);

      // Request marked COMPLETED with partial note
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: {
          status: "COMPLETED",
          briefingId: "brief-1",
          errorMessage: "Partial assembly: 1 of 2 jobs failed",
        },
      });

      // Step output reflects partial
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            output: expect.objectContaining({ partial: true }),
          }),
        })
      );

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── All jobs failed ──

  describe("all jobs failed", () => {
    it("marks request FAILED when zero jobs completed", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job-1", requestId: "req-1", episodeId: "ep-1", durationTier: 5, status: "FAILED", clipId: null, episode: { id: "ep-1", title: "Episode 1" } },
        { id: "job-2", requestId: "req-1", episodeId: "ep-2", durationTier: 3, status: "FAILED", clipId: null, episode: { id: "ep-2", title: "Episode 2" } },
      ]);
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No completed jobs with clips available for assembly",
        }),
      });

      // No briefing, segments, or step created
      expect(mockPrisma.briefing.create).not.toHaveBeenCalled();
      expect(mockPrisma.briefingSegment.create).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineStep.create).not.toHaveBeenCalled();

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── No clip audio in R2 ──

  describe("no clip audio in R2", () => {
    it("marks step FAILED and request FAILED when R2 returns no audio", async () => {
      (getClip as any).mockResolvedValue(null);

      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No clip audio found in R2",
          durationMs: expect.any(Number),
        }),
      });

      // Request marked FAILED
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No clip audio found in R2 for completed jobs",
        }),
      });

      // No concat or storage
      expect(concatMp3Buffers).not.toHaveBeenCalled();
      expect(putBriefing).not.toHaveBeenCalled();

      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Error handling ──

  describe("error handling", () => {
    it("marks step FAILED and request FAILED on unexpected error, then retries", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });

      // concatMp3Buffers throws after step is created
      (concatMp3Buffers as any).mockImplementation(() => {
        throw new Error("concat failed");
      });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefingRequest.updateMany.mockResolvedValue({ count: 1 });

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: "concat failed",
          }),
        })
      );

      // Request marked FAILED via updateMany (safe for deleted/already-terminal)
      expect(mockPrisma.briefingRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: "req-1",
          status: { notIn: ["COMPLETED", "FAILED"] },
        },
        data: { status: "FAILED", errorMessage: "concat failed" },
      });

      // Message retried
      expect(msg.retry).toHaveBeenCalled();
    });

    it("retries when DB throws during request load", async () => {
      mockPrisma.briefingRequest.findUnique.mockRejectedValue(new Error("DB down"));
      mockPrisma.briefingRequest.updateMany.mockResolvedValue({ count: 0 });

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      expect(msg.retry).toHaveBeenCalled();
    });

    it("does not try to update step when error occurs before step creation", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
      mockPrisma.pipelineJob.findMany.mockRejectedValue(new Error("jobs query failed"));
      mockPrisma.briefingRequest.updateMany.mockResolvedValue({ count: 1 });

      const msg = createMsg({ requestId: "req-1" });
      await handleBriefingAssembly(createBatch([msg]), env, ctx);

      // No step update attempted (stepId is null)
      expect(mockPrisma.pipelineStep.update).not.toHaveBeenCalled();
      expect(msg.retry).toHaveBeenCalled();
    });
  });

  // ── Batch processing ──

  describe("batch processing", () => {
    it("processes multiple messages independently", async () => {
      // First request: happy path
      mockPrisma.briefingRequest.findUnique
        .mockResolvedValueOnce(makeRequest({ id: "req-1" }))
        .mockResolvedValueOnce(null); // Second: not found

      mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.briefing.create.mockResolvedValue({ id: "brief-1" });
      mockPrisma.briefingSegment.create.mockResolvedValue({});
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
