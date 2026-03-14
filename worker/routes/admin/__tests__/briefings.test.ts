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

const { briefingsRoutes } = await import("../briefings");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Briefings Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/briefings", briefingsRoutes);

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

  describe("GET /briefings/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/briefings/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /briefings/", () => {
    it("returns paginated list with clip data", async () => {
      const now = new Date();
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
        {
          id: "br1", userId: "u1", clipId: "cl1",
          adAudioUrl: null,
          createdAt: now,
          user: { email: "user@test.com", plan: { name: "Pro", slug: "pro" } },
          clip: {
            id: "cl1", durationTier: 5, status: "READY",
            actualSeconds: 290, audioUrl: "http://a.mp3",
            episode: {
              title: "Episode 1", durationSeconds: 3600,
              podcast: { title: "Pod 1", imageUrl: null },
            },
          },
          _count: { feedItems: 2 },
        },
      ]);
      mockPrisma.briefing.count.mockResolvedValueOnce(1);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].clipId).toBe("cl1");
      expect(body.data[0].durationTier).toBe(5);
      expect(body.data[0].actualSeconds).toBe(290);
      expect(body.data[0].feedItemCount).toBe(2);
      expect(body.total).toBe(1);
    });

    it("returns clip data when no episode info", async () => {
      const now = new Date();
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
        {
          id: "br1", userId: "u1", clipId: "cl1",
          adAudioUrl: null,
          createdAt: now,
          user: { email: "user@test.com", plan: { name: "Free", slug: "free" } },
          clip: {
            id: "cl1", durationTier: 3, status: "PENDING",
            actualSeconds: null, audioUrl: null,
            episode: null,
          },
          _count: { feedItems: 0 },
        },
      ]);
      mockPrisma.briefing.count.mockResolvedValueOnce(1);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data[0].episodeTitle).toBeUndefined();
    });
  });

  describe("GET /briefings/:id", () => {
    it("returns briefing detail with clip and pipeline steps", async () => {
      const now = new Date();
      mockPrisma.briefing.findUnique.mockResolvedValueOnce({
        id: "br1", userId: "u1", clipId: "cl1",
        adAudioUrl: null, adAudioKey: null,
        createdAt: now,
        user: { email: "user@test.com", plan: { name: "Pro", slug: "pro" } },
        clip: {
          id: "cl1", durationTier: 5, status: "READY",
          actualSeconds: 295, audioUrl: "http://a.mp3", wordCount: 500,
          episodeId: "ep1",
          episode: {
            title: "Ep1", durationSeconds: 3600,
            podcast: { id: "pod1", title: "Pod1", imageUrl: null },
          },
        },
        feedItems: [
          { id: "fi1", status: "READY", listened: false, source: "SUBSCRIPTION", createdAt: now },
        ],
      });
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/briefings/br1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("br1");
      expect(body.data.clip).toHaveProperty("durationTier");
      expect(body.data.clip.podcastTitle).toBe("Pod1");
      expect(body.data.pipelineSteps).toBeDefined();
      expect(body.data.feedItems).toHaveLength(1);
    });

    it("returns 404 when not found", async () => {
      mockPrisma.briefing.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/briefings/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });

  });
});
