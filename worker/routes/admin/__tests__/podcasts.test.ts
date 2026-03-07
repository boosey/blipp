import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { createMockEnv, createMockPrisma } from "../../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const { podcastsRoutes } = await import("../podcasts");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Admin Podcasts Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/podcasts", podcastsRoutes);

    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });
    mockPrisma.$disconnect.mockResolvedValue(undefined);
  });

  describe("GET /podcasts/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/podcasts/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /podcasts/stats", () => {
    it("returns catalog stats", async () => {
      mockPrisma.podcast.count.mockResolvedValueOnce(25).mockResolvedValueOnce(3);
      mockPrisma.podcast.groupBy
        .mockResolvedValueOnce([
          { feedHealth: "excellent", _count: 10 },
          { feedHealth: "good", _count: 12 },
          { feedHealth: "broken", _count: 3 },
        ])
        .mockResolvedValueOnce([
          { status: "active", _count: 22 },
          { status: "archived", _count: 3 },
        ]);

      const res = await app.request("/podcasts/stats", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("total");
      expect(body.data).toHaveProperty("byHealth");
      expect(body.data).toHaveProperty("byStatus");
      expect(body.data).toHaveProperty("needsAttention");
    });

    it("returns zeroed stats when columns missing", async () => {
      mockPrisma.podcast.count.mockRejectedValueOnce(new Error("column missing"));

      const res = await app.request("/podcasts/stats", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.total).toBe(0);
    });
  });

  describe("GET /podcasts/", () => {
    it("returns paginated podcast list", async () => {
      const now = new Date();
      mockPrisma.podcast.findMany.mockResolvedValueOnce([
        {
          id: "pod1", title: "Test", description: "desc", feedUrl: "http://x.com/feed",
          imageUrl: null, author: "Auth", categories: [], lastFetchedAt: now,
          feedHealth: "good", feedError: null, status: "active",
          createdAt: now, updatedAt: now,
          _count: { episodes: 10, subscriptions: 5 },
        },
      ]);
      mockPrisma.podcast.count.mockResolvedValueOnce(1);

      const res = await app.request("/podcasts", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty("episodeCount");
      expect(body.data[0]).toHaveProperty("subscriberCount");
      expect(body.total).toBe(1);
    });
  });

  describe("GET /podcasts/:id", () => {
    it("returns podcast detail with episodes", async () => {
      const now = new Date();
      mockPrisma.podcast.findUnique.mockResolvedValueOnce({
        id: "pod1", title: "Test", description: "desc", feedUrl: "http://x.com/feed",
        imageUrl: null, author: "Auth", categories: [], lastFetchedAt: now,
        feedHealth: "good", feedError: null, status: "active",
        createdAt: now, updatedAt: now,
        _count: { episodes: 1, subscriptions: 2 },
        episodes: [
          {
            id: "ep1", title: "Episode 1", publishedAt: now, durationSeconds: 600,
            distillation: { status: "COMPLETED" },
            _count: { clips: 3 },
          },
        ],
      });
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/podcasts/pod1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("pod1");
      expect(body.data.episodes).toHaveLength(1);
      expect(body.data).toHaveProperty("recentPipelineActivity");
    });

    it("returns 404 when not found", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/podcasts/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /podcasts/", () => {
    it("creates a podcast and returns 201", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce(null);
      mockPrisma.podcast.create.mockResolvedValueOnce({ id: "pod_new", title: "New", feedUrl: "http://new.com/feed" });

      const res = await app.request("/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: "http://new.com/feed", title: "New" }),
      }, env, mockExCtx);
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.id).toBe("pod_new");
    });

    it("returns 400 when missing fields", async () => {
      const res = await app.request("/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "No URL" }),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("returns 409 when duplicate feedUrl", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce({ id: "existing" });

      const res = await app.request("/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: "http://dup.com/feed", title: "Dup" }),
      }, env, mockExCtx);
      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /podcasts/:id", () => {
    it("updates and returns podcast", async () => {
      mockPrisma.podcast.update.mockResolvedValueOnce({ id: "pod1", status: "paused" });

      const res = await app.request("/podcasts/pod1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.status).toBe("paused");
    });
  });

  describe("DELETE /podcasts/:id", () => {
    it("soft-deletes (archives) podcast", async () => {
      mockPrisma.podcast.update.mockResolvedValueOnce({ id: "pod1", status: "archived" });

      const res = await app.request("/podcasts/pod1", { method: "DELETE" }, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.status).toBe("archived");
    });
  });

  describe("POST /podcasts/:id/refresh", () => {
    it("creates a FEED_REFRESH job", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce({ id: "pod1", title: "Test" });
      mockPrisma.pipelineJob.create.mockResolvedValueOnce({ id: "job1", status: "PENDING" });

      const res = await app.request("/podcasts/pod1/refresh", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.jobId).toBe("job1");
    });

    it("returns 404 when podcast not found", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/podcasts/missing/refresh", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("returns 201 with null jobId when PipelineJob table missing", async () => {
      mockPrisma.podcast.findUnique.mockResolvedValueOnce({ id: "pod1", title: "Test" });
      mockPrisma.pipelineJob.create.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/podcasts/pod1/refresh", { method: "POST" }, env, mockExCtx);
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.jobId).toBeNull();
    });
  });
});
