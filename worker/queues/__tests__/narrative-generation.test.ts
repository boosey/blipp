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
  selectClaimsForDuration: vi.fn().mockImplementation((claims: any[]) => claims),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn((params: any) => {
    if (params.type === "NARRATIVE") return `wp/narrative/${params.episodeId}/${params.durationTier}.txt`;
    if (params.type === "CLAIMS") return `wp/claims/${params.episodeId}.json`;
    return `wp/${params.type.toLowerCase()}/${params.episodeId}`;
  }),
  putWorkProduct: vi.fn().mockResolvedValue(undefined),
  getWorkProduct: vi.fn().mockResolvedValue(null),
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
  initCircuitBreakerConfig: vi.fn().mockResolvedValue(undefined),
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
import { generateNarrative, selectClaimsForDuration } from "../../lib/distillation";
import { putWorkProduct, getWorkProduct } from "../../lib/work-products";
import { resolveStageModel, resolveModelChain } from "../../lib/model-resolution";
import { writeAiError } from "../../lib/ai-errors";

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

const CLAIMS = [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "Here is the verbatim excerpt for this claim." }];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  // Cancellation guard: default to non-cancelled request so happy-path tests proceed
  mockPrisma.briefingRequest.findUnique.mockResolvedValue({ status: "PROCESSING" });

  // Re-set mocks after clearAllMocks (vitest v4 clears mockResolvedValue)
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
  (generateNarrative as any).mockResolvedValue({
    narrative: "A warm narrative about technology trends.",
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  });
  (putWorkProduct as any).mockResolvedValue(undefined);
  (selectClaimsForDuration as any).mockImplementation((claims: any[]) => claims);
  // Claims from R2 (default: return claims JSON)
  (getWorkProduct as any).mockResolvedValue(new TextEncoder().encode(JSON.stringify(CLAIMS)).buffer);

  // R2 head returns null (no cache hit)
  (mockEnv.R2.head as any).mockResolvedValue(null);

  mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp-1" });
  mockPrisma.pipelineEvent.create.mockResolvedValue({});
  mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 0 });

  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());

  // Default mocks for job and step creation
  mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue(JOB);
  mockPrisma.pipelineStep.create.mockResolvedValue(STEP);
  mockPrisma.pipelineStep.update.mockResolvedValue(STEP);

  // Episode metadata for narrative intro
  mockPrisma.episode.findUnique.mockResolvedValue({
    title: "Test Episode",
    publishedAt: new Date("2026-03-12"),
    durationSeconds: 1800,
    podcast: { title: "Test Podcast" },
  });

  // Clip lookups for voice-preset-aware findFirst + create/update
  mockPrisma.clip.findFirst.mockResolvedValue(null);
  mockPrisma.clip.create.mockResolvedValue({ id: "clip-1" });
  mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

  // Distillation record for clip upsert
  mockPrisma.distillation.findUnique.mockResolvedValue({ id: "dist-1", episodeId: "ep-1" });
  mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1", episodeId: "ep-1", durationTier: 5 });
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

  it("cache hit — step SKIPPED when NARRATIVE exists in R2", async () => {
    // R2 head returns object (narrative exists)
    (mockEnv.R2.head as any).mockResolvedValue({ size: 500 });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

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

    // No narrative generation called
    expect(generateNarrative).not.toHaveBeenCalled();

    // Orchestrator notified
    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        action: "job-stage-complete",
        jobId: "job-1",
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("full flow: claims from R2 -> narrative generation -> clip upsert -> work product", async () => {
    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    // Claims loaded from R2 via getWorkProduct
    expect(getWorkProduct).toHaveBeenCalled();

    // Narrative generated with model from config + episode metadata
    expect(generateNarrative).toHaveBeenCalledWith(
      expect.anything(), // prisma
      expect.anything(), // llm
      CLAIMS,
      5,
      expect.any(String),
      8192,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        podcastTitle: "Test Podcast",
        episodeTitle: "Test Episode",
        briefingMinutes: 5,
      })
    );

    // Clip created or updated (narrative content lives in R2 only)
    const clipCall = mockPrisma.clip.create.mock.calls[0]?.[0] ?? mockPrisma.clip.update.mock.calls[0]?.[0];
    expect(clipCall).toBeDefined();
    expect(clipCall.data).toMatchObject(
      expect.objectContaining({
        wordCount: 6,
      })
    );

    // NARRATIVE work product written to R2
    expect(putWorkProduct).toHaveBeenCalledTimes(1);
    expect(putWorkProduct).toHaveBeenCalledWith(mockEnv.R2, expect.stringContaining("narrative"), "A warm narrative about technology trends.");

    // WorkProduct upserted in DB
    expect(mockPrisma.workProduct.upsert).toHaveBeenCalled();

    // Step marked COMPLETED with narrative model/usage
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
        model: "test-model",
        inputTokens: 100,
        outputTokens: 50,
      }),
    });

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("reports to orchestrator on completion", async () => {
    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        action: "job-stage-complete",
        jobId: "job-1",
      })
    );
  });

  it("calls selectClaimsForDuration before generating narrative", async () => {
    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(selectClaimsForDuration).toHaveBeenCalledWith(
      CLAIMS,
      5 // durationTier from msgBody
    );
  });

  it("skips selectClaimsForDuration for legacy claims without excerpts", async () => {
    const legacyClaims = [{ claim: "Old claim", speaker: "Host", importance: 9, novelty: 7 }];
    (getWorkProduct as any).mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(legacyClaims)).buffer);

    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(selectClaimsForDuration).not.toHaveBeenCalled();
    // All claims passed directly to generateNarrative
    expect(generateNarrative).toHaveBeenCalledWith(
      expect.anything(), // prisma
      expect.anything(), // llm
      legacyClaims,
      5,
      expect.any(String),
      8192,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it("reads narrative model via resolveModelChain", async () => {
    const { mockBatch } = makeBatch(msgBody);
    await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

    expect(resolveModelChain).toHaveBeenCalledWith(expect.anything(), "narrative");
    expect(generateNarrative).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 5, expect.any(String), 8192, expect.anything(), expect.anything(), expect.anything());
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage is disabled", async () => {
      (getConfig as any)
        .mockResolvedValueOnce(true)   // pipeline.enabled
        .mockResolvedValueOnce(false); // stage enabled

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: "NARRATIVE_GENERATION" });
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      const manualBody = { ...msgBody, type: "manual" as const };
      const { mockMsg, mockBatch } = makeBatch(manualBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED, notifies orchestrator, and acks on error", async () => {
      (generateNarrative as any).mockRejectedValueOnce(new Error("Claude API error"));

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

      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          action: "job-failed",
          jobId: "job-1",
          errorMessage: "Claude API error",
        })
      );
      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockMsg.retry).not.toHaveBeenCalled();
    });

    it("notifies orchestrator when no claims found in R2", async () => {
      (getWorkProduct as any).mockResolvedValueOnce(null);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "episode_error",
        { episodeId: "ep-1", durationTier: 5 },
        expect.any(Error)
      );
    });
  });

  describe("AiProviderError handling", () => {
    it("captures AI provider error via writeAiError and notifies orchestrator", async () => {
      const { AiProviderError } = await import("../../lib/ai-errors");

      (generateNarrative as any).mockRejectedValueOnce(
        new AiProviderError({
          message: "Anthropic rate limit exceeded",
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          httpStatus: 429,
          rawResponse: '{"error":"rate_limit_error"}',
          requestDurationMs: 150,
        })
      );

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Anthropic rate limit exceeded",
        }),
      });

      // AI error captured via writeAiError
      expect(writeAiError).toHaveBeenCalled();

      // Orchestrator notified with job-failed
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          action: "job-failed",
          jobId: "job-1",
          errorMessage: "Anthropic rate limit exceeded",
        })
      );

      // Transient error (rate limit) → retry, not ack
      expect(mockMsg.retry).toHaveBeenCalled();
      expect(mockMsg.ack).not.toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs batch_start", async () => {
      // Cache hit path for simplicity
      (mockEnv.R2.head as any).mockResolvedValue({ size: 500 });

      const { mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs narrative_generated on success", async () => {
      const { mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("narrative_generated", {
        episodeId: "ep-1",
        wordCount: 6,
        tier: "primary",
      });
    });
  });

  describe("model chain fallback", () => {
    it("falls back to secondary model when primary fails", async () => {
      // Chain: primary (fails) -> secondary (succeeds)
      (resolveModelChain as any).mockResolvedValue([
        { provider: "anthropic", model: "claude-sonnet-4-20250514", providerModelId: "claude-sonnet-4-20250514", pricing: null, limits: null },
        { provider: "openai", model: "gpt-4o", providerModelId: "gpt-4o", pricing: null, limits: null },
      ]);

      // First call fails, second succeeds
      (generateNarrative as any)
        .mockRejectedValueOnce(new Error("Anthropic 500: Internal Server Error"))
        .mockResolvedValueOnce({
          narrative: "Fallback narrative about technology.",
          usage: { model: "gpt-4o", inputTokens: 120, outputTokens: 60, cost: null },
        });

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      // Provider was called twice (primary failed, secondary succeeded)
      expect(generateNarrative).toHaveBeenCalledTimes(2);
      // Narrative written to R2
      expect(putWorkProduct).toHaveBeenCalledWith(
        mockEnv.R2,
        expect.stringContaining("narrative"),
        "Fallback narrative about technology.",
      );
      // Step marked COMPLETED
      expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "step-1" },
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("fails when all models in chain fail", async () => {
      (resolveModelChain as any).mockResolvedValue([
        { provider: "anthropic", model: "claude-sonnet-4-20250514", providerModelId: "claude-sonnet-4-20250514", pricing: null, limits: null },
        { provider: "openai", model: "gpt-4o", providerModelId: "gpt-4o", pricing: null, limits: null },
      ]);

      (generateNarrative as any)
        .mockRejectedValueOnce(new Error("Anthropic 500"))
        .mockRejectedValueOnce(new Error("OpenAI 500"));

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(generateNarrative).toHaveBeenCalledTimes(2);
      // Step marked FAILED with last error
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("OpenAI 500"),
        }),
      });
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("throws when model chain is empty", async () => {
      (resolveModelChain as any).mockResolvedValue([]);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("No narrative model configured"),
        }),
      });
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });
});
