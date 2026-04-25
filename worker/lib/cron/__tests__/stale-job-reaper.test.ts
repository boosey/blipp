import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStaleJobReaperJob } from "../stale-job-reaper";

describe("stale-job-reaper", () => {
  const mockPrisma = {
    episodeRefreshJob: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    feedItem: {
      updateMany: vi.fn(),
    },
    pipelineJob: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    pipelineStep: {
      updateMany: vi.fn(),
    },
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

  it("should reap stale pipeline jobs and steps", async () => {
    mockPrisma.pipelineJob.findMany.mockResolvedValue([
      { requestId: "req-1" },
    ]);
    mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.episodeRefreshJob.findMany.mockResolvedValue([]);

    const result = await runStaleJobReaperJob(mockPrisma as any, mockLogger as any);

    expect(result.staleJobsReaped).toBe(1);
    expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }));
    expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ requestId: { in: ["req-1"] } }),
    }));
  });

  it("should handle near-complete refresh jobs", async () => {
    mockPrisma.pipelineJob.findMany.mockResolvedValue([]);
    mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 0 });
    
    // 95% complete job
    mockPrisma.episodeRefreshJob.findMany.mockResolvedValue([
      {
        id: "job-near",
        podcastsTotal: 10,
        podcastsCompleted: 10,
        prefetchTotal: 10,
        prefetchCompleted: 9,
      },
      // 50% complete job
      {
        id: "job-stale",
        podcastsTotal: 10,
        podcastsCompleted: 5,
        prefetchTotal: 10,
        prefetchCompleted: 5,
      }
    ]);
    mockPrisma.episodeRefreshJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await runStaleJobReaperJob(mockPrisma as any, mockLogger as any);

    expect(result.staleRefreshJobsCompleted).toBe(1);
    expect(result.staleRefreshJobsReaped).toBe(1);
    expect(mockPrisma.episodeRefreshJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["job-near"] } },
      data: expect.objectContaining({ status: "complete" }),
    }));
    expect(mockPrisma.episodeRefreshJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["job-stale"] } },
      data: expect.objectContaining({ status: "failed" }),
    }));
  });
});
