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

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

const { auditLogRoutes } = await import("../audit-log");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Admin Audit Log", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/audit-log", auditLogRoutes);

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

  it("returns paginated audit log entries", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: "al_1",
        actorId: "user_1",
        actorEmail: "admin@test.com",
        action: "plan.create",
        entityType: "Plan",
        entityId: "plan_1",
        before: null,
        after: { name: "Pro" },
        metadata: null,
        createdAt: new Date("2026-03-14"),
      },
    ]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(1);

    const res = await app.request("/audit-log", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].action).toBe("plan.create");
  });

  it("filters by entityType", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(0);

    await app.request("/audit-log?entityType=User", {}, env, mockExCtx);

    const findCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(findCall.where.entityType).toBe("User");
  });

  it("filters by date range", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(0);

    await app.request("/audit-log?from=2026-03-01&to=2026-03-14", {}, env, mockExCtx);

    const findCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(findCall.where.createdAt.gte).toEqual(new Date("2026-03-01"));
    expect(findCall.where.createdAt.lte).toEqual(new Date("2026-03-14"));
  });

  it("filters by action", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(0);

    await app.request("/audit-log?action=plan", {}, env, mockExCtx);

    const findCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
    expect(findCall.where.action).toEqual({ contains: "plan" });
  });
});
