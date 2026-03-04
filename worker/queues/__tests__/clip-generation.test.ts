import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleClipGeneration } from "../clip-generation";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/distillation", () => ({
  generateNarrative: vi.fn().mockResolvedValue("A warm narrative about technology trends."),
}));

vi.mock("../../lib/tts", () => ({
  generateSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(2048)),
}));

vi.mock("../../lib/clip-cache", () => ({
  putClip: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@anthropic-ai/sdk", () => {
  return { default: class MockAnthropic {} };
});

vi.mock("openai", () => {
  return { default: class MockOpenAI {} };
});

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { generateNarrative } from "../../lib/distillation";
import { generateSpeech } from "../../lib/tts";
import { putClip } from "../../lib/clip-cache";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

const JOB = {
  id: "job-1",
  requestId: "req-1",
  episodeId: "ep-1",
  durationTier: 5,
  status: "PENDING",
  currentStage: "CLIP_GENERATION",
};

const STEP = { id: "step-1", jobId: "job-1", stage: "CLIP_GENERATION", status: "IN_PROGRESS" };

const DISTILLATION = {
  id: "dist-1",
  episodeId: "ep-1",
  status: "COMPLETED",
  claimsJson: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);

  // Re-set mocks after clearAllMocks (vitest v4 clears mockResolvedValue)
  (getConfig as any).mockResolvedValue(true);
  (generateNarrative as any).mockResolvedValue("A warm narrative about technology trends.");
  (generateSpeech as any).mockResolvedValue(new ArrayBuffer(2048));
  (putClip as any).mockResolvedValue(undefined);
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());

  // Default mocks for job and step creation
  mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue(JOB);
  mockPrisma.pipelineStep.create.mockResolvedValue(STEP);
  mockPrisma.pipelineStep.update.mockResolvedValue(STEP);
});

function makeBatch(body: any) {
  const mockMsg = { body, ack: vi.fn(), retry: vi.fn() };
  const mockBatch = {
    messages: [mockMsg],
    queue: "clip-generation",
  } as unknown as MessageBatch<any>;
  return { mockMsg, mockBatch };
}

describe("handleClipGeneration", () => {
  const msgBody = {
    jobId: "job-1",
    episodeId: "ep-1",
    durationTier: 5,
  };

  it("creates PipelineStep on processing", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1", episodeId: "ep-1", durationTier: 5 });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        stage: "CLIP_GENERATION",
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
      }),
    });
  });

  it("cache hit — step SKIPPED, reports to orchestrator", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue({
      id: "clip-cached",
      episodeId: "ep-1",
      durationTier: 5,
      status: "COMPLETED",
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    // Step marked SKIPPED with cached: true
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "SKIPPED",
        cached: true,
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
      }),
    });

    // Job updated with cached clipId
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: { clipId: "clip-cached" },
      })
    );

    // No narrative/TTS generation
    expect(generateNarrative).not.toHaveBeenCalled();
    expect(generateSpeech).not.toHaveBeenCalled();

    // Orchestrator notified
    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("full flow: claims lookup → narrative → TTS → R2 → clip record", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    // Distillation claims loaded from DB
    expect(mockPrisma.distillation.findFirst).toHaveBeenCalledWith({
      where: { episodeId: "ep-1", status: "COMPLETED" },
    });

    // Narrative generated
    expect(generateNarrative).toHaveBeenCalledWith(
      expect.anything(),
      DISTILLATION.claimsJson,
      5
    );

    // TTS generated
    expect(generateSpeech).toHaveBeenCalled();

    // Stored in R2
    expect(putClip).toHaveBeenCalledWith(
      mockEnv.R2,
      "ep-1",
      5,
      expect.any(ArrayBuffer)
    );

    // Clip upserted as COMPLETED
    expect(mockPrisma.clip.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "COMPLETED" }),
        create: expect.objectContaining({ status: "COMPLETED", durationTier: 5 }),
      })
    );

    // Step marked COMPLETED
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
      }),
    });

    // Job updated with clipId
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: { clipId: "clip-1" },
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("reports to orchestrator on completion", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 4 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).not.toHaveBeenCalled();
      expect(generateSpeech).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: 4 });
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

      const manualBody = { ...msgBody, type: "manual" as const };
      const { mockMsg, mockBatch } = makeBatch(manualBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).toHaveBeenCalled();
      expect(generateSpeech).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED and retries on error", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      (generateNarrative as any).mockRejectedValueOnce(new Error("Claude API error"));
      mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.clip.upsert.mockResolvedValue({});

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "CLIP_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Claude API error",
        }),
      });

      // Clip upserted as FAILED
      expect(mockPrisma.clip.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: "FAILED", errorMessage: "Claude API error" }),
        })
      );

      expect(mockMsg.retry).toHaveBeenCalled();
      expect(mockMsg.ack).not.toHaveBeenCalled();
    });

    it("throws if no completed distillation found", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(null);
      mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.clip.upsert.mockResolvedValue({});

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.retry).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "episode_error",
        { episodeId: "ep-1", durationTier: 5 },
        expect.any(Error)
      );
    });
  });

  describe("logging", () => {
    it("logs batch_start", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue({ id: "clip-1", status: "COMPLETED" });

      const { mockBatch } = makeBatch(msgBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs clip_completed on success", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

      const { mockBatch } = makeBatch(msgBody);
      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("clip_completed", {
        episodeId: "ep-1",
        durationTier: 5,
        audioKey: "clips/ep-1/5.mp3",
      });
    });
  });
});
