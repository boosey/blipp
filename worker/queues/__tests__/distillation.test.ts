import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleDistillation } from "../distillation";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
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

vi.mock("../../lib/distillation", () => ({
  extractClaims: vi.fn().mockResolvedValue([
    { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7 },
  ]),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn().mockReturnValue("wp/claims/ep-1.json"),
  putWorkProduct: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return { default: class MockAnthropic {} };
});

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { extractClaims } from "../../lib/distillation";
import { wpKey, putWorkProduct } from "../../lib/work-products";
import { getModelConfig } from "../../lib/ai-models";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  // Re-set getConfig default after clearAllMocks
  (getConfig as any).mockResolvedValue(true);
  (getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
  (extractClaims as any).mockResolvedValue([
    { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7 },
  ]);
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());
});

function makeBatch(messages: any[]) {
  return {
    messages: messages.map((body) => ({
      body,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
    queue: "distillation",
  } as unknown as MessageBatch<any>;
}

describe("handleDistillation", () => {
  it("creates PipelineStep and extracts claims when not cached", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "TRANSCRIPT_READY",
      transcript: "This is a transcript of the episode.",
    });
    mockPrisma.distillation.update.mockResolvedValue({});
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    // PipelineStep created
    expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        stage: "DISTILLATION",
        status: "IN_PROGRESS",
      }),
    });

    // Claims extracted
    expect(extractClaims).toHaveBeenCalled();

    // WorkProduct written to R2
    expect(wpKey).toHaveBeenCalledWith({ type: "CLAIMS", episodeId: "ep-1" });
    expect(putWorkProduct).toHaveBeenCalledWith(
      mockEnv.R2,
      "wp/claims/ep-1.json",
      expect.any(String)
    );

    // WorkProduct row created
    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "CLAIMS",
        episodeId: "ep-1",
        r2Key: "wp/claims/ep-1.json",
        metadata: { claimCount: 1 },
      }),
    });

    // Step marked COMPLETED with workProductId
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-1" },
        data: expect.objectContaining({ status: "COMPLETED", workProductId: "wp-1" }),
      })
    );

    // Job updated with distillationId
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: { distillationId: "dist-1" },
      })
    );

    // Message acked
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it("cache hit marks step SKIPPED with cached: true and links existing WorkProduct", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
      claimsJson: [{ claim: "cached" }],
    });
    mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-existing" });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    // WorkProduct lookup for existing claims
    expect(mockPrisma.workProduct.findFirst).toHaveBeenCalledWith({
      where: { type: "CLAIMS", episodeId: "ep-1" },
    });

    // Step marked SKIPPED + cached + workProductId linked
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-1" },
        data: expect.objectContaining({
          status: "SKIPPED",
          cached: true,
          workProductId: "wp-existing",
        }),
      })
    );

    // extractClaims NOT called
    expect(extractClaims).not.toHaveBeenCalled();

    // No new WorkProduct created
    expect(mockPrisma.workProduct.create).not.toHaveBeenCalled();

    // Job updated with distillationId
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: { distillationId: "dist-1" },
      })
    );

    // Message acked
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it("reports to orchestrator on completion", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "TRANSCRIPT_READY",
      transcript: "Some transcript",
    });
    mockPrisma.distillation.update.mockResolvedValue({});
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });
  });

  it("reports to orchestrator on cache hit", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
    });
    mockPrisma.workProduct.findFirst.mockResolvedValue(null);

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req-1",
      action: "job-stage-complete",
      jobId: "job-1",
    });
  });

  it("reads distillation model from config and passes to extractClaims", async () => {
    (getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });

    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({ id: "job-1", requestId: "req-1" });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1", episodeId: "ep-1", status: "TRANSCRIPT_READY", transcript: "Some transcript",
    });
    mockPrisma.distillation.update.mockResolvedValue({});
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "distillation");
    expect(extractClaims).toHaveBeenCalledWith(expect.anything(), "Some transcript", "claude-haiku-4-5-20251001");
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 3 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(extractClaims).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "This is a transcript.",
      });
      mockPrisma.distillation.update.mockResolvedValue({});
      mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1", type: "manual" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(extractClaims).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED, upserts distillation as FAILED, and retries", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "Some transcript",
      });
      mockPrisma.distillation.update.mockResolvedValue({});
      mockPrisma.distillation.upsert.mockResolvedValue({});

      (extractClaims as any).mockRejectedValueOnce(new Error("API error"));

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: "API error",
          }),
        })
      );

      // Distillation upserted as FAILED
      expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
        where: { episodeId: "ep-1" },
        update: { status: "FAILED", errorMessage: "API error" },
        create: { episodeId: "ep-1", status: "FAILED", errorMessage: "API error" },
      });

      // Message retried
      expect(batch.messages[0].retry).toHaveBeenCalled();
      expect(batch.messages[0].ack).not.toHaveBeenCalled();
    });

    it("retries when no transcript is available", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "PENDING",
        transcript: null,
      });
      mockPrisma.distillation.upsert.mockResolvedValue({});

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(batch.messages[0].retry).toHaveBeenCalled();
      expect(batch.messages[0].ack).not.toHaveBeenCalled();
    });
  });

  describe("structured logging", () => {
    it("logs batch_start", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "Some transcript",
      });
      mockPrisma.distillation.update.mockResolvedValue({});
      mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs claims_extracted on success", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "This is a transcript.",
      });
      mockPrisma.distillation.update.mockResolvedValue({});
      mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("claims_extracted", {
        episodeId: "ep-1",
        claimCount: 1,
      });
    });

    it("logs episode_error on failure", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "Some transcript",
      });
      mockPrisma.distillation.update.mockResolvedValue({});
      mockPrisma.distillation.upsert.mockResolvedValue({});

      (extractClaims as any).mockRejectedValueOnce(new Error("API error"));

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "episode_error",
        { episodeId: "ep-1", jobId: "job-1" },
        expect.any(Error)
      );
    });
  });
});
