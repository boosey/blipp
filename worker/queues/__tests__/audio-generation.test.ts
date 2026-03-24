import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleAudioGeneration } from "../audio-generation";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/tts", () => ({
  generateSpeech: vi.fn().mockResolvedValue({
    audio: new ArrayBuffer(2048),
    usage: { model: "test-tts-model", inputTokens: 40, outputTokens: 0, cost: null },
  }),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn((params: any) => {
    if (params.type === "AUDIO_CLIP") return `wp/clip/${params.episodeId}/${params.durationTier}/${params.voice ?? "default"}.mp3`;
    if (params.type === "NARRATIVE") return `wp/narrative/${params.episodeId}/${params.durationTier}.txt`;
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
}));

vi.mock("../../lib/model-resolution", () => ({
  resolveStageModel: vi.fn().mockResolvedValue({
    provider: "openai",
    model: "gpt-4o-mini-tts",
    providerModelId: "gpt-4o-mini-tts",
    pricing: { pricePerMinute: 0.015 },
  }),
  resolveModelChain: vi.fn().mockResolvedValue([{
    provider: "openai",
    model: "gpt-4o-mini-tts",
    providerModelId: "gpt-4o-mini-tts",
    pricing: { pricePerMinute: 0.015 },
    limits: null,
  }]),
}));

vi.mock("../../lib/tts-providers", () => ({
  getTtsProviderImpl: vi.fn().mockReturnValue({ name: "MockTTS", provider: "openai" }),
}));

vi.mock("../../lib/pipeline-events", () => ({
  writeEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../../lib/voice-presets", () => ({
  loadPresetConfig: vi.fn().mockResolvedValue(null),
  extractProviderConfig: vi.fn().mockReturnValue({}),
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
import { generateSpeech } from "../../lib/tts";
import { putWorkProduct, getWorkProduct } from "../../lib/work-products";
import { resolveStageModel, resolveModelChain } from "../../lib/model-resolution";
import { writeAiError } from "../../lib/ai-errors";
import { loadPresetConfig, extractProviderConfig } from "../../lib/voice-presets";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

const JOB = {
  id: "job-1",
  requestId: "req-1",
  episodeId: "ep-1",
  durationTier: 5,
  status: "PENDING",
  currentStage: "AUDIO_GENERATION",
};

const STEP = { id: "step-1", jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);

  // Re-set mocks after clearAllMocks (vitest v4 clears mockResolvedValue)
  (getConfig as any).mockResolvedValue(true);
  (resolveStageModel as any).mockResolvedValue({
    provider: "openai",
    model: "gpt-4o-mini-tts",
    providerModelId: "gpt-4o-mini-tts",
    pricing: { pricePerMinute: 0.015 },
  });
  (resolveModelChain as any).mockResolvedValue([{
    provider: "openai",
    model: "gpt-4o-mini-tts",
    providerModelId: "gpt-4o-mini-tts",
    pricing: { pricePerMinute: 0.015 },
    limits: null,
  }]);
  (generateSpeech as any).mockResolvedValue({
    audio: new ArrayBuffer(2048),
    usage: { model: "test-tts-model", inputTokens: 40, outputTokens: 0, cost: null },
  });
  (putWorkProduct as any).mockResolvedValue(undefined);
  (getWorkProduct as any).mockResolvedValue(new TextEncoder().encode("A warm narrative about technology trends.").buffer);

  // Safety mocks for error handler (.catch() chains need thenables)
  mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.clip.upsert.mockResolvedValue({});
  mockPrisma.clip.create.mockResolvedValue({ id: "clip-new" });
  mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });
  mockPrisma.pipelineEvent.create.mockResolvedValue({});
  mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp-1" });
  mockPrisma.distillation.findFirst.mockResolvedValue({ id: "dist-1" });

  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());

  // Default mocks for job and step creation
  mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue(JOB);
  mockPrisma.pipelineStep.create.mockResolvedValue(STEP);
  mockPrisma.pipelineStep.update.mockResolvedValue(STEP);

  // R2 head returns null by default (no cache hit)
  (mockEnv.R2.head as any).mockResolvedValue(null);

  // clip lookups return null by default (no cached clip)
  mockPrisma.clip.findUnique.mockResolvedValue(null);
  mockPrisma.clip.findFirst.mockResolvedValue(null);

  // Voice presets: no preset by default
  (loadPresetConfig as any).mockResolvedValue(null);
  (extractProviderConfig as any).mockReturnValue({});
});

function makeBatch(body: any) {
  const mockMsg = { body, ack: vi.fn(), retry: vi.fn() };
  const mockBatch = {
    messages: [mockMsg],
    queue: "audio-generation",
  } as unknown as MessageBatch<any>;
  return { mockMsg, mockBatch };
}

describe("handleAudioGeneration", () => {
  const msgBody = {
    jobId: "job-1",
    episodeId: "ep-1",
    durationTier: 5,
  };

  it("creates PipelineStep on processing", async () => {
    mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        stage: "AUDIO_GENERATION",
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
      }),
    });
  });

  it("cache hit — step SKIPPED when completed clip + R2 audio exist", async () => {
    // R2 head returns object (audio exists in R2)
    (mockEnv.R2.head as any).mockResolvedValue({ size: 2048 });
    // Clip exists and is COMPLETED
    mockPrisma.clip.findFirst.mockResolvedValue({
      id: "clip-cached",
      episodeId: "ep-1",
      durationTier: 5,
      status: "COMPLETED",
      audioKey: "wp/clip/ep-1/5/default.mp3",
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

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

    // No TTS generation
    expect(generateSpeech).not.toHaveBeenCalled();

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

  it("full flow: load narrative from R2 -> TTS -> R2 -> clip update as COMPLETED", async () => {
    // findFirst returns existing clip for update path
    mockPrisma.clip.findFirst.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
      status: "PENDING",
    });
    mockPrisma.clip.update.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
      status: "COMPLETED",
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    // Narrative loaded from R2 via getWorkProduct
    expect(getWorkProduct).toHaveBeenCalled();

    // TTS generated
    expect(generateSpeech).toHaveBeenCalled();

    // Clip created or updated as COMPLETED with audioKey
    const clipCallArgs = mockPrisma.clip.create.mock.calls[0]?.[0] ?? mockPrisma.clip.update.mock.calls[0]?.[0];
    expect(clipCallArgs).toBeDefined();
    expect(clipCallArgs.data).toMatchObject({
      status: "COMPLETED",
      audioKey: expect.stringContaining("wp/clip/"),
    });

    // Audio written to R2
    expect(putWorkProduct).toHaveBeenCalledTimes(1);

    // WorkProduct upserted in DB
    expect(mockPrisma.workProduct.upsert).toHaveBeenCalled();

    // Step marked COMPLETED with TTS model/usage
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
        model: "test-tts-model",
        inputTokens: 40,
        outputTokens: 0,
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
    mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
    mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        action: "job-stage-complete",
        jobId: "job-1",
      })
    );
  });

  it("reads TTS model via resolveModelChain", async () => {
    mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
    mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });
    mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    expect(resolveModelChain).toHaveBeenCalledWith(expect.anything(), "tts");
    expect(generateSpeech).toHaveBeenCalled();
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage is disabled", async () => {
      (getConfig as any)
        .mockResolvedValueOnce(true)   // pipeline.enabled
        .mockResolvedValueOnce(false); // stage enabled

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateSpeech).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: "AUDIO_GENERATION" });
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

      const manualBody = { ...msgBody, type: "manual" as const };
      const { mockMsg, mockBatch } = makeBatch(manualBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateSpeech).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("marks step FAILED, notifies orchestrator, and acks on TTS error", async () => {
      (generateSpeech as any).mockRejectedValueOnce(new Error("TTS API error"));

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "TTS API error",
        }),
      });

      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          action: "job-failed",
          jobId: "job-1",
          errorMessage: "TTS API error",
        })
      );
      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockMsg.retry).not.toHaveBeenCalled();
    });

    it("throws if no narrative found in R2", async () => {
      (getWorkProduct as any).mockResolvedValueOnce(null);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

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
      mockPrisma.pipelineStep.findFirst.mockResolvedValue({ id: "step-1" });
      mockPrisma.aiServiceError.create.mockResolvedValue({});

      (generateSpeech as any).mockRejectedValueOnce(
        new AiProviderError({
          message: "OpenAI TTS quota exceeded",
          provider: "openai",
          model: "gpt-4o-mini-tts",
          httpStatus: 402,
          rawResponse: '{"error":"insufficient_quota"}',
          requestDurationMs: 300,
        })
      );

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "OpenAI TTS quota exceeded",
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
          errorMessage: "OpenAI TTS quota exceeded",
        })
      );

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockMsg.retry).not.toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs batch_start", async () => {
      // Cache hit path for simplicity
      (mockEnv.R2.head as any).mockResolvedValue({ size: 2048 });
      mockPrisma.clip.findFirst.mockResolvedValue({
        id: "clip-1",
        status: "COMPLETED",
        audioKey: "clips/ep-1/5.mp3",
      });

      const { mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs audio_completed on success", async () => {
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

      const { mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("audio_completed", {
        episodeId: "ep-1",
        durationTier: 5,
        audioKey: expect.stringContaining("wp/clip/"),
      });
    });
  });

  describe("model chain fallback", () => {
    it("falls back to secondary model when primary fails", async () => {
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

      // Chain: primary (fails) -> secondary (succeeds)
      (resolveModelChain as any).mockResolvedValue([
        { provider: "openai", model: "gpt-4o-mini-tts", providerModelId: "gpt-4o-mini-tts", pricing: null, limits: null },
        { provider: "elevenlabs", model: "eleven-v2", providerModelId: "eleven_multilingual_v2", pricing: null, limits: null },
      ]);

      // First call fails, second succeeds
      (generateSpeech as any)
        .mockRejectedValueOnce(new Error("OpenAI 500: Internal Server Error"))
        .mockResolvedValueOnce({
          audio: new ArrayBuffer(4096),
          usage: { model: "eleven-v2", inputTokens: 40, outputTokens: 0, cost: null },
        });

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      // Provider was called twice (primary failed, secondary succeeded)
      expect(generateSpeech).toHaveBeenCalledTimes(2);
      // Audio written to R2
      expect(putWorkProduct).toHaveBeenCalledTimes(1);
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
        { provider: "openai", model: "gpt-4o-mini-tts", providerModelId: "gpt-4o-mini-tts", pricing: null, limits: null },
        { provider: "elevenlabs", model: "eleven-v2", providerModelId: "eleven_multilingual_v2", pricing: null, limits: null },
      ]);

      (generateSpeech as any)
        .mockRejectedValueOnce(new Error("OpenAI 500"))
        .mockRejectedValueOnce(new Error("ElevenLabs 500"));

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(generateSpeech).toHaveBeenCalledTimes(2);
      // Step marked FAILED with last error
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("ElevenLabs 500"),
        }),
      });
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("throws when model chain is empty", async () => {
      (resolveModelChain as any).mockResolvedValue([]);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("No TTS model configured"),
        }),
      });
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });

  describe("voice preset resolution", () => {
    it("passes voicePresetId through message body", async () => {
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });
      (loadPresetConfig as any).mockResolvedValue({
        openai: { voice: "nova", instructions: "Speak quickly", speed: 1.2 },
      });
      (extractProviderConfig as any).mockReturnValue({
        voice: "nova",
        instructions: "Speak quickly",
        speed: 1.2,
      });

      const bodyWithPreset = { ...msgBody, voicePresetId: "preset-1" };
      const { mockMsg, mockBatch } = makeBatch(bodyWithPreset);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(loadPresetConfig).toHaveBeenCalledWith(expect.anything(), "preset-1");
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("passes preset voice to generateSpeech when preset has openai config", async () => {
      mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });
      (loadPresetConfig as any).mockResolvedValue({
        openai: { voice: "nova", instructions: "Professional tone" },
      });
      (extractProviderConfig as any).mockReturnValue({
        voice: "nova",
        instructions: "Professional tone",
      });

      const bodyWithPreset = { ...msgBody, voicePresetId: "preset-1" };
      const { mockMsg, mockBatch } = makeBatch(bodyWithPreset);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      // generateSpeech receives voice from preset as 3rd arg, instructions as 7th
      expect(generateSpeech).toHaveBeenCalledWith(
        expect.anything(),    // tts provider
        expect.any(String),   // narrative text
        "nova",               // voice from preset
        expect.any(String),   // providerModelId
        expect.anything(),    // env
        expect.anything(),    // pricing
        "Professional tone",  // instructions from preset
        undefined             // speed
      );
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("uses default voice when no voicePresetId in message", async () => {
      mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      // extractProviderConfig returns {} by default (no preset), so voice is undefined
      expect(generateSpeech).toHaveBeenCalled();
      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("falls back to default voice when preset not found", async () => {
      mockPrisma.clip.findFirst.mockResolvedValue({ id: "clip-1", status: "PENDING" });
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });
      (loadPresetConfig as any).mockResolvedValue(null);

      const bodyWithPreset = { ...msgBody, voicePresetId: "nonexistent" };
      const { mockMsg, mockBatch } = makeBatch(bodyWithPreset);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(generateSpeech).toHaveBeenCalled();
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });
});
