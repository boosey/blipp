import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { blippFeedbackRoutes } from "../blipp-feedback";
import { createMockPrisma, createMockEnv } from "../../../../tests/helpers/mocks";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("admin blipp-feedback routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    mockPrisma.blippFeedback = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue({ id: "bf1" }),
    };

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/blipp-feedback", blippFeedbackRoutes);
  });

  it("GET / returns paginated feedback list", async () => {
    mockPrisma.blippFeedback.findMany.mockResolvedValue([
      { id: "bf1", reasons: ["too_short"], isTechnicalFailure: false },
    ]);
    mockPrisma.blippFeedback.count.mockResolvedValue(1);

    const res = await app.request("/blipp-feedback?page=1&pageSize=20", {
      method: "GET",
    }, env, mockExCtx);

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("GET / filters by isTechnicalFailure=true", async () => {
    mockPrisma.blippFeedback.findMany.mockResolvedValue([]);
    mockPrisma.blippFeedback.count.mockResolvedValue(0);

    await app.request("/blipp-feedback?isTechnicalFailure=true", {
      method: "GET",
    }, env, mockExCtx);

    expect(mockPrisma.blippFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isTechnicalFailure: true },
      })
    );
  });

  it("GET / filters by isTechnicalFailure=false", async () => {
    mockPrisma.blippFeedback.findMany.mockResolvedValue([]);
    mockPrisma.blippFeedback.count.mockResolvedValue(0);

    await app.request("/blipp-feedback?isTechnicalFailure=false", {
      method: "GET",
    }, env, mockExCtx);

    expect(mockPrisma.blippFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isTechnicalFailure: false },
      })
    );
  });

  it("GET / returns all when no filter", async () => {
    mockPrisma.blippFeedback.findMany.mockResolvedValue([]);
    mockPrisma.blippFeedback.count.mockResolvedValue(0);

    await app.request("/blipp-feedback", {
      method: "GET",
    }, env, mockExCtx);

    expect(mockPrisma.blippFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it("DELETE /:id removes feedback entry", async () => {
    const res = await app.request("/blipp-feedback/bf1", {
      method: "DELETE",
    }, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(mockPrisma.blippFeedback.delete).toHaveBeenCalledWith({
      where: { id: "bf1" },
    });
  });
});
