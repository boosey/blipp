import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import { cosineSimilarity, computePodcastProfiles, computeUserProfile, scoreRecommendations } from "../recommendations";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";

let mockPrisma: ReturnType<typeof createMockPrisma>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = { Technology: 0.8, Business: 0.3 };
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity({ A: 1 }, { B: 1 })).toBe(0);
  });

  it("returns 0 when either vector is empty", () => {
    expect(cosineSimilarity({}, { A: 1 })).toBe(0);
    expect(cosineSimilarity({ A: 1 }, {})).toBe(0);
  });

  it("returns a value between 0 and 1 for partial overlap", () => {
    const a = { Tech: 1, Science: 0.5 };
    const b = { Tech: 0.8, Business: 1 };
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

describe("computePodcastProfiles", () => {
  it("returns 0 when no active podcasts", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([]);
    const count = await computePodcastProfiles(mockPrisma);
    expect(count).toBe(0);
    expect(mockPrisma.podcastProfile.upsert).not.toHaveBeenCalled();
  });

  it("upserts a profile for each active podcast", async () => {
    const now = new Date();
    mockPrisma.podcast.findMany.mockResolvedValue([
      {
        id: "pod1",
        categories: ["Technology", "Science"],
        _count: { subscriptions: 10 },
        episodes: [{ publishedAt: now }],
      },
      {
        id: "pod2",
        categories: [],
        _count: { subscriptions: 5 },
        episodes: [],
      },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});

    const count = await computePodcastProfiles(mockPrisma);
    expect(count).toBe(2);
    expect(mockPrisma.podcastProfile.upsert).toHaveBeenCalledTimes(2);

    const firstCall = mockPrisma.podcastProfile.upsert.mock.calls[0][0];
    expect(firstCall.where).toEqual({ podcastId: "pod1" });
    expect(firstCall.create.popularity).toBe(1); // 10/10 = 1 (max)
    expect(firstCall.create.categoryWeights).toMatchObject({ Technology: 0.5, Science: 0.5 });
  });

  it("normalizes popularity relative to max subscribers", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "pod1", categories: [], _count: { subscriptions: 100 }, episodes: [] },
      { id: "pod2", categories: [], _count: { subscriptions: 50 }, episodes: [] },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});

    await computePodcastProfiles(mockPrisma);

    const calls = mockPrisma.podcastProfile.upsert.mock.calls;
    const pop1 = calls[0][0].create.popularity;
    const pop2 = calls[1][0].create.popularity;
    expect(pop1).toBe(1);   // 100/100
    expect(pop2).toBe(0.5); // 50/100
  });
});

describe("computeUserProfile", () => {
  it("upserts a user profile with weighted category aggregation", async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcast: { categories: ["Technology"] } },
    ]);
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([
      { podcast: { categories: ["Technology", "Science"] } },
    ]);
    mockPrisma.feedItem.count.mockResolvedValue(5);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});

    await computeUserProfile("user1", mockPrisma);

    expect(mockPrisma.userRecommendationProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user1" },
        create: expect.objectContaining({ userId: "user1", listenCount: 5 }),
      })
    );

    const weights = mockPrisma.userRecommendationProfile.upsert.mock.calls[0][0].create.categoryWeights;
    // Technology gets 1.0 (sub) + 0.5 (fav) = 1.5; Science gets 0.5 (fav)
    // Normalized: max=1.5, Technology=1.0, Science=0.333
    expect(weights.Technology).toBeCloseTo(1.0);
    expect(weights.Science).toBeCloseTo(0.333, 2);
  });
});

describe("scoreRecommendations", () => {
  function mockConfigDefaults() {
    (getConfig as any)
      .mockResolvedValueOnce(20)    // recommendations.cache.maxResults
      .mockResolvedValueOnce(3)     // recommendations.coldStart.minSubscriptions
      .mockResolvedValueOnce(0.40)  // recommendations.weights.category
      .mockResolvedValueOnce(0.35)  // recommendations.weights.popularity
      .mockResolvedValueOnce(0.15)  // recommendations.weights.freshness
      .mockResolvedValueOnce(0.10); // recommendations.weights.subscriberOverlap
  }

  it("returns popular recommendations for cold-start users", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([]); // 0 subscriptions < 3

    const popularProfiles = [
      { podcastId: "pod1", popularity: 0.9, podcast: { id: "pod1", title: "Pop 1" } },
      { podcastId: "pod2", popularity: 0.7, podcast: { id: "pod2", title: "Pop 2" } },
    ];
    mockPrisma.podcastProfile.findMany.mockResolvedValue(popularProfiles);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.source).toBe("popular");
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].podcastId).toBe("pod1");
  });

  it("computes personalized recommendations for users with enough subscriptions", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" },
      { podcastId: "sub2" },
      { podcastId: "sub3" },
    ]);

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0, Science: 0.5 },
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 0.9 },
        popularity: 0.8,
        freshness: 0.9,
        subscriberCount: 20,
      },
      {
        podcastId: "rec2",
        categoryWeights: { Business: 1.0 },
        popularity: 0.3,
        freshness: 0.1,
        subscriberCount: 2,
      },
    ]);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.source).toBe("personalized");
    expect(result.recommendations).toHaveLength(2);
    // rec1 should score higher (category match + high popularity + high freshness)
    expect(result.recommendations[0].podcastId).toBe("rec1");
  });

  it("excludes already-subscribed podcasts", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" },
      { podcastId: "sub2" },
      { podcastId: "sub3" },
    ]);
    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
    });
    // podcastProfile.findMany is called with notIn filter — Prisma handles exclusion
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(mockPrisma.podcastProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          podcastId: { notIn: expect.arrayContaining(["sub1", "sub2", "sub3"]) },
        }),
      })
    );
    expect(result.recommendations).toHaveLength(0);
  });

  it("computes user profile on-the-fly if missing", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([{ podcastId: "s1" }, { podcastId: "s2" }, { podcastId: "s3" }]) // first call: subscribed IDs
      .mockResolvedValueOnce([{ podcast: { categories: ["Tech"] } }]) // computeUserProfile
      .mockResolvedValueOnce([{ podcastId: "s1" }, { podcastId: "s2" }, { podcastId: "s3" }]); // recursive call

    mockPrisma.userRecommendationProfile.findUnique
      .mockResolvedValueOnce(null) // first check — missing
      .mockResolvedValueOnce({ categoryWeights: { Tech: 1.0 } }); // recursive call
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([]);
    mockPrisma.feedItem.count.mockResolvedValue(0);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);

    // Second call to scoreRecommendations (recursive) needs another set of config mocks
    (getConfig as any)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0.40)
      .mockResolvedValueOnce(0.35)
      .mockResolvedValueOnce(0.15)
      .mockResolvedValueOnce(0.10);

    await scoreRecommendations("user1", mockPrisma);
    expect(mockPrisma.userRecommendationProfile.upsert).toHaveBeenCalled();
  });
});
