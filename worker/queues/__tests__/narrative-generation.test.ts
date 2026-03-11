import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleNarrativeGeneration } from "../narrative-generation";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/distillation", () => ({
  generateNarrative: vi.fn().mockResolvedValue({
    narrative: "A warm narrative about technology trends.",
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  }),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn((params: any) => `wp/${params.type.toLowerCase()}/${params.episodeId}/${params.durationTier}${params.voice ? `/${params.voice}` : ""}`),
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

vi.mock("@anthropic-ai/sdk", () => {
  return { default: class MockAnthropic {} };
});

vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" }),
}));

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { generateNarrative } from "../../lib/distillation";
import { putWorkProduct } from "../../lib/work-products";
import { getModelConfig } from "../../lib/ai-models";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

const JOB = {
  id: "job-1",
  requestId: "req-1",
  episodeId: "ep-1",
  durationTier: 5,
  status: "PENDING",
  currentStage: "NARRATIVE_GENERATION",
};

const STEP = { id: "step-1", jobId: "job-1", stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" };

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
  (getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
  (generateNarrative as any).mockResolvedValue({
    narrative: "A warm narrative about technology trends.",
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  });
  (putWorkProduct as any).mockResolvedValue(undefined);
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });
  mockPrisma.workProduct.findFirst.mockResolvedValue(null);
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
    queue: "narrative-generation",
  } as unknown as MessageBatch<any>;
  return { mockMsg, mockBatch };
}

describe("handleNarrativeGeneration", () => {
  const msgBody = {
    jobId: "job-1",
    episodeId: "ep-1",
    durationTier: 5,
  };

  it("creates PipelineStep on processing", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1", episodeId: "ep-1", durationTier: 5 });

    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        stage: "NARRATIVE_GENERATION",
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
      }),
    });
  });

  it("cache hit — step SKIPPED when NARRATIVE work product exists", async () => {
    mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-cached", type: "NARRATIVE" });
    mockPrisma.clip.findUnique.mockResolvedValue({
      id: "clip-cached",
      episodeId: "ep-1",
      durationTier: 5,
      narrativeText: "cached narrative",
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    // Work product lookup for existing NARRATIVE
    expect(mockPrisma.workProduct.findFirst).toHaveBeenCalledWith({
      where: { type: "NARRATIVE", episodeId: "ep-1", durationTier: 5 },
    });

    // Step marked SKIPPED with cached: true and workProductId
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "SKIPPED",
        cached: true,
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
        workProductId: "wp-cached",
      }),
    });

    // No narrative generation called
    expect(generateNarrative).not.toHaveBeenCalled();

    // Orchestrator notified
    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("full flow: claims lookup -> narrative generation -> clip upsert -> work product", async () => {
    mockPrisma.workProduct.findFirst.mockResolvedValue(null);
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    // Distillation claims loaded from DB
    expect(mockPrisma.distillation.findFirst).toHaveBeenCalledWith({
      where: { episodeId: "ep-1", status: "COMPLETED" },
    });

    // Narrative generated with model from config
    expect(generateNarrative).toHaveBeenCalledWith(
      expect.anything(),
      DISTILLATION.claimsJson,
      5,
      "claude-sonnet-4-20250514"
    );

    // Clip upserted with narrative but NOT as COMPLETED (audio gen does that)
    expect(mockPrisma.clip.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          narrativeText: "A warm narrative about technology trends.",
          wordCount: 6,
        }),
        create: expect.objectContaining({
          narrativeText: "A warm narrative about technology trends.",
          wordCount: 6,
          durationTier: 5,
        }),
      })
    );

    // NARRATIVE work product created (R2 + DB)
    expect(putWorkProduct).toHaveBeenCalledTimes(1);
    expect(putWorkProduct).toHaveBeenCalledWith(mockEnv.R2, expect.stringContaining("narrative"), "A warm narrative about technology trends.");

    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "NARRATIVE",
        episodeId: "ep-1",
        durationTier: 5,
        sizeBytes: expect.any(Number),
        metadata: { wordCount: 6 },
      }),
    });

    // Step marked COMPLETED with only narrative model/usage
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
        workProductId: "wp-1",
        model: "test-model",
        inputTokens: 100,
        outputTokens: 50,
      }),
    });

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("reports to orchestrator on completion", async () => {
    mockPrisma.workProduct.findFirst.mockResolvedValue(null);
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });
  });

  it("reads narrative model from config", async () => {
    (getModelConfig as any).mockResolvedValueOnce({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });

    mockPrisma.workProduct.findFirst.mockResolvedValue(null);
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
    mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "narrative");
    expect(generateNarrative).toHaveBeenCalledWith(expect.anything(), expect.anything(), 5, "claude-haiku-4-5-20251001");
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 4 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: "NARRATIVE_GENERATION" });
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.workProduct.findFirst.mockResolvedValue(null);
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

      const manualBody = { ...msgBody, type: "manual" as const };
      const { mockMsg, mockBatch } = makeBatch(manualBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED and retries on error", async () => {
      mockPrisma.workProduct.findFirst.mockResolvedValue(null);
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      (generateNarrative as any).mockRejectedValueOnce(new Error("Claude API error"));
      mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 1 });

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Claude API error",
        }),
      });

      expect(mockMsg.retry).toHaveBeenCalled();
      expect(mockMsg.ack).not.toHaveBeenCalled();
    });

    it("throws if no completed distillation found", async () => {
      mockPrisma.workProduct.findFirst.mockResolvedValue(null);
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(null);
      mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 1 });

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

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
      mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-1", type: "NARRATIVE" });
      mockPrisma.clip.findUnique.mockResolvedValue({
        id: "clip-1",
        narrativeText: "cached",
      });

      const { mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs narrative_generated on success", async () => {
      mockPrisma.workProduct.findFirst.mockResolvedValue(null);
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
      mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

      const { mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("narrative_generated", {
        episodeId: "ep-1",
        wordCount: 6,
      });
    });
  });
});
