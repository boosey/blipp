import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn(),
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

vi.mock("../../lib/pricing-updater", () => ({
  refreshPricing: vi.fn().mockResolvedValue({ updated: 0 }),
}));

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";
import { scheduled } from "../index";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;
let mockEvent: ScheduledEvent;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  mockEvent = { scheduledTime: Date.now(), cron: "*/30 * * * *" } as ScheduledEvent;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());
});

describe("scheduled", () => {
  it("enqueues feed refresh when pipeline enabled and interval elapsed", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(true)    // pipeline.enabled
      .mockResolvedValueOnce(60)      // pipeline.minIntervalMinutes
      .mockResolvedValueOnce(null)    // pipeline.lastAutoRunAt (never run)
      .mockResolvedValueOnce(new Date().toISOString()); // pricing.lastRefreshedAt (recent, skip)

    mockPrisma.platformConfig.upsert.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockEnv.FEED_REFRESH_QUEUE.send).toHaveBeenCalledWith({ type: "cron" });
    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "pipeline.lastAutoRunAt" },
      })
    );
  });

  it("does NOT enqueue when pipeline.enabled is false", async () => {
    (getConfig as any).mockResolvedValueOnce(false); // pipeline.enabled

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockEnv.FEED_REFRESH_QUEUE.send).not.toHaveBeenCalled();
    expect(mockPrisma.platformConfig.upsert).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when interval has not elapsed", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    (getConfig as any)
      .mockResolvedValueOnce(true)             // pipeline.enabled
      .mockResolvedValueOnce(60)               // pipeline.minIntervalMinutes
      .mockResolvedValueOnce(fiveMinutesAgo);  // pipeline.lastAutoRunAt (5 min ago)

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockEnv.FEED_REFRESH_QUEUE.send).not.toHaveBeenCalled();
  });

  it("enqueues when interval HAS elapsed", async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    (getConfig as any)
      .mockResolvedValueOnce(true)          // pipeline.enabled
      .mockResolvedValueOnce(60)            // pipeline.minIntervalMinutes
      .mockResolvedValueOnce(twoHoursAgo)   // pipeline.lastAutoRunAt
      .mockResolvedValueOnce(new Date().toISOString()); // pricing.lastRefreshedAt (recent, skip)

    mockPrisma.platformConfig.upsert.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockEnv.FEED_REFRESH_QUEUE.send).toHaveBeenCalledWith({ type: "cron" });
  });

  it("updates pipeline.lastAutoRunAt after successful enqueue", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Date().toISOString()); // pricing.lastRefreshedAt (recent, skip)

    mockPrisma.platformConfig.upsert.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "pipeline.lastAutoRunAt" },
        create: expect.objectContaining({
          key: "pipeline.lastAutoRunAt",
          description: "Timestamp of last automatic pipeline run",
        }),
      })
    );
  });

  it("defaults to enabled when PlatformConfig missing (getConfig returns fallback)", async () => {
    // getConfig returns fallback values (simulating no PlatformConfig entries)
    (getConfig as any)
      .mockResolvedValueOnce(true)   // pipeline.enabled defaults to true
      .mockResolvedValueOnce(60)     // pipeline.minIntervalMinutes defaults to 60
      .mockResolvedValueOnce(null)   // pipeline.lastAutoRunAt defaults to null
      .mockResolvedValueOnce(new Date().toISOString()); // pricing.lastRefreshedAt (recent, skip)

    mockPrisma.platformConfig.upsert.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockEnv.FEED_REFRESH_QUEUE.send).toHaveBeenCalledWith({ type: "cron" });
  });

  it("should log pipeline_disabled when pipeline is off", async () => {
    (getConfig as any).mockResolvedValueOnce(false); // pipeline.enabled

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockLogger.info).toHaveBeenCalledWith("pipeline_disabled", {});
  });

  it("should log feed_refresh_enqueued on successful trigger", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(true)   // pipeline.enabled
      .mockResolvedValueOnce(60)     // pipeline.minIntervalMinutes
      .mockResolvedValueOnce(null)   // pipeline.lastAutoRunAt
      .mockResolvedValueOnce(new Date().toISOString()); // pricing.lastRefreshedAt (recent, skip)

    mockPrisma.platformConfig.upsert.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockLogger.info).toHaveBeenCalledWith("feed_refresh_enqueued", { trigger: "cron" });
  });

  it("disconnects prisma in finally block", async () => {
    (getConfig as any).mockResolvedValueOnce(false);

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockCtx.waitUntil).toHaveBeenCalledWith(mockPrisma.$disconnect());
  });
});
