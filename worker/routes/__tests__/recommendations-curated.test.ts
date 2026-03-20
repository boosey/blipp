import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { recommendations } from "../recommendations";
import { createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../lib/recommendations", () => ({
  scoreRecommendations: vi.fn(),
  cosineSimilarity: vi.fn(),
  recomputeUserProfile: vi.fn().mockResolvedValue(undefined),
}));

import { getCurrentUser } from "../../lib/admin-helpers";
import { scoreRecommendations } from "../../lib/recommendations";

describe("Curated recommendations and episode browse", () => {
  let app: Hono;
  let mockPrisma: any;

  const mockEpisode = (id: string, podcastId: string, title: string) => ({
    id,
    title,
    publishedAt: new Date("2026-03-15").toISOString(),
    durationSeconds: 3600,
    topicTags: ["tech", "ai"],
    podcast: { id: podcastId, title: `Podcast ${podcastId}`, author: "Author", imageUrl: null, categories: ["Technology"] },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    app = new Hono();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/", recommendations);
    (getCurrentUser as any).mockResolvedValue({ id: "user1" });

    // Default: user has no subscriptions
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    // Default: no recommendation dismissals
    mockPrisma.recommendationDismissal.findMany.mockResolvedValue([]);
    // Default: no user profile
    mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue(null);
    // Default: no favorites
    mockPrisma.podcastFavorite.findFirst.mockResolvedValue(null);
    // Default: scoreRecommendations returns empty
    (scoreRecommendations as any).mockResolvedValue({
      recommendations: [],
      source: "popular",
    });
  });

  describe("GET /curated", () => {
    it("returns rows array with trending episodes", async () => {
      const ep1 = mockEpisode("ep1", "pod1", "Episode 1");
      mockPrisma.episode.findMany.mockResolvedValueOnce([ep1]); // trending row

      const res = await app.request("/curated");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.rows).toBeDefined();
      expect(Array.isArray(data.rows)).toBe(true);
      expect(data.rows.length).toBeGreaterThanOrEqual(1);
      expect(data.rows[0].title).toBe("Trending Now");
      expect(data.rows[0].type).toBe("episodes");
      expect(data.rows[0].items).toHaveLength(1);
      expect(data.podcastSuggestions).toEqual([]);
    });

    it("filters by genre when provided", async () => {
      const ep1 = mockEpisode("ep1", "pod1", "Tech Episode");
      mockPrisma.episode.findMany.mockResolvedValueOnce([ep1]); // trending row

      const res = await app.request("/curated?genre=Technology");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.rows.length).toBeGreaterThanOrEqual(1);
      expect(data.rows[0].title).toBe("Trending in Technology");

      // Verify genre was passed in the Prisma query
      const firstCall = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(firstCall.where.podcast.categories).toEqual({ has: "Technology" });
    });

    it("excludes empty rows from response", async () => {
      // All episode queries return empty
      mockPrisma.episode.findMany.mockResolvedValue([]);

      const res = await app.request("/curated");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.rows).toEqual([]);
    });

    it("includes 'New on topics you follow' when user has topic profile", async () => {
      // No trending episodes
      mockPrisma.episode.findMany
        .mockResolvedValueOnce([]) // trending row - empty
        .mockResolvedValueOnce([mockEpisode("ep2", "pod2", "Topic Episode")]); // topics row

      mockPrisma.userRecommendationProfile.findUnique.mockResolvedValue({
        userId: "user1",
        topicTags: ["artificial-intelligence", "machine-learning"],
      });

      const res = await app.request("/curated");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const topicRow = data.rows.find((r: any) => r.title === "New on topics you follow");
      expect(topicRow).toBeDefined();
      expect(topicRow.type).toBe("episodes");
      expect(topicRow.items).toHaveLength(1);
    });

    it("includes 'Popular with listeners like you' from scoreRecommendations", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([]); // no trending/topic episodes

      (scoreRecommendations as any).mockResolvedValue({
        recommendations: [
          { podcastId: "pod1", score: 0.9, reasons: ["Popular with listeners like you"] },
        ],
        source: "personalized",
      });
      mockPrisma.podcast.findMany.mockResolvedValueOnce([
        { id: "pod1", title: "Popular Pod", author: "A", description: null, imageUrl: null, feedUrl: "http://f", categories: ["Tech"], episodeCount: 10, _count: { subscriptions: 50 } },
      ]);

      const res = await app.request("/curated");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const popularRow = data.rows.find((r: any) => r.title === "Popular with listeners like you");
      expect(popularRow).toBeDefined();
      expect(popularRow.type).toBe("podcasts");
      expect(popularRow.items).toHaveLength(1);
      expect(popularRow.items[0].podcast.id).toBe("pod1");
    });

    it("includes 'Because you like {name}' row when user has favorites", async () => {
      mockPrisma.episode.findMany
        .mockResolvedValueOnce([]) // trending
        .mockResolvedValueOnce([mockEpisode("ep3", "pod3", "Similar Episode")]); // because you like row

      mockPrisma.podcastFavorite.findFirst.mockResolvedValue({
        podcast: { id: "fav1", title: "My Favorite Show", categories: ["Comedy"] },
      });

      const res = await app.request("/curated");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const becauseRow = data.rows.find((r: any) => r.title.startsWith("Because you like"));
      expect(becauseRow).toBeDefined();
      expect(becauseRow.title).toBe("Because you like My Favorite Show");
      expect(becauseRow.type).toBe("episodes");
    });
  });

  describe("GET /episodes", () => {
    it("returns paginated episodes", async () => {
      const episodes = [mockEpisode("ep1", "pod1", "Episode 1")];
      mockPrisma.episode.findMany.mockResolvedValue(episodes);
      mockPrisma.episode.count.mockResolvedValue(1);

      const res = await app.request("/episodes");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.episodes).toHaveLength(1);
      expect(data.episodes[0].episode.id).toBe("ep1");
      expect(data.episodes[0].podcast.id).toBe("pod1");
      expect(data.total).toBe(1);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(20);
    });

    it("filters by genre", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.count.mockResolvedValue(0);

      const res = await app.request("/episodes?genre=Technology");
      expect(res.status).toBe(200);

      const call = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(call.where.podcast).toEqual({ categories: { has: "Technology" } });
    });

    it("filters by search term", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.count.mockResolvedValue(0);

      const res = await app.request("/episodes?search=artificial");
      expect(res.status).toBe(200);

      const call = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { title: { contains: "artificial", mode: "insensitive" } },
        { podcast: { title: { contains: "artificial", mode: "insensitive" } } },
      ]);
    });

    it("respects page and pageSize parameters", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.count.mockResolvedValue(100);

      const res = await app.request("/episodes?page=3&pageSize=10");
      expect(res.status).toBe(200);

      const call = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20); // (3-1) * 10
      expect(call.take).toBe(30); // 10 * 3 (over-fetch for diversity)

      const data = (await res.json()) as any;
      expect(data.page).toBe(3);
      expect(data.pageSize).toBe(10);
    });

    it("caps pageSize at 50", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([]);
      mockPrisma.episode.count.mockResolvedValue(0);

      await app.request("/episodes?pageSize=100");

      const call = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(call.take).toBe(150); // 50 * 3 (over-fetch for diversity)
    });
  });
});
