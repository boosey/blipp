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

const { pulseAdminRoutes } = await import("../pulse");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

const lorem = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function fullPostRow(overrides: Partial<Record<string, any>> = {}): any {
  return {
    id: "post-1",
    slug: "first-post",
    title: "First post",
    subtitle: null,
    body: lorem(900),
    sourcesMarkdown: "- [Ep](/p/show/ep)",
    status: "DRAFT",
    mode: "HUMAN",
    editorId: "editor-1",
    heroImageUrl: null,
    topicTags: [],
    wordCount: 900,
    quotedWordCount: 0,
    ratioCheckPassed: true,
    generationMeta: { mode: "human", quoteCounts: {} },
    seoTitle: null,
    seoDescription: null,
    scheduledAt: null,
    publishedAt: null,
    editorReviewedAt: null,
    editorRejectedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    editor: { id: "editor-1", slug: "alex", name: "Alex", status: "READY" },
    episodes: [],
    ...overrides,
  };
}

describe("admin/pulse routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/pulse", pulseAdminRoutes);

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

  describe("GET /pulse", () => {
    it("filters by status when query param is set", async () => {
      mockPrisma.pulsePost.findMany.mockResolvedValueOnce([]);
      mockPrisma.pulsePost.count.mockResolvedValueOnce(0);
      const res = await app.request("/pulse?status=DRAFT", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      expect(mockPrisma.pulsePost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT" }) })
      );
    });

    it("ignores invalid status values", async () => {
      mockPrisma.pulsePost.findMany.mockResolvedValueOnce([]);
      mockPrisma.pulsePost.count.mockResolvedValueOnce(0);
      await app.request("/pulse?status=GARBAGE", {}, env, mockExCtx);
      expect(mockPrisma.pulsePost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe("GET /pulse/:id", () => {
    it("returns post + validation report", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(fullPostRow());
      const res = await app.request("/pulse/post-1", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.data.id).toBe("post-1");
      expect(json.validation).toBeDefined();
      expect(json.validation.computed.wordCount).toBe(900);
      expect(json.validation.ok).toBe(true);
    });

    it("404s when not found", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(null);
      const res = await app.request("/pulse/missing", {}, env, mockExCtx);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /pulse/:id", () => {
    it("recomputes wordCount when body changes", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce({ id: "post-1", status: "DRAFT", generationMeta: {} });
      mockPrisma.pulsePost.update.mockResolvedValueOnce(fullPostRow({ body: lorem(50), wordCount: 50 }));

      const res = await app.request(
        "/pulse/post-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: lorem(50) }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      expect(mockPrisma.pulsePost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ wordCount: 50 }),
        })
      );
    });

    it("persists quotes into generationMeta and updates quotedWordCount", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce({ id: "post-1", status: "DRAFT", generationMeta: {} });
      mockPrisma.pulsePost.update.mockResolvedValueOnce(fullPostRow());

      await app.request(
        "/pulse/post-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quotes: [
              { sourceId: "ep-A", words: 30 },
              { sourceId: "ep-B", words: 20 },
            ],
          }),
        },
        env,
        mockExCtx
      );

      const updateArg = (mockPrisma.pulsePost.update as any).mock.calls[0][0];
      expect(updateArg.data.quotedWordCount).toBe(50);
      expect((updateArg.data.generationMeta as any).quoteCounts).toEqual({ "ep-A": 30, "ep-B": 20 });
    });
  });

  describe("PUT /pulse/:id/citations", () => {
    it("replaces existing citations with the provided episode list", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce({ id: "post-1" });
      mockPrisma.episodePulsePost.deleteMany.mockResolvedValueOnce({ count: 1 });
      (mockPrisma.episodePulsePost as any).createMany.mockResolvedValueOnce({ count: 2 });

      const res = await app.request(
        "/pulse/post-1/citations",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeIds: ["ep-A", "ep-B"] }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      expect(mockPrisma.episodePulsePost.deleteMany).toHaveBeenCalledWith({
        where: { pulsePostId: "post-1" },
      });
      expect((mockPrisma.episodePulsePost as any).createMany).toHaveBeenCalledWith({
        data: [
          { pulsePostId: "post-1", episodeId: "ep-A", displayOrder: 0 },
          { pulsePostId: "post-1", episodeId: "ep-B", displayOrder: 1 },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe("POST /pulse/:id/transitions/:action", () => {
    it("publishes when validation passes and updates publishedAt", async () => {
      const post = fullPostRow({ status: "REVIEW" });
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(post);
      mockPrisma.pulsePost.update.mockResolvedValueOnce({ ...post, status: "PUBLISHED" });

      const res = await app.request(
        "/pulse/post-1/transitions/publish",
        { method: "POST" },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      const updateArg = (mockPrisma.pulsePost.update as any).mock.calls[0][0];
      expect(updateArg.data.status).toBe("PUBLISHED");
      expect(updateArg.data.publishedAt).toBeInstanceOf(Date);
    });

    it("blocks publish when sourcesMarkdown is empty", async () => {
      const post = fullPostRow({ status: "REVIEW", sourcesMarkdown: "" });
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(post);

      const res = await app.request(
        "/pulse/post-1/transitions/publish",
        { method: "POST" },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.validation?.publishBlocking?.find((f: any) => f.rule === "sources.required")).toBeTruthy();
      expect(mockPrisma.pulsePost.update).not.toHaveBeenCalled();
    });

    it("blocks publish when editor is NOT_READY", async () => {
      const post = fullPostRow({ status: "REVIEW", editor: { id: "e", slug: "x", name: "X", status: "NOT_READY" } });
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(post);

      const res = await app.request(
        "/pulse/post-1/transitions/publish",
        { method: "POST" },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.validation.publishBlocking.find((f: any) => f.rule === "editor.notReady")).toBeTruthy();
    });

    it("rejects requires a reason", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(fullPostRow({ status: "REVIEW" }));
      const res = await app.request(
        "/pulse/post-1/transitions/reject",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
    });

    it("review only valid from DRAFT", async () => {
      mockPrisma.pulsePost.findUnique.mockResolvedValueOnce(fullPostRow({ status: "PUBLISHED" }));
      const res = await app.request(
        "/pulse/post-1/transitions/review",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
    });
  });

  describe("editors", () => {
    it("creates an editor as NOT_READY regardless of input", async () => {
      mockPrisma.pulseEditor.create.mockResolvedValueOnce({ id: "e1", slug: "alex", name: "Alex", status: "NOT_READY" });
      const res = await app.request(
        "/pulse/editors",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "alex", name: "Alex", status: "READY" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(201);
      expect(mockPrisma.pulseEditor.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "NOT_READY" }) })
      );
    });

    it("rejects bad status on PATCH /editors/:id", async () => {
      const res = await app.request(
        "/pulse/editors/e1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "BOGUS" }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(400);
    });
  });
});
