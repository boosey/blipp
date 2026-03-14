import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

// Mock Prisma deps so Vite doesn't try to resolve the generated client
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

// Mock createPrismaClient (may still be transitively imported)
const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

// Mock Clerk auth
const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
  requireAuth: vi.fn((c: any, next: any) => {
    if (!currentAuth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  }),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("../../lib/plan-limits", () => ({
  getUserWithPlan: vi.fn(),
  checkDurationLimit: vi.fn().mockReturnValue(null),
  checkSubscriptionLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

import { getUserWithPlan } from "../../lib/plan-limits";

// Import after mocks are set up
const { podcasts } = await import("../podcasts");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Podcast Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/podcasts", podcasts);

    // Reset mock prisma methods
    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });

    // Set up getUserWithPlan mock for routes that need it
    (getUserWithPlan as any).mockResolvedValue({
      id: "usr_1",
      clerkId: "user_test123",
      plan: { maxDurationMinutes: 15, maxPodcastSubscriptions: null },
    });
  });

  describe("GET /podcasts/catalog", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/podcasts/catalog?q=test", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return catalog results without query", async () => {
      const podcasts = [
        { id: "pod1", title: "Test Pod", author: "Auth", description: "desc", imageUrl: null, feedUrl: "http://x.com/feed", _count: { episodes: 5 } },
      ];
      mockPrisma.podcast.findMany.mockResolvedValueOnce(podcasts);
      mockPrisma.podcast.count.mockResolvedValueOnce(1);

      const res = await app.request("/podcasts/catalog", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.podcasts).toHaveLength(1);
      expect(body.podcasts[0].episodeCount).toBe(5);
      expect(body.total).toBe(1);
    });

    it("should return search results from local catalog", async () => {
      const podcasts = [
        { id: "pod1", title: "Test Pod", author: "Auth", description: "desc", imageUrl: null, feedUrl: "http://x.com/feed", _count: { episodes: 3 } },
      ];
      mockPrisma.podcast.findMany.mockResolvedValueOnce(podcasts);
      mockPrisma.podcast.count.mockResolvedValueOnce(1);

      const res = await app.request("/podcasts/catalog?q=test", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.podcasts).toHaveLength(1);
    });
  });

  describe("POST /podcasts/subscribe", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/podcasts/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedUrl: "https://example.com/feed.xml", title: "Test" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should create subscription and return 201", async () => {
      const podcast = { id: "pod_1", feedUrl: "https://example.com/feed.xml", title: "Test Pod" };
      const subscription = { id: "sub_1", userId: "usr_1", podcastId: "pod_1", durationTier: 5 };

      mockPrisma.podcast.upsert.mockResolvedValueOnce(podcast);
      mockPrisma.subscription.upsert.mockResolvedValueOnce(subscription);
      mockPrisma.episode.findFirst.mockResolvedValueOnce(null); // no episodes yet

      const res = await app.request(
        "/podcasts/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedUrl: "https://example.com/feed.xml",
            title: "Test Pod",
            durationTier: 5,
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.subscription).toBeDefined();
      expect(body.subscription.podcast).toBeDefined();
    });

    it("should return 400 when feedUrl or title is missing", async () => {
      const res = await app.request(
        "/podcasts/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
    });

    it("should return 400 when durationTier is missing", async () => {
      const res = await app.request(
        "/podcasts/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedUrl: "https://example.com/feed.xml", title: "Test" }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("durationTier");
    });
  });

  describe("DELETE /podcasts/subscribe/:podcastId", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/podcasts/subscribe/pod_1",
        { method: "DELETE" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should delete subscription and return success", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.subscription.delete.mockResolvedValueOnce({});

      const res = await app.request(
        "/podcasts/subscribe/pod_1",
        { method: "DELETE" },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("GET /podcasts/subscriptions", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/podcasts/subscriptions", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return user subscriptions with podcast data", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      const subscriptions = [
        {
          id: "sub_1",
          userId: "usr_1",
          podcastId: "pod_1",
          podcast: { id: "pod_1", title: "My Podcast" },
        },
      ];

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.subscription.findMany.mockResolvedValueOnce(subscriptions);

      const res = await app.request("/podcasts/subscriptions", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.subscriptions).toHaveLength(1);
      expect(body.subscriptions[0].podcast.title).toBe("My Podcast");
    });
  });
});
