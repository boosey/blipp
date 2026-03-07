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

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

// Import after mocks are set up
const { requests } = await import("../requests");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /requests", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/requests", requests);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns user requests with enriched podcast/episode info", async () => {
    mockPrisma.briefingRequest.findMany.mockResolvedValue([
      {
        id: "req_1",
        status: "COMPLETED",
        targetMinutes: 5,
        createdAt: new Date("2026-03-06"),
        briefingId: "br_1",
        items: [{ podcastId: "pod_1", episodeId: "ep_1" }],
        jobs: [
          {
            episode: {
              title: "Great Episode",
              podcast: { title: "Great Podcast", imageUrl: "https://img.com/1.jpg" },
            },
          },
        ],
      },
    ]);

    const res = await app.request("/requests", {}, env, mockExCtx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].podcastTitle).toBe("Great Podcast");
    expect(body.requests[0].episodeTitle).toBe("Great Episode");
  });

  it("returns empty array when user has no requests", async () => {
    mockPrisma.briefingRequest.findMany.mockResolvedValue([]);

    const res = await app.request("/requests", {}, env, mockExCtx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requests).toEqual([]);
  });
});

describe("GET /requests/:id", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/requests", requests);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns request detail with briefing audio URL", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req_1",
      status: "COMPLETED",
      targetMinutes: 5,
      createdAt: new Date("2026-03-06"),
      briefingId: "br_1",
      items: [{ podcastId: "pod_1" }],
      briefing: { id: "br_1", audioUrl: "https://r2.example.com/briefing.mp3", actualSeconds: 300 },
      jobs: [
        {
          episode: {
            title: "Great Episode",
            podcast: { title: "Great Podcast", imageUrl: "https://img.com/1.jpg" },
          },
        },
      ],
    });

    const res = await app.request("/requests/req_1", {}, env, mockExCtx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.request.briefing.audioUrl).toBe("https://r2.example.com/briefing.mp3");
  });

  it("returns 404 for non-existent request", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue(null);

    const res = await app.request("/requests/nonexistent", {}, env, mockExCtx);

    expect(res.status).toBe(404);
  });
});
