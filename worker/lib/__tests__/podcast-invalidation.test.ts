import { describe, it, expect, vi } from "vitest";
import {
  isMusicOnlyFeed,
  looksLikeSongLyricsOutput,
  invalidatePodcastAsMusic,
  NotAPodcastError,
  MUSIC_FEED_ITEM_ERROR,
} from "../podcast-invalidation";
import { createMockPrisma } from "../../../tests/helpers/mocks";

describe("isMusicOnlyFeed", () => {
  it("flags SoundCloud user RSS feeds", () => {
    expect(isMusicOnlyFeed("https://feeds.soundcloud.com/users/soundcloud:users:1225470/sounds.rss")).toBe(true);
    expect(isMusicOnlyFeed("http://feeds.soundcloud.com/users/anybody/sounds.rss")).toBe(true);
  });

  it("does not flag general podcast feeds", () => {
    expect(isMusicOnlyFeed("https://feeds.megaphone.fm/ACAST123")).toBe(false);
    expect(isMusicOnlyFeed("https://feeds.simplecast.com/abc")).toBe(false);
    expect(isMusicOnlyFeed("https://lexfridman.com/feed/podcast/")).toBe(false);
  });

  it("handles null/undefined gracefully", () => {
    expect(isMusicOnlyFeed(null)).toBe(false);
    expect(isMusicOnlyFeed(undefined)).toBe(false);
    expect(isMusicOnlyFeed("")).toBe(false);
  });
});

describe("looksLikeSongLyricsOutput", () => {
  it("detects explicit song-lyrics prose", () => {
    expect(looksLikeSongLyricsOutput("The provided transcript appears to be song lyrics")).toBe(true);
    expect(looksLikeSongLyricsOutput("This is music lyrics only")).toBe(true);
    expect(looksLikeSongLyricsOutput("This transcript is not a podcast episode")).toBe(true);
  });

  it("detects empty array paired with nonsensical signal", () => {
    expect(looksLikeSongLyricsOutput("[]\nNo coherent factual claims present")).toBe(true);
    expect(looksLikeSongLyricsOutput("[] The content is nonsensical")).toBe(true);
    expect(looksLikeSongLyricsOutput("[] No substantive discussion found")).toBe(true);
  });

  it("does not false-positive on normal failures", () => {
    expect(looksLikeSongLyricsOutput("rate limit exceeded")).toBe(false);
    expect(looksLikeSongLyricsOutput("invalid JSON: {foo")).toBe(false);
    expect(looksLikeSongLyricsOutput("[]")).toBe(false); // plain empty array alone is ambiguous
  });

  it("handles null/empty", () => {
    expect(looksLikeSongLyricsOutput(null)).toBe(false);
    expect(looksLikeSongLyricsOutput("")).toBe(false);
  });
});

describe("NotAPodcastError", () => {
  it("carries raw LLM output", () => {
    const err = new NotAPodcastError("raw LLM text");
    expect(err.name).toBe("NotAPodcastError");
    expect(err.rawOutput).toBe("raw LLM text");
    expect(err.message).toMatch(/music|song/i);
  });
});

describe("invalidatePodcastAsMusic", () => {
  function setupPrisma() {
    const prisma: any = createMockPrisma();
    // $transaction wrapper — just await each op and return its results in order.
    prisma.$transaction = vi.fn(async (ops: any[]) => {
      const results = [];
      for (const op of ops) results.push(await op);
      return results;
    });
    return prisma;
  }

  it("no-ops when podcast is already invalidated", async () => {
    const prisma = setupPrisma();
    prisma.podcast.findUnique.mockResolvedValue({ id: "p1", status: "music" });

    const result = await invalidatePodcastAsMusic(prisma, "p1", "song_lyrics_detected");

    expect(result.alreadyInvalid).toBe(true);
    expect(prisma.subscription.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws when the podcast doesn't exist", async () => {
    const prisma = setupPrisma();
    prisma.podcast.findUnique.mockResolvedValue(null);
    await expect(invalidatePodcastAsMusic(prisma, "missing", "admin")).rejects.toThrow(/not found/);
  });

  it("wipes subscriptions/favorites/votes and cancels in-flight work", async () => {
    const prisma = setupPrisma();
    prisma.podcast.findUnique.mockResolvedValue({ id: "p1", status: "active" });
    prisma.episode.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    prisma.pipelineJob.findMany.mockResolvedValue([
      { id: "j1", requestId: "r1" },
      { id: "j2", requestId: "r1" },
      { id: "j3", requestId: "r2" },
    ]);
    prisma.podcast.update.mockResolvedValue({ id: "p1", status: "music" });
    prisma.subscription.deleteMany.mockResolvedValue({ count: 5 });
    prisma.podcastFavorite.deleteMany.mockResolvedValue({ count: 3 });
    prisma.podcastVote.deleteMany.mockResolvedValue({ count: 2 });
    prisma.feedItem.updateMany.mockResolvedValue({ count: 7 });
    prisma.briefingRequest.updateMany.mockResolvedValue({ count: 2 });
    prisma.pipelineJob.updateMany.mockResolvedValue({ count: 3 });

    const result = await invalidatePodcastAsMusic(prisma, "p1", "song_lyrics_detected");

    expect(result).toEqual({
      alreadyInvalid: false,
      subscriptionsRemoved: 5,
      favoritesRemoved: 3,
      votesRemoved: 2,
      feedItemsCancelled: 7,
      requestsCancelled: 2,
      jobsCancelled: 3,
    });

    expect(prisma.podcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          status: "music",
          deliverable: false,
          invalidationReason: "song_lyrics_detected",
        }),
      })
    );

    expect(prisma.feedItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ podcastId: "p1" }),
        data: expect.objectContaining({
          status: "CANCELLED",
          errorMessage: MUSIC_FEED_ITEM_ERROR,
        }),
      })
    );

    // Only unique request IDs are cancelled
    expect(prisma.briefingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: expect.arrayContaining(["r1", "r2"]) },
        }),
      })
    );
  });

  it("handles podcast with no episodes gracefully", async () => {
    const prisma = setupPrisma();
    prisma.podcast.findUnique.mockResolvedValue({ id: "p1", status: "active" });
    prisma.episode.findMany.mockResolvedValue([]);
    prisma.podcast.update.mockResolvedValue({ id: "p1", status: "music" });
    prisma.subscription.deleteMany.mockResolvedValue({ count: 1 });
    prisma.podcastFavorite.deleteMany.mockResolvedValue({ count: 0 });
    prisma.podcastVote.deleteMany.mockResolvedValue({ count: 0 });
    prisma.feedItem.updateMany.mockResolvedValue({ count: 0 });
    prisma.briefingRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.pipelineJob.updateMany.mockResolvedValue({ count: 0 });

    const result = await invalidatePodcastAsMusic(prisma, "p1", "admin");

    expect(result.alreadyInvalid).toBe(false);
    expect(result.subscriptionsRemoved).toBe(1);
    // With no episodes, we don't query for in-flight jobs at all
    expect(prisma.pipelineJob.findMany).not.toHaveBeenCalled();
  });
});
