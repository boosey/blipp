import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

vi.mock("../config", () => ({
  getConfig: vi.fn().mockResolvedValue("info"),
}));

const { getConfig } = await import("../config");
const { createPipelineLogger, LOG_LEVELS } = await import("../logger");

describe("createPipelineLogger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as any).mockResolvedValue("info");
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should emit info-level JSON to console.log", async () => {
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.info("transcript_fetched", { episodeId: "ep1", bytes: 5000 });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({
      level: "info",
      stage: "transcription",
      action: "transcript_fetched",
      episodeId: "ep1",
      bytes: 5000,
    });
    expect(parsed.ts).toBeDefined();
  });

  it("should emit error-level JSON to console.error with error details", async () => {
    const log = await createPipelineLogger({ stage: "distillation", prisma: {} as any });
    const err = new Error("connection timeout");
    log.error("claude_api_failed", { episodeId: "ep2" }, err);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({
      level: "error",
      stage: "distillation",
      action: "claude_api_failed",
      episodeId: "ep2",
      error: "connection timeout",
    });
    expect(parsed.stack).toBeDefined();
  });

  it("should include requestId when provided", async () => {
    const log = await createPipelineLogger({ stage: "orchestrator", requestId: "req_abc", prisma: {} as any });
    log.info("request_evaluated", {});

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBe("req_abc");
  });

  it("should not include requestId when not provided", async () => {
    const log = await createPipelineLogger({ stage: "feed-refresh", prisma: {} as any });
    log.info("batch_start", {});

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBeUndefined();
  });

  it("should suppress debug logs when level is info", async () => {
    (getConfig as any).mockResolvedValue("info");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.debug("idempotency_skip", { episodeId: "ep1" });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should emit debug logs when level is debug", async () => {
    (getConfig as any).mockResolvedValue("debug");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.debug("idempotency_skip", { episodeId: "ep1" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.level).toBe("debug");
  });

  it("should always emit errors regardless of log level", async () => {
    (getConfig as any).mockResolvedValue("error");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.info("should_be_suppressed", {});
    log.error("should_appear", {}, new Error("fail"));

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle non-Error objects in error method", async () => {
    const log = await createPipelineLogger({ stage: "feed-refresh", prisma: {} as any });
    log.error("unexpected_error", {}, "string error");

    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed.error).toBe("string error");
    expect(parsed.stack).toBeUndefined();
  });

  it("timer should log elapsed duration", async () => {
    const log = await createPipelineLogger({ stage: "clip-generation", prisma: {} as any });
    const elapsed = log.timer("tts_generation");
    elapsed();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.action).toBe("tts_generation");
    expect(typeof parsed.durationMs).toBe("number");
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("LOG_LEVELS should define correct hierarchy", () => {
    expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.info);
    expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.debug);
  });
});
