import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((c: any, next: any) => {
    if (!currentAuth?.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  }),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const mockPrisma = createMockPrisma();

const { me } = await import("../me");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /me", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/me", me);

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

  it("returns 401 when not authenticated", async () => {
    currentAuth = null;

    const res = await app.request("/me", {}, env, mockExCtx);
    expect(res.status).toBe(401);
  });

  it("returns current user with plan data", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "usr_1",
      clerkId: "user_test123",
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "usr_1",
      email: "test@example.com",
      name: "Test User",
      imageUrl: "https://img.com/avatar.jpg",
      isAdmin: false,
      plan: { id: "plan_free", name: "Free", slug: "free" },
    });

    const res = await app.request("/me", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.user.id).toBe("usr_1");
    expect(body.user.email).toBe("test@example.com");
    expect(body.user.plan.slug).toBe("free");
    expect(body.user.isAdmin).toBe(false);
  });

  it("returns admin flag when user is admin", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "usr_admin",
      clerkId: "user_test123",
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "usr_admin",
      email: "admin@example.com",
      name: "Admin",
      imageUrl: null,
      isAdmin: true,
      plan: { id: "plan_pro", name: "Pro", slug: "pro" },
    });

    const res = await app.request("/me", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.user.isAdmin).toBe(true);
    expect(body.user.plan.name).toBe("Pro");
  });
});
