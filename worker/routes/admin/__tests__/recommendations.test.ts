import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { recommendationsRoutes } from "../recommendations";
import { createMockPrisma } from "../../../../tests/helpers/mocks";

vi.mock("../../../lib/recommendations", () => ({
  computePodcastProfiles: vi.fn(),
  recomputeUserProfile: vi.fn(),
}));

vi.mock("../../../lib/config", () => ({
  getConfig: vi.fn(),
}));

import { computePodcastProfiles } from "../../../lib/recommendations";
import { getConfig } from "../../../lib/config";

describe("Admin recommendations routes", () => {
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
    app.route("/", recommendationsRoutes);

    // Re-set mocks after clearAllMocks (Vitest v4 clears mockResolvedValue)
    (computePodcastProfiles as any).mockResolvedValue({ processed: 0, cursor: null });
    (getConfig as any).mockResolvedValue(false);
  });

  describe("GET /stats", () => {
    it("returns recommendation system stats", async () => {
      mockPrisma.userRecommendationProfile.count.mockResolvedValue(42);
      mockPrisma.podcastProfile.count.mockResolvedValue(100);
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.recommendationCache.count.mockResolvedValue(30);
      mockPrisma.podcastProfile.findFirst.mockResolvedValue({ computedAt: new Date("2026-03-10") });

      const res = await app.request("/stats");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.usersWithProfiles).toBe(42);
      expect(body.data.podcastsWithProfiles).toBe(100);
      expect(body.data.cacheHitRate).toBeCloseTo(0.6); // 30/50
      expect(body.data.lastComputeAt).not.toBeNull();
    });

    it("returns 0 cacheHitRate when no users", async () => {
      mockPrisma.userRecommendationProfile.count.mockResolvedValue(0);
      mockPrisma.podcastProfile.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.recommendationCache.count.mockResolvedValue(0);
      mockPrisma.podcastProfile.findFirst.mockResolvedValue(null);

      const res = await app.request("/stats");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.cacheHitRate).toBe(0);
      expect(body.data.lastComputeAt).toBeNull();
    });
  });

  describe("POST /recompute", () => {
    it("triggers profile recompute and returns batch result", async () => {
      (computePodcastProfiles as any).mockResolvedValue({ processed: 25, cursor: "pod25" });

      const res = await app.request("/recompute", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.processed).toBe(25);
      expect(body.data.cursor).toBe("pod25");
    });
  });

  describe("GET /topics", () => {
    it("returns paginated topic browser", async () => {
      mockPrisma.podcastProfile.findMany.mockResolvedValue([
        {
          podcastId: "p1",
          topicTags: ["AI", "Tech"],
          computedAt: new Date("2026-03-15"),
          podcast: { id: "p1", title: "AI Show", imageUrl: "http://img", categories: ["Technology"] },
        },
      ]);
      mockPrisma.podcastProfile.count.mockResolvedValue(1);

      const res = await app.request("/topics?page=1&pageSize=20");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].podcastTitle).toBe("AI Show");
      expect(body.data[0].topicTags).toEqual(["AI", "Tech"]);
      expect(body.data[0].topicCount).toBe(2);
      expect(body.total).toBe(1);
    });

    it("supports search filter", async () => {
      mockPrisma.podcastProfile.findMany.mockResolvedValue([]);
      mockPrisma.podcastProfile.count.mockResolvedValue(0);

      const res = await app.request("/topics?search=AI");
      expect(res.status).toBe(200);

      const findManyCall = mockPrisma.podcastProfile.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR).toHaveLength(2);
    });
  });

  describe("GET /topics/:podcastId/episodes", () => {
    it("returns episodes with topic tags", async () => {
      mockPrisma.episode.findMany.mockResolvedValue([
        { id: "e1", title: "Episode 1", publishedAt: new Date("2026-03-14"), topicTags: ["AI", "ML"] },
        { id: "e2", title: "Episode 2", publishedAt: new Date("2026-03-13"), topicTags: ["Tech"] },
      ]);

      const res = await app.request("/topics/p1/episodes");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data).toHaveLength(2);
      expect(body.data[0].topicTags).toEqual(["AI", "ML"]);

      const findManyCall = mockPrisma.episode.findMany.mock.calls[0][0];
      expect(findManyCall.where.podcastId).toBe("p1");
      expect(findManyCall.take).toBe(50);
    });
  });

  describe("GET /embeddings/status", () => {
    it("returns embedding status", async () => {
      (getConfig as any).mockResolvedValue(true);
      mockPrisma.podcastProfile.count
        .mockResolvedValueOnce(10) // with embeddings
        .mockResolvedValueOnce(50); // total
      mockPrisma.userRecommendationProfile.count
        .mockResolvedValueOnce(5)  // with embeddings
        .mockResolvedValueOnce(20); // total
      mockPrisma.podcastProfile.findFirst.mockResolvedValue({
        computedAt: new Date("2026-03-15"),
      });

      const res = await app.request("/embeddings/status");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.enabled).toBe(true);
      expect(body.data.model).toBe("@cf/baai/bge-base-en-v1.5");
      expect(body.data.podcastsWithEmbeddings).toBe(10);
      expect(body.data.podcastsTotal).toBe(50);
      expect(body.data.usersWithEmbeddings).toBe(5);
      expect(body.data.usersTotal).toBe(20);
      expect(body.data.lastComputeAt).not.toBeNull();
    });

    it("returns null lastComputeAt when no embeddings exist", async () => {
      (getConfig as any).mockResolvedValue(false);
      mockPrisma.podcastProfile.count.mockResolvedValue(0);
      mockPrisma.userRecommendationProfile.count.mockResolvedValue(0);
      mockPrisma.podcastProfile.findFirst.mockResolvedValue(null);

      const res = await app.request("/embeddings/status");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.enabled).toBe(false);
      expect(body.data.lastComputeAt).toBeNull();
    });
  });

  describe("POST /embeddings/recompute", () => {
    it("enables embeddings and triggers recompute", async () => {
      mockPrisma.platformConfig.upsert.mockResolvedValue({});
      (computePodcastProfiles as any).mockResolvedValue({ processed: 25, cursor: null });

      const res = await app.request("/embeddings/recompute", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.processed).toBe(25);
      expect(body.data.message).toContain("First batch recomputed");

      expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "recommendations.embeddings.enabled" },
          update: { value: true },
        })
      );
    });
  });

  describe("GET /config", () => {
    it("returns all recommendation config with defaults", async () => {
      mockPrisma.platformConfig.findMany.mockResolvedValue([
        { key: "recommendations.enabled", value: false, description: "Master enable", updatedAt: new Date("2026-03-15") },
      ]);

      const res = await app.request("/config");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.length).toBeGreaterThan(0);

      const enabledConfig = body.data.find((c: any) => c.key === "recommendations.enabled");
      expect(enabledConfig.value).toBe(false);
      expect(enabledConfig.isDefault).toBe(false);
      expect(enabledConfig.updatedAt).not.toBeNull();

      const embeddingsConfig = body.data.find((c: any) => c.key === "recommendations.embeddings.enabled");
      expect(embeddingsConfig.value).toBe(false);
      expect(embeddingsConfig.isDefault).toBe(true);
      expect(embeddingsConfig.updatedAt).toBeNull();
    });
  });

  describe("PATCH /config", () => {
    it("updates recommendation config keys", async () => {
      mockPrisma.platformConfig.upsert.mockResolvedValue({});

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            { key: "recommendations.weights.category", value: 0.3 },
            { key: "recommendations.weights.topic", value: 0.2 },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.updated).toBe(2);
      expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledTimes(2);
    });

    it("rejects empty updates", async () => {
      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [] }),
      });
      expect(res.status).toBe(400);
    });

    it("skips non-recommendation keys", async () => {
      mockPrisma.platformConfig.upsert.mockResolvedValue({});

      const res = await app.request("/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            { key: "recommendations.enabled", value: true },
            { key: "system.debug", value: true },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.updated).toBe(1);
      expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
