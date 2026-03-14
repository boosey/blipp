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

const { plans } = await import("../plans");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Plans Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/plans", plans);

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

  describe("GET /plans", () => {
    it("returns all active plans sorted by sortOrder", async () => {
      const mockPlans = [
        {
          id: "plan_free", slug: "free", name: "Free", description: "Basic",
          priceCentsMonthly: 0, priceCentsAnnual: null, features: [],
          highlighted: false, briefingsPerWeek: 3, maxDurationMinutes: 5,
          maxPodcastSubscriptions: 3, adFree: false, priorityProcessing: false, earlyAccess: false,
        },
        {
          id: "plan_pro", slug: "pro", name: "Pro", description: "Pro features",
          priceCentsMonthly: 999, priceCentsAnnual: 9990, features: ["priority"],
          highlighted: true, briefingsPerWeek: null, maxDurationMinutes: 15,
          maxPodcastSubscriptions: null, adFree: true, priorityProcessing: true, earlyAccess: false,
        },
      ];
      mockPrisma.plan.findMany.mockResolvedValueOnce(mockPlans);

      const res = await app.request("/plans", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].slug).toBe("free");
      expect(body[1].slug).toBe("pro");
      expect(body[1].highlighted).toBe(true);
    });

    it("returns empty array when no plans exist", async () => {
      mockPrisma.plan.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/plans", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe("GET /plans/current", () => {
    it("returns 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/plans/current", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("returns current user plan", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        id: "usr_1",
        clerkId: "user_test123",
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "usr_1",
        plan: {
          id: "plan_pro",
          name: "Pro",
          slug: "pro",
          priceCentsMonthly: 999,
        },
      });

      const res = await app.request("/plans/current", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.plan.slug).toBe("pro");
      expect(body.plan.priceCentsMonthly).toBe(999);
    });
  });
});
