import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";
import { checkStageEnabled, ackAll } from "../queue-helpers";

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
