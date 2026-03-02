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
    it("returns paginated list with fitAccuracy", async () => {
      const now = new Date();
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
        {
          id: "br1", userId: "u1", status: "COMPLETED",
          targetMinutes: 5, actualSeconds: 290,
          audioUrl: "http://a.mp3", errorMessage: null,
          createdAt: now,
          user: { email: "user@test.com", tier: "PRO" },
          _count: { segments: 3 },
          segments: [{ clipId: "cl1" }, { clipId: "cl2" }],
        },
      ]);
      mockPrisma.briefing.count.mockResolvedValueOnce(1);
      mockPrisma.clip.findMany.mockResolvedValueOnce([
        { id: "cl1", episode: { podcastId: "pod1" } },
        { id: "cl2", episode: { podcastId: "pod2" } },
      ]);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty("fitAccuracy");
      expect(body.data[0].podcastCount).toBe(2);
      expect(body.data[0].segmentCount).toBe(3);
      expect(body.total).toBe(1);
    });

    it("returns undefined fitAccuracy when no timing data", async () => {
      const now = new Date();
      mockPrisma.briefing.findMany.mockResolvedValueOnce([
        {
          id: "br1", userId: "u1", status: "PENDING",
          targetMinutes: 5, actualSeconds: null,
          audioUrl: null, errorMessage: null, createdAt: now,
          user: { email: "user@test.com", tier: "FREE" },
          _count: { segments: 0 },
          segments: [],
        },
      ]);
      mockPrisma.briefing.count.mockResolvedValueOnce(1);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data[0].fitAccuracy).toBeUndefined();
    });
  });

  describe("GET /briefings/:id", () => {
    it("returns briefing detail with quality metrics", async () => {
      const now = new Date();
      mockPrisma.briefing.findUnique.mockResolvedValueOnce({
        id: "br1", userId: "u1", status: "COMPLETED",
        targetMinutes: 5, actualSeconds: 295,
        audioUrl: "http://a.mp3", errorMessage: null, createdAt: now,
        user: { email: "user@test.com", tier: "PRO" },
        _count: { segments: 2 },
        segments: [
          { id: "s1", orderIndex: 0, clipId: "cl1", transitionText: "First up" },
          { id: "s2", orderIndex: 1, clipId: "cl2", transitionText: "Next" },
        ],
      });
      mockPrisma.clip.findMany.mockResolvedValueOnce([
        {
          id: "cl1", actualSeconds: 150, durationTier: 3,
          episode: { podcastId: "pod1", title: "Ep1", podcast: { title: "Pod1", imageUrl: null } },
        },
        {
          id: "cl2", actualSeconds: 120, durationTier: 2,
          episode: { podcastId: "pod2", title: "Ep2", podcast: { title: "Pod2", imageUrl: null } },
        },
      ]);

      const res = await app.request("/briefings/br1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("br1");
      expect(body.data.segments).toHaveLength(2);
      expect(body.data.qualityMetrics).toHaveProperty("fitAccuracy");
      expect(body.data.qualityMetrics).toHaveProperty("contentCoverage");
      expect(body.data.qualityMetrics).toHaveProperty("segmentBalance");
      expect(body.data.qualityMetrics).toHaveProperty("transitionQuality");
    });

    it("returns 404 when not found", async () => {
      mockPrisma.briefing.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/briefings/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("calls $disconnect", async () => {
      mockPrisma.briefing.findUnique.mockResolvedValueOnce(null);
      await app.request("/briefings/missing", {}, env, mockExCtx);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});
