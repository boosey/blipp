import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

// Mock getAuth
vi.mock("../auth", () => ({
  getAuth: vi.fn(() => ({ userId: "user_123" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

const { requestLogger } = await import("../request-logger");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("requestLogger", () => {
  let consoleSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs successful 200 request via console.log", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("requestId", "req-1"); await next(); });
    app.use("/*", requestLogger);
    app.get("/api/test", (c) => c.json({ ok: true }));

    await app.request("/api/test", {}, createMockEnv(), mockExCtx);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logLine = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logLine.action).toBe("http_request");
    expect(logLine.method).toBe("GET");
    expect(logLine.path).toBe("/api/test");
    expect(logLine.status).toBe(200);
    expect(logLine.level).toBe("info");
    expect(logLine.requestId).toBe("req-1");
    expect(typeof logLine.durationMs).toBe("number");
  });

  it("logs 500 request via console.error", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("requestId", "req-2"); await next(); });
    app.use("/*", requestLogger);
    app.get("/api/fail", (c) => c.json({ error: "bad" }, 500));

    await app.request("/api/fail", {}, createMockEnv(), mockExCtx);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logLine = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(logLine.level).toBe("error");
    expect(logLine.status).toBe(500);
  });

  it("does not log /api/health requests", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requestLogger);
    app.get("/api/health", (c) => c.json({ ok: true }));

    await app.request("/api/health", {}, createMockEnv(), mockExCtx);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("includes durationMs as non-negative number", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("requestId", "req-3"); await next(); });
    app.use("/*", requestLogger);
    app.get("/api/test", (c) => c.json({ ok: true }));

    await app.request("/api/test", {}, createMockEnv(), mockExCtx);

    const logLine = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logLine.durationMs).toBeGreaterThanOrEqual(0);
  });
});
