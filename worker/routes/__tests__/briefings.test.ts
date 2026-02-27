import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

// Mock Prisma deps so Vite doesn't try to resolve the generated client
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

// Mock createPrismaClient
const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

// Mock Clerk auth
const mockUserId = { userId: "user_test123" };
let currentAuth: { userId: string } | null = mockUserId;

vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => currentAuth),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

// Import after mocks
const { briefings } = await import("../briefings");

/** Mock ExecutionContext for Hono test requests */
const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Briefing Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.route("/briefings", briefings);

    // Reset mock prisma
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

  describe("GET /briefings/", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return user briefings ordered by date desc", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      const briefingsList = [
        { id: "b_2", userId: "usr_1", createdAt: "2024-01-02" },
        { id: "b_1", userId: "usr_1", createdAt: "2024-01-01" },
      ];

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.findMany.mockResolvedValueOnce(briefingsList);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.briefings).toHaveLength(2);
    });

    it("should return empty array when user has no briefings", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.findMany.mockResolvedValueOnce([]);

      const res = await app.request("/briefings", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.briefings).toHaveLength(0);
    });
  });

  describe("GET /briefings/today", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request("/briefings/today", {}, env, mockExCtx);
      expect(res.status).toBe(401);
    });

    it("should return today's briefing", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      const briefing = { id: "b_1", userId: "usr_1", status: "COMPLETED" };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.findFirst.mockResolvedValueOnce(briefing);

      const res = await app.request("/briefings/today", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.briefing).toBeDefined();
      expect(body.briefing.id).toBe("b_1");
    });

    it("should return null when no briefing exists for today", async () => {
      const user = { id: "usr_1", clerkId: "user_test123" };
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.findFirst.mockResolvedValueOnce(null);

      const res = await app.request("/briefings/today", {}, env, mockExCtx);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.briefing).toBeNull();
    });
  });

  describe("POST /briefings/generate", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/briefings/generate",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should create briefing and queue it for assembly", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        tier: "PRO",
        briefingLengthMinutes: 15,
      };
      const briefing = {
        id: "b_new",
        userId: "usr_1",
        targetMinutes: 15,
        status: "PENDING",
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.create.mockResolvedValueOnce(briefing);

      const res = await app.request(
        "/briefings/generate",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.briefing.id).toBe("b_new");
    });

    it("should return 429 when free-tier user exceeds weekly limit", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        tier: "FREE",
        briefingLengthMinutes: 15,
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.count.mockResolvedValueOnce(3); // Already at limit

      const res = await app.request(
        "/briefings/generate",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(429);
      const body: any = await res.json();
      expect(body.error).toContain("Free tier limit");
    });

    it("should cap free-tier briefing to 5 minutes max", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        tier: "FREE",
        briefingLengthMinutes: 15,
      };
      const briefing = {
        id: "b_free",
        userId: "usr_1",
        targetMinutes: 5,
        status: "PENDING",
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.count.mockResolvedValueOnce(0);
      mockPrisma.briefing.create.mockResolvedValueOnce(briefing);

      const res = await app.request(
        "/briefings/generate",
        { method: "POST" },
        env,
        mockExCtx
      );
      expect(res.status).toBe(201);

      // Verify create was called with capped targetMinutes
      expect(mockPrisma.briefing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetMinutes: 5 }),
        })
      );
    });

    it("should send message to BRIEFING_ASSEMBLY_QUEUE", async () => {
      const user = {
        id: "usr_1",
        clerkId: "user_test123",
        tier: "PRO",
        briefingLengthMinutes: 10,
      };
      const briefing = { id: "b_q", userId: "usr_1" };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
      mockPrisma.briefing.create.mockResolvedValueOnce(briefing);

      await app.request("/briefings/generate", { method: "POST" }, env, mockExCtx);

      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith({
        briefingId: "b_q",
        userId: "usr_1",
      });
    });
  });

  describe("PATCH /briefings/preferences", () => {
    it("should return 401 when not authenticated", async () => {
      currentAuth = null;

      const res = await app.request(
        "/briefings/preferences",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ briefingLengthMinutes: 10 }),
        },
        env,
        mockExCtx
      );
      expect(res.status).toBe(401);
    });

    it("should update preferences and return new values", async () => {
      const updatedUser = {
        briefingLengthMinutes: 10,
        briefingTime: "08:00",
        timezone: "America/Chicago",
      };

      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const res = await app.request(
        "/briefings/preferences",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefingLengthMinutes: 10,
            briefingTime: "08:00",
            timezone: "America/Chicago",
          }),
        },
        env,
        mockExCtx
      );

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.preferences.briefingLengthMinutes).toBe(10);
      expect(body.preferences.briefingTime).toBe("08:00");
      expect(body.preferences.timezone).toBe("America/Chicago");
    });

    it("should update only provided fields", async () => {
      const updatedUser = {
        briefingLengthMinutes: 15,
        briefingTime: "07:00",
        timezone: "Europe/London",
      };

      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      await app.request(
        "/briefings/preferences",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: "Europe/London" }),
        },
        env,
        mockExCtx
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { timezone: "Europe/London" },
        })
      );
    });
  });
});
