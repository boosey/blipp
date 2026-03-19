import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

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
    users: { getUser: vi.fn(), deleteUser: vi.fn() },
  })),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const mockBuildUserExport = vi.fn();
const mockDeleteUserAccount = vi.fn();
vi.mock("../../lib/user-data", () => ({
  buildUserExport: (...args: any[]) => mockBuildUserExport(...args),
  deleteUserAccount: (...args: any[]) => mockDeleteUserAccount(...args),
}));

const mockPrisma = createMockPrisma();

const { me } = await import("../me");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

function resetMockPrisma() {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === "object" && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === "function" && "mockReset" in method) {
          (method as any).mockReset();
        }
      });
    }
  });
}

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

    resetMockPrisma();
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

describe("GET /me/export", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/me", me);

    resetMockPrisma();

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "usr_1",
      clerkId: "user_test123",
    });
  });

  it("returns user data export", async () => {
    mockBuildUserExport.mockResolvedValueOnce({
      exportedAt: "2026-03-14T00:00:00Z",
      user: { id: "usr_1", email: "test@example.com", name: "Test", createdAt: "2026-01-01", plan: { name: "Free", slug: "free" } },
      subscriptions: [],
      feedItems: [],
      briefingRequests: [],
    });

    const res = await app.request("/me/export", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.user.email).toBe("test@example.com");
    expect(body.data.subscriptions).toEqual([]);
    expect(res.headers.get("Content-Disposition")).toContain("blipp-export-");
  });

  it("returns 401 when not authenticated", async () => {
    currentAuth = null;
    const res = await app.request("/me/export", {}, env, mockExCtx);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /me", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/me", me);

    resetMockPrisma();

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "usr_1",
      clerkId: "user_test123",
    });
  });

  it("returns 400 without confirmation", async () => {
    const res = await app.request("/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("returns 400 with wrong confirmation value", async () => {
    const res = await app.request("/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "delete" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("returns 204 with correct confirmation", async () => {
    mockDeleteUserAccount.mockResolvedValueOnce({ r2Deleted: 3 });

    const res = await app.request("/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    }, env, mockExCtx);
    expect(res.status).toBe(204);
    expect(mockDeleteUserAccount).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ R2: expect.anything() }),
      "usr_1",
      "user_test123"
    );
  });

  it("returns 401 when not authenticated", async () => {
    currentAuth = null;
    const res = await app.request("/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    }, env, mockExCtx);
    expect(res.status).toBe(401);
  });
});

describe("Validation", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/me", me);

    resetMockPrisma();

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "usr_1",
      clerkId: "user_test123",
      isAdmin: false,
    });
  });

  it("PATCH /onboarding-complete rejects non-boolean reset", async () => {
    const res = await app.request("/me/onboarding-complete", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: "yes" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /preferences rejects invalid duration tier", async () => {
    const res = await app.request("/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDurationTier: 99 }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /preferences rejects non-number duration tier", async () => {
    const res = await app.request("/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDurationTier: "fast" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE /me rejects missing confirm field", async () => {
    const res = await app.request("/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("POST /push/subscribe rejects missing keys", async () => {
    const res = await app.request("/me/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("POST /push/subscribe rejects invalid endpoint URL", async () => {
    const res = await app.request("/me/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "not-a-url", keys: { p256dh: "key1", auth: "key2" } }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE /push/subscribe rejects missing endpoint", async () => {
    const res = await app.request("/me/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE /push/subscribe rejects invalid endpoint URL", async () => {
    const res = await app.request("/me/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "not-a-url" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
