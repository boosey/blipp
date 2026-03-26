import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { feed } from "../feed";
import { createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "../../lib/admin-helpers";

describe("Feed routes", () => {
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
    app.route("/", feed);

    (getCurrentUser as any).mockResolvedValue({ id: "user1" });
    mockPrisma.episodeVote.findMany.mockResolvedValue([]);
    mockPrisma.podcastVote.findMany.mockResolvedValue([]);
  });

  describe("GET /", () => {
    it("returns paginated feed items with includes", async () => {
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);

      const res = await app.request("/?limit=10&offset=0");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("items");
      expect(data).toHaveProperty("total");
    });

    it("passes source filter to where clause", async () => {
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);

      await app.request("/?source=SUBSCRIPTION");

      expect(mockPrisma.feedItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: "SUBSCRIPTION" }),
        })
      );
    });

    it("passes source=ON_DEMAND filter to where clause", async () => {
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);

      await app.request("/?source=ON_DEMAND");

      expect(mockPrisma.feedItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: "ON_DEMAND" }),
        })
      );
    });

    it("includes narrativeText in clip select", async () => {
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);

      await app.request("/");

      expect(mockPrisma.feedItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            briefing: expect.objectContaining({
              include: expect.objectContaining({
                clip: expect.objectContaining({
                  select: expect.objectContaining({ narrativeText: true }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it("maps narrativeText to previewText in response", async () => {
      mockPrisma.feedItem.findMany.mockResolvedValue([
        {
          id: "fi1",
          source: "SUBSCRIPTION",
          status: "READY",
          listened: false,
          listenedAt: null,
          durationTier: 5,
          createdAt: new Date().toISOString(),
          errorMessage: null,
          episodeId: "e1",
          podcast: { id: "p1", title: "Test", imageUrl: null },
          episode: {
            id: "e1",
            title: "Ep",
            publishedAt: new Date().toISOString(),
            durationSeconds: 3600,
          },
          briefing: {
            id: "b1",
            adAudioUrl: null,
            clip: {
              id: "c1",
              audioKey: "clips/test.mp3",
              actualSeconds: 180,
              narrativeText: "This is a test narrative",
            },
          },
        },
      ]);
      mockPrisma.feedItem.count.mockResolvedValue(1);

      const res = await app.request("/");
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].briefing.clip.previewText).toBe(
        "This is a test narrative"
      );
    });
  });

  describe("GET /:id", () => {
    it("returns a single feed item", async () => {
      mockPrisma.feedItem.findFirst.mockResolvedValue({
        id: "fi1",
        source: "SUBSCRIPTION",
        status: "READY",
        listened: false,
        listenedAt: null,
        durationTier: 5,
        createdAt: new Date().toISOString(),
        clipId: null,
        podcast: { id: "pod1", title: "Test", imageUrl: null },
        episode: { id: "ep1", title: "Ep 1", publishedAt: new Date().toISOString(), durationSeconds: 3600 },
      });

      const res = await app.request("/fi1");
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data).toHaveProperty("item");
      expect(data.item.id).toBe("fi1");
    });

    it("returns 404 for unknown item", async () => {
      mockPrisma.feedItem.findFirst.mockResolvedValue(null);

      const res = await app.request("/unknown");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /:id/listened", () => {
    it("marks item as listened", async () => {
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });

      const res = await app.request("/item1/listened", { method: "PATCH" });
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown item", async () => {
      mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 0 });

      const res = await app.request("/unknown/listened", { method: "PATCH" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /counts", () => {
    it("returns feed counts", async () => {
      mockPrisma.feedItem.count.mockResolvedValue(5);

      const res = await app.request("/counts");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("total");
      expect(data).toHaveProperty("unlistened");
      expect(data).toHaveProperty("pending");
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a feed item and returns success", async () => {
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 1 });

      const res = await app.request("/fi1", { method: "DELETE" });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);

      expect(mockPrisma.feedItem.deleteMany).toHaveBeenCalledWith({
        where: { id: "fi1", userId: "user1" },
      });
    });

    it("returns 404 when no item found", async () => {
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 0 });

      const res = await app.request("/nonexistent", { method: "DELETE" });
      expect(res.status).toBe(404);
      const data: any = await res.json();
      expect(data.error).toBe("Feed item not found");
    });

    it("scopes delete to the authenticated user", async () => {
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 1 });

      await app.request("/fi1", { method: "DELETE" });

      expect(mockPrisma.feedItem.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user1" }),
        })
      );
    });
  });
});
