import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleFeedRefresh } from "../feed-refresh";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
}));
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));

vi.mock("../../lib/rss-parser", () => ({
  parseRssFeed: vi.fn().mockReturnValue({
    title: "Test Podcast",
    description: "A test podcast",
    imageUrl: null,
    author: null,
    episodes: [
      {
        title: "Episode 1",
        description: "First episode",
        audioUrl: "https://example.com/ep1.mp3",
        publishedAt: new Date("2026-01-15").toISOString(),
        durationSeconds: 3600,
        guid: "guid-1",
        transcriptUrl: "https://example.com/ep1.vtt",
      },
    ],
  }),
}));

// Mock global fetch for RSS feed fetching
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createPrismaClient } from "../../lib/db";
import { getConfig } from "../../lib/config";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  // Re-set getConfig default after clearAllMocks (vitest v4 resets mock implementations)
  // Return sensible defaults per key; pipeline stages enabled, catalog.refreshAllPodcasts disabled
  (getConfig as any).mockImplementation(async (_p: any, key: string, fallback: any) => {
    if (key === "catalog.refreshAllPodcasts") return false;
    if (key === "pipeline.feedRefresh.maxEpisodesPerPodcast") return 5;
    return fallback !== undefined ? true : true;
  });
  mockFetch.mockResolvedValue({
    text: vi.fn().mockResolvedValue("<rss></rss>"),
  });
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());
});

describe("handleFeedRefresh", () => {
  it("should fetch feeds and create episodes for specific podcast", async () => {
    const podcast = {
      id: "pod-1",
      feedUrl: "https://example.com/feed.xml",
      title: "Test",
    };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
    // GUID already exists — not a new episode
    mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
    mockPrisma.episode.upsert.mockResolvedValue({
      id: "ep-1",
      podcastId: "pod-1",
      guid: "guid-1",
    });
    mockPrisma.podcast.update.mockResolvedValue(podcast);

    const mockMsg = {
      body: { type: "manual", podcastId: "pod-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Verify podcast feed was fetched
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed.xml");

    // Verify episode was created
    expect(mockPrisma.episode.upsert).toHaveBeenCalled();

    // Verify message was acked
    expect(mockMsg.ack).toHaveBeenCalled();

    // Verify last fetched timestamp was updated
    expect(mockPrisma.podcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pod-1" },
      })
    );
  });

  it("should continue processing other podcasts when one fails", async () => {
    const podcast1 = {
      id: "pod-1",
      feedUrl: "https://fail.example.com/feed.xml",
    };
    const podcast2 = {
      id: "pod-2",
      feedUrl: "https://ok.example.com/feed.xml",
    };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast1, podcast2]);

    // First fetch fails, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        text: vi.fn().mockResolvedValue("<rss></rss>"),
      });

    mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
    mockPrisma.episode.upsert.mockResolvedValue({
      id: "ep-2",
      podcastId: "pod-2",
      guid: "guid-1",
    });
    mockPrisma.podcast.update.mockResolvedValue(podcast2);

    const mockMsg = {
      body: { type: "manual", podcastId: "pod-1" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch<any>;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Second podcast should still be processed
    expect(mockPrisma.episode.upsert).toHaveBeenCalled();
    expect(mockMsg.ack).toHaveBeenCalled();
  });


  describe("per-podcast filtering", () => {
    it("fetches only the specified podcast when podcastId is in message", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-1",
      });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should filter by podcast ID
      expect(mockPrisma.podcast.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["pod-1"] } },
      });
    });

    it("fetches only subscribed podcasts when fetchAll (cron)", async () => {
      // refreshAllPodcasts=false so it uses subscription-based filtering
      (getConfig as any).mockImplementation(async (_p: any, key: string) => {
        if (key === "catalog.refreshAllPodcasts") return false;
        return true;
      });

      // Subscription query returns one subscribed podcast
      mockPrisma.subscription.findMany.mockResolvedValue([
        { podcastId: "pod-1" },
      ]);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-1",
      });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should query subscriptions first
      expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith({
        select: { podcastId: true },
        distinct: ["podcastId"],
      });

      // Then fetch only subscribed podcasts
      expect(mockPrisma.podcast.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["pod-1"] } },
      });
    });

    it("skips podcast fetch when no subscriptions exist (cron)", async () => {
      (getConfig as any).mockImplementation(async (_p: any, key: string) => {
        if (key === "catalog.refreshAllPodcasts") return false;
        return true;
      });

      mockPrisma.subscription.findMany.mockResolvedValue([]);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // No podcast fetch when no subscriptions
      expect(mockPrisma.podcast.findMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });

  describe("subscriber notification on new episodes", () => {
    it("creates FeedItems and dispatches pipeline for new episodes with subscribers", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // No existing episodes — GUID is new
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-new",
        podcastId: "pod-1",
        guid: "guid-1",
      });

      // Two subscribers at different tiers
      mockPrisma.subscription.findMany.mockResolvedValue([
        { userId: "user-1", podcastId: "pod-1", durationTier: 5 },
        { userId: "user-2", podcastId: "pod-1", durationTier: 5 },
        { userId: "user-3", podcastId: "pod-1", durationTier: 10 },
      ]);

      mockPrisma.feedItem.upsert.mockResolvedValue({});
      mockPrisma.briefingRequest.create
        .mockResolvedValueOnce({ id: "req-tier5" })
        .mockResolvedValueOnce({ id: "req-tier10" });
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // FeedItems created for each subscriber
      expect(mockPrisma.feedItem.upsert).toHaveBeenCalledTimes(3);

      // One BriefingRequest per tier
      expect(mockPrisma.briefingRequest.create).toHaveBeenCalledTimes(2);

      // FeedItems linked to requests
      expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledTimes(2);

      // Dispatched to orchestrator for each tier
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledTimes(2);
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
        requestId: "req-tier5",
        action: "evaluate",
      });
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
        requestId: "req-tier10",
        action: "evaluate",
      });

      expect(mockMsg.ack).toHaveBeenCalled();
    });

    it("does not create FeedItems for existing (non-new) episodes", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // GUID already exists — not a new episode
      mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-old",
        podcastId: "pod-1",
        guid: "guid-1",
      });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // No subscriber queries or FeedItem creation
      expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.feedItem.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.briefingRequest.create).not.toHaveBeenCalled();
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).not.toHaveBeenCalled();
    });

    it("skips subscriber notification when no subscriptions for podcast", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // No existing episodes — GUID is new
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-new",
        podcastId: "pod-1",
        guid: "guid-1",
      });
      mockPrisma.subscription.findMany.mockResolvedValue([]);
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockPrisma.feedItem.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.briefingRequest.create).not.toHaveBeenCalled();
    });

    it("groups subscribers by durationTier for efficient pipeline requests", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // No existing episodes — GUID is new
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-new",
        podcastId: "pod-1",
        guid: "guid-1",
      });

      // 3 subscribers: 2 at tier 5, 1 at tier 10
      mockPrisma.subscription.findMany.mockResolvedValue([
        { userId: "user-1", podcastId: "pod-1", durationTier: 5 },
        { userId: "user-2", podcastId: "pod-1", durationTier: 5 },
        { userId: "user-3", podcastId: "pod-1", durationTier: 10 },
      ]);

      mockPrisma.feedItem.upsert.mockResolvedValue({});
      mockPrisma.briefingRequest.create
        .mockResolvedValueOnce({ id: "req-5" })
        .mockResolvedValueOnce({ id: "req-10" });
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // BriefingRequest anchored to first user in each tier group
      expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          targetMinutes: 5,
        }),
      });
      expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-3",
          targetMinutes: 10,
        }),
      });
    });
  });

  describe("GUID-based new episode detection", () => {
    it("detects new episodes by GUID not existing in database", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // No existing episodes — guid-1 from the feed is new
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-new",
        podcastId: "pod-1",
        guid: "guid-1",
      });
      mockPrisma.subscription.findMany.mockResolvedValue([
        { userId: "user-1", podcastId: "pod-1", durationTier: 5 },
      ]);
      mockPrisma.feedItem.upsert.mockResolvedValue({});
      mockPrisma.briefingRequest.create.mockResolvedValue({ id: "req-1" });
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should query existing GUIDs
      expect(mockPrisma.episode.findMany).toHaveBeenCalledWith({
        where: { podcastId: "pod-1" },
        select: { guid: true },
      });

      // New GUID triggers subscriber pipeline
      expect(mockPrisma.feedItem.upsert).toHaveBeenCalledTimes(1);
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledTimes(1);
    });

    it("treats episodes with already-known GUIDs as not new", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);

      // guid-1 already exists in database
      mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-1",
        podcastId: "pod-1",
        guid: "guid-1",
      });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Known GUID — no subscriber pipeline triggered
      expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.feedItem.upsert).not.toHaveBeenCalled();
      expect(mockEnv.ORCHESTRATOR_QUEUE.send).not.toHaveBeenCalled();
    });
  });

  describe("structured logging", () => {
    it("should log batch_start", async () => {
      mockPrisma.subscription.findMany.mockResolvedValue([]);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("should log podcast_refreshed with newEpisodes count", async () => {
      const podcast = {
        id: "pod-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test",
      };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.findMany.mockResolvedValue([{ guid: "guid-1" }]);
      mockPrisma.episode.upsert.mockResolvedValue({
        id: "ep-1",
      });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("podcast_refreshed", {
        podcastId: "pod-1",
        episodesProcessed: 1,
        newEpisodes: 0,
      });
    });

    it("should log podcast_error on failure", async () => {
      const podcast = {
        id: "pod-1",
        feedUrl: "https://fail.example.com/feed.xml",
      };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch<any>;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "podcast_error",
        { podcastId: "pod-1" },
        expect.any(Error)
      );
    });
  });
});
