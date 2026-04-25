import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGeoTaggingJob } from "../geo-tagging";
import { getConfig } from "../../config";
import { findCityMatches } from "../../geo-lookup";
import { getLlmProviderImpl } from "../../llm-providers";

vi.mock("../../config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../geo-lookup", () => ({
  findCityMatches: vi.fn(),
}));

vi.mock("../../llm-providers", () => ({
  getLlmProviderImpl: vi.fn(),
}));

describe("geo-tagging", () => {
  const mockPrisma = {
    podcast: { findMany: vi.fn(), update: vi.fn() },
    podcastGeoProfile: { findMany: vi.fn(), upsert: vi.fn() },
    aiModelProvider: { findUnique: vi.fn() },
    sportsTeam: { findMany: vi.fn() },
  };

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockEnv = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process podcasts via keywords (Pass 1)", async () => {
    (getConfig as any).mockResolvedValue(100); // batchSize
    mockPrisma.podcastGeoProfile.findMany.mockResolvedValue([]);
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "p1", title: "New Orleans Podcast" },
    ]);
    (findCityMatches as any).mockReturnValue([
      { city: "New Orleans", state: "Louisiana", confidence: 0.9, scope: "city" },
    ]);

    const result = await runGeoTaggingJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.processed).toBe(1);
    expect(result.pass1Matched).toBe(1);
    expect(mockPrisma.podcastGeoProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ city: "New Orleans" }),
    }));
    expect(mockPrisma.podcast.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "p1" },
      data: { geoProcessedAt: expect.any(Date) },
    }));
  });

  it("should attempt LLM classification for others (Pass 2)", async () => {
    (getConfig as any)
      .mockResolvedValueOnce(100) // batchSize
      .mockResolvedValueOnce("provider-1") // llmProviderId
      .mockResolvedValueOnce(10); // llmBatchSize
    
    mockPrisma.podcastGeoProfile.findMany.mockResolvedValue([]);
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "p2", title: "Generic Sports Show" },
    ]);
    (findCityMatches as any).mockReturnValue([]); // No keyword match
    
    mockPrisma.aiModelProvider.findUnique.mockResolvedValue({
      provider: "openai",
      model: { modelId: "gpt-4" },
      priceInputPerMToken: 10,
      priceOutputPerMToken: 30,
    });

    const mockLlm = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({ "p2": [{ city: "Chicago", state: "Illinois", scope: "city", confidence: 0.8 }] }),
        inputTokens: 100,
        outputTokens: 50,
      }),
    };
    (getLlmProviderImpl as any).mockReturnValue(mockLlm);
    mockPrisma.sportsTeam.findMany.mockResolvedValue([]);

    const result = await runGeoTaggingJob(mockPrisma as any, mockLogger as any, mockEnv as any);

    expect(result.pass1Matched).toBe(0);
    expect(result.pass2Matched).toBe(1);
    expect(mockLlm.complete).toHaveBeenCalled();
    expect(mockPrisma.podcastGeoProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ city: "Chicago" }),
    }));
  });
});
