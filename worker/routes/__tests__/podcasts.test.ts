import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

// Mock Prisma deps so Vite doesn't try to resolve the generated client
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

// Mock createPrismaClient
const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

// Mock PodcastIndexClient — use a real class so `new` works
const mockSearchByTerm = vi.fn();
const mockTrending = vi.fn();
vi.mock("../../lib/podcast-index", () => {
  return {
    PodcastIndexClient: class {
      searchByTerm = mockSearchByTerm;
      trending = mockTrending;
    },
  };
});

// Mock Clerk auth
const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

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
    mockPrisma.$disconnect.mockResolvedValue(undefined);
  });

  describe("GET /podcasts/search", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/podcasts/search?q=test", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return 400 when q parameter is missing", async () => {
      const res = await app.request("/podcasts/search", {}, env, mockExCtx);
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("Missing search query");
    });

    it("should return search results from Podcast Index", async () => {
      const feeds = [{ id: 1, title: "Test Pod" }];
      mockSearchByTerm.mockResolvedValueOnce(feeds);

      const res = await app.request("/podcasts/search?q=test", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.feeds).toEqual(feeds);
    });
  });

  describe("GET /podcasts/trending", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/podcasts/trending", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return trending podcasts", async () => {
      const feeds = [{ id: 2, title: "Trending Pod" }];
      mockTrending.mockResolvedValueOnce(feeds);

      const res = await app.request("/podcasts/trending", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.feeds).toEqual(feeds);
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
      const user = { id: "usr_1", clerkId: "user_test123" };
      const podcast = { id: "pod_1", feedUrl: "https://example.com/feed.xml", title: "Test Pod" };
      const subscription = { id: "sub_1", userId: "usr_1", podcastId: "pod_1" };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.podcast.upsert.mockResolvedValueOnce(podcast);
      mockPrisma.subscription.upsert.mockResolvedValueOnce(subscription);

      const res = await app.request(
        "/podcasts/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedUrl: "https://example.com/feed.xml",
            title: "Test Pod",
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
