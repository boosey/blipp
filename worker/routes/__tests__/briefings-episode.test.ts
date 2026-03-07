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

// Mock time-fitting
vi.mock("../../lib/time-fitting", () => ({
  nearestTier: vi.fn((n: number) => n),
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
const { briefings } = await import("../briefings");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /briefings/generate with episodeId", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/briefings", briefings);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user_1",
      tier: "PRO",
      briefingLengthMinutes: 5,
    });
  });

  it("creates a request for a specific episode", async () => {
    mockPrisma.episode.findUniqueOrThrow.mockResolvedValue({
      id: "ep_1",
      podcastId: "pod_1",
    });
    mockPrisma.briefingRequest.create.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      targetMinutes: 5,
    });

    const res = await app.request(
      "/briefings/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: "ep_1" }),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.episode.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "ep_1" },
    });
    expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ episodeId: "ep_1", useLatest: false }),
          ]),
        }),
      })
    );
    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalled();
  });

  it("falls back to subscription-based when no episodeId", async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { podcastId: "pod_1" },
    ]);
    mockPrisma.briefingRequest.create.mockResolvedValue({
      id: "req_2",
      status: "PENDING",
      targetMinutes: 5,
    });

    const res = await app.request(
      "/briefings/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.episode.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ useLatest: true }),
          ]),
        }),
      })
    );
  });
});
