import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { createMockEnv, createMockPrisma } from "../../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma() as ReturnType<typeof createMockPrisma> & { $transaction: ReturnType<typeof vi.fn> };
// $transaction passes the mock prisma to the callback so tx.model.method() calls hit the mocks
(mockPrisma as any).$transaction = vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma));
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
  requireAuth: vi.fn(() => vi.fn((c: any, next: any) => next())),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

vi.mock("../../../lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const { requestsRoutes } = await import("../requests");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Requests Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/requests", requestsRoutes);

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

  describe("GET /requests/", () => {
    it("returns paginated list of briefing requests", async () => {
      const now = new Date();
      mockPrisma.briefingRequest.findMany.mockResolvedValueOnce([
        {
          id: "req1",
          userId: "u1",
          status: "PENDING",
          targetMinutes: 5,
          items: [{ podcastId: "pod1" }, { podcastId: "pod2" }],
          isTest: false,
          briefingId: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          user: { name: "Test User", email: "test@test.com" },
          jobs: [],
        },
      ]);
      mockPrisma.briefingRequest.count.mockResolvedValueOnce(1);

      const res = await app.request("/requests", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("req1");
      expect(body.data[0].userName).toBe("Test User");
      expect(body.data[0].userEmail).toBe("test@test.com");
      expect(body.data[0].status).toBe("PENDING");
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(1);
    });

    it("filters by status when query param provided", async () => {
      mockPrisma.briefingRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.briefingRequest.count.mockResolvedValueOnce(0);

      const res = await app.request("/requests?status=COMPLETED", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      expect(mockPrisma.briefingRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "COMPLETED" } })
      );
    });

    it("supports pagination params", async () => {
      mockPrisma.briefingRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.briefingRequest.count.mockResolvedValueOnce(50);

      const res = await app.request("/requests?page=3&pageSize=10", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      expect(mockPrisma.briefingRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
      const body: any = await res.json();
      expect(body.page).toBe(3);
      expect(body.totalPages).toBe(5);
    });

    it("caps pageSize at 100", async () => {
      mockPrisma.briefingRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.briefingRequest.count.mockResolvedValueOnce(0);

      await app.request("/requests?pageSize=999", {}, env, mockExCtx);
      expect(mockPrisma.briefingRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

  });

  describe("GET /requests/:id", () => {
    const makeRequest = (overrides: any = {}) => ({
      id: "req1",
      userId: "u1",
      status: "PROCESSING",
      targetMinutes: 5,
      items: [{ podcastId: "pod1" }],
      isTest: false,
      briefingId: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { name: "Test User", email: "test@test.com" },
      ...overrides,
    });

    const makeJob = (overrides: any = {}) => ({
      id: "job1",
      episodeId: "ep1",
      durationTier: 5,
      status: "COMPLETED",
      currentStage: "AUDIO_GENERATION",
      episode: { title: "Episode 1", durationSeconds: 3600, podcast: { title: "Podcast 1" } },
      steps: [],
      ...overrides,
    });

    function setupDetailMocks(request: any, jobs: any[]) {
      mockPrisma.briefingRequest.findUnique.mockResolvedValueOnce(request);
      mockPrisma.pipelineJob.findMany.mockResolvedValueOnce(jobs);
      mockPrisma.workProduct.findMany
        .mockResolvedValueOnce([]) // episode WPs
        .mockResolvedValueOnce([]); // briefing WPs
    }

    it("returns request detail with job progress", async () => {
      const job = makeJob({
        steps: [
          { stage: "TRANSCRIPTION", status: "COMPLETED", cached: false, durationMs: 100, cost: 0.1, model: "whisper-1", inputTokens: 50, outputTokens: 0, errorMessage: null, workProduct: null },
          { stage: "DISTILLATION", status: "COMPLETED", cached: false, durationMs: 200, cost: 0.2, model: "claude-sonnet", inputTokens: 100, outputTokens: 50, errorMessage: null, workProduct: null },
        ],
      });
      setupDetailMocks(makeRequest(), [job]);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe("req1");
      expect(body.data.jobProgress).toHaveLength(1);
      expect(body.data.jobProgress[0].episodeTitle).toBe("Episode 1");
      expect(body.data.jobProgress[0].podcastTitle).toBe("Podcast 1");
      expect(body.data.jobProgress[0].steps).toHaveLength(2);
      expect(body.data.jobProgress[0].steps[0].stage).toBe("TRANSCRIPTION");
      expect(body.data.jobProgress[0].steps[1].stage).toBe("DISTILLATION");
    });

    it("returns 404 when request not found", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/requests/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("handles jobs with no steps yet", async () => {
      setupDetailMocks(makeRequest(), [makeJob({ steps: [] })]);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.jobProgress).toHaveLength(1);
      expect(body.data.jobProgress[0].steps).toHaveLength(0);
    });

    it("returns multiple jobs for multi-episode requests", async () => {
      const jobs = [
        makeJob({ id: "job1", episodeId: "ep1", steps: [] }),
        makeJob({ id: "job2", episodeId: "ep2", episode: { title: "Episode 2", durationSeconds: 1800, podcast: { title: "Podcast 2" } }, steps: [] }),
      ];
      setupDetailMocks(makeRequest(), jobs);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.jobProgress).toHaveLength(2);
      expect(body.data.jobProgress[1].episodeTitle).toBe("Episode 2");
    });

    it("shows step with IN_PROGRESS status", async () => {
      const job = makeJob({
        status: "IN_PROGRESS",
        steps: [
          { stage: "TRANSCRIPTION", status: "COMPLETED", cached: false, durationMs: 100, cost: 0.1, model: "whisper-1", inputTokens: 50, outputTokens: 0, errorMessage: null, workProduct: null },
          { stage: "DISTILLATION", status: "IN_PROGRESS", cached: false, durationMs: null, cost: null, model: null, inputTokens: null, outputTokens: null, errorMessage: null, workProduct: null },
        ],
      });
      setupDetailMocks(makeRequest(), [job]);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.jobProgress[0].steps[0].status).toBe("COMPLETED");
      expect(body.data.jobProgress[0].steps[1].status).toBe("IN_PROGRESS");
    });

    it("shows FAILED step with error message", async () => {
      const job = makeJob({
        status: "FAILED",
        steps: [
          { stage: "TRANSCRIPTION", status: "FAILED", cached: false, durationMs: 50, cost: null, model: null, inputTokens: null, outputTokens: null, errorMessage: "Transcript fetch failed", workProduct: null },
        ],
      });
      setupDetailMocks(makeRequest({ status: "FAILED" }), [job]);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.jobProgress[0].steps[0].status).toBe("FAILED");
      expect(body.data.jobProgress[0].steps[0].errorMessage).toBe("Transcript fetch failed");
    });

    it("computes totalCost from step costs", async () => {
      const job = makeJob({
        steps: [
          { stage: "TRANSCRIPTION", status: "COMPLETED", cached: false, durationMs: 100, cost: 0.10, model: "whisper-1", inputTokens: 50, outputTokens: 0, errorMessage: null, workProduct: null },
          { stage: "DISTILLATION", status: "COMPLETED", cached: false, durationMs: 200, cost: 0.25, model: "claude-sonnet", inputTokens: 100, outputTokens: 50, errorMessage: null, workProduct: null },
        ],
      });
      setupDetailMocks(makeRequest(), [job]);

      const res = await app.request("/requests/req1", {}, env, mockExCtx);
      const body: any = await res.json();
      expect(body.data.totalCost).toBeCloseTo(0.35);
    });

    it("GET /requests/:id includes events in step data", async () => {
      const mockRequest = {
        id: "req_1",
        userId: "user_1",
        status: "COMPLETED",
        targetMinutes: 5,
        items: [],
        isTest: false,
        briefingId: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { name: "Test", email: "test@test.com" },
      };

      const mockJobs = [{
        id: "job_1",
        requestId: "req_1",
        episodeId: "ep_1",
        durationTier: 5,
        status: "COMPLETED",
        currentStage: "BRIEFING_ASSEMBLY",
        steps: [{
          id: "step_1",
          stage: "TRANSCRIPTION",
          status: "COMPLETED",
          cached: false,
          durationMs: 2000,
          cost: null,
          model: null,
          inputTokens: null,
          outputTokens: null,
          errorMessage: null,
          workProduct: null,
          events: [
            { id: "evt_1", level: "INFO", message: "Cache miss", data: null, createdAt: new Date() },
            { id: "evt_2", level: "INFO", message: "Fetched transcript", data: { bytes: 4532 }, createdAt: new Date() },
          ],
        }],
        episode: { title: "Ep 1", durationSeconds: 3600, podcast: { title: "Pod 1" } },
      }];

      mockPrisma.briefingRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.pipelineJob.findMany.mockResolvedValue(mockJobs);
      mockPrisma.workProduct.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await app.request("/requests/req_1", {}, env, mockExCtx as any);
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      const step = body.data.jobProgress[0].steps[0];
      expect(step.events).toHaveLength(2);
      expect(step.events[0]).toMatchObject({ id: "evt_1", level: "INFO", message: "Cache miss" });
      expect(step.events[1]).toMatchObject({ id: "evt_2", level: "INFO", message: "Fetched transcript" });
      expect(step.events[1].data).toEqual({ bytes: 4532 });
    });

  });

  describe("POST /requests/test-briefing", () => {
    const testItems = [{ podcastId: "pod1", useLatest: true }, { podcastId: "pod2", useLatest: true }];

    it("creates a test briefing request and dispatches to orchestrator", async () => {
      const now = new Date();
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", clerkId: "user_test123" });
      mockPrisma.episode.findFirst
        .mockResolvedValueOnce({ id: "ep1" })
        .mockResolvedValueOnce({ id: "ep2" });
      mockPrisma.briefingRequest.create.mockResolvedValueOnce({
        id: "req1",
        userId: "u1",
        targetMinutes: 5,
        items: testItems,
        isTest: true,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.request("/requests/test-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: testItems, targetMinutes: 5 }),
      }, env, mockExCtx);

      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.id).toBe("req1");
      expect(body.data.isTest).toBe(true);

      expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
        requestId: "req1",
        action: "evaluate",
      });
    });

    it("returns 400 when items is empty", async () => {
      const res = await app.request("/requests/test-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [], targetMinutes: 5 }),
      }, env, mockExCtx);

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toBe("items required");
    });

    it("returns 404 when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/requests/test-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ podcastId: "pod1", useLatest: true }], targetMinutes: 5 }),
      }, env, mockExCtx);

      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.error).toBe("User not found");
    });

    it("defaults targetMinutes to 5 when not provided", async () => {
      const now = new Date();
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", clerkId: "user_test123" });
      mockPrisma.episode.findFirst.mockResolvedValueOnce({ id: "ep1" });
      mockPrisma.briefingRequest.create.mockResolvedValueOnce({
        id: "req1",
        userId: "u1",
        targetMinutes: 5,
        items: [{ podcastId: "pod1", useLatest: true }],
        isTest: true,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });

      await app.request("/requests/test-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ podcastId: "pod1", useLatest: true }] }),
      }, env, mockExCtx);

      expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetMinutes: 5 }),
      });
    });
  });

  // ── Delete Preview & Delete ──

  describe("GET /requests/:id/delete-preview", () => {
    function setupDeleteMocks({
      request = { id: "req1", userId: "u1", status: "COMPLETED", createdAt: new Date() },
      stepWpLinks = [] as { workProductId: string }[],
      relatedSteps = [] as { job: { requestId: string } }[],
      requests = [] as any[],
      feedItems = [] as { id: string; briefingId: string | null }[],
      briefings = [] as { clipId: string }[],
      clips = [] as { audioKey: string | null }[],
      remainingFeedItems = 0,
      remainingBriefings = 0,
      remainingSteps = 0,
    } = {}) {
      // findUnique for subject
      mockPrisma.briefingRequest.findUnique.mockResolvedValueOnce(request);
      // computeDeleteImpact internals:
      mockPrisma.pipelineStep.findMany
        .mockResolvedValueOnce(stepWpLinks)       // step 1: WP links from subject
        .mockResolvedValueOnce(relatedSteps);      // step 2: related steps referencing those WPs
      mockPrisma.briefingRequest.findMany.mockResolvedValueOnce(
        requests.length > 0 ? requests : [{ ...request, jobs: [], user: { name: "Test", email: "test@test.com" } }]
      );
      mockPrisma.feedItem.findMany.mockResolvedValueOnce(feedItems);
      // orphan checks
      mockPrisma.feedItem.count.mockResolvedValue(remainingFeedItems);
      mockPrisma.briefing.findMany.mockResolvedValueOnce(briefings);
      mockPrisma.briefing.count.mockResolvedValue(remainingBriefings);
      mockPrisma.clip.findUnique.mockImplementation(async ({ where }: any) => {
        const clip = clips.find((c: any) => c.id === where.id);
        return clip ?? { audioKey: null };
      });
      mockPrisma.pipelineStep.count.mockResolvedValue(remainingSteps);
      mockPrisma.workProduct.findUnique.mockResolvedValue({ r2Key: "wp/some-key" });
    }

    it("returns impact summary for isolated request (no shared WPs)", async () => {
      setupDeleteMocks();

      const res = await app.request("/requests/req1/delete-preview", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body.data.subjectRequest.id).toBe("req1");
      expect(body.data.relatedRequests).toHaveLength(0);
      expect(body.data.impactSummary.requestCount).toBe(1);
    });

    it("returns 404 for missing request", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/requests/missing/delete-preview", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("detects related requests that share work products", async () => {
      const now = new Date();
      setupDeleteMocks({
        stepWpLinks: [{ workProductId: "wp1" }],
        relatedSteps: [
          { job: { requestId: "req1" } },
          { job: { requestId: "req2" } },
        ],
        requests: [
          { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now, jobs: [], user: { name: "User1", email: "u1@test.com" } },
          { id: "req2", userId: "u2", status: "COMPLETED", createdAt: now, jobs: [], user: { name: "User2", email: "u2@test.com" } },
        ],
      });

      const res = await app.request("/requests/req1/delete-preview", {}, env, mockExCtx);
      const body: any = await res.json();

      expect(body.data.impactSummary.requestCount).toBe(2);
      expect(body.data.relatedRequests).toHaveLength(1);
      expect(body.data.relatedRequests[0].id).toBe("req2");
    });

    it("counts orphaned feed items, briefings, and work products", async () => {
      const now = new Date();
      setupDeleteMocks({
        stepWpLinks: [{ workProductId: "wp1" }],
        relatedSteps: [{ job: { requestId: "req1" } }],
        requests: [
          { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now, jobs: [{ id: "j1", steps: [{ id: "s1" }] }], user: { name: "Test", email: "test@test.com" } },
        ],
        feedItems: [{ id: "fi1", briefingId: "b1" }],
        briefings: [{ clipId: "c1" }],
        remainingFeedItems: 0,   // all feed items are ours → briefing is orphaned
        remainingBriefings: 0,   // no other briefings reference the clip → clip is orphaned
        remainingSteps: 0,       // no other steps reference the WP → WP is orphaned
      });

      const res = await app.request("/requests/req1/delete-preview", {}, env, mockExCtx);
      const body: any = await res.json();

      expect(body.data.impactSummary.feedItemCount).toBe(1);
      expect(body.data.impactSummary.briefingCount).toBe(1);
      expect(body.data.impactSummary.workProductCount).toBe(1);
    });
  });

  describe("DELETE /requests/:id", () => {
    function setupDeleteAndExecuteMocks({
      request = { id: "req1", userId: "u1", status: "COMPLETED", createdAt: new Date() },
    } = {}) {
      // findUnique for subject
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(request);
      // computeDeleteImpact: no shared WPs, no orphans (simplest case)
      mockPrisma.pipelineStep.findMany
        .mockResolvedValue([]);
      mockPrisma.briefingRequest.findMany.mockResolvedValue([
        { ...request, jobs: [], user: { name: "Test", email: "test@test.com" } },
      ]);
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);
      mockPrisma.briefing.findMany.mockResolvedValue([]);
      mockPrisma.briefing.count.mockResolvedValue(0);
      mockPrisma.pipelineStep.count.mockResolvedValue(0);
      // Transaction operations
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.briefingRequest.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.briefing.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.clip.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.workProduct.deleteMany.mockResolvedValue({ count: 0 });
      // getCurrentUser for audit log
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "test@test.com", clerkId: "user_test123" });
    }

    it("deletes request and returns deletion counts", async () => {
      setupDeleteAndExecuteMocks();

      const res = await app.request("/requests/req1", { method: "DELETE" }, env, mockExCtx);
      expect(res.status).toBe(200);

      const body: any = await res.json();
      expect(body.data.deleted.requests).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.briefingRequest.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["req1"] } },
      });
    });

    it("returns 404 for missing request", async () => {
      mockPrisma.briefingRequest.findUnique.mockResolvedValueOnce(null);

      const res = await app.request("/requests/missing", { method: "DELETE" }, env, mockExCtx);
      expect(res.status).toBe(404);
    });

    it("deletes orphaned work products and R2 objects", async () => {
      const now = new Date();
      // findUnique for subject (called twice: once by route, once by computeDeleteImpact internals)
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(
        { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now }
      );
      // Step 1: subject's WP links
      mockPrisma.pipelineStep.findMany
        .mockResolvedValueOnce([{ workProductId: "wp1" }, { workProductId: "wp2" }])
        .mockResolvedValueOnce([{ job: { requestId: "req1" } }]); // only subject references these
      mockPrisma.briefingRequest.findMany.mockResolvedValue([
        { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now, jobs: [{ id: "j1", steps: [{ id: "s1" }, { id: "s2" }] }], user: { name: "Test", email: "test@test.com" } },
      ]);
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);
      mockPrisma.briefing.findMany.mockResolvedValue([]);
      mockPrisma.briefing.count.mockResolvedValue(0);
      // Both WPs are orphaned (no remaining steps)
      mockPrisma.pipelineStep.count.mockResolvedValue(0);
      mockPrisma.workProduct.findUnique
        .mockResolvedValueOnce({ r2Key: "wp/key1" })
        .mockResolvedValueOnce({ r2Key: "wp/key2" });
      // Transaction mocks
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.briefingRequest.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.briefing.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.clip.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.workProduct.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "test@test.com", clerkId: "user_test123" });

      const res = await app.request("/requests/req1", { method: "DELETE" }, env, mockExCtx);
      expect(res.status).toBe(200);

      const body: any = await res.json();
      expect(body.data.deleted.workProducts).toBe(2);
      expect(body.data.deleted.r2Objects).toBe(2);
      // R2 delete should have been called for each key
      expect(env.R2.delete).toHaveBeenCalledWith("wp/key1");
      expect(env.R2.delete).toHaveBeenCalledWith("wp/key2");
    });

    it("cascade-deletes related requests sharing work products", async () => {
      const now = new Date();
      mockPrisma.briefingRequest.findUnique.mockResolvedValue(
        { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now }
      );
      mockPrisma.pipelineStep.findMany
        .mockResolvedValueOnce([{ workProductId: "wp1" }])
        .mockResolvedValueOnce([
          { job: { requestId: "req1" } },
          { job: { requestId: "req2" } },
        ]);
      mockPrisma.briefingRequest.findMany.mockResolvedValue([
        { id: "req1", userId: "u1", status: "COMPLETED", createdAt: now, jobs: [], user: { name: "Test1", email: "t1@t.com" } },
        { id: "req2", userId: "u2", status: "FAILED", createdAt: now, jobs: [], user: { name: "Test2", email: "t2@t.com" } },
      ]);
      mockPrisma.feedItem.findMany.mockResolvedValue([]);
      mockPrisma.feedItem.count.mockResolvedValue(0);
      mockPrisma.briefing.findMany.mockResolvedValue([]);
      mockPrisma.briefing.count.mockResolvedValue(0);
      mockPrisma.pipelineStep.count.mockResolvedValue(0);
      mockPrisma.workProduct.findUnique.mockResolvedValue({ r2Key: "wp/key1" });
      mockPrisma.feedItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.briefingRequest.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.briefing.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.clip.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.workProduct.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "test@test.com", clerkId: "user_test123" });

      const res = await app.request("/requests/req1", { method: "DELETE" }, env, mockExCtx);
      const body: any = await res.json();

      expect(body.data.deleted.requests).toBe(2);
      expect(mockPrisma.briefingRequest.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: expect.arrayContaining(["req1", "req2"]) } },
      });
    });
  });
});
