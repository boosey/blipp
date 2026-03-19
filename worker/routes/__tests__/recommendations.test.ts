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
}));

import { getCurrentUser } from "../../lib/admin-helpers";
import { getConfig } from "../../lib/config";
import { scoreRecommendations, cosineSimilarity } from "../../lib/recommendations";

describe("Recommendations routes", () => {
  let app: Hono;
  let mockPrisma: any;

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
  });

  describe("GET /", () => {
    it("returns empty list when recommendations disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const res = await app.request("/");
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.recommendations).toHaveLength(0);
      expect(data.source).toBe("popular");
    });

    it("returns cached recommendations within 1-hour window", async () => {
      (getConfig as any).mockResolvedValueOnce(true); // enabled

      const freshCache = {
        computedAt: new Date(),
        podcasts: [{ podcastId: "pod1", score: 0.9, reasons: ["Trending podcast"] }],
      };
      mockPrisma.recommendationCache.findUnique.mockResolvedValue(freshCache);
      mockPrisma.podcast.findMany.mockResolvedValue([
        { id: "pod1", title: "Test Pod", author: null, description: null, imageUrl: null, feedUrl: "http://feed", categories: [], episodeCount: 10, _count: { subscriptions: 0 } },
      ]);
      mockPrisma.subscription.count.mockResolvedValue(5);
      (getConfig as any).mockResolvedValueOnce(3); // minSubscriptions

      const res = await app.request("/");
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.recommendations).toHaveLength(1);
      expect(data.recommendations[0].podcast.id).toBe("pod1");
      expect(scoreRecommendations).not.toHaveBeenCalled();
    });

    it("computes fresh recommendations when cache is stale", async () => {
      (getConfig as any).mockResolvedValueOnce(true); // enabled

      const staleDate = new Date(Date.now() - 2 * 3600000); // 2 hours ago
      mockPrisma.recommendationCache.findUnique.mockResolvedValue({
        computedAt: staleDate,
        podcasts: [],
      });

      (scoreRecommendations as any).mockResolvedValue({
        recommendations: [{ podcastId: "pod1", score: 0.8, reasons: ["For you"] }],
        source: "personalized",
      });
      mockPrisma.podcast.findMany.mockResolvedValue([
        { id: "pod1", title: "Fresh Pod", author: null, description: null, imageUrl: null, feedUrl: "http://feed", categories: [], episodeCount: 5, _count: { subscriptions: 0 } },
      ]);
      mockPrisma.recommendationCache.upsert.mockResolvedValue({});

      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(scoreRecommendations).toHaveBeenCalledWith("user1", mockPrisma);
      const data = await res.json() as any;
      expect(data.source).toBe("personalized");
    });

    it("computes fresh recommendations when no cache exists", async () => {
      (getConfig as any).mockResolvedValueOnce(true);
      mockPrisma.recommendationCache.findUnique.mockResolvedValue(null);
      (scoreRecommendations as any).mockResolvedValue({
        recommendations: [],
        source: "popular",
      });
      mockPrisma.podcast.findMany.mockResolvedValue([]);
      mockPrisma.recommendationCache.upsert.mockResolvedValue({});

      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(scoreRecommendations).toHaveBeenCalled();
    });

    it("caches computed recommendations", async () => {
      (getConfig as any).mockResolvedValueOnce(true);
      mockPrisma.recommendationCache.findUnique.mockResolvedValue(null);
      (scoreRecommendations as any).mockResolvedValue({
        recommendations: [{ podcastId: "p1", score: 0.5, reasons: [] }],
        source: "popular",
      });
      mockPrisma.podcast.findMany.mockResolvedValue([]);
      mockPrisma.recommendationCache.upsert.mockResolvedValue({});

      await app.request("/");

      expect(mockPrisma.recommendationCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user1" },
          create: expect.objectContaining({ userId: "user1" }),
        })
      );
    });
  });

  describe("GET /similar/:podcastId", () => {
    it("returns empty list when recommendations disabled", async () => {
      (getConfig as any).mockResolvedValueOnce(false);

      const res = await app.request("/similar/pod1");
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.similar).toHaveLength(0);
    });

    it("returns empty list when no profile found", async () => {
      (getConfig as any).mockResolvedValueOnce(true);
      mockPrisma.podcastProfile.findUnique.mockResolvedValue(null);

      const res = await app.request("/similar/pod1");
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.similar).toHaveLength(0);
    });

    it("returns similar podcasts sorted by cosine similarity", async () => {
      (getConfig as any).mockResolvedValueOnce(true);
      mockPrisma.podcastProfile.findUnique.mockResolvedValue({
        podcastId: "pod1",
        categoryWeights: { Technology: 1.0 },
      });
      mockPrisma.podcastProfile.findMany.mockResolvedValue([
        {
          podcastId: "pod2",
          categoryWeights: { Technology: 0.8 },
          podcast: { id: "pod2", title: "Similar Pod", author: null, description: null, imageUrl: null, feedUrl: "http://feed2", categories: ["Technology"], episodeCount: 5, _count: { subscriptions: 2 } },
        },
        {
          podcastId: "pod3",
          categoryWeights: { Business: 1.0 },
          podcast: { id: "pod3", title: "Different Pod", author: null, description: null, imageUrl: null, feedUrl: "http://feed3", categories: ["Business"], episodeCount: 3, _count: { subscriptions: 0 } },
        },
      ]);
      (cosineSimilarity as any)
        .mockReturnValueOnce(0.9)  // pod2 — high similarity
        .mockReturnValueOnce(0.1); // pod3 — low similarity

      const res = await app.request("/similar/pod1");
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.similar).toHaveLength(2);
      expect(data.similar[0].podcast.id).toBe("pod2");
    });
  });
});
