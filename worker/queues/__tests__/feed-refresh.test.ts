import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { handleFeedRefresh } from "../feed-refresh";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
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

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);
  mockFetch.mockResolvedValue({
    text: vi.fn().mockResolvedValue("<rss></rss>"),
  });
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

    // Verify distillation was queued (because transcriptUrl is present)
    expect(mockEnv.DISTILLATION_QUEUE.send).toHaveBeenCalledWith({
      episodeId: "ep-1",
      transcriptUrl: "https://example.com/ep1.vtt",
    });

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
});
