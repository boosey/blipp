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

// Mock PodcastIndexClient
vi.mock("../../lib/podcast-index", () => {
  return {
    PodcastIndexClient: class {
      searchByTerm = vi.fn();
      trending = vi.fn();
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

describe("GET /podcasts/:id", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/podcasts", podcasts);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns podcast detail with isSubscribed=true", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      title: "Test Pod",
      description: "A podcast",
      feedUrl: "https://example.com/feed.xml",
      imageUrl: "https://example.com/img.jpg",
      author: "Author",
      podcastIndexId: "12345",
      episodeCount: 10,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({ id: "sub_1" });

    const res = await app.request("/podcasts/pod_1", {}, env, mockExCtx);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.podcast.id).toBe("pod_1");
    expect(body.podcast.isSubscribed).toBe(true);
  });

  it("returns podcast detail with isSubscribed=false", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      title: "Test Pod",
      description: null,
      feedUrl: "https://example.com/feed.xml",
      imageUrl: null,
      author: null,
      podcastIndexId: null,
      episodeCount: 0,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    const res = await app.request("/podcasts/pod_1", {}, env, mockExCtx);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.podcast.isSubscribed).toBe(false);
  });
});

describe("GET /podcasts/:id/episodes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/podcasts", podcasts);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns episodes for a podcast from the database", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      feedUrl: "https://example.com/feed.xml",
      podcastIndexId: "12345",
    });
    mockPrisma.episode.findMany.mockResolvedValue([
      {
        id: "ep_1",
        title: "Episode 1",
        description: "First ep",
        publishedAt: new Date("2026-01-01"),
        durationSeconds: 3600,
      },
    ]);

    const res = await app.request("/podcasts/pod_1/episodes", {}, env, mockExCtx);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.episodes).toHaveLength(1);
    expect(body.episodes[0].title).toBe("Episode 1");
  });
});
