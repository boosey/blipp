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

const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const { requireAdmin } = await import("../../../middleware/admin");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("requireAdmin middleware", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/admin/*", requireAdmin);
    app.get("/admin/test", (c) => c.json({ ok: true }));

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

  it("returns 401 when no auth", async () => {
    currentAuth = null;
    const res = await app.request("/admin/test", {}, env, mockExCtx);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user exists but is not admin", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ isAdmin: false });
    const res = await app.request("/admin/test", {}, env, mockExCtx);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when user is not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await app.request("/admin/test", {}, env, mockExCtx);
    expect(res.status).toBe(403);
  });

  it("passes through when user is admin", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ isAdmin: true });
    const res = await app.request("/admin/test", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
  });

  it("calls $disconnect via waitUntil", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ isAdmin: true });
    await app.request("/admin/test", {}, env, mockExCtx);
    expect(mockPrisma.$disconnect).toHaveBeenCalled();
  });
});
