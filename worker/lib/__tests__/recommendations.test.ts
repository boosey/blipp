import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import { cosineSimilarity, jaccardSimilarity, computePodcastProfiles, computeUserProfile, scoreRecommendations, scoreEpisodeRecommendations } from "../recommendations";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../work-products", () => ({
  getWorkProduct: vi.fn(),
  wpKey: vi.fn((params: any) => `wp/claims/${params.episodeId}.json`),
}));

vi.mock("../topic-extraction", () => ({
  fingerprint: vi.fn(),
}));

vi.mock("../embeddings", () => ({
  buildEmbeddingText: vi.fn(),
  computeEmbedding: vi.fn(),
  averageEmbeddings: vi.fn(),
  cosineSimilarityVec: vi.fn(),
}));

import { getConfig } from "../config";
import { getWorkProduct } from "../work-products";
import { fingerprint } from "../topic-extraction";
import { buildEmbeddingText, computeEmbedding, averageEmbeddings, cosineSimilarityVec } from "../embeddings";

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
  beforeEach(() => {
    // Default: mock subscription.groupBy to return a max of 10 subs
    mockPrisma.subscription.groupBy.mockResolvedValue([{ podcastId: "pod1", _count: 10 }]);
    // Return defaults for config lookups (mock replaces the real function including fallback logic)
    (getConfig as any).mockImplementation((_p: any, key: string, fallback: any) => Promise.resolve(fallback));
  });

  it("returns processed 0 when no active podcasts", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([]);
    const result = await computePodcastProfiles(mockPrisma);
    expect(result.processed).toBe(0);
    expect(result.cursor).toBeNull();
    expect(mockPrisma.podcastProfile.upsert).not.toHaveBeenCalled();
  });

  it("upserts a profile for each active podcast", async () => {
    const now = new Date();
    mockPrisma.podcast.findMany.mockResolvedValue([
      {
        id: "pod1",
        title: "Tech Podcast",
        description: "A technology podcast",
        categories: ["Technology", "Science"],
        _count: { subscriptions: 10 },
        votes: [{ vote: 1 }, { vote: 1 }, { vote: -1 }],
        episodes: [{ id: "ep1", publishedAt: now }],
      },
      {
        id: "pod2",
        title: "Empty Podcast",
        description: null,
        categories: [],
        _count: { subscriptions: 5 },
        votes: [],
        episodes: [],
      },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});

    const result = await computePodcastProfiles(mockPrisma);
    expect(result.processed).toBe(2);
    expect(result.cursor).toBeNull(); // fewer than batchSize → done
    expect(mockPrisma.podcastProfile.upsert).toHaveBeenCalledTimes(2);

    const firstCall = mockPrisma.podcastProfile.upsert.mock.calls[0][0];
    expect(firstCall.where).toEqual({ podcastId: "pod1" });
    // Popularity is boosted by vote sentiment: 1.0 + (1/3)*0.15 = ~1.05, clamped to 1
    expect(firstCall.create.popularity).toBe(1);
    expect(firstCall.create.categoryWeights).toMatchObject({ Technology: 0.5, Science: 0.5 });
  });

  it("normalizes popularity relative to max subscribers", async () => {
    mockPrisma.subscription.groupBy.mockResolvedValue([{ podcastId: "pod1", _count: 100 }]);
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "pod1", title: "P1", description: null, categories: [], _count: { subscriptions: 100 }, votes: [], episodes: [] },
      { id: "pod2", title: "P2", description: null, categories: [], _count: { subscriptions: 50 }, votes: [], episodes: [] },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});

    await computePodcastProfiles(mockPrisma);

    const calls = mockPrisma.podcastProfile.upsert.mock.calls;
    const pop1 = calls[0][0].create.popularity;
    const pop2 = calls[1][0].create.popularity;
    expect(pop1).toBe(1);   // 100/100
    expect(pop2).toBe(0.5); // 50/100
  });

  it("extracts topics from R2 claims when env is provided", async () => {
    const now = new Date();
    const claimsData = [
      { claim: "Machine learning advances rapidly", speaker: "host", importance: 3, novelty: 2, excerpt: "..." },
      { claim: "Neural networks improve accuracy", speaker: "guest", importance: 2, novelty: 1, excerpt: "..." },
    ];
    const encoded = new TextEncoder().encode(JSON.stringify(claimsData));

    mockPrisma.podcast.findMany.mockResolvedValue([
      {
        id: "pod1",
        title: "AI Pod",
        description: "AI topics",
        categories: ["Technology"],
        _count: { subscriptions: 5 },
        votes: [],
        episodes: [
          { id: "ep1", publishedAt: now },
          { id: "ep2", publishedAt: new Date(now.getTime() - 86400000) },
        ],
      },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});
    mockPrisma.episode.update.mockResolvedValue({});

    (getWorkProduct as any)
      .mockResolvedValueOnce(encoded.buffer) // ep1
      .mockResolvedValueOnce(encoded.buffer); // ep2

    (fingerprint as any)
      .mockReturnValueOnce([
        { topic: "machine learning", weight: 3.0 },
        { topic: "neural networks", weight: 2.0 },
      ])
      .mockReturnValueOnce([
        { topic: "machine learning", weight: 2.5 },
        { topic: "deep learning", weight: 1.5 },
      ]);

    const mockEnv = { R2: { get: vi.fn() } };
    await computePodcastProfiles(mockPrisma, mockEnv);

    // Episode topics should be stored
    expect(mockPrisma.episode.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.episode.update).toHaveBeenCalledWith({
      where: { id: "ep1" },
      data: { topicTags: ["machine learning", "neural networks"] },
    });

    // Podcast profile should include aggregated topics
    const upsertCall = mockPrisma.podcastProfile.upsert.mock.calls[0][0];
    expect(upsertCall.create.topicTags).toContain("machine learning");
    expect(upsertCall.create.topicTags.length).toBeGreaterThan(0);
  });

  it("computes embeddings when enabled and AI binding present", async () => {
    const now = new Date();
    const claimsData = [{ claim: "test claim", speaker: "host", importance: 1, novelty: 1, excerpt: "..." }];
    const encoded = new TextEncoder().encode(JSON.stringify(claimsData));

    mockPrisma.podcast.findMany.mockResolvedValue([
      {
        id: "pod1",
        title: "Test Pod",
        description: "A test podcast",
        categories: [],
        _count: { subscriptions: 1 },
        votes: [],
        episodes: [{ id: "ep1", publishedAt: now }],
      },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});
    mockPrisma.episode.update.mockResolvedValue({});

    (getWorkProduct as any).mockResolvedValue(encoded.buffer);
    (fingerprint as any).mockReturnValue([{ topic: "testing", weight: 1.0 }]);
    (getConfig as any).mockResolvedValue(true); // embeddings enabled
    (buildEmbeddingText as any).mockReturnValue("Test Pod A test podcast testing");
    (computeEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

    const mockEnv = { R2: { get: vi.fn() }, AI: { run: vi.fn() } };
    await computePodcastProfiles(mockPrisma, mockEnv);

    expect(buildEmbeddingText).toHaveBeenCalledWith("Test Pod", "A test podcast", ["testing"]);
    expect(computeEmbedding).toHaveBeenCalledWith(mockEnv.AI, "Test Pod A test podcast testing");

    const upsertCall = mockPrisma.podcastProfile.upsert.mock.calls[0][0];
    expect(upsertCall.create.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("skips topics and embeddings when env is not provided", async () => {
    mockPrisma.podcast.findMany.mockResolvedValue([
      {
        id: "pod1",
        title: "P1",
        description: null,
        categories: ["Tech"],
        _count: { subscriptions: 1 },
        votes: [],
        episodes: [{ id: "ep1", publishedAt: new Date() }],
      },
    ]);
    mockPrisma.podcastProfile.upsert.mockResolvedValue({});

    await computePodcastProfiles(mockPrisma);

    expect(getWorkProduct).not.toHaveBeenCalled();
    expect(fingerprint).not.toHaveBeenCalled();
    const upsertCall = mockPrisma.podcastProfile.upsert.mock.calls[0][0];
    expect(upsertCall.create.topicTags).toEqual([]);
  });
});

describe("computeUserProfile", () => {
  it("upserts a user profile with weighted category aggregation", async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "pod1", podcast: { categories: ["Technology"] } },
    ]);
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([
      { podcast: { categories: ["Technology", "Science"] } },
    ]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
    mockPrisma.episodeVote.findMany.mockResolvedValue([]);
    mockPrisma.feedItem.count.mockResolvedValue(5);
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);
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

  it("incorporates vote signals into category weights", async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([
      { vote: 1, podcastId: "pod1", podcast: { categories: ["Comedy", "Society"] } },
      { vote: -1, podcastId: "pod2", podcast: { categories: ["True Crime"] } },
    ]);
    mockPrisma.episodeVote.findMany.mockResolvedValue([
      { vote: 1, episode: { podcast: { categories: ["Comedy"] } } },
    ]);
    mockPrisma.feedItem.count.mockResolvedValue(0);
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});

    await computeUserProfile("user1", mockPrisma);

    const weights = mockPrisma.userRecommendationProfile.upsert.mock.calls[0][0].create.categoryWeights;
    // Comedy: 0.7 (podcast upvote) + 0.3 (episode upvote) = 1.0
    // Society: 0.7 (podcast upvote)
    // True Crime: -0.7 (podcast downvote) → clamped to 0
    expect(weights.Comedy).toBeCloseTo(1.0);
    expect(weights.Society).toBeCloseTo(0.7);
    expect(weights["True Crime"]).toBe(0);
  });

  it("aggregates topics from podcast profiles into user profile", async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "pod1", podcast: { categories: ["Tech"] } },
    ]);
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([
      { vote: 1, podcastId: "pod2", podcast: { categories: ["Science"] } },
    ]);
    mockPrisma.episodeVote.findMany.mockResolvedValue([]);
    mockPrisma.feedItem.count.mockResolvedValue(0);
    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      { podcastId: "pod1", topicTags: ["machine learning", "neural networks"], embedding: [0.1, 0.2] },
      { podcastId: "pod2", topicTags: ["quantum computing", "machine learning"], embedding: null },
    ]);
    (averageEmbeddings as any).mockReturnValue([0.1, 0.2]);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});

    await computeUserProfile("user1", mockPrisma);

    const upsertCall = mockPrisma.userRecommendationProfile.upsert.mock.calls[0][0];
    // pod1 is subscribed (weight 1.0), pod2 is upvoted (weight 0.7)
    expect(upsertCall.create.topicTags).toContain("machine learning");
    expect(upsertCall.create.topicTags).toContain("neural networks");
    expect(upsertCall.create.topicTags).toContain("quantum computing");
    // Embedding from subscribed podcast only (pod1 has embedding)
    expect(upsertCall.create.embedding).toEqual([0.1, 0.2]);
  });
});

describe("scoreRecommendations", () => {
  function mockConfigDefaults() {
    (getConfig as any)
      .mockResolvedValueOnce(20)    // recommendations.cache.maxResults
      .mockResolvedValueOnce(3)     // recommendations.coldStart.minSubscriptions
      .mockResolvedValueOnce(0.25)  // recommendations.weights.category
      .mockResolvedValueOnce(0.20)  // recommendations.weights.popularity
      .mockResolvedValueOnce(0.10)  // recommendations.weights.freshness
      .mockResolvedValueOnce(0.15)  // recommendations.weights.subscriberOverlap
      .mockResolvedValueOnce(0.15)  // recommendations.weights.topic
      .mockResolvedValueOnce(0.15); // recommendations.weights.embedding
  }

  function mockDefaultExclusions() {
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([]);
  }

  it("returns popular recommendations for cold-start users", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([]); // 0 subscriptions < 3
    mockDefaultExclusions();

    const rankedPodcasts = [
      { id: "pod1", title: "Pop 1", author: "A", description: "D", imageUrl: null, feedUrl: "f1", categories: [], episodeCount: 10, appleRank: 1 },
      { id: "pod2", title: "Pop 2", author: "B", description: "D", imageUrl: null, feedUrl: "f2", categories: [], episodeCount: 5, appleRank: 2 },
    ];
    mockPrisma.podcast.findMany.mockResolvedValue(rankedPodcasts);
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]); // no backfill needed

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.source).toBe("popular");
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].podcastId).toBe("pod1");
    expect(result.recommendations[0].reasons[0]).toContain("#1");
  });

  it("computes personalized recommendations for users with enough subscriptions", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" },
      { podcastId: "sub2" },
      { podcastId: "sub3" },
    ]);
    mockDefaultExclusions();

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0, Science: 0.5 },
      listenCount: 10,
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 0.9 },
        popularity: 0.8,
        freshness: 0.9,
        subscriberCount: 20,
        podcast: { subscriptions: [{ userId: "u1" }, { userId: "u2" }] },
      },
      {
        podcastId: "rec2",
        categoryWeights: { Business: 1.0 },
        popularity: 0.3,
        freshness: 0.1,
        subscriberCount: 2,
        podcast: { subscriptions: [] },
      },
    ]);

    // User's own subscribed podcasts' subscriber lists
    mockPrisma.podcast.findMany.mockResolvedValue([
      { id: "sub1", subscriptions: [{ userId: "u1" }] },
      { id: "sub2", subscriptions: [{ userId: "u2" }] },
      { id: "sub3", subscriptions: [] },
    ]);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.source).toBe("personalized");
    expect(result.recommendations).toHaveLength(2);
    // rec1 should score higher (category match + high popularity + high freshness + overlap)
    expect(result.recommendations[0].podcastId).toBe("rec1");
  });

  it("excludes subscribed, downvoted, and dismissed podcasts", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" },
      { podcastId: "sub2" },
      { podcastId: "sub3" },
    ]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([
      { podcastId: "downvoted1" },
    ]);
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([
      { podcastId: "dismissed1" },
    ]);
    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      listenCount: 0,
    });
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(mockPrisma.podcastProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          podcastId: { notIn: expect.arrayContaining(["sub1", "sub2", "sub3", "downvoted1", "dismissed1"]) },
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
      .mockResolvedValueOnce({ categoryWeights: { Tech: 1.0 }, listenCount: 0 }); // recursive call
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
    mockPrisma.episodeVote.findMany.mockResolvedValue([]);
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([]);
    mockPrisma.feedItem.count.mockResolvedValue(0);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});
    // computeUserProfile now queries podcast profiles for topic aggregation
    mockPrisma.podcastProfile.findMany
      .mockResolvedValueOnce([]) // computeUserProfile's profile lookup
      .mockResolvedValueOnce([]); // recursive scoreRecommendations candidate profiles
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    // Second call to scoreRecommendations (recursive) needs another set of config mocks
    (getConfig as any)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0.25)
      .mockResolvedValueOnce(0.20)
      .mockResolvedValueOnce(0.10)
      .mockResolvedValueOnce(0.15)
      .mockResolvedValueOnce(0.15)
      .mockResolvedValueOnce(0.15);

    await scoreRecommendations("user1", mockPrisma);
    expect(mockPrisma.userRecommendationProfile.upsert).toHaveBeenCalled();
  });

  it("boosts category weight for high-engagement users", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" }, { podcastId: "sub2" }, { podcastId: "sub3" },
    ]);
    mockDefaultExclusions();

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      listenCount: 200, // high engagement → 1.3x multiplier
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 1.0 },
        popularity: 0.5,
        freshness: 0.5,
        subscriberCount: 5,
        podcast: { subscriptions: [] },
      },
    ]);
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    const result = await scoreRecommendations("user1", mockPrisma);
    // No embeddings, so weight is redistributed. Category capped at 1.0.
    // With redistribution scale = 1.0/0.85 ≈ 1.176
    // Score > 0.25*1.176*1 + 0.20*1.176*0.5 + 0.10*1.176*0.5 = ~0.47
    expect(result.recommendations[0].score).toBeGreaterThan(0.4);
  });

  it("includes topic similarity scoring with reason string", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" }, { podcastId: "sub2" }, { podcastId: "sub3" },
    ]);
    mockDefaultExclusions();

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      topicTags: ["machine learning", "neural networks", "deep learning"],
      listenCount: 10,
      embedding: null,
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 0.9 },
        topicTags: ["machine learning", "neural networks", "transformers"],
        popularity: 0.5,
        freshness: 0.5,
        subscriberCount: 5,
        embedding: null,
        podcast: { subscriptions: [] },
      },
    ]);
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.recommendations[0].reasons).toContain("Both cover machine learning");
  });

  it("includes embedding similarity scoring with reason string", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" }, { podcastId: "sub2" }, { podcastId: "sub3" },
    ]);
    mockDefaultExclusions();

    const userEmb = [0.1, 0.2, 0.3];
    const podcastEmb = [0.1, 0.2, 0.3];

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      topicTags: [],
      listenCount: 10,
      embedding: userEmb,
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 0.9 },
        topicTags: [],
        popularity: 0.5,
        freshness: 0.5,
        subscriberCount: 5,
        embedding: podcastEmb,
        podcast: { subscriptions: [] },
      },
    ]);
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    (cosineSimilarityVec as any).mockReturnValue(0.85);

    const result = await scoreRecommendations("user1", mockPrisma);
    expect(result.recommendations[0].reasons).toContain("Semantically similar to podcasts you enjoy");
  });

  it("redistributes embedding weight when embeddings are missing", async () => {
    mockConfigDefaults();
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "sub1" }, { podcastId: "sub2" }, { podcastId: "sub3" },
    ]);
    mockDefaultExclusions();

    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      topicTags: [],
      listenCount: 0,
      embedding: null,
    });

    mockPrisma.podcastProfile.findMany.mockResolvedValue([
      {
        podcastId: "rec1",
        categoryWeights: { Technology: 1.0 },
        topicTags: [],
        popularity: 1.0,
        freshness: 1.0,
        subscriberCount: 5,
        embedding: null,
        podcast: { subscriptions: [] },
      },
    ]);
    mockPrisma.podcast.findMany.mockResolvedValue([]);

    const result = await scoreRecommendations("user1", mockPrisma);
    // Without redistribution: 0.25+0.20+0.10+0+0 = 0.55 (missing 0.15 embedding weight)
    // With redistribution: scale = 1.0/0.85, total ≈ 0.55 * (1/0.85) ≈ 0.647
    // Actual: (0.25*scale*1 + 0.20*scale*1 + 0.10*scale*1) = 0.55 * 1.176 ≈ 0.647
    expect(result.recommendations[0].score).toBeCloseTo(0.647, 2);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 0 for two empty arrays", () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it("returns 0 for disjoint arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 1 for identical arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("returns correct value for partial overlap", () => {
    // intersection={a}, union={a,b,c} → 1/3
    expect(jaccardSimilarity(["a", "b"], ["a", "c"])).toBeCloseTo(1 / 3);
  });

  it("returns 0 when one array is empty", () => {
    expect(jaccardSimilarity([], ["a"])).toBe(0);
    expect(jaccardSimilarity(["a"], [])).toBe(0);
  });

  it("handles duplicates by deduplicating via Set", () => {
    // ["a","a"] → Set{a}, ["a","b"] → Set{a,b}, intersection=1, union=2 → 0.5
    expect(jaccardSimilarity(["a", "a"], ["a", "b"])).toBeCloseTo(0.5);
  });
});

describe("scoreEpisodeRecommendations", () => {
  it("scores episodes by topic overlap and returns podcast suggestions", async () => {
    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
      categoryWeights: { Technology: 1.0 },
      topicTags: ["machine learning", "neural networks", "deep learning"],
      listenCount: 10,
      embedding: null,
    });

    mockPrisma.subscription.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([]);

    const now = new Date();
    mockPrisma.episode.findMany.mockResolvedValue([
      { id: "ep1", podcastId: "pod1", topicTags: ["machine learning", "transformers"], publishedAt: now, podcast: { id: "pod1", title: "AI Pod" } },
      { id: "ep2", podcastId: "pod1", topicTags: ["neural networks"], publishedAt: now, podcast: { id: "pod1", title: "AI Pod" } },
      { id: "ep3", podcastId: "pod1", topicTags: ["deep learning", "machine learning"], publishedAt: now, podcast: { id: "pod1", title: "AI Pod" } },
      { id: "ep4", podcastId: "pod2", topicTags: ["cooking"], publishedAt: now, podcast: { id: "pod2", title: "Cook Pod" } },
    ]);

    const result = await scoreEpisodeRecommendations("user1", mockPrisma);

    // 3 episodes from pod1 should match, ep4 has no overlap → score = 0
    expect(result.episodes.length).toBe(3);
    expect(result.episodes.every((e: any) => e.podcastId === "pod1")).toBe(true);

    // pod1 has 3+ matched episodes → should appear in podcastSuggestions
    expect(result.podcastSuggestions.length).toBe(1);
    expect(result.podcastSuggestions[0].podcastId).toBe("pod1");
    expect(result.podcastSuggestions[0].reasons[0]).toContain("3 recent episodes");
  });

  it("computes user profile on-the-fly if missing", async () => {
    mockPrisma.userRecommendationProfile.findUnique
      .mockResolvedValueOnce(null) // first check
      .mockResolvedValueOnce({ // after compute
        categoryWeights: {},
        topicTags: ["ai"],
        listenCount: 0,
        embedding: null,
      });

    // computeUserProfile mocks
    mockPrisma.subscription.findMany
      .mockResolvedValueOnce([]) // computeUserProfile
      .mockResolvedValueOnce([]); // recursive scoreEpisodeRecommendations
    mockPrisma.podcastFavorite.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
    mockPrisma.episodeVote.findMany.mockResolvedValue([]);
    mockPrisma.feedItem.count.mockResolvedValue(0);
    mockPrisma.userRecommendationProfile.upsert.mockResolvedValue({});
    mockPrisma.podcastProfile.findMany.mockResolvedValue([]);
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([]);
    mockPrisma.episode.findMany.mockResolvedValue([]);

    const result = await scoreEpisodeRecommendations("user1", mockPrisma);
    expect(mockPrisma.userRecommendationProfile.upsert).toHaveBeenCalled();
    expect(result.episodes).toHaveLength(0);
  });
});
