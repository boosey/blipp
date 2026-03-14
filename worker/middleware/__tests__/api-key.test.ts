import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  getAuth: vi.fn(),
}));

const { apiKeyAuth } = await import("../api-key");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

/** Helper: SHA-256 hash a string the same way the middleware does */
async function hashKey(key: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("apiKeyAuth middleware", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
  });

  function createApp() {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.use("/*", apiKeyAuth);
    app.get("/test", (c) => {
      const scopes = c.get("apiKeyScopes");
      const userId = c.get("apiKeyUserId");
      return c.json({ ok: true, scopes, userId });
    });
    return app;
  }

  it("falls through when no Authorization header", async () => {
    const app = createApp();

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
    // No API key lookup should have been made
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("falls through when header is not API key format", async () => {
    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer sk_regular_token" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("falls through for Bearer tokens without blp_live_ prefix", async () => {
    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer some_other_key" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid API key (no match in DB)", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);

    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_invalid_key_123" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("looks up key by SHA-256 hash", async () => {
    const apiKey = "blp_live_test_key_abc";
    const expectedHash = await hashKey(apiKey);

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);

    const app = createApp();

    await app.request(
      "/test",
      { headers: { Authorization: `Bearer ${apiKey}` } },
      createMockEnv(),
      mockExCtx,
    );

    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: expectedHash },
    });
  });

  it("returns 401 for revoked key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_1",
      keyHash: "abc",
      revokedAt: new Date("2025-01-01"),
      expiresAt: null,
      scopes: ["read"],
      userId: "user_1",
    });

    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_revoked_key" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("API key has been revoked");
  });

  it("returns 401 for expired key", async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_2",
      keyHash: "def",
      revokedAt: null,
      expiresAt: pastDate,
      scopes: ["read"],
      userId: "user_2",
    });

    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_expired_key" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toBe("API key has expired");
  });

  it("sets scopes and userId in context for valid key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_3",
      keyHash: "ghi",
      revokedAt: null,
      expiresAt: null,
      scopes: ["read", "write"],
      userId: "user_3",
    });
    mockPrisma.apiKey.update.mockResolvedValueOnce({});

    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_valid_key" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scopes).toEqual(["read", "write"]);
    expect(body.userId).toBe("user_3");
  });

  it("updates lastUsedAt via waitUntil for valid key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_4",
      keyHash: "jkl",
      revokedAt: null,
      expiresAt: null,
      scopes: ["read"],
      userId: "user_4",
    });
    mockPrisma.apiKey.update.mockResolvedValueOnce({});

    const app = createApp();

    await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_track_usage" } },
      createMockEnv(),
      mockExCtx,
    );

    // waitUntil is called on the executionCtx with the update promise
    expect(mockExCtx.waitUntil).toHaveBeenCalled();
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key_4" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("allows valid key with future expiration", async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_5",
      keyHash: "mno",
      revokedAt: null,
      expiresAt: futureDate,
      scopes: ["admin"],
      userId: "user_5",
    });
    mockPrisma.apiKey.update.mockResolvedValueOnce({});

    const app = createApp();

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer blp_live_future_expiry" } },
      createMockEnv(),
      mockExCtx,
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.scopes).toEqual(["admin"]);
  });
});
