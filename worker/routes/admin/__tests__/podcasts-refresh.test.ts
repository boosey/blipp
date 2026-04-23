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

describe("POST /podcasts/:id/refresh (queue dispatch)", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
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

  it("sends manual message to FEED_REFRESH_QUEUE with podcastId", async () => {
    mockPrisma.podcast.findUnique.mockResolvedValueOnce({ id: "pod-1", title: "Test" });
    mockPrisma.pipelineJob.create.mockResolvedValueOnce({ id: "job-1", status: "PENDING" });

    const res = await app.request("/podcasts/pod-1/refresh", { method: "POST" }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(env.FEED_REFRESH_QUEUE.send).toHaveBeenCalledWith({
      type: "manual",
      podcastId: "pod-1",
    });
  });

  it("returns 404 when podcast not found", async () => {
    mockPrisma.podcast.findUnique.mockResolvedValueOnce(null);

    const res = await app.request("/podcasts/missing/refresh", { method: "POST" }, env, mockExCtx);

    expect(res.status).toBe(404);
    expect(env.FEED_REFRESH_QUEUE.send).not.toHaveBeenCalled();
  });

});
