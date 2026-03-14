import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { briefings } from "../briefings";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk_123" })),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  parsePagination: vi.fn(),
  parseSort: vi.fn(),
  paginatedResponse: vi.fn(),
}));

vi.mock("../../lib/plan-limits", () => ({
  getUserWithPlan: vi.fn(),
  checkDurationLimit: vi.fn().mockReturnValue(null),
  checkWeeklyBriefingLimit: vi.fn().mockResolvedValue(null),
}));

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /briefings/:id/audio", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/briefings", briefings);
  });

  it("returns 404 when briefing does not exist", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValueOnce(null);

    const res = await app.request("/briefings/br-1/audio", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("returns assembled audio from R2 when available", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValueOnce({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });

    const audioData = new Uint8Array([0xff, 0xfb, 0x01]).buffer;
    (env.R2 as any).get.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(audioData),
    });

    const res = await app.request("/briefings/br-1/audio", {}, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("falls back to raw clip when no assembled audio", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValueOnce({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });

    const clipAudio = new Uint8Array([0xff, 0xfb, 0x02]).buffer;
    (env.R2 as any).get
      .mockResolvedValueOnce(null)  // assembled audio not found
      .mockResolvedValueOnce({       // raw clip found
        arrayBuffer: () => Promise.resolve(clipAudio),
      });

    const res = await app.request("/briefings/br-1/audio", {}, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 404 when neither assembled nor raw audio exists", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValueOnce({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });
    (env.R2 as any).get.mockResolvedValue(null);

    const res = await app.request("/briefings/br-1/audio", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });
});
