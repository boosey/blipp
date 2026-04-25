import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCatalogPregenJob } from "../catalog-pregen";

describe("catalog-pregen", () => {
  const mockPrisma = {
    podcast: { findMany: vi.fn() },
    episode: { findMany: vi.fn() },
    catalogBriefing: { findMany: vi.fn(), updateMany: vi.fn() },
    pipelineJob: { findMany: vi.fn() },
    briefingRequest: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  };

  const mockQueue = {
    send: vi.fn().mockResolvedValue({}),
  };

  const mockEnv = {
    ORCHESTRATOR_QUEUE: mockQueue,
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

  it("should queue pre-generation for ranked podcasts missing catalog briefings", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "p1", title: "Pod 1", appleRank: 1 },
    ]);
    mockPrisma.episode.findMany.mockResolvedValue([
      { id: "e1", podcastId: "p1", title: "Ep 1" },
    ]);
    mockPrisma.catalogBriefing.findMany.mockResolvedValue([]);
    mockPrisma.pipelineJob.findMany.mockResolvedValue([]);
    mockPrisma.user.findFirst.mockResolvedValue({ id: "admin1" });
    mockPrisma.briefingRequest.create.mockResolvedValue({ id: "req1" });
    mockPrisma.catalogBriefing.updateMany.mockResolvedValue({ count: 0 });

    const result = await runCatalogPregenJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.episodesQueued).toBe(1);
    expect(mockPrisma.briefingRequest.create).toHaveBeenCalled();
    expect(mockQueue.send).toHaveBeenCalled();
  });

  it("should skip if latest episode already has catalog briefing", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([{ id: "p1", appleRank: 1 }]);
    mockPrisma.episode.findMany.mockResolvedValue([{ id: "e1", podcastId: "p1" }]);
    mockPrisma.catalogBriefing.findMany.mockResolvedValue([{ episodeId: "e1" }]);
    mockPrisma.pipelineJob.findMany.mockResolvedValue([]);

    const result = await runCatalogPregenJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.episodesQueued).toBe(0);
    expect(mockPrisma.briefingRequest.create).not.toHaveBeenCalled();
  });
});
