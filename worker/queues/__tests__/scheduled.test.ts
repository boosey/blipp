import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

const mockRunJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../lib/cron/runner", () => ({
  runJob: mockRunJob,
}));

vi.mock("../../lib/cron/pipeline-trigger", () => ({
  runPipelineTriggerJob: vi.fn(),
}));
vi.mock("../../lib/cron/monitoring", () => ({
  runMonitoringJob: vi.fn(),
}));
vi.mock("../../lib/cron/user-lifecycle", () => ({
  runUserLifecycleJob: vi.fn(),
}));
vi.mock("../../lib/cron/data-retention", () => ({
  runDataRetentionJob: vi.fn(),
}));
vi.mock("../../lib/cron/recommendations", () => ({
  runRecommendationsJob: vi.fn(),
}));
vi.mock("../../lib/cron/podcast-discovery", () => ({
  runAppleDiscoveryJob: vi.fn(),
  runPodcastIndexDiscoveryJob: vi.fn(),
}));

import { createPrismaClient } from "../../lib/db";
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
  mockEvent = { scheduledTime: Date.now(), cron: "*/5 * * * *" } as ScheduledEvent;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  mockRunJob.mockResolvedValue(undefined);
  // Migration calls platformConfig.findUnique — return null to skip by default
  mockPrisma.platformConfig.findUnique.mockResolvedValue(null);
});

describe("scheduled", () => {
  it("dispatches all 7 cron jobs via runJob", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockRunJob).toHaveBeenCalledTimes(8);
    const jobKeys = mockRunJob.mock.calls.map((c: any) => c[0].jobKey);
    expect(jobKeys).toContain("apple-discovery");
    expect(jobKeys).toContain("podcast-index-discovery");
    expect(jobKeys).toContain("pipeline-trigger");
    expect(jobKeys).toContain("monitoring");
    expect(jobKeys).toContain("user-lifecycle");
    expect(jobKeys).toContain("data-retention");
    expect(jobKeys).toContain("recommendations");
    expect(jobKeys).toContain("listen-original-aggregation");
  });

  it("passes prisma to each runJob call", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    for (const call of mockRunJob.mock.calls) {
      expect(call[0].prisma).toBe(mockPrisma);
    }
  });

  it("migrates legacy config keys when they exist", async () => {
    // cron.monitoring.lastRunAt does NOT exist, but legacy key DOES
    mockPrisma.platformConfig.findUnique
      .mockResolvedValueOnce(null) // cron.monitoring.lastRunAt
      .mockResolvedValueOnce({ key: "pricing.lastRefreshedAt", value: "2026-01-01T00:00:00Z" })
      // Remaining migration pair: new key exists or no legacy
      .mockResolvedValueOnce(null) // cron.recommendations.lastRunAt
      .mockResolvedValueOnce(null); // recommendations.lastProfileRefresh (no legacy)

    mockPrisma.platformConfig.create.mockResolvedValue({});

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockPrisma.platformConfig.create).toHaveBeenCalledWith({
      data: {
        key: "cron.monitoring.lastRunAt",
        value: "2026-01-01T00:00:00Z",
        description: "Migrated from pricing.lastRefreshedAt",
      },
    });
  });

  it("skips migration when new keys already exist", async () => {
    // All new keys already exist — findUnique returns a record for each
    mockPrisma.platformConfig.findUnique.mockResolvedValue({ key: "exists", value: "yes" });

    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockPrisma.platformConfig.create).not.toHaveBeenCalled();
  });

  it("continues when runJob rejects (allSettled)", async () => {
    mockRunJob.mockRejectedValue(new Error("job error"));

    // Should not throw — Promise.allSettled handles rejections
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockRunJob).toHaveBeenCalledTimes(8);
  });

  it("disconnects prisma in finally block", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockCtx.waitUntil).toHaveBeenCalledWith(mockPrisma.$disconnect());
  });
});
