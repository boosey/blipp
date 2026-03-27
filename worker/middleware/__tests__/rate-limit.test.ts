import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

vi.mock("../auth", () => ({
  getAuth: vi.fn(() => ({ userId: "user_123" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

const { rateLimit } = await import("../rate-limit");

const mockExCtx = {
  waitUntil: vi.fn((p: Promise<any>) => p.catch(() => {})),
  passThroughOnException: vi.fn(),
  props: {},
};

function createStatefulKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve(undefined); }),
    delete: vi.fn((key: string) => { store.delete(key); return Promise.resolve(undefined); }),
  } as unknown as KVNamespace;
}

describe("rateLimit middleware", () => {
  it("allows requests under the limit", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/*",
      rateLimit({ windowMs: 60_000, maxRequests: 5, keyPrefix: "test" })
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const env = { ...createMockEnv(), RATE_LIMIT_KV: createStatefulKV() };
    const res = await app.request("/test", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
  });

  it("returns 429 when limit exceeded", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/*",
      rateLimit({ windowMs: 60_000, maxRequests: 2, keyPrefix: "test2" })
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const env = { ...createMockEnv(), RATE_LIMIT_KV: createStatefulKV() };
    // First 2 requests succeed
    await app.request("/test", {}, env, mockExCtx);
    await app.request("/test", {}, env, mockExCtx);
    // Third request should be rate limited
    const res = await app.request("/test", {}, env, mockExCtx);
    expect(res.status).toBe(429);
    const body: any = await res.json();
    expect(body.error).toContain("Rate limit");
  });

  it("includes rate limit headers", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/*",
      rateLimit({ windowMs: 60_000, maxRequests: 10, keyPrefix: "test3" })
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const env = { ...createMockEnv(), RATE_LIMIT_KV: createStatefulKV() };
    const res = await app.request("/test", {}, env, mockExCtx);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  it("skips exempt paths", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      "/*",
      rateLimit({
        windowMs: 60_000,
        maxRequests: 1,
        keyPrefix: "test4",
        skipPaths: ["/webhook"],
      })
    );
    app.get("/webhook/test", (c) => c.json({ ok: true }));
    app.get("/other", (c) => c.json({ ok: true }));

    const env = { ...createMockEnv(), RATE_LIMIT_KV: createStatefulKV() };
    // Webhook path should always work (skipped)
    const res1 = await app.request("/webhook/test", {}, env, mockExCtx);
    expect(res1.status).toBe(200);
    const res2 = await app.request("/webhook/test", {}, env, mockExCtx);
    expect(res2.status).toBe(200);

    // Non-webhook path should hit the limit after 1 request
    await app.request("/other", {}, env, mockExCtx);
    const res3 = await app.request("/other", {}, env, mockExCtx);
    expect(res3.status).toBe(429);
  });
});
