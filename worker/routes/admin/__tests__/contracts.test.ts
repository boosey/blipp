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

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../../middleware/auth", () => ({
  getAuth: vi.fn(() => ({ userId: "admin_1" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../../lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const { adminRoutes } = await import("../index");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("API Response Contracts", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma as any);
      await next();
    });
    app.route("/admin", adminRoutes);

    // Reset all model mocks
    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });
  });

  // ── PaginatedResponse shape ──

  describe("PaginatedResponse shape", () => {
    it("GET /admin/users returns paginated shape with data/total/page/pageSize/totalPages", async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);

      const res = await app.request("/admin/users", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(body).toHaveProperty("totalPages");
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.total).toBe("number");
      expect(typeof body.page).toBe("number");
      expect(typeof body.pageSize).toBe("number");
      expect(typeof body.totalPages).toBe("number");
    });

    it("GET /admin/plans returns paginated shape", async () => {
      mockPrisma.plan.findMany.mockResolvedValueOnce([]);
      mockPrisma.plan.count.mockResolvedValueOnce(0);

      const res = await app.request("/admin/plans", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(body).toHaveProperty("totalPages");
    });

    it("GET /admin/ai-errors returns paginated shape", async () => {
      mockPrisma.aiServiceError.findMany.mockResolvedValueOnce([]);
      mockPrisma.aiServiceError.count.mockResolvedValueOnce(0);

      const res = await app.request("/admin/ai-errors", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(body).toHaveProperty("totalPages");
    });

    it("GET /admin/briefings returns paginated shape", async () => {
      mockPrisma.briefing.findMany.mockResolvedValueOnce([]);
      mockPrisma.briefing.count.mockResolvedValueOnce(0);

      const res = await app.request("/admin/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(body).toHaveProperty("totalPages");
    });

    it("GET /admin/pipeline/jobs returns paginated shape", async () => {
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([]);
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(0);

      const res = await app.request("/admin/pipeline/jobs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(body).toHaveProperty("totalPages");
    });
  });

  // ── AdminUser shape ──

  describe("AdminUser shape", () => {
    it("GET /admin/users returns items matching AdminUser contract", async () => {
      const mockUser = {
        id: "usr_1",
        clerkId: "clerk_1",
        email: "test@example.com",
        name: "Test User",
        imageUrl: null,
        isAdmin: false,
        createdAt: new Date("2026-01-01"),
        plan: { id: "plan_1", name: "Free", slug: "free" },
        _count: { subscriptions: 2, feedItems: 10, briefings: 5 },
      };
      mockPrisma.user.findMany.mockResolvedValueOnce([mockUser]);
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.feedItem.findMany.mockResolvedValueOnce([
        { userId: "usr_1", createdAt: new Date() },
      ]);

      const res = await app.request("/admin/users", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const user = body.data[0];

      // Required fields from AdminUser type
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("clerkId");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("plan");
      expect(user.plan).toHaveProperty("id");
      expect(user.plan).toHaveProperty("name");
      expect(user.plan).toHaveProperty("slug");
      expect(user).toHaveProperty("isAdmin");
      expect(user).toHaveProperty("status");
      expect(["active", "inactive", "churned"]).toContain(user.status);
      expect(user).toHaveProperty("briefingCount");
      expect(typeof user.briefingCount).toBe("number");
      expect(user).toHaveProperty("podcastCount");
      expect(typeof user.podcastCount).toBe("number");
      expect(user).toHaveProperty("createdAt");
      expect(typeof user.createdAt).toBe("string"); // ISO string
      expect(user).toHaveProperty("badges");
      expect(Array.isArray(user.badges)).toBe(true);
    });
  });

  // ── DashboardStats shape ──

  describe("DashboardStats shape", () => {
    it("GET /admin/dashboard/stats returns shape matching DashboardStats", async () => {
      // 8 count calls: podcast total, podcast trend, user total, user trend,
      // episode total, episode trend, briefing total, briefing trend
      mockPrisma.podcast.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.episode.count.mockResolvedValue(100);
      mockPrisma.briefing.count.mockResolvedValue(50);

      const res = await app.request("/admin/dashboard/stats", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      const stats = body.data;

      // Each stat group must have total and trend
      for (const key of ["podcasts", "users", "episodes", "briefings"]) {
        expect(stats).toHaveProperty(key);
        expect(stats[key]).toHaveProperty("total");
        expect(stats[key]).toHaveProperty("trend");
        expect(typeof stats[key].total).toBe("number");
        expect(typeof stats[key].trend).toBe("number");
      }
    });
  });

  // ── PipelineJob shape ──

  describe("PipelineJob shape", () => {
    it("GET /admin/pipeline/jobs returns items matching PipelineJob contract", async () => {
      const mockJob = {
        id: "job_1",
        requestId: "req_1",
        episodeId: "ep_1",
        durationTier: 5,
        status: "COMPLETED",
        currentStage: "BRIEFING_ASSEMBLY",
        distillationId: "dist_1",
        clipId: "clip_1",
        errorMessage: null,
        createdAt: new Date("2026-03-01"),
        updatedAt: new Date("2026-03-01T01:00:00"),
        completedAt: new Date("2026-03-01T01:00:00"),
        episode: {
          title: "Episode 1",
          durationSeconds: 3600,
          podcast: { title: "Podcast 1", imageUrl: "https://example.com/img.jpg" },
        },
      };
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce([mockJob]);
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(1);

      const res = await app.request("/admin/pipeline/jobs", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const job = body.data[0];

      // Required fields from PipelineJob type
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("requestId");
      expect(job).toHaveProperty("episodeId");
      expect(job).toHaveProperty("durationTier");
      expect(typeof job.durationTier).toBe("number");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("currentStage");
      expect(job).toHaveProperty("createdAt");
      expect(typeof job.createdAt).toBe("string");
      expect(job).toHaveProperty("updatedAt");
      expect(typeof job.updatedAt).toBe("string");

      // Optional joined data
      expect(job).toHaveProperty("episodeTitle");
      expect(job).toHaveProperty("podcastTitle");
    });
  });

  // ── AdminPlan shape ──

  describe("AdminPlan shape", () => {
    it("GET /admin/plans returns items matching AdminPlan contract", async () => {
      const mockPlan = {
        id: "plan_1",
        name: "Pro",
        slug: "pro",
        description: "Pro plan",
        briefingsPerWeek: 50,
        maxDurationMinutes: 15,
        maxPodcastSubscriptions: 20,
        adFree: true,
        priorityProcessing: true,
        earlyAccess: false,
        priceCentsMonthly: 599,
        priceCentsAnnual: 5990,
        stripePriceIdMonthly: null,
        stripePriceIdAnnual: null,
        stripeProductId: null,
        trialDays: 7,
        features: ["feature1"],
        highlighted: true,
        active: true,
        sortOrder: 1,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { users: 5 },
      };
      mockPrisma.plan.findMany.mockResolvedValueOnce([mockPlan]);
      mockPrisma.plan.count.mockResolvedValueOnce(1);

      const res = await app.request("/admin/plans", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const plan = body.data[0];

      // Required fields from AdminPlan type
      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("slug");
      expect(plan).toHaveProperty("priceCentsMonthly");
      expect(typeof plan.priceCentsMonthly).toBe("number");
      expect(plan).toHaveProperty("active");
      expect(typeof plan.active).toBe("boolean");
      expect(plan).toHaveProperty("sortOrder");
      expect(plan).toHaveProperty("isDefault");
      expect(plan).toHaveProperty("_count");
      expect(plan._count).toHaveProperty("users");
      expect(typeof plan._count.users).toBe("number");

      // Feature flags
      expect(plan).toHaveProperty("adFree");
      expect(plan).toHaveProperty("priorityProcessing");
      expect(plan).toHaveProperty("earlyAccess");
    });
  });

  // ── AdminBriefing shape ──

  describe("AdminBriefing shape", () => {
    it("GET /admin/briefings returns items matching AdminBriefing contract", async () => {
      const mockBriefing = {
        id: "br_1",
        userId: "usr_1",
        clipId: "clip_1",
        adAudioUrl: null,
        adAudioKey: null,
        createdAt: new Date("2026-03-01"),
        user: { email: "user@example.com", plan: { name: "Free", slug: "free" } },
        clip: {
          id: "clip_1",
          durationTier: 5,
          status: "COMPLETED",
          actualSeconds: 290,
          audioUrl: "https://r2.example.com/clip.mp3",
          episode: {
            title: "Episode 1",
            durationSeconds: 3600,
            podcast: { title: "Podcast 1", imageUrl: "https://example.com/img.jpg" },
          },
        },
        _count: { feedItems: 2 },
      };
      mockPrisma.briefing.findMany.mockResolvedValueOnce([mockBriefing]);
      mockPrisma.briefing.count.mockResolvedValueOnce(1);

      const res = await app.request("/admin/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const briefing = body.data[0];

      // Required fields from AdminBriefing type
      expect(briefing).toHaveProperty("id");
      expect(briefing).toHaveProperty("userId");
      expect(briefing).toHaveProperty("userEmail");
      expect(typeof briefing.userEmail).toBe("string");
      expect(briefing).toHaveProperty("userPlan");
      expect(briefing).toHaveProperty("clipId");
      expect(briefing).toHaveProperty("durationTier");
      expect(typeof briefing.durationTier).toBe("number");
      expect(briefing).toHaveProperty("clipStatus");
      expect(briefing).toHaveProperty("feedItemCount");
      expect(typeof briefing.feedItemCount).toBe("number");
      expect(briefing).toHaveProperty("createdAt");
      expect(typeof briefing.createdAt).toBe("string"); // ISO string

      // Optional fields
      expect(briefing).toHaveProperty("actualSeconds");
      expect(briefing).toHaveProperty("audioUrl");
      expect(briefing).toHaveProperty("episodeTitle");
      expect(briefing).toHaveProperty("podcastTitle");
    });
  });

  // ── AdminAiServiceError shape ──

  describe("AdminAiServiceError shape", () => {
    it("GET /admin/ai-errors returns items matching AdminAiServiceError contract", async () => {
      const mockError = {
        id: "err_1",
        service: "stt",
        provider: "openai",
        model: "whisper-1",
        operation: "transcribe",
        correlationId: "corr-1",
        jobId: "job-1",
        stepId: null,
        episodeId: "ep-1",
        category: "rate_limit",
        severity: "transient",
        httpStatus: 429,
        errorMessage: "Too many requests",
        rawResponse: null,
        requestDurationMs: 150,
        timestamp: new Date("2026-03-01T12:00:00Z"),
        retryCount: 0,
        maxRetries: 3,
        willRetry: true,
        resolved: false,
        rateLimitRemaining: 0,
        rateLimitResetAt: null,
        createdAt: new Date("2026-03-01T12:00:00Z"),
      };
      mockPrisma.aiServiceError.findMany.mockResolvedValueOnce([mockError]);
      mockPrisma.aiServiceError.count.mockResolvedValueOnce(1);

      const res = await app.request("/admin/ai-errors", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const error = body.data[0];

      // Required fields from AdminAiServiceError type
      expect(error).toHaveProperty("id");
      expect(error).toHaveProperty("service");
      expect(error).toHaveProperty("provider");
      expect(error).toHaveProperty("model");
      expect(error).toHaveProperty("operation");
      expect(error).toHaveProperty("correlationId");
      expect(error).toHaveProperty("category");
      expect(error).toHaveProperty("severity");
      expect(["transient", "permanent"]).toContain(error.severity);
      expect(error).toHaveProperty("errorMessage");
      expect(typeof error.errorMessage).toBe("string");
      expect(error).toHaveProperty("requestDurationMs");
      expect(typeof error.requestDurationMs).toBe("number");
      expect(error).toHaveProperty("timestamp");
      expect(typeof error.timestamp).toBe("string"); // ISO string, not Date
      expect(error).toHaveProperty("retryCount");
      expect(error).toHaveProperty("maxRetries");
      expect(error).toHaveProperty("willRetry");
      expect(typeof error.willRetry).toBe("boolean");
      expect(error).toHaveProperty("resolved");
      expect(typeof error.resolved).toBe("boolean");
      expect(error).toHaveProperty("createdAt");
      expect(typeof error.createdAt).toBe("string");
    });
  });

  // ── SystemHealth shape ──

  describe("SystemHealth shape", () => {
    it("GET /admin/dashboard returns shape matching SystemHealth contract", async () => {
      mockPrisma.pipelineJob.count.mockResolvedValueOnce(0);
      mockPrisma.pipelineJob.groupBy.mockResolvedValueOnce([]);

      const res = await app.request("/admin/dashboard", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body).toHaveProperty("data");
      const health = body.data;

      expect(health).toHaveProperty("overall");
      expect(["operational", "degraded", "critical"]).toContain(health.overall);
      expect(health).toHaveProperty("stages");
      expect(Array.isArray(health.stages)).toBe(true);
      expect(health).toHaveProperty("activeIssuesCount");
      expect(typeof health.activeIssuesCount).toBe("number");

      // Each stage should match PipelineStageHealth
      if (health.stages.length > 0) {
        const stage = health.stages[0];
        expect(stage).toHaveProperty("stage");
        expect(stage).toHaveProperty("name");
        expect(stage).toHaveProperty("completionRate");
        expect(typeof stage.completionRate).toBe("number");
        expect(stage).toHaveProperty("activeJobs");
        expect(stage).toHaveProperty("status");
        expect(["healthy", "warning", "critical"]).toContain(stage.status);
      }
    });
  });

  // ── Global error handler shape ──

  describe("Global error handler shape", () => {
    it("classifyHttpError returns { error, requestId, code } shape", async () => {
      const { classifyHttpError } = await import("../../../lib/errors");

      const testApp = new Hono<{ Bindings: Env }>();

      testApp.onError((err, c) => {
        const { status, message, code } = classifyHttpError(err);
        const requestId = crypto.randomUUID();
        return c.json({ error: message, requestId, code }, status as any);
      });

      testApp.get("/fail", () => {
        throw new Error("test error");
      });

      const res = await testApp.request("/fail", {}, env, mockExCtx);
      const body: any = await res.json();

      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("requestId");
      expect(typeof body.requestId).toBe("string");
      expect(body).toHaveProperty("code");
      // Should not leak internal error message
      expect(body.error).not.toContain("test error");
      expect(body.error).toBe("Internal server error");
    });
  });

  // ── Date serialization ──

  describe("Date serialization", () => {
    it("all date fields are ISO strings, not Date objects", async () => {
      const mockUser = {
        id: "usr_1",
        clerkId: "clerk_1",
        email: "test@example.com",
        name: null,
        imageUrl: null,
        isAdmin: false,
        createdAt: new Date("2026-01-15T10:30:00Z"),
        plan: { id: "plan_1", name: "Free", slug: "free" },
        _count: { subscriptions: 0, feedItems: 0, briefings: 0 },
      };
      mockPrisma.user.findMany.mockResolvedValueOnce([mockUser]);
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.feedItem.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/admin/users", {}, env, mockExCtx);
      const body: any = await res.json();
      const user = body.data[0];

      // createdAt must be a string, not a serialized Date object
      expect(typeof user.createdAt).toBe("string");
      // Must be valid ISO 8601
      expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
    });
  });
});
