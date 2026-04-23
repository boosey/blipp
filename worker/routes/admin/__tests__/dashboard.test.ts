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

const { dashboardRoutes } = await import("../dashboard");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Dashboard Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/dashboard", dashboardRoutes);

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

  describe("GET /dashboard/health", () => {
    it("returns ok", async () => {
      const res = await app.request("/dashboard/health", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /dashboard/", () => {
    it("returns operational when no failures", async () => {
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(0);
      mockPrisma.pipelineJob.groupBy.mockResolvedValueOnce([]);

      const res = await app.request("/dashboard", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.overall).toBe("operational");
      expect(body.data.stages).toHaveLength(5);
      expect(body.data).toHaveProperty("activeIssuesCount");
    });

    it("returns critical when >20% fail rate", async () => {
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(5);
      mockPrisma.pipelineJob.groupBy.mockResolvedValueOnce([
        { currentStage: "TRANSCRIPTION", status: "COMPLETED", _count: 3 },
        { currentStage: "TRANSCRIPTION", status: "FAILED", _count: 5 },
      ]);

      const res = await app.request("/dashboard", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.overall).toBe("critical");
    });

    it("returns degraded when some warnings", async () => {
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(1);
      mockPrisma.pipelineJob.groupBy.mockResolvedValueOnce([
        { currentStage: "TRANSCRIPTION", status: "COMPLETED", _count: 90 },
        { currentStage: "TRANSCRIPTION", status: "FAILED", _count: 8 },
      ]);

      const res = await app.request("/dashboard", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.overall).toBe("degraded");
    });

    it("handles missing PipelineJob table gracefully", async () => {
      mockPrisma.pipelineJob.count.mockRejectedValueOnce(new Error("table missing"));
      mockPrisma.pipelineJob.groupBy.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/dashboard", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.overall).toBe("operational");
    });

  });

  describe("GET /dashboard/stats", () => {
    it("returns stat cards with totals and trends", async () => {
      mockPrisma.podcast.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
      mockPrisma.user.count.mockResolvedValueOnce(50).mockResolvedValueOnce(5);
      mockPrisma.episode.count.mockResolvedValueOnce(100).mockResolvedValueOnce(15);
      mockPrisma.briefing.count.mockResolvedValueOnce(200).mockResolvedValueOnce(30);

      const res = await app.request("/dashboard/stats", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.podcasts).toEqual({ total: 10, trend: 2 });
      expect(body.data.users).toEqual({ total: 50, trend: 5 });
      expect(body.data.episodes).toEqual({ total: 100, trend: 15 });
      expect(body.data.briefings).toEqual({ total: 200, trend: 30 });
    });

    it("returns zeros when queries fail (Promise.allSettled)", async () => {
      mockPrisma.podcast.count.mockRejectedValueOnce(new Error("fail")).mockRejectedValueOnce(new Error("fail"));
      mockPrisma.user.count.mockRejectedValueOnce(new Error("fail")).mockRejectedValueOnce(new Error("fail"));
      mockPrisma.episode.count.mockRejectedValueOnce(new Error("fail")).mockRejectedValueOnce(new Error("fail"));
      mockPrisma.briefing.count.mockRejectedValueOnce(new Error("fail")).mockRejectedValueOnce(new Error("fail"));

      const res = await app.request("/dashboard/stats", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.podcasts.total).toBe(0);
      expect(body.data.users.total).toBe(0);
    });
  });

  describe("GET /dashboard/activity", () => {
    it("returns recent pipeline activity with entity names", async () => {
      const now = new Date();
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([
        {
          id: "job1", currentStage: "TRANSCRIPTION",
          status: "COMPLETED", createdAt: now,
          episode: { title: "Test Episode", podcast: { title: "Test Podcast" } },
        },
      ]);

      const res = await app.request("/dashboard/activity", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].episodeTitle).toBe("Test Episode");
      expect(body.data[0].podcastName).toBe("Test Podcast");
    });

    it("returns empty array when PipelineJob table missing", async () => {
      mockPrisma.pipelineJob.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/dashboard/activity", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe("GET /dashboard/costs", () => {
    it("returns cost summary with breakdown", async () => {
      mockPrisma.pipelineStep.findMany
        .mockResolvedValueOnce([
          { stage: "TRANSCRIPTION", cost: 0.50 },
          { stage: "DISTILLATION", cost: 0.30 },
        ])
        .mockResolvedValueOnce([
          { stage: "TRANSCRIPTION", cost: 0.40 },
        ]);

      const res = await app.request("/dashboard/costs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty("todaySpend");
      expect(body.data).toHaveProperty("yesterdaySpend");
      expect(body.data).toHaveProperty("trend");
      expect(body.data).toHaveProperty("breakdown");
    });

    it("returns zeros when table missing", async () => {
      mockPrisma.pipelineStep.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/dashboard/costs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.todaySpend).toBe(0);
      expect(body.data.yesterdaySpend).toBe(0);
    });
  });

  describe("GET /dashboard/feed-refresh-summary", () => {
    it("returns correct FeedRefreshSummary structure", async () => {
      const lastFetched = new Date("2026-03-03T10:00:00Z");
      mockPrisma.podcast.findFirst.mockResolvedValueOnce({ lastFetchedAt: lastFetched });
      mockPrisma.podcast.count
        .mockResolvedValueOnce(5)   // podcastsRefreshed (within 10 min window)
        .mockResolvedValueOnce(10)  // totalPodcasts (active)
        .mockResolvedValueOnce(2);  // feedErrors
      mockPrisma.episode.count
        .mockResolvedValueOnce(500) // totalEpisodes
        .mockResolvedValueOnce(8)   // recentEpisodes (last 24h)
        .mockResolvedValueOnce(120) // prefetchedTranscripts
        .mockResolvedValueOnce(80); // prefetchedAudio

      const res = await app.request("/dashboard/feed-refresh-summary", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual({
        lastRunAt: lastFetched.toISOString(),
        podcastsRefreshed: 5,
        totalPodcasts: 10,
        totalEpisodes: 500,
        recentEpisodes: 8,
        prefetchedTranscripts: 120,
        prefetchedAudio: 80,
        feedErrors: 2,
      });
    });

    it("returns null lastRunAt when no podcasts have been fetched", async () => {
      mockPrisma.podcast.findFirst.mockResolvedValueOnce(null);
      mockPrisma.podcast.count
        .mockResolvedValueOnce(3)  // totalPodcasts
        .mockResolvedValueOnce(0); // feedErrors
      mockPrisma.episode.count
        .mockResolvedValueOnce(0)  // totalEpisodes
        .mockResolvedValueOnce(0)  // recentEpisodes
        .mockResolvedValueOnce(0)  // prefetchedTranscripts
        .mockResolvedValueOnce(0); // prefetchedAudio

      const res = await app.request("/dashboard/feed-refresh-summary", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.lastRunAt).toBeNull();
      expect(body.data.podcastsRefreshed).toBe(0);
      expect(body.data.totalPodcasts).toBe(3);
    });

  });

  describe("GET /dashboard/issues", () => {
    it("returns issues from failed jobs and broken podcasts", async () => {
      const now = new Date();
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([
        {
          id: "job1", type: "TRANSCRIPTION", status: "FAILED",
          errorMessage: "timeout", entityId: "ep1", entityType: "episode",
          createdAt: now,
        },
      ]);
      mockPrisma.podcast.findMany.mockResolvedValueOnce([
        { id: "pod1", title: "Broken Pod", feedHealth: "broken", feedError: "DNS error", updatedAt: now },
      ]);

      const res = await app.request("/dashboard/issues", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.length).toBe(2);
      expect(body.data[0]).toHaveProperty("severity");
      expect(body.data[0]).toHaveProperty("title");
    });

    it("returns empty when tables missing", async () => {
      mockPrisma.pipelineJob.findMany.mockRejectedValueOnce(new Error("table missing"));
      mockPrisma.podcast.findMany.mockRejectedValueOnce(new Error("table missing"));

      const res = await app.request("/dashboard/issues", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });
  });
});
