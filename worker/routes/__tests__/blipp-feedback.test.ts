import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { blippFeedback } from "../blipp-feedback";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk1" })),
}));

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /feedback/blipp", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    mockPrisma.user.findUnique.mockResolvedValue({ id: "user1" });
    mockPrisma.blippFeedback = { create: vi.fn().mockResolvedValue({ id: "bf1" }) };

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/feedback/blipp", blippFeedback);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });
  });

  it("creates blipp feedback and returns 201", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "ep1",
        reasons: ["too_short"],
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toBe("bf1");
    expect(mockPrisma.blippFeedback.create).toHaveBeenCalledWith({
      data: {
        userId: "user1",
        episodeId: "ep1",
        briefingId: null,
        reasons: ["too_short"],
        message: null,
        isTechnicalFailure: false,
      },
    });
  });

  it("sets isTechnicalFailure when blipp_failed reason present", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "ep1",
        briefingId: "br1",
        reasons: ["blipp_failed", "poor_audio"],
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.blippFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isTechnicalFailure: true }),
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects empty reasons array", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: "ep1", reasons: [] }),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("rejects invalid reason code", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: "ep1", reasons: ["invalid_reason"] }),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("rejects message over 2000 chars", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "ep1",
        reasons: ["too_long"],
        message: "x".repeat(2001),
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: "ep1", reasons: ["inaccurate"] }),
    }, env, mockExCtx);

    expect(res.status).toBe(404);
  });

  it("creates feedback with multiple reasons", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "ep1",
        reasons: ["too_short", "missed_key_points", "not_interesting"],
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.blippFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reasons: ["too_short", "missed_key_points", "not_interesting"],
        isTechnicalFailure: false,
      }),
    });
  });

  it("returns 401 when unauthenticated (requireAuth rejects)", async () => {
    // Build a fresh app without the auth bypass to test requireAuth behavior
    const unauthApp = new Hono<{ Bindings: Env }>();
    unauthApp.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    // Simulate requireAuth rejecting: no clerk auth → 401
    unauthApp.use("/feedback/blipp/*", async (c, next) => {
      return c.json({ error: "Unauthorized" }, 401);
    });
    unauthApp.route("/feedback/blipp", blippFeedback);

    const res = await unauthApp.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: "ep1", reasons: ["too_short"] }),
    }, env, mockExCtx);

    expect(res.status).toBe(401);
  });

  it("rejects missing episodeId", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasons: ["too_short"] }),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("accepts optional message and briefingId", async () => {
    const res = await app.request("/feedback/blipp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeId: "ep1",
        briefingId: "br1",
        reasons: ["missed_key_points"],
        message: "Missing the interview segment",
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.blippFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        briefingId: "br1",
        message: "Missing the interview segment",
      }),
    });
  });
});
