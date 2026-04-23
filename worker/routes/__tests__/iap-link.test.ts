import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

const mockUserId = { userId: "user_clerk123" };
let currentAuth: { userId: string } | null = mockUserId;
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));
vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ users: { getUser: vi.fn() } })),
}));

// Stub entitlement side effects
const mockUpsert = vi.fn();
const mockRecompute = vi.fn();
vi.mock("../../lib/entitlement", () => ({
  upsertBillingSubscription: (...args: any[]) => mockUpsert(...args),
  recomputeEntitlement: (...args: any[]) => mockRecompute(...args),
}));

// Stub service-key-resolver to return values straight from env
vi.mock("../../lib/service-key-resolver", () => ({
  resolveApiKey: vi.fn(async (_prisma: any, env: any, envKey: string) => env[envKey]),
}));

const { iap } = await import("../iap");
const { classifyHttpError } = await import("../../lib/errors");

describe("POST /iap/link (v2)", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/iap", iap);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "db_user_1", clerkId: "user_clerk123", status: "active" });
    mockPrisma.plan.findFirst.mockResolvedValue({ id: "plan_pro_1" });

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  function requestLink() {
    return app.request("/iap/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "com.podblipp.app.pro.monthly",
        originalTransactionId: "2000000000000001",
      }),
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} });
  }

  it("calls v2 URL with project id and bearer key", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [
      { store: "app_store", status: "active", auto_renewal_status: "will_renew", current_period_ends_at: new Date(Date.now() + 86400000).toISOString() },
    ] }), { status: 200 }));

    const res = await requestLink();
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.revenuecat.com/v2/projects/proj_mock/customers/user_clerk123/subscriptions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer rc_rest_mock" });
  });

  it("upserts ACTIVE when RC reports an active app_store subscription", async () => {
    const endsAt = new Date(Date.now() + 86400000).toISOString();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [
      { store: "app_store", status: "active", auto_renewal_status: "will_renew", current_period_ends_at: endsAt },
    ] }), { status: 200 }));

    const res = await requestLink();
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      source: "APPLE",
      externalId: "2000000000000001",
      productExternalId: "com.podblipp.app.pro.monthly",
      planId: "plan_pro_1",
      status: "ACTIVE",
      willRenew: true,
    }));
    expect(mockRecompute).toHaveBeenCalledWith(expect.anything(), "db_user_1");
  });

  it("marks CANCELLED_PENDING_EXPIRY when auto_renewal_status is will_not_renew", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [
      { store: "app_store", status: "active", auto_renewal_status: "will_not_renew", current_period_ends_at: new Date(Date.now() + 86400000).toISOString() },
    ] }), { status: 200 }));

    await requestLink();
    expect(mockUpsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "CANCELLED_PENDING_EXPIRY",
      willRenew: false,
    }));
  });

  it("marks GRACE_PERIOD when status is in_grace_period", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [
      { store: "app_store", status: "in_grace_period", auto_renewal_status: "will_renew", current_period_ends_at: new Date(Date.now() + 86400000).toISOString() },
    ] }), { status: 200 }));

    await requestLink();
    expect(mockUpsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "GRACE_PERIOD",
    }));
  });

  it("returns 404 when no active app_store subscription exists on RC", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [
      { store: "play_store", status: "active" },
      { store: "app_store", status: "expired" },
    ] }), { status: 200 }));

    const res = await requestLink();
    expect(res.status).toBe(404);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 502 when RC REST call fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad key", { status: 401 }));

    const res = await requestLink();
    expect(res.status).toBe(502);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 500 when REVENUECAT_PROJECT_ID is missing", async () => {
    env.REVENUECAT_PROJECT_ID = undefined;

    const res = await requestLink();
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
