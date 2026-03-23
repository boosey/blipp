import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/catalog-sources", () => ({
  getCatalogSource: vi.fn(),
}));

import { createPrismaClient } from "../../lib/db";
import { getCatalogSource } from "../../lib/catalog-sources";
import { handleCatalogRefresh } from "../catalog-refresh";
import type { CatalogRefreshMessage } from "../../lib/queue-messages";
import type { DiscoveredPodcast } from "../../lib/catalog-sources";

let mockPrisma: ReturnType<typeof createMockPrisma> & {
  category: ReturnType<typeof createModelMethods>;
  podcastCategory: ReturnType<typeof createModelMethods>;
};
let mockEnv: ReturnType<typeof createMockEnv>;
let mockCtx: ExecutionContext;
let mockAppleDiscover: ReturnType<typeof vi.fn>;

function createModelMethods() {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    createMany: vi.fn(),
  };
}

const sampleDiscovered: DiscoveredPodcast[] = [
  {
    feedUrl: "https://example.com/feed1.xml",
    title: "Podcast One",
    description: "First podcast",
    imageUrl: "https://example.com/img1.jpg",
    author: "Author One",
    appleId: "111",
    categories: [
      { genreId: "1301", name: "Arts" },
      { genreId: "1309", name: "TV & Film" },
      { genreId: "26", name: "Podcasts" }, // should be filtered
    ],
    appleMetadata: { collectionId: 111, kind: "podcast" },
  },
  {
    feedUrl: "https://example.com/feed2.xml",
    title: "Podcast Two",
    description: "Second podcast",
    imageUrl: "https://example.com/img2.jpg",
    author: "Author Two",
    appleId: "222",
    categories: [{ genreId: "1301", name: "Arts" }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();

  const basePrisma = createMockPrisma();
  mockPrisma = {
    ...basePrisma,
    category: createModelMethods(),
    podcastCategory: createModelMethods(),
  } as any;

  mockEnv = createMockEnv();
  // Add sendBatch to FEED_REFRESH_QUEUE
  (mockEnv.FEED_REFRESH_QUEUE as any).sendBatch = vi.fn().mockResolvedValue(undefined);

  mockCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  (createPrismaClient as any).mockReturnValue(mockPrisma);

  mockAppleDiscover = vi.fn().mockResolvedValue(sampleDiscovered);
  (getCatalogSource as any).mockImplementation((id: string) => {
    if (id === "apple") return { name: "Apple Podcasts", identifier: "apple", discover: mockAppleDiscover, search: vi.fn() };
    return { name: "Podcast Index", identifier: "podcast-index", discover: vi.fn().mockResolvedValue([]), search: vi.fn() };
  });

  // Default mock behaviors
  mockPrisma.platformConfig.upsert.mockResolvedValue({});
  mockPrisma.category.upsert
    .mockResolvedValueOnce({ id: "cat-arts", appleGenreId: "1301", name: "Arts" })
    .mockResolvedValueOnce({ id: "cat-tv", appleGenreId: "1309", name: "TV & Film" });
  mockPrisma.podcast.upsert
    .mockResolvedValueOnce({ id: "pod-1", status: "active" })
    .mockResolvedValueOnce({ id: "pod-2", status: "active" });
  mockPrisma.podcastCategory.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.podcastCategory.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.podcast.findUnique.mockResolvedValue(null);
  mockPrisma.podcast.findMany.mockResolvedValue([]);
  mockPrisma.subscription.count.mockResolvedValue(0);
});

function createBatch(action: "seed" | "refresh"): MessageBatch<CatalogRefreshMessage> {
  return {
    messages: [
      {
        body: { action },
        ack: vi.fn(),
        retry: vi.fn(),
        id: "msg-1",
        timestamp: new Date(),
        attempts: 1,
      },
    ],
    queue: "catalog-refresh",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<CatalogRefreshMessage>;
}

describe("handleCatalogRefresh", () => {
  it("calls discover on Apple source", async () => {
    const batch = createBatch("refresh");

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(getCatalogSource).toHaveBeenCalledWith("apple");
    expect(mockAppleDiscover).toHaveBeenCalledWith(100, mockEnv);
  });

  it("upserts categories from discovered podcasts, filtering genreId 26", async () => {
    const batch = createBatch("refresh");

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    // Should upsert 2 unique categories (1301 Arts, 1309 TV & Film), not "26" Podcasts
    expect(mockPrisma.category.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.category.upsert).toHaveBeenCalledWith({
      where: { appleGenreId: "1301" },
      update: { name: "Arts" },
      create: { appleGenreId: "1301", name: "Arts" },
    });
    expect(mockPrisma.category.upsert).toHaveBeenCalledWith({
      where: { appleGenreId: "1309" },
      update: { name: "TV & Film" },
      create: { appleGenreId: "1309", name: "TV & Film" },
    });
  });

  it("upserts podcasts with correct data shape", async () => {
    const batch = createBatch("refresh");

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.podcast.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feedUrl: "https://example.com/feed1.xml" },
        create: expect.objectContaining({
          title: "Podcast One",
          feedUrl: "https://example.com/feed1.xml",
          status: "active",
          appleId: "111",
          source: "apple",
        }),
      })
    );
  });

  it("creates PodcastCategory join records", async () => {
    const batch = createBatch("refresh");

    mockPrisma.podcast.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.status) return []; // markPendingDeletion
      if (args?.where?.feedUrl) {
        return [
          { id: "pod-1", feedUrl: "https://example.com/feed1.xml", source: "apple" },
          { id: "pod-2", feedUrl: "https://example.com/feed2.xml", source: "apple" },
        ];
      }
      return [];
    });

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    // Batch delete old joins for chunk
    expect(mockPrisma.podcastCategory.deleteMany).toHaveBeenCalledWith({
      where: { podcastId: { in: ["pod-1", "pod-2"] } },
    });
    // Batch create new join records
    expect(mockPrisma.podcastCategory.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { podcastId: "pod-1", categoryId: "cat-arts" },
        { podcastId: "pod-1", categoryId: "cat-tv" },
      ]),
      skipDuplicates: true,
    });
  });

  it("marks unsubscribed podcasts not in charts as pending_deletion on refresh", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "pod-1" },
      { id: "pod-2" },
      { id: "pod-old" }, // not in charts
    ]);
    mockPrisma.subscription.count.mockImplementation(async (args: any) => {
      return args.where.podcastId === "pod-old" ? 0 : 1;
    });

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pod-old"] } },
      data: { status: "pending_deletion" },
    });
  });

  it("does not mark podcasts with subscribers as pending_deletion", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "pod-1" },
      { id: "pod-2" },
      { id: "pod-subscribed" },
    ]);
    mockPrisma.subscription.count.mockResolvedValue(1);

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.updateMany).not.toHaveBeenCalled();
  });

  it("does not mark pending_deletion on seed action", async () => {
    const batch = createBatch("seed");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active" } })
    );
  });

  it("wipes catalog data on seed action", async () => {
    const batch = createBatch("seed");
    mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.briefing.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.briefingRequest.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.clip.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.distillation.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.subscription.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.episode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.podcast.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.category.deleteMany.mockResolvedValue({ count: 0 });

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.feedItem.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.briefing.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.subscription.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.episode.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.podcast.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.category.deleteMany).toHaveBeenCalled();
  });

  it("queues feed refresh for upserted podcasts", async () => {
    const batch = createBatch("refresh");

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect((mockEnv.FEED_REFRESH_QUEUE as any).sendBatch).toHaveBeenCalled();
    const sendBatchCall = (mockEnv.FEED_REFRESH_QUEUE as any).sendBatch.mock.calls[0][0];
    expect(sendBatchCall).toEqual(
      expect.arrayContaining([
        { body: { podcastId: "pod-1", type: "manual" } },
        { body: { podcastId: "pod-2", type: "manual" } },
      ])
    );
  });

  it("auto-restores pending_deletion podcasts that reappear in charts", async () => {
    mockPrisma.podcast.findUnique.mockResolvedValue(null);
    mockPrisma.podcast.upsert
      .mockReset()
      .mockResolvedValueOnce({ id: "pod-1", status: "pending_deletion" })
      .mockResolvedValueOnce({ id: "pod-2", status: "active" });
    mockPrisma.podcast.update.mockResolvedValue({ id: "pod-1", status: "active" });

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.update).toHaveBeenCalledWith({
      where: { id: "pod-1" },
      data: { status: "active" },
    });
  });

  it("acks message on success", async () => {
    const batch = createBatch("refresh");

    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(batch.messages[0].ack).toHaveBeenCalled();
    expect(batch.messages[0].retry).not.toHaveBeenCalled();
  });

  it("retries message on Apple failure", async () => {
    mockAppleDiscover.mockRejectedValue(new Error("Apple API down"));

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    // Source failure should retry the message
    expect(batch.messages[0].retry).toHaveBeenCalled();
  });

  it("updates status through lifecycle stages", async () => {
    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    const statusCalls = mockPrisma.platformConfig.upsert.mock.calls.map(
      (call: any) => call[0].update.value
    );
    expect(statusCalls).toContain("fetching_charts");
    expect(statusCalls).toContain("resolving_metadata");
    expect(statusCalls).toContain("upserting");
    expect(statusCalls).toContain("complete");
  });

  it("disconnects prisma via waitUntil", async () => {
    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockCtx.waitUntil).toHaveBeenCalled();
  });

  it("skips podcasts without feedUrl", async () => {
    const noFeedPodcast: DiscoveredPodcast = {
      feedUrl: "",
      title: "No Feed",
    };
    mockAppleDiscover.mockResolvedValue([noFeedPodcast]);

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    expect(mockPrisma.podcast.upsert).not.toHaveBeenCalled();
  });

  it("batches feed refresh queue messages in groups of 100", async () => {
    const largeBatch: DiscoveredPodcast[] = Array.from({ length: 150 }, (_, i) => ({
      feedUrl: `https://example.com/feed${i}.xml`,
      title: `Podcast ${i}`,
      categories: [],
    }));
    mockAppleDiscover.mockResolvedValue(largeBatch);
    mockPrisma.podcast.upsert.mockImplementation(async () => {
      const id = `pod-${Math.random()}`;
      return { id, status: "active" };
    });

    const batch = createBatch("refresh");
    await handleCatalogRefresh(batch, mockEnv, mockCtx);

    // Should be called twice: batch of 100 + batch of 50
    expect((mockEnv.FEED_REFRESH_QUEUE as any).sendBatch).toHaveBeenCalledTimes(2);
  });
});
