import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDataRetentionJob } from "../data-retention";
import { getConfig } from "../../config";

vi.mock("../../config", () => ({
  getConfig: vi.fn(),
}));

describe("data-retention", () => {
  const mockPrisma = {
    platformConfig: { upsert: vi.fn() },
    episode: { count: vi.fn() },
    podcast: { count: vi.fn() },
    briefingRequest: { deleteMany: vi.fn() },
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

  it("should handle episode aging if enabled", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(true) // aging enabled
      .mockResolvedValueOnce(180) // maxAgeDays
      .mockResolvedValueOnce(false) // cleanup disabled
      .mockResolvedValueOnce(false); // archiving disabled

    mockPrisma.episode.count.mockResolvedValue(5);

    const result = await runDataRetentionJob(mockPrisma as any, mockLogger as any);

    expect(result.episodeAgingCandidates).toBe(5);
    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "episodes.aging.candidateCount" },
      update: { value: 5 },
    }));
  });

  it("should handle catalog cleanup if enabled", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(false) // aging disabled
      .mockResolvedValueOnce(true) // cleanup enabled
      .mockResolvedValueOnce(false); // archiving disabled

    mockPrisma.podcast.count.mockResolvedValue(3);

    const result = await runDataRetentionJob(mockPrisma as any, mockLogger as any);

    expect(result.catalogCleanupCandidates).toBe(3);
    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "catalog.cleanup.candidateCount" },
    }));
  });

  it("should handle briefing request archiving if enabled", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(false) // aging disabled
      .mockResolvedValueOnce(false) // cleanup disabled
      .mockResolvedValueOnce(true) // archiving enabled
      .mockResolvedValueOnce(30); // maxAgeDays

    mockPrisma.briefingRequest.deleteMany.mockResolvedValue({ count: 10 });

    const result = await runDataRetentionJob(mockPrisma as any, mockLogger as any);

    expect(result.requestsArchived).toBe(10);
    expect(mockPrisma.briefingRequest.deleteMany).toHaveBeenCalled();
  });
});
