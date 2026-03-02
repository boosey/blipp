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

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
});

describe("handleClipGeneration", () => {
  const msgBody = {
    episodeId: "ep-1",
    distillationId: "dist-1",
    durationTier: 5,
    claims: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7 }],
  };

  it("should generate narrative + TTS, store in R2, and ack", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.clip.upsert.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 5,
    });
    mockPrisma.clip.update.mockResolvedValue({});

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "clip-generation",
    } as unknown as MessageBatch<any>;

    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    // Verify narrative was generated
    expect(generateNarrative).toHaveBeenCalled();

    // Verify TTS was called
    expect(generateSpeech).toHaveBeenCalled();

    // Verify clip was stored in R2
    expect(putClip).toHaveBeenCalledWith(
      mockEnv.R2,
      "ep-1",
      5,
      expect.any(ArrayBuffer)
    );

    // Verify clip was marked completed
    expect(mockPrisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("should skip already COMPLETED clips (idempotency)", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue({
      id: "clip-1",
      status: "COMPLETED",
    });

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "clip-generation",
    } as unknown as MessageBatch<any>;

    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockMsg.ack).toHaveBeenCalled();
    expect(generateNarrative).not.toHaveBeenCalled();
    expect(generateSpeech).not.toHaveBeenCalled();
  });

  it("should record error and retry on failure", async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    mockPrisma.clip.upsert.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
    });

    // Make narrative generation fail
    (generateNarrative as any).mockRejectedValueOnce(
      new Error("Claude API error")
    );

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "clip-generation",
    } as unknown as MessageBatch<any>;

    await handleClipGeneration(mockBatch, mockEnv, mockCtx);

    expect(mockMsg.retry).toHaveBeenCalled();
    expect(mockMsg.ack).not.toHaveBeenCalled();
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 3 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false); // pipeline.stage.3.enabled

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "clip-generation",
      } as unknown as MessageBatch<any>;

      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).not.toHaveBeenCalled();
      expect(generateSpeech).not.toHaveBeenCalled();
      expect(mockPrisma.clip.findUnique).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.clip.findUnique.mockResolvedValue(null);
      mockPrisma.clip.upsert.mockResolvedValue({
        id: "clip-1",
        episodeId: "ep-1",
        durationTier: 5,
      });
      mockPrisma.clip.update.mockResolvedValue({});

      const manualBody = { ...msgBody, type: "manual" as const };
      const mockMsg = { body: manualBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "clip-generation",
      } as unknown as MessageBatch<any>;

      await handleClipGeneration(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(generateNarrative).toHaveBeenCalled();
      expect(generateSpeech).toHaveBeenCalled();
    });
  });
});
