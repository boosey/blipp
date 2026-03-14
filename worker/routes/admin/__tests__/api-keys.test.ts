import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import {
  createMockEnv,
  createMockPrisma,
} from "../../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../../middleware/auth", () => ({
  getAuth: vi.fn(() => ({ userId: "admin_1" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

const { apiKeysRoutes } = await import("../api-keys");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe("Admin API Keys", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/api-keys", apiKeysRoutes);

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

  it("POST creates key and returns plaintext once", async () => {
    mockPrisma.apiKey.create.mockResolvedValueOnce({
      id: "key_1",
      name: "Test Key",
      keyPrefix: "blp_live_abc",
      scopes: ["health:read"],
      createdAt: new Date(),
    });

    const res = await app.request(
      "/api-keys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Key", scopes: ["health:read"] }),
      },
      env,
      mockExCtx
    );

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.data.key).toMatch(/^blp_live_/);
    expect(body.data.name).toBe("Test Key");
  });

  it("DELETE revokes a key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_1",
      revokedAt: null,
    });
    mockPrisma.apiKey.update.mockResolvedValueOnce({ id: "key_1" });

    const res = await app.request(
      "/api-keys/key_1",
      { method: "DELETE" },
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.revoked).toBe(true);
  });

  it("POST returns 400 without name", async () => {
    const res = await app.request(
      "/api-keys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["health:read"] }),
      },
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("DELETE returns 404 for nonexistent key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);

    const res = await app.request(
      "/api-keys/nonexistent",
      { method: "DELETE" },
      env,
      mockExCtx
    );
    expect(res.status).toBe(404);
  });

  it("DELETE returns 409 for already revoked key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_1",
      revokedAt: new Date(),
    });

    const res = await app.request(
      "/api-keys/key_1",
      { method: "DELETE" },
      env,
      mockExCtx
    );
    expect(res.status).toBe(409);
  });

  it("GET lists keys with pagination", async () => {
    mockPrisma.apiKey.findMany.mockResolvedValueOnce([
      {
        id: "key_1",
        name: "Test",
        keyPrefix: "blp_live_abc",
        scopes: ["health:read"],
        userId: "admin_1",
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        user: { email: "admin@test.com" },
      },
    ]);
    mockPrisma.apiKey.count.mockResolvedValueOnce(1);

    const res = await app.request("/api-keys", { method: "GET" }, env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});
