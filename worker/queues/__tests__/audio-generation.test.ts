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

vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "openai", model: "gpt-4o-mini-tts" }),
}));

vi.mock("../../lib/ai-usage", () => ({
  getModelPricing: vi.fn().mockResolvedValue({ pricePerMinute: 0.015 }),
}));

vi.mock("../../lib/tts-providers", () => ({
  getTtsProviderImpl: vi.fn().mockReturnValue({ name: "MockTTS", provider: "openai" }),
}));

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { generateSpeech } from "../../lib/tts";
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
  currentStage: "AUDIO_GENERATION",
};

const STEP = { id: "step-1", jobId: "job-1", stage: "AUDIO_GENERATION", status: "IN_PROGRESS" };

const CLIP_WITH_NARRATIVE = {
  id: "clip-1",
  episodeId: "ep-1",
  durationTier: 5,
  narrativeText: "A warm narrative about technology trends.",
  wordCount: 6,
  status: "GENERATING_AUDIO",
  distillationId: "dist-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);

  // Re-set mocks after clearAllMocks (vitest v4 clears mockResolvedValue)
  (getConfig as any).mockResolvedValue(true);
  (getModelConfig as any).mockResolvedValue({ provider: "openai", model: "gpt-4o-mini-tts" });
  (generateSpeech as any).mockResolvedValue({
    audio: new ArrayBuffer(2048),
    usage: { model: "test-tts-model", inputTokens: 40, outputTokens: 0, cost: null },
  });
  mockPrisma.aiModelProvider.findFirst.mockResolvedValue({ providerModelId: "gpt-4o-mini-tts" });
  (putWorkProduct as any).mockResolvedValue(undefined);
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });
  mockPrisma.workProduct.findFirst.mockResolvedValue(null);
  // Safety mocks for error handler (.catch() chains need thenables)
  mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.clip.upsert.mockResolvedValue({});
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
    mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
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

  it("cache hit — step SKIPPED when completed clip + AUDIO_CLIP work product exist", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue({
      id: "clip-cached",
      episodeId: "ep-1",
      durationTier: 5,
      status: "COMPLETED",
      audioKey: "clips/ep-1/5.mp3",
    });
    mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-cached" });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    // Work product lookup for existing AUDIO_CLIP
    expect(mockPrisma.workProduct.findFirst).toHaveBeenCalledWith({
      where: { type: "AUDIO_CLIP", episodeId: "ep-1", durationTier: 5 },
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

  it("full flow: load narrative -> TTS -> R2 -> clip update as COMPLETED", async () => {
    mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
    mockPrisma.clip.update.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
      status: "COMPLETED",
    });

    const { mockMsg, mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    // TTS generated with model from config
    expect(generateSpeech).toHaveBeenCalledWith(
      expect.anything(),
      "A warm narrative about technology trends.",
      undefined,
      expect.any(String),
      expect.anything(),
      expect.anything()
    );

    // Clip updated as COMPLETED with audioKey (now uses wpKey format)
    expect(mockPrisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { episodeId_durationTier: { episodeId: "ep-1", durationTier: 5 } },
        data: expect.objectContaining({
          status: "COMPLETED",
          audioKey: "wp/audio_clip/ep-1/5/default",
        }),
      })
    );

    // AUDIO_CLIP work product created (R2 + DB)
    expect(putWorkProduct).toHaveBeenCalledTimes(1);
    expect(putWorkProduct).toHaveBeenCalledWith(mockEnv.R2, expect.stringContaining("audio_clip"), expect.any(ArrayBuffer));

    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "AUDIO_CLIP",
        episodeId: "ep-1",
        durationTier: 5,
        voice: "default",
        sizeBytes: 2048,
      }),
    });

    // Step marked COMPLETED with TTS-only model/usage
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
        workProductId: "wp-1",
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
    mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
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

  it("reads TTS model from config", async () => {
    (getModelConfig as any).mockResolvedValueOnce({ provider: "openai", model: "tts-1-hd" });

    mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
    mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

    const { mockBatch } = makeBatch(msgBody);
    await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

    expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "tts");
    expect(generateSpeech).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, expect.any(String), expect.anything(), expect.anything());
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 5 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const { mockMsg, mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateSpeech).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: "AUDIO_GENERATION" });
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
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
      mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
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

    it("throws if no narrative found on clip", async () => {
      mockPrisma.clip.findUnique.mockResolvedValueOnce({ id: "clip-1", narrativeText: null });

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

  describe("logging", () => {
    it("logs batch_start", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue({
        id: "clip-1",
        status: "COMPLETED",
        audioKey: "clips/ep-1/5.mp3",
      });
      mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-1" });

      const { mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("logs audio_completed on success", async () => {
      mockPrisma.clip.findUnique.mockResolvedValueOnce(CLIP_WITH_NARRATIVE);
      mockPrisma.clip.update.mockResolvedValue({ id: "clip-1" });

      const { mockBatch } = makeBatch(msgBody);
      await handleAudioGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("audio_completed", {
        episodeId: "ep-1",
        durationTier: 5,
        audioKey: "wp/audio_clip/ep-1/5/default",
      });
    });
  });
});
