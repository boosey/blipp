import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAppleDiscoveryJob, runPodcastIndexDiscoveryJob } from "../podcast-discovery";

describe("podcast-discovery", () => {
  const mockPrisma = {
    catalogSeedJob: {
      create: vi.fn(),
    },
  };

  const mockQueue = {
    send: vi.fn().mockResolvedValue({}),
  };

  const mockEnv = {
    CATALOG_REFRESH_QUEUE: mockQueue,
  };

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should trigger apple discovery seed", async () => {
    mockPrisma.catalogSeedJob.create.mockResolvedValue({ id: "job-apple" });

    const result = await runAppleDiscoveryJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.seedJobId).toBe("job-apple");
    expect(mockPrisma.catalogSeedJob.create).toHaveBeenCalledWith({
      data: { mode: "additive", source: "apple", trigger: "cron" },
    });
    expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({
      source: "apple",
      seedJobId: "job-apple",
    }));
  });

  it("should trigger podcast-index discovery seed", async () => {
    mockPrisma.catalogSeedJob.create.mockResolvedValue({ id: "job-pi" });

    const result = await runPodcastIndexDiscoveryJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.seedJobId).toBe("job-pi");
    expect(mockPrisma.catalogSeedJob.create).toHaveBeenCalledWith({
      data: { mode: "additive", source: "podcast-index", trigger: "cron" },
    });
    expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({
      source: "podcast-index",
      seedJobId: "job-pi",
    }));
  });
});
