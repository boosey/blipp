import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupPodcastIndexTranscript } from "../transcript-source";

// Mock the podcast-index module
vi.mock("../podcast-index", () => ({
  PodcastIndexClient: vi.fn().mockImplementation(() => ({
    episodesByFeedId: vi.fn(),
  })),
}));

import { PodcastIndexClient } from "../podcast-index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lookupPodcastIndexTranscript", () => {
  const mockClient = {
    episodesByFeedId: vi.fn(),
  };

  it("returns null when podcast has no podcastIndexId", async () => {
    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      null,
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
    expect(mockClient.episodesByFeedId).not.toHaveBeenCalled();
  });

  it("returns transcriptUrl when episode matched by GUID", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "test-guid", title: "Test Episode", transcriptUrl: "https://example.com/transcript.vtt" },
      { guid: "other-guid", title: "Other Episode", transcriptUrl: null },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-123",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBe("https://example.com/transcript.vtt");
    expect(mockClient.episodesByFeedId).toHaveBeenCalledWith(123, 20);
  });

  it("returns null when matched episode has no transcriptUrl", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "test-guid", title: "Test Episode", transcriptUrl: null },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-456",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
  });

  it("returns null when no episodes match", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "unrelated", title: "Unrelated Episode", transcriptUrl: "https://example.com/t.vtt" },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-789",
      "no-match-guid",
      "No Match Title"
    );
    expect(result).toBeNull();
  });

  it("returns null when API call fails (does not throw)", async () => {
    mockClient.episodesByFeedId.mockRejectedValue(new Error("API down"));

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-999",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
  });

  it("parses numeric podcastIndexId from string", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([]);

    await lookupPodcastIndexTranscript(
      mockClient as any,
      "42",
      "test-guid",
      "Test Episode"
    );
    expect(mockClient.episodesByFeedId).toHaveBeenCalledWith(42, 20);
  });
});
