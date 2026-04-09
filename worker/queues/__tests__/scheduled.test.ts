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
vi.mock("../../lib/cron/stale-job-reaper", () => ({
  runStaleJobReaperJob: vi.fn(),
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
});

describe("scheduled", () => {
  it("dispatches all cron jobs via runJob", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockRunJob).toHaveBeenCalledTimes(10);
    const jobKeys = mockRunJob.mock.calls.map((c: any) => c[0].jobKey);
    expect(jobKeys).toContain("apple-discovery");
    expect(jobKeys).toContain("podcast-index-discovery");
    expect(jobKeys).toContain("pipeline-trigger");
    expect(jobKeys).toContain("monitoring");
    expect(jobKeys).toContain("user-lifecycle");
    expect(jobKeys).toContain("data-retention");
    expect(jobKeys).toContain("recommendations");
    expect(jobKeys).toContain("listen-original-aggregation");
    expect(jobKeys).toContain("stale-job-reaper");
    expect(jobKeys).toContain("geo-tagging");
  });

  it("passes prisma to each runJob call", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    for (const call of mockRunJob.mock.calls) {
      expect(call[0].prisma).toBe(mockPrisma);
    }
  });

  it("does not pass defaultIntervalMinutes — config comes from CronJob table", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    for (const call of mockRunJob.mock.calls) {
      expect(call[0]).not.toHaveProperty("defaultIntervalMinutes");
    }
  });

  it("continues when runJob rejects (allSettled)", async () => {
    mockRunJob.mockRejectedValue(new Error("job error"));

    // Should not throw — Promise.allSettled handles rejections
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockRunJob).toHaveBeenCalledTimes(10);
  });

  it("disconnects prisma in finally block", async () => {
    await scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockCtx.waitUntil).toHaveBeenCalledWith(mockPrisma.$disconnect());
  });
});
