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
  (getConfig as any).mockResolvedValue(true);
  mockFetch.mockResolvedValue({
    text: vi.fn().mockResolvedValue("<rss></rss>"),
  });
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.error.mockReset();
  mockLogger.timer.mockReset().mockReturnValue(vi.fn());
});

describe("handleFeedRefresh", () => {
  it("should fetch feeds, create episodes, and queue distillation", async () => {
    const podcast = {
      id: "pod-1",
      feedUrl: "https://example.com/feed.xml",
      title: "Test",
    };
    mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
    mockPrisma.episode.upsert.mockResolvedValue({
      id: "ep-1",
      podcastId: "pod-1",
      guid: "guid-1",
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
    } as unknown as MessageBatch;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Verify podcast feed was fetched
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed.xml");

    // Verify episode was created
    expect(mockPrisma.episode.upsert).toHaveBeenCalled();

    // Feed refresh no longer auto-chains to distillation (demand-driven)
    expect(mockEnv.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();

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

    mockPrisma.episode.upsert.mockResolvedValue({
      id: "ep-2",
      podcastId: "pod-2",
      guid: "guid-1",
    });
    mockPrisma.podcast.update.mockResolvedValue(podcast2);

    const mockMsg = {
      body: { type: "cron" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    // Second podcast should still be processed
    expect(mockPrisma.episode.upsert).toHaveBeenCalled();
    expect(mockMsg.ack).toHaveBeenCalled();
  });

  it("should not queue distillation for episodes without transcripts", async () => {
    // Override mock to return episodes without transcriptUrl
    const { parseRssFeed } = await import("../../lib/rss-parser");
    (parseRssFeed as any).mockReturnValueOnce({
      title: "Test",
      description: null,
      imageUrl: null,
      author: null,
      episodes: [
        {
          title: "Ep No Transcript",
          description: "",
          audioUrl: "https://example.com/ep.mp3",
          publishedAt: new Date().toISOString(),
          durationSeconds: 1800,
          guid: "guid-no-transcript",
          transcriptUrl: null,
        },
      ],
    });

    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "pod-1", feedUrl: "https://example.com/feed.xml" },
    ]);
    mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-nt" });
    mockPrisma.podcast.update.mockResolvedValue({});

    const mockMsg = {
      body: { type: "cron" },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const mockBatch = {
      messages: [mockMsg],
      queue: "feed-refresh",
    } as unknown as MessageBatch;

    await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

    expect(mockEnv.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();
  });

  describe("stage-enabled check", () => {
    it("ACKs without processing when stage 1 is disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false); // pipeline.stage.1.enabled

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(mockPrisma.podcast.findMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("bypasses stage-enabled check for manual messages", async () => {
      // getConfig would return false for stage enabled, but manual bypasses it
      (getConfig as any).mockResolvedValue(true);

      mockPrisma.podcast.findMany.mockResolvedValue([
        { id: "pod-1", feedUrl: "https://example.com/feed.xml" },
      ]);
      mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1" });
      mockPrisma.podcast.update.mockResolvedValue({});

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should process even though it's a manual message — stage check is skipped
      expect(mockPrisma.podcast.findMany).toHaveBeenCalled();
      expect(mockMsg.ack).toHaveBeenCalled();
    });
  });

  describe("per-podcast filtering", () => {
    it("fetches only the specified podcast when podcastId is in message", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1" });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should filter by podcast ID
      expect(mockPrisma.podcast.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["pod-1"] } },
      });
    });

    it("fetches all podcasts when message has no podcastId (cron)", async () => {
      (getConfig as any).mockResolvedValue(true);

      const podcast = { id: "pod-1", feedUrl: "https://example.com/feed.xml" };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1" });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should fetch all podcasts (no where clause)
      expect(mockPrisma.podcast.findMany).toHaveBeenCalledWith();
    });

    it("fetches all when batch contains a mix of cron and podcast-specific messages", async () => {
      (getConfig as any).mockResolvedValue(true);

      mockPrisma.podcast.findMany.mockResolvedValue([]);

      const cronMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const podcastMsg = {
        body: { type: "manual", podcastId: "pod-1" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [cronMsg, podcastMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      // Should fetch all because at least one message lacks podcastId
      expect(mockPrisma.podcast.findMany).toHaveBeenCalledWith();
    });
  });

  describe("structured logging", () => {
    it("should log batch_start", async () => {
      mockPrisma.podcast.findMany.mockResolvedValue([]);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("batch_start", { messageCount: 1 });
    });

    it("should log stage_disabled when stage is off", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", { stage: 1 });
    });

    it("should log podcast_refreshed on success", async () => {
      const podcast = {
        id: "pod-1",
        feedUrl: "https://example.com/feed.xml",
        title: "Test",
      };
      mockPrisma.podcast.findMany.mockResolvedValue([podcast]);
      mockPrisma.episode.upsert.mockResolvedValue({ id: "ep-1" });
      mockPrisma.podcast.update.mockResolvedValue(podcast);

      const mockMsg = {
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.info).toHaveBeenCalledWith("podcast_refreshed", {
        podcastId: "pod-1",
        episodesProcessed: 1,
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
        body: { type: "cron" },
        ack: vi.fn(),
        retry: vi.fn(),
      };
      const mockBatch = {
        messages: [mockMsg],
        queue: "feed-refresh",
      } as unknown as MessageBatch;

      await handleFeedRefresh(mockBatch, mockEnv, mockCtx);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "podcast_error",
        { podcastId: "pod-1" },
        expect.any(Error)
      );
    });
  });
});
