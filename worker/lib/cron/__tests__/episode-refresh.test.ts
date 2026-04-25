import { describe, it, expect, vi, beforeEach } from "vitest";
import { runEpisodeRefreshJob } from "../episode-refresh";
import { sendBatchedFeedRefresh } from "../../queue-helpers";

vi.mock("../../queue-helpers", () => ({
  sendBatchedFeedRefresh: vi.fn().mockResolvedValue({}),
}));

describe("episode-refresh", () => {
  const mockPrisma = {
    podcast: { findMany: vi.fn() },
    episodeRefreshJob: { create: vi.fn() },
  };

  const mockEnv = { FEED_REFRESH_QUEUE: {} };

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find active podcasts and create a refresh job", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockPrisma.episodeRefreshJob.create.mockResolvedValue({ id: "job1" });

    const result = await runEpisodeRefreshJob(mockPrisma as any, mockEnv as any, mockLogger as any);

    expect(result.podcastsTotal).toBe(2);
    expect(mockPrisma.episodeRefreshJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ podcastsTotal: 2 }),
    }));
    expect(sendBatchedFeedRefresh).toHaveBeenCalledWith(
      mockEnv.FEED_REFRESH_QUEUE,
      ["p1", "p2"],
      expect.any(Number),
      expect.objectContaining({ refreshJobId: "job1" })
    );
  });
});
