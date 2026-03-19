import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { ads } from "../ads";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk1" })),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(false),
}));

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /ads/event", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/ads", ads);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });
  });

  it("rejects invalid placement", async () => {
    const res = await app.request("/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placement: "midroll",
        event: "impression",
      }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.details).toBeDefined();
  });

  it("rejects invalid event", async () => {
    const res = await app.request("/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placement: "preroll",
        event: "unknown_event",
      }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.details).toBeDefined();
  });

  it("rejects missing required fields", async () => {
    const res = await app.request("/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts valid event with optional fields", async () => {
    const res = await app.request("/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefingId: "br-123",
        feedItemId: "fi-456",
        placement: "postroll",
        event: "complete",
        metadata: { source: "auto" },
      }),
    }, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
  });

  it("accepts valid event without optional fields", async () => {
    const res = await app.request("/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placement: "preroll",
        event: "start",
      }),
    }, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
  });
});
