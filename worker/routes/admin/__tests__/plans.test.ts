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

// Mock requireAdmin middleware to be a passthrough
vi.mock("../../../middleware/admin", () => ({
  requireAdmin: vi.fn((_c: any, next: any) => next()),
}));

// Mock auth for audit logging
vi.mock("../../../middleware/auth", () => ({
  getAuth: vi.fn(() => ({ userId: "admin_1" })),
  clerkMiddleware: vi.fn(() => async (_c: any, next: any) => next()),
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

// Mock audit log (fire-and-forget, should not affect tests)
vi.mock("../../../lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const { plansRoutes } = await import("../plans");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Admin Plans Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/plans", plansRoutes);

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

  describe("POST /", () => {
    it("should create plan with only allowed fields", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null); // slug check
      mockPrisma.plan.create.mockResolvedValueOnce({
        id: "plan_1",
        name: "Pro",
        slug: "pro",
        priceCentsMonthly: 999,
        _count: { users: 0 },
      });

      const res = await app.request(
        "/plans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Pro",
            slug: "pro",
            priceCentsMonthly: 999,
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(201);
      expect(mockPrisma.plan.create).toHaveBeenCalledWith({
        data: { name: "Pro", slug: "pro", priceCentsMonthly: 999 },
        include: { _count: { select: { users: true } } },
      });
    });

    it("should strip disallowed fields", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce(null); // slug check
      mockPrisma.plan.create.mockResolvedValueOnce({
        id: "plan_1",
        name: "Pro",
        slug: "pro",
        _count: { users: 0 },
      });

      const res = await app.request(
        "/plans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Pro",
            slug: "pro",
            id: "evil_id",
            stripeProductId: "prod_evil",
            stripePriceIdMonthly: "price_evil",
            createdAt: "2020-01-01",
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(201);
      const createCall = mockPrisma.plan.create.mock.calls[0][0];
      expect(createCall.data).not.toHaveProperty("id");
      expect(createCall.data).not.toHaveProperty("stripeProductId");
      expect(createCall.data).toHaveProperty("stripePriceIdMonthly", "price_evil");
      expect(createCall.data).not.toHaveProperty("createdAt");
    });

    it("should return 400 when name is missing", async () => {
      const res = await app.request(
        "/plans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "test" }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("name and slug are required");
    });

    it("should return 400 when slug is missing", async () => {
      const res = await app.request(
        "/plans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("name and slug are required");
    });
  });

  describe("PATCH /:id", () => {
    it("should update only allowed fields", async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce({ id: "plan_1", slug: "pro" }); // existing check
      mockPrisma.plan.update.mockResolvedValueOnce({
        id: "plan_1",
        name: "New Name",
        slug: "pro",
        _count: { users: 0 },
      });

      const res = await app.request(
        "/plans/plan_1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New Name",
            stripeProductId: "prod_evil",
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.plan.update.mock.calls[0][0];
      expect(updateCall.data).toHaveProperty("name", "New Name");
      expect(updateCall.data).not.toHaveProperty("stripeProductId");
    });

    it("should return 400 when body has no valid fields", async () => {
      const res = await app.request(
        "/plans/plan_1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "evil_id",
            createdAt: "2020-01-01",
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toContain("No valid fields to update");
    });
  });
});
