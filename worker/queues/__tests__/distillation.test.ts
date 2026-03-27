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
  logDbError: vi.fn(() => () => {}),
}));

vi.mock("../../lib/distillation", () => ({
  extractClaims: vi.fn().mockResolvedValue({
    claims: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "Verbatim excerpt from the transcript." }],
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  }),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn().mockReturnValue("wp/claims/ep-1.json"),
  putWorkProduct: vi.fn().mockResolvedValue(undefined),
  getWorkProduct: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/model-resolution", () => ({
  resolveStageModel: vi.fn().mockResolvedValue({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerModelId: "claude-sonnet-4-20250514",
    pricing: { priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
  }),
  resolveModelChain: vi.fn().mockResolvedValue([{
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerModelId: "claude-sonnet-4-20250514",
    pricing: { priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
    limits: null,
  }]),
}));

vi.mock("../../lib/llm-providers", () => ({
  getLlmProviderImpl: vi.fn().mockReturnValue({ name: "MockLLM", provider: "anthropic" }),
}));

vi.mock("../../lib/pipeline-events", () => ({
  writeEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../../lib/ai-errors", () => {
  class AiProviderError extends Error {
    readonly provider: string;
    readonly model: string;
    readonly httpStatus?: number;
    readonly rawResponse?: string;
    readonly requestDurationMs: number;
    readonly rateLimitRemaining?: number;
    readonly rateLimitResetAt?: Date;
    constructor(opts: any) {
      super(opts.message);
      this.name = "AiProviderError";
      this.provider = opts.provider;
      this.model = opts.model;
      this.httpStatus = opts.httpStatus;
      this.rawResponse = opts.rawResponse;
      this.requestDurationMs = opts.requestDurationMs;
      this.rateLimitRemaining = opts.rateLimitRemaining;
      this.rateLimitResetAt = opts.rateLimitResetAt;
    }
  }
  return {
    writeAiError: vi.fn().mockResolvedValue(undefined),
    classifyAiError: vi.fn().mockReturnValue({ category: "unknown", severity: "transient" }),
    AiProviderError,
  };
});

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { extractClaims } from "../../lib/distillation";
import { wpKey, putWorkProduct, getWorkProduct } from "../../lib/work-products";
import { resolveStageModel, resolveModelChain } from "../../lib/model-resolution";
import { writeAiError, classifyAiError } from "../../lib/ai-errors";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);

  // Re-set mocks after clearAllMocks
  (getConfig as any).mockResolvedValue(true);
  (resolveStageModel as any).mockResolvedValue({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerModelId: "claude-sonnet-4-20250514",
    pricing: { priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
  });
  (resolveModelChain as any).mockResolvedValue([{
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerModelId: "claude-sonnet-4-20250514",
    pricing: { priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
    limits: null,
  }]);
  (extractClaims as any).mockResolvedValue({
    claims: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "Verbatim excerpt from the transcript." }],
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  });
  (getWorkProduct as any).mockResolvedValue(new TextEncoder().encode("This is a transcript of the episode.").buffer);
  (putWorkProduct as any).mockResolvedValue(undefined);
  (wpKey as any).mockReturnValue("wp/claims/ep-1.json");

  // R2 head returns null by default (no cache hit)
  (mockEnv.R2.head as any).mockResolvedValue(null);

  // Safety mocks for error handler (.catch() chains need thenables)
  mockPrisma.pipelineStep.update.mockResolvedValue({});
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
  mockPrisma.pipelineEvent.create.mockResolvedValue({});
  mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp-1" });

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
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
    mockPrisma.distillation.update.mockResolvedValue({});

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

    // WorkProduct row upserted
    expect(mockPrisma.workProduct.upsert).toHaveBeenCalled();

    // Step marked COMPLETED
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
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

  it("cache hit marks step SKIPPED with cached: true when R2 has claims", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    // R2 head returns object (claims exist in R2)
    (mockEnv.R2.head as any).mockResolvedValue({ size: 500 });
    // Existing distillation record
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
    });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    // Step marked SKIPPED + cached
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-1" },
        data: expect.objectContaining({
          status: "SKIPPED",
          cached: true,
        }),
      })
    );

    // extractClaims NOT called
    expect(extractClaims).not.toHaveBeenCalled();

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
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
    mockPrisma.distillation.update.mockResolvedValue({});

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        action: "job-stage-complete",
        jobId: "job-1",
      })
    );
  });

  it("reports to orchestrator on cache hit", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
      id: "job-1",
      requestId: "req-1",
    });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    // R2 cache hit
    (mockEnv.R2.head as any).mockResolvedValue({ size: 500 });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
    });

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        action: "job-stage-complete",
        jobId: "job-1",
      })
    );
  });

  it("reads distillation model via resolveModelChain and passes to extractClaims", async () => {
    mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({ id: "job-1", requestId: "req-1" });
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
    mockPrisma.distillation.update.mockResolvedValue({});

    const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
    await handleDistillation(batch, mockEnv, mockCtx);

    expect(resolveModelChain).toHaveBeenCalledWith(expect.anything(), "distillation");
    expect(extractClaims).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(String), expect.any(String), 8192, expect.anything(), expect.anything());
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage is disabled", async () => {
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
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
      mockPrisma.distillation.update.mockResolvedValue({});

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1", type: "manual" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(extractClaims).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED, upserts distillation as FAILED, and notifies orchestrator", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.distillation.upsert.mockResolvedValue({});

      (extractClaims as any).mockRejectedValueOnce(new Error("API error"));

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      // Step marked FAILED (uses .update with .catch in error handler)
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

      // Orchestrator notified of failure
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          action: "job-failed",
          jobId: "job-1",
          errorMessage: "API error",
        })
      );
      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(batch.messages[0].retry).not.toHaveBeenCalled();
    });

    it("notifies orchestrator when no transcript is available in R2", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      // No transcript in R2
      (getWorkProduct as any).mockResolvedValueOnce(null);
      mockPrisma.distillation.upsert.mockResolvedValue({});

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "job-failed",
          jobId: "job-1",
        }),
      );
      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(batch.messages[0].retry).not.toHaveBeenCalled();
    });
  });

  describe("AiProviderError handling", () => {
    it("captures AI provider error via writeAiError and notifies orchestrator", async () => {
      const { AiProviderError } = await import("../../lib/ai-errors");
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.distillation.upsert.mockResolvedValue({});
      mockPrisma.aiServiceError.create.mockResolvedValue({});

      (extractClaims as any).mockRejectedValueOnce(
        new AiProviderError({
          message: "Claude API server error",
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          httpStatus: 500,
          rawResponse: '{"error":"internal_error"}',
          requestDurationMs: 2000,
        })
      );

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: "Claude API server error",
          }),
        })
      );

      // AI error captured via writeAiError
      expect(writeAiError).toHaveBeenCalled();

      // Orchestrator notified with job-failed
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          action: "job-failed",
          jobId: "job-1",
          errorMessage: "Claude API server error",
        })
      );

      // Transient error (500) → retry, not ack
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
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
      mockPrisma.distillation.update.mockResolvedValue({});

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
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
      mockPrisma.distillation.update.mockResolvedValue({});

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("claims_extracted", {
        episodeId: "ep-1",
        claimCount: 1,
        tier: "primary",
      });
    });

    it("logs episode_error on failure", async () => {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
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

  describe("model chain fallback", () => {
    function setupDistillBase() {
      mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({
        id: "job-1",
        requestId: "req-1",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
      mockPrisma.distillation.update.mockResolvedValue({});
    }

    it("falls back to secondary model when primary fails", async () => {
      setupDistillBase();

      // Chain: primary (fails) -> secondary (succeeds)
      (resolveModelChain as any).mockResolvedValue([
        { provider: "anthropic", model: "claude-sonnet-4-20250514", providerModelId: "claude-sonnet-4-20250514", pricing: null, limits: null },
        { provider: "openai", model: "gpt-4o", providerModelId: "gpt-4o", pricing: null, limits: null },
      ]);

      // First call fails, second succeeds
      (extractClaims as any)
        .mockRejectedValueOnce(new Error("Anthropic 500: Internal Server Error"))
        .mockResolvedValueOnce({
          claims: [{ claim: "Fallback claim", speaker: "Host", importance: 8, novelty: 6, excerpt: "Fallback excerpt." }],
          usage: { model: "gpt-4o", inputTokens: 120, outputTokens: 60, cost: null },
        });

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      // Provider was called twice (primary failed, secondary succeeded)
      expect(extractClaims).toHaveBeenCalledTimes(2);
      // Claims written to R2
      expect(putWorkProduct).toHaveBeenCalledWith(
        mockEnv.R2,
        "wp/claims/ep-1.json",
        expect.any(String),
      );
      // Step marked COMPLETED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(batch.messages[0].ack).toHaveBeenCalled();
    });

    it("fails when all models in chain fail", async () => {
      setupDistillBase();

      (resolveModelChain as any).mockResolvedValue([
        { provider: "anthropic", model: "claude-sonnet-4-20250514", providerModelId: "claude-sonnet-4-20250514", pricing: null, limits: null },
        { provider: "openai", model: "gpt-4o", providerModelId: "gpt-4o", pricing: null, limits: null },
      ]);

      (extractClaims as any)
        .mockRejectedValueOnce(new Error("Anthropic 500"))
        .mockRejectedValueOnce(new Error("OpenAI 500"));

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(extractClaims).toHaveBeenCalledTimes(2);
      // Step marked FAILED with last error
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: expect.stringContaining("OpenAI 500"),
          }),
        })
      );
      expect(batch.messages[0].ack).toHaveBeenCalled();
    });

    it("throws when model chain is empty", async () => {
      setupDistillBase();

      (resolveModelChain as any).mockResolvedValue([]);

      const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
      await handleDistillation(batch, mockEnv, mockCtx);

      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: expect.stringContaining("No distillation model configured"),
          }),
        })
      );
      expect(batch.messages[0].ack).toHaveBeenCalled();
    });
  });
});
