import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRecommendationsJob } from "../recommendations";
import { getConfig } from "../../config";

vi.mock("../../config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../recommendations", () => ({
  computePodcastProfiles: vi.fn(),
}));

import { computePodcastProfiles } from "../../recommendations";

describe("recommendations", () => {
  const mockPrisma = {
    platformConfig: { upsert: vi.fn() },
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

  it("should process batches and persist cursor", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(25000) // timeBudgetMs
      .mockResolvedValueOnce(null); // initial cursor

    (computePodcastProfiles as any).mockResolvedValueOnce({
      processed: 10,
      cursor: "c1",
    }).mockResolvedValueOnce({
      processed: 5,
      cursor: null, // cycle complete
    });

    const result = await runRecommendationsJob(mockPrisma as any, mockLogger as any);

    expect(result.processed).toBe(15);
    expect(result.batches).toBe(2);
    expect(result.cycleComplete).toBe(true);
    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.platformConfig.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { value: null },
    }));
  });

  it("should respect time budget", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(50) // small time budget (50ms)
      .mockResolvedValueOnce(null); // initial cursor

    (computePodcastProfiles as any).mockImplementation(async () => {
      // Simulate work that takes time
      await new Promise(resolve => setTimeout(resolve, 100));
      return { processed: 10, cursor: "c1" };
    });

    const result = await runRecommendationsJob(mockPrisma as any, mockLogger as any);

    expect(result.batches).toBe(1);
    expect(result.cycleComplete).toBe(false);
    expect(result.cursor).toBe("c1");
  });
});
