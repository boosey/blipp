import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleBriefingAssembly } from "../briefing-assembly";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/clip-cache", () => ({
  getClip: vi.fn(),
  putBriefing: vi.fn().mockResolvedValue("briefings/user-1/2026-02-26.mp3"),
}));

vi.mock("../../lib/mp3-concat", () => ({
  concatMp3Buffers: vi.fn().mockReturnValue(new ArrayBuffer(4096)),
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

vi.mock("../../lib/time-fitting", () => ({
  allocateWordBudget: vi.fn().mockReturnValue([
    { index: 0, allocatedWords: 450, durationTier: 3 },
  ]),
}));

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { getClip, putBriefing } from "../../lib/clip-cache";
import { concatMp3Buffers } from "../../lib/mp3-concat";

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

describe("handleBriefingAssembly", () => {
  const msgBody = { briefingId: "brief-1", userId: "user-1" };

  it("should concatenate cached clips and store completed briefing", async () => {
    mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
      id: "brief-1",
      userId: "user-1",
      targetMinutes: 10,
    });
    mockPrisma.briefing.update.mockResolvedValue({});
    mockPrisma.subscription.findMany.mockResolvedValue([
      { id: "sub-1", userId: "user-1", podcastId: "pod-1" },
    ]);
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep-1",
      podcastId: "pod-1",
      title: "Episode 1",
    });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
      transcript: "A long transcript with many words for testing",
      claimsJson: [{ claim: "test" }],
    });

    // Clip is cached
    (getClip as any).mockResolvedValue(new ArrayBuffer(1024));

    mockPrisma.clip.findUnique.mockResolvedValue({
      id: "clip-1",
      episodeId: "ep-1",
      durationTier: 3,
    });
    mockPrisma.briefingSegment.create.mockResolvedValue({});

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "briefing-assembly",
    } as unknown as MessageBatch<any>;

    await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

    // Verify clips were concatenated
    expect(concatMp3Buffers).toHaveBeenCalled();

    // Verify briefing was stored in R2
    expect(putBriefing).toHaveBeenCalled();

    // Verify briefing was marked COMPLETED
    expect(mockPrisma.briefing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("should queue missing clips and re-queue briefing with delay", async () => {
    mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
      id: "brief-1",
      userId: "user-1",
      targetMinutes: 10,
    });
    mockPrisma.briefing.update.mockResolvedValue({});
    mockPrisma.subscription.findMany.mockResolvedValue([
      { id: "sub-1", userId: "user-1", podcastId: "pod-1" },
    ]);
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep-1",
      podcastId: "pod-1",
      title: "Episode 1",
    });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-1",
      episodeId: "ep-1",
      status: "COMPLETED",
      transcript: "transcript words here",
      claimsJson: [{ claim: "test" }],
    });

    // Clip is NOT cached
    (getClip as any).mockResolvedValue(null);

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "briefing-assembly",
    } as unknown as MessageBatch<any>;

    await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

    // Verify clip generation was queued
    expect(mockEnv.CLIP_GENERATION_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: "ep-1",
        distillationId: "dist-1",
      })
    );

    // Verify briefing was re-queued with delay
    expect(mockEnv.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
      { briefingId: "brief-1", userId: "user-1" },
      { delaySeconds: 60 }
    );

    // Should ack the current message (not retry)
    expect(mockMsg.ack).toHaveBeenCalled();

    // Should NOT have concatenated or stored
    expect(concatMp3Buffers).not.toHaveBeenCalled();
  });

  it("should mark briefing FAILED when no ready episodes", async () => {
    mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
      id: "brief-1",
      userId: "user-1",
      targetMinutes: 10,
    });
    mockPrisma.briefing.update.mockResolvedValue({});
    mockPrisma.subscription.findMany.mockResolvedValue([
      { id: "sub-1", userId: "user-1", podcastId: "pod-1" },
    ]);

    // No episodes with completed distillations
    mockPrisma.episode.findFirst.mockResolvedValue(null);

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "briefing-assembly",
    } as unknown as MessageBatch<any>;

    await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

    // Verify briefing was marked FAILED
    expect(mockPrisma.briefing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No episodes with completed distillations",
        }),
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("should mark briefing FAILED when user has no subscriptions", async () => {
    mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
      id: "brief-1",
      userId: "user-1",
      targetMinutes: 10,
    });
    mockPrisma.briefing.update.mockResolvedValue({});
    mockPrisma.subscription.findMany.mockResolvedValue([]);

    const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
    const mockBatch = {
      messages: [mockMsg],
      queue: "briefing-assembly",
    } as unknown as MessageBatch<any>;

    await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

    expect(mockPrisma.briefing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No subscriptions found",
        }),
      })
    );

    expect(mockMsg.ack).toHaveBeenCalled();
  });

  describe("logging", () => {
    it("should log batch_start", async () => {
      mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
        id: "brief-1", userId: "user-1", targetMinutes: 10,
      });
      mockPrisma.briefing.update.mockResolvedValue({});
      mockPrisma.subscription.findMany.mockResolvedValue([]);

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("should log stage_disabled when stage is off", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: 5 });
    });

    it("should log assembly_complete on success", async () => {
      mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
        id: "brief-1", userId: "user-1", targetMinutes: 10,
      });
      mockPrisma.briefing.update.mockResolvedValue({});
      mockPrisma.subscription.findMany.mockResolvedValue([
        { id: "sub-1", userId: "user-1", podcastId: "pod-1" },
      ]);
      mockPrisma.episode.findFirst.mockResolvedValue({
        id: "ep-1", podcastId: "pod-1", title: "Episode 1",
      });
      mockPrisma.distillation.findUnique.mockResolvedValue({
        id: "dist-1", episodeId: "ep-1", status: "COMPLETED",
        transcript: "A long transcript with many words for testing",
        claimsJson: [{ claim: "test" }],
      });
      (getClip as any).mockResolvedValue(new ArrayBuffer(1024));
      mockPrisma.clip.findUnique.mockResolvedValue({
        id: "clip-1", episodeId: "ep-1", durationTier: 3,
      });
      mockPrisma.briefingSegment.create.mockResolvedValue({});

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("assembly_complete", expect.objectContaining({ briefingId: "brief-1" }));
    });

    it("should log assembly_error on failure", async () => {
      mockPrisma.briefing.findUniqueOrThrow.mockRejectedValue(new Error("DB error"));
      mockPrisma.briefing.update.mockResolvedValue({});

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "assembly_error",
        { briefingId: "brief-1" },
        expect.any(Error)
      );
    });
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 5 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false); // pipeline.stage.5.enabled

      const mockMsg = { body: msgBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockPrisma.briefing.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      mockPrisma.briefing.findUniqueOrThrow.mockResolvedValue({
        id: "brief-1",
        userId: "user-1",
        targetMinutes: 10,
      });
      mockPrisma.briefing.update.mockResolvedValue({});
      mockPrisma.subscription.findMany.mockResolvedValue([]);

      const manualBody = { ...msgBody, type: "manual" as const };
      const mockMsg = { body: manualBody, ack: vi.fn(), retry: vi.fn() };
      const mockBatch = {
        messages: [mockMsg],
        queue: "briefing-assembly",
      } as unknown as MessageBatch<any>;

      await handleBriefingAssembly(mockBatch, mockEnv, mockCtx);

      // Should process — stage check is bypassed for manual
      expect(mockPrisma.briefing.findUniqueOrThrow).toHaveBeenCalled();
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });
});
