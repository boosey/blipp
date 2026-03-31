import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { createMockEnv } from "../../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));
vi.mock("../../../lib/db", () => ({ createPrismaClient: vi.fn() }));

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../../middleware/auth", () => ({
  getAuth: vi.fn(() => ({ userId: "admin_1" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

const { invitesRoutes } = await import("../invites");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe("Admin Invites", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;
  let mockKv: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    mockKv = {};

    // Mock KV
    (env as any).RATE_LIMIT_KV = {
      get: vi.fn(async (key: string) => mockKv[key] ?? null),
      put: vi.fn(async (key: string, value: string) => {
        mockKv[key] = value;
      }),
    };
    (env as any).RESEND_API_KEY = "re_test_123";
    (env as any).FROM_EMAIL = "Blipp <hello@podblipp.com>";

    app = new Hono<{ Bindings: Env }>();
    app.route("/invites", invitesRoutes);
  });

  describe("POST /invites/send", () => {
    it("returns 400 if no emails provided", async () => {
      const res = await app.request("/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("sends invites and tracks in KV", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const res = await app.request("/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: ["test@example.com"] }),
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.sent).toBe(1);
      expect(data.skipped).toBe(0);
      expect(data.failed).toBe(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockKv["invite:sent:test@example.com"]).toBeDefined();

      vi.unstubAllGlobals();
    });

    it("skips already-sent emails", async () => {
      mockKv["invite:sent:already@done.com"] = JSON.stringify({ sentAt: "2026-01-01" });

      const res = await app.request("/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: ["already@done.com"] }),
      }, env, mockExCtx);

      const data = await res.json() as any;
      expect(data.skipped).toBe(1);
      expect(data.sent).toBe(0);
    });

    it("handles Resend failures gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const res = await app.request("/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: ["fail@test.com"] }),
      }, env, mockExCtx);

      const data = await res.json() as any;
      expect(data.failed).toBe(1);
      expect(data.sent).toBe(0);

      vi.unstubAllGlobals();
    });
  });

  describe("GET /invites/status", () => {
    it("returns 400 without emails param", async () => {
      const res = await app.request("/invites/status", {}, env, mockExCtx);
      expect(res.status).toBe(400);
    });

    it("returns status for given emails", async () => {
      mockKv["invite:sent:a@b.com"] = JSON.stringify({ sentAt: "2026-03-29T00:00:00Z" });

      const res = await app.request("/invites/status?emails=a@b.com,c@d.com", {}, env, mockExCtx);
      const data = await res.json() as any;

      expect(data.statuses["a@b.com"].sent).toBe(true);
      expect(data.statuses["c@d.com"].sent).toBe(false);
    });
  });
});
