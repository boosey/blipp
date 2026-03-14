import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockGetAuth = vi.fn();
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  getAuth: (...args: any[]) => mockGetAuth(...args),
}));

const { requireAuth } = await import("../auth");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe("requireAuth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth context", async () => {
    mockGetAuth.mockReturnValue(null);

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requireAuth);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when userId is null", async () => {
    mockGetAuth.mockReturnValue({ userId: null });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requireAuth);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when userId is undefined", async () => {
    mockGetAuth.mockReturnValue({ userId: undefined });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requireAuth);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(401);
  });

  it("passes through when authenticated", async () => {
    mockGetAuth.mockReturnValue({ userId: "user_123" });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requireAuth);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
  });
});
