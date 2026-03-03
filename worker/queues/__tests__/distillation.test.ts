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

vi.mock("@anthropic-ai/sdk", () => {
  return { default: class MockAnthropic {} };
});

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { extractClaims } from "../../lib/distillation";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  // Re-set getConfig default after clearAllMocks (vitest v4 resets mock implementations)
  (getConfig as any).mockResolvedValue(true);
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());
});

describe("handleDistillation", () => {
  it("should read existing transcript, extract claims, and ack message", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "TRANSCRIPT_READY",
      transcript: "This is a transcript of the episode.",
    });
    mockPrisma.distillation.update.mockResolvedValue({});

    const mockMsg = {
      body: { episodeId: "ep-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    // Verify claims were extracted using existing transcript
    expect(extractClaims).toHaveBeenCalled();

    // Verify distillation was marked as COMPLETED
    expect(mockPrisma.distillation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );

    // Verify message was acked
    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("should throw error when no transcript is available", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "PENDING",
      transcript: null,
    });
    mockPrisma.distillation.upsert.mockResolvedValue({});

    const mockMsg = {
      body: { episodeId: "ep-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    // Should retry because no transcript available
    expect(mockMsg.retry).toHaveBeenCalled();
    expect(mockMsg.ack).not.toHaveBeenCalled();
  });

  it("should record error and retry on failure", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "TRANSCRIPT_READY",
      transcript: "Some transcript",
    });
    mockPrisma.distillation.update.mockResolvedValue({});

    // Make extractClaims fail
    (extractClaims as any).mockRejectedValueOnce(new Error("API error"));
    mockPrisma.distillation.upsert.mockResolvedValue({});

    const mockMsg = {
      body: { episodeId: "ep-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    // Verify message was retried
    expect(mockMsg.retry).toHaveBeenCalled();
    expect(mockMsg.ack).not.toHaveBeenCalled();
  });

  it("should skip already COMPLETED distillations (idempotency)", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
    });

    const mockMsg = {
      body: { episodeId: "ep-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    // Should ack without processing
    expect(mockMsg.ack).toHaveBeenCalled();
    expect(extractClaims).not.toHaveBeenCalled();
  });

  it("should report to orchestrator when requestId present and COMPLETED", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
    });

    const mockMsg = {
      body: { episodeId: "ep-1", requestId: "req1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req1", action: "stage-complete", stage: 3, episodeId: "ep-1",
    });
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 3 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false); // pipeline.stage.3.enabled

      const mockMsg = {
        body: { episodeId: "ep-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(extractClaims).not.toHaveBeenCalled();
      expect(mockPrisma.distillation.findUnique).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "This is a transcript.",
      });
      mockPrisma.distillation.update.mockResolvedValue({});

      const mockMsg = {
        body: { episodeId: "ep-1", type: "manual" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(extractClaims).toHaveBeenCalled();
    });
  });

  describe("structured logging", () => {
    it("should log batch_start", async () => {
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "Some transcript",
      });
      mockPrisma.distillation.update.mockResolvedValue({});

      const mockMsg = {
        body: { episodeId: "ep-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("should log stage_disabled when stage is off", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const mockMsg = {
        body: { episodeId: "ep-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: 3 });
    });

    it("should log claims_extracted on success", async () => {
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "This is a transcript.",
      });
      mockPrisma.distillation.update.mockResolvedValue({});

      const mockMsg = {
        body: { episodeId: "ep-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("claims_extracted", {
        episodeId: "ep-1",
        claimCount: 1,
      });
    });

    it("should log episode_error on failure", async () => {
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "TRANSCRIPT_READY",
        transcript: "Some transcript",
      });
      mockPrisma.distillation.update.mockResolvedValue({});

      (extractClaims as any).mockRejectedValueOnce(new Error("API error"));
      mockPrisma.distillation.upsert.mockResolvedValue({});

      const mockMsg = {
        body: { episodeId: "ep-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "episode_error",
        { episodeId: "ep-1" },
        expect.any(Error)
      );
    });
  });
});
