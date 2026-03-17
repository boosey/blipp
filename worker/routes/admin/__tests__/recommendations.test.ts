import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { recommendationsRoutes } from "../recommendations";
import { createMockPrisma } from "../../../../tests/helpers/mocks";

vi.mock("../../../lib/recommendations", () => ({
  computePodcastProfiles: vi.fn(),
}));

import { computePodcastProfiles } from "../../../lib/recommendations";

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
    it("triggers profile recompute and returns count", async () => {
      (computePodcastProfiles as any).mockResolvedValue(87);

      const res = await app.request("/recompute", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.recomputed).toBe(87);
      expect(computePodcastProfiles).toHaveBeenCalledWith(mockPrisma);
    });
  });
});
