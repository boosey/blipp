import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleDistillation } from "../distillation";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/distillation", () => ({
  extractClaims: vi.fn().mockResolvedValue([
    { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7 },
  ]),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return { default: class MockAnthropic {} };
});

// Mock global fetch for transcript fetching
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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
  mockFetch.mockResolvedValue({
    text: vi.fn().mockResolvedValue("This is a transcript of the episode."),
  });
});

describe("handleDistillation", () => {
  it("should fetch transcript, extract claims, and ack message", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "FETCHING_TRANSCRIPT",
    });
    mockPrisma.distillation.update.mockResolvedValue({});

    const mockMsg = {
      body: { episodeId: "ep-1", transcriptUrl: "https://example.com/ep1.vtt" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "distillation",
    } as unknown as MessageBatch<any>;

    await handleDistillation(mockBatch, mockEnv, mockCtx);

    // Verify transcript was fetched
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/ep1.vtt");

    // Verify claims were extracted
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

  it("should record error and retry on failure", async () => {
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
    });

    // Make transcript fetch fail
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockPrisma.distillation.upsert.mockResolvedValue({});

    const mockMsg = {
      body: { episodeId: "ep-1", transcriptUrl: "https://example.com/ep1.vtt" },
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
      body: { episodeId: "ep-1", transcriptUrl: "https://example.com/ep1.vtt" },
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
    expect(mockFetch).not.toHaveBeenCalled();
    expect(extractClaims).not.toHaveBeenCalled();
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 2 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false); // pipeline.stage.2.enabled

      const mockMsg = {
        body: { episodeId: "ep-1", transcriptUrl: "https://example.com/ep1.vtt" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(extractClaims).not.toHaveBeenCalled();
      expect(mockPrisma.distillation.findUnique).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      // Even if getConfig would return false, manual messages bypass the check
      // Since hasManual is true, getConfig for stage is never called
      mockPrisma.distillation.findUnique.mockResolvedValue(null);
      mockPrisma.distillation.upsert.mockResolvedValue({
        id: "dist-1",
        episodeId: "ep-1",
        status: "FETCHING_TRANSCRIPT",
      });
      mockPrisma.distillation.update.mockResolvedValue({});

      const mockMsg = {
        body: { episodeId: "ep-1", transcriptUrl: "https://example.com/ep1.vtt", type: "manual" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "distillation",
      } as unknown as MessageBatch<any>;

      await handleDistillation(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
      expect(extractClaims).toHaveBeenCalled();
    });
  });
});
