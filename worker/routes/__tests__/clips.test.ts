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

// Mock getAuth to return a userId
const mockGetAuth = vi.fn();
vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: (...args: any[]) => mockGetAuth(...args),
}));

const { clips } = await import("../clips");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Clip Audio Route", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma as any); await next(); });
    app.route("/clips", clips);

    mockGetAuth.mockReturnValue({ userId: "clerk_123" });

    // Reset prisma mocks
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

  it("should serve from wp/ path", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", isAdmin: false, clerkId: "clerk_123" });
    mockPrisma.feedItem.findFirst.mockResolvedValueOnce({ id: "fi_1" });

    const audioData = new ArrayBuffer(100);
    (env.R2 as any).get.mockImplementation((key: string) => {
      if (key === "wp/clip/ep_123/5/default.mp3") {
        return Promise.resolve({ arrayBuffer: () => Promise.resolve(audioData) });
      }
      return Promise.resolve(null);
    });

    const res = await app.request("/clips/ep_123/5", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("should fall back to legacy path", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", isAdmin: false, clerkId: "clerk_123" });
    mockPrisma.feedItem.findFirst.mockResolvedValueOnce({ id: "fi_1" });

    const audioData = new ArrayBuffer(100);
    (env.R2 as any).get.mockImplementation((key: string) => {
      if (key === "clips/ep_123/5.mp3") {
        return Promise.resolve({ arrayBuffer: () => Promise.resolve(audioData) });
      }
      return Promise.resolve(null);
    });

    const res = await app.request("/clips/ep_123/5", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("should return 404 when neither path exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", isAdmin: false, clerkId: "clerk_123" });
    mockPrisma.feedItem.findFirst.mockResolvedValueOnce({ id: "fi_1" });
    (env.R2 as any).get.mockResolvedValue(null);

    const res = await app.request("/clips/ep_123/5", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(404);
  });

  it("should return 404 when user has no FeedItem for clip", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", isAdmin: false, clerkId: "clerk_123" });
    mockPrisma.feedItem.findFirst.mockResolvedValueOnce(null);

    const res = await app.request("/clips/ep_123/5", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(404);
  });

  it("should allow admin to access any clip", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "usr_admin", isAdmin: true, clerkId: "clerk_123" });

    const audioData = new ArrayBuffer(50);
    (env.R2 as any).get.mockImplementation((key: string) => {
      if (key === "wp/clip/ep_any/3/default.mp3") {
        return Promise.resolve({ arrayBuffer: () => Promise.resolve(audioData) });
      }
      return Promise.resolve(null);
    });

    const res = await app.request("/clips/ep_any/3", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(200);
    // feedItem.findFirst should NOT have been called for admin
    expect(mockPrisma.feedItem.findFirst).not.toHaveBeenCalled();
  });

  it("should return 401 when user not found in DB", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await app.request("/clips/ep_123/5", { method: "GET" }, env, mockExCtx);

    expect(res.status).toBe(401);
  });
});
