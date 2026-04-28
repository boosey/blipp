import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";
import { checkStageEnabled, ackAll, claimEpisodeStage, releaseEpisodeStage, STALE_LOCK_MS, LOCK_RETRY_DELAY_S } from "../queue-helpers";

describe("checkStageEnabled", () => {
  const mockLog = { info: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for manual messages regardless of config", async () => {
    const batch = {
      messages: [
        { body: { type: "manual" }, ack: vi.fn() },
      ],
    } as unknown as MessageBatch;

    const result = await checkStageEnabled({}, batch, "TRANSCRIPTION", mockLog);
    expect(result).toBe(true);
    expect(getConfig).not.toHaveBeenCalled();
  });

  it("returns true when stage is enabled in config", async () => {
    (getConfig as any).mockResolvedValue(true);

    const batch = {
      messages: [
        { body: { type: "cron" }, ack: vi.fn() },
      ],
    } as unknown as MessageBatch;

    const result = await checkStageEnabled({}, batch, "TRANSCRIPTION", mockLog);
    expect(result).toBe(true);
  });

  it("returns false and acks all messages when stage is disabled", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(true)   // pipeline.enabled
      .mockResolvedValueOnce(false); // stage enabled
    const ackFn = vi.fn();

    const batch = {
      messages: [
        { body: { type: "cron" }, ack: ackFn },
        { body: { type: "cron" }, ack: ackFn },
      ],
    } as unknown as MessageBatch;

    const result = await checkStageEnabled({}, batch, "DISTILLATION", mockLog);
    expect(result).toBe(false);
    expect(ackFn).toHaveBeenCalledTimes(2);
    expect(mockLog.info).toHaveBeenCalledWith("stage_disabled", { stage: "DISTILLATION" });
  });

  it("returns false and acks all when pipeline.enabled is false", async () => {
    (getConfig as any).mockResolvedValueOnce(false); // pipeline.enabled
    const ackFn = vi.fn();

    const batch = {
      messages: [
        { body: { type: "cron" }, ack: ackFn },
      ],
    } as unknown as MessageBatch;

    const result = await checkStageEnabled({}, batch, "TRANSCRIPTION", mockLog);
    expect(result).toBe(false);
    expect(ackFn).toHaveBeenCalledTimes(1);
    expect(mockLog.info).toHaveBeenCalledWith("pipeline_disabled", { stage: "TRANSCRIPTION" });
  });

  it("queries correct config keys for pipeline and stage", async () => {
    (getConfig as any).mockResolvedValue(true);

    const batch = {
      messages: [{ body: {}, ack: vi.fn() }],
    } as unknown as MessageBatch;

    await checkStageEnabled({ prisma: true }, batch, "AUDIO_GENERATION", mockLog);
    expect(getConfig).toHaveBeenCalledWith(
      { prisma: true },
      "pipeline.enabled",
      true
    );
    expect(getConfig).toHaveBeenCalledWith(
      { prisma: true },
      "pipeline.stage.AUDIO_GENERATION.enabled",
      true
    );
  });
});

describe("ackAll", () => {
  it("acks every message in the list", () => {
    const messages = [
      { ack: vi.fn() },
      { ack: vi.fn() },
      { ack: vi.fn() },
    ];

    ackAll(messages);
    messages.forEach((m) => expect(m.ack).toHaveBeenCalledOnce());
  });

  it("handles empty list", () => {
    expect(() => ackAll([])).not.toThrow();
  });
});

describe("claimEpisodeStage", () => {
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      distillation: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };
  });

  it("returns claimed:true when the CAS update affects 1 row", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: true });
    expect(prisma.distillation.updateMany).toHaveBeenCalledWith({
      where: {
        episodeId: "ep1",
        OR: [
          { status: "PENDING", transcriptionStartedAt: null },
          { status: "PENDING", transcriptionStartedAt: { lt: expect.any(Date) } },
        ],
      },
      data: { status: "PENDING", transcriptionStartedAt: expect.any(Date) },
    });
  });

  it("includes inProgressStatus + stale-lock branch when inProgressStatus is given", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 1 });

    await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "distillationStartedAt",
      requiredStatus: "TRANSCRIPT_READY",
      inProgressStatus: "EXTRACTING_CLAIMS",
    });

    const call = prisma.distillation.updateMany.mock.calls[0][0];
    expect(call.where.OR).toHaveLength(3);
    expect(call.where.OR[2]).toEqual({
      status: "EXTRACTING_CLAIMS",
      distillationStartedAt: { lt: expect.any(Date) },
    });
    // Reset to requiredStatus on claim (covers in-progress recovery case;
    // no-op when status already matched requiredStatus)
    expect(call.data).toEqual({
      status: "TRANSCRIPT_READY",
      distillationStartedAt: expect.any(Date),
    });
  });

  it("treats in-progress status as held (not completed) when claim fails with fresh lock", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "EXTRACTING_CLAIMS",
      distillationStartedAt: new Date(),
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "distillationStartedAt",
      requiredStatus: "TRANSCRIPT_READY",
      inProgressStatus: "EXTRACTING_CLAIMS",
    });

    expect(result).toEqual({ claimed: false, reason: "held" });
  });

  it("returns reason:completed when status is past in-progress (e.g. COMPLETED)", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "COMPLETED",
      distillationStartedAt: null,
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "distillationStartedAt",
      requiredStatus: "TRANSCRIPT_READY",
      inProgressStatus: "EXTRACTING_CLAIMS",
    });

    expect(result).toEqual({ claimed: false, reason: "completed" });
  });

  it("returns claimed:false reason:held when status matches but lock is fresh", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "PENDING",
      transcriptionStartedAt: new Date(),
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: false, reason: "held" });
  });

  it("returns claimed:false reason:completed when status has advanced", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 0 });
    prisma.distillation.findUnique.mockResolvedValue({
      status: "TRANSCRIPT_READY",
      transcriptionStartedAt: null,
    });

    const result = await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
      requiredStatus: "PENDING",
    });

    expect(result).toEqual({ claimed: false, reason: "completed" });
  });

  it("uses staleMs override when provided", async () => {
    prisma.distillation.updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    await claimEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "distillationStartedAt",
      requiredStatus: "TRANSCRIPT_READY",
      staleMs: 60_000,
    });

    const after = Date.now();
    const call = prisma.distillation.updateMany.mock.calls[0][0];
    const staleAt = call.where.OR[1].distillationStartedAt.lt as Date;
    expect(staleAt.getTime()).toBeGreaterThanOrEqual(before - 60_000 - 10);
    expect(staleAt.getTime()).toBeLessThanOrEqual(after - 60_000 + 10);
  });

  it("exports STALE_LOCK_MS = 10 minutes and LOCK_RETRY_DELAY_S = 30s", () => {
    expect(STALE_LOCK_MS).toBe(10 * 60 * 1000);
    expect(LOCK_RETRY_DELAY_S).toBe(30);
  });
});

describe("releaseEpisodeStage", () => {
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      distillation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  it("clears the named lock field for the episode", async () => {
    await releaseEpisodeStage({
      prisma,
      episodeId: "ep1",
      lockField: "transcriptionStartedAt",
    });

    expect(prisma.distillation.updateMany).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      data: { transcriptionStartedAt: null },
    });
  });

  it("swallows DB errors silently", async () => {
    prisma.distillation.updateMany.mockRejectedValue(new Error("connection lost"));
    await expect(
      releaseEpisodeStage({
        prisma,
        episodeId: "ep1",
        lockField: "distillationStartedAt",
      })
    ).resolves.toBeUndefined();
  });
});
