import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockGetAuth = vi.fn();
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  getAuth: (...args: any[]) => mockGetAuth(...args),
}));

const { requireAdmin } = await import("../admin");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe("requireAdmin middleware", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockReturnValue(null);

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when userId is null", async () => {
    mockGetAuth.mockReturnValue({ userId: null });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockGetAuth.mockReturnValue({ userId: "user_123" });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      isAdmin: false,
    });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user not found in DB", async () => {
    mockGetAuth.mockReturnValue({ userId: "user_missing" });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    // null?.isAdmin is falsy, so !user?.isAdmin is true → 403
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("passes through when user is admin", async () => {
    mockGetAuth.mockReturnValue({ userId: "admin_123" });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      isAdmin: true,
      clerkId: "admin_123",
    });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
  });

  it("queries user by clerkId", async () => {
    mockGetAuth.mockReturnValue({ userId: "clerk_abc" });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      isAdmin: true,
    });

    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", requireAdmin);
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test", {}, createMockEnv(), mockExCtx);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_abc" },
      select: { isAdmin: true },
    });
  });
});
