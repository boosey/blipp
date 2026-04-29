import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import { enrichNewEpisodesWithAppleTrackIds } from "../apple-episode-enrichment";
import { ApplePodcastsClient } from "../apple-podcasts";

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
};

describe("enrichNewEpisodesWithAppleTrackIds", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let lookupSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    lookupSpy = vi.spyOn(ApplePodcastsClient.prototype, "lookupEpisodes");
  });

  it("updates episodes whose RSS guid matches an Apple episodeGuid", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([
      { id: "ep-1", guid: "rss-guid-1" },
      { id: "ep-2", guid: "rss-guid-2" },
    ]);
    lookupSpy.mockResolvedValue([
      { trackId: 1001, episodeGuid: "rss-guid-1", trackName: "Ep 1" },
      { trackId: 1002, episodeGuid: "rss-guid-other", trackName: "Other" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1", "ep-2"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).toHaveBeenCalledWith("999");
    expect(mockPrisma.episode.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.episode.update).toHaveBeenCalledWith({
      where: { id: "ep-1" },
      data: { appleEpisodeTrackId: "1001" },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      "apple_episode_enrichment",
      expect.objectContaining({ podcastId: "pod-1", attempted: 2, matched: 1 })
    );
  });

  it("makes no update calls when no guids match", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([{ id: "ep-1", guid: "rss-guid-1" }]);
    lookupSpy.mockResolvedValue([
      { trackId: 1002, episodeGuid: "rss-guid-other", trackName: "Other" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "apple_episode_enrichment",
      expect.objectContaining({ matched: 0 })
    );
  });

  it("bails immediately when appleId is null", async () => {
    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: null },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).not.toHaveBeenCalled();
    expect(mockPrisma.episode.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
  });

  it("bails immediately when newEpisodeIds is empty", async () => {
    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: [],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it("ignores Apple results with null episodeGuid", async () => {
    mockPrisma.episode.findMany.mockResolvedValue([{ id: "ep-1", guid: "rss-guid-1" }]);
    lookupSpy.mockResolvedValue([
      { trackId: 1001, episodeGuid: null, trackName: "Ep 1" },
    ]);

    await enrichNewEpisodesWithAppleTrackIds({
      prisma: mockPrisma as any,
      podcast: { id: "pod-1", appleId: "999" },
      newEpisodeIds: ["ep-1"],
      apple: new ApplePodcastsClient(),
      log: mockLogger as any,
    });

    expect(mockPrisma.episode.update).not.toHaveBeenCalled();
  });
});
