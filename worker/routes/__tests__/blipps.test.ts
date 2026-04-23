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
    users: { getUser: vi.fn(), deleteUser: vi.fn() },
  })),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const mockPrisma = createMockPrisma();

const { blipps } = await import("../blipps");

const mockExCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

const testUser = {
  id: "user1",
  clerkId: "user_test123",
  email: "test@test.com",
  acceptAnyVoice: false,
  defaultVoicePresetId: "voice1",
  planId: "plan1",
  isAdmin: false,
};

function resetMockPrisma() {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === "object" && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === "function" && "mockReset" in method) {
          (method as any).mockReset();
        }
      });
    }
  });
}

describe("GET /blipps/availability", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuth = mockUserId;
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma as any);
      await next();
    });
    app.route("/blipps", blipps);

    resetMockPrisma();

    // Default: getCurrentUser uses findUniqueOrThrow, resolveVoicePresetId uses findUnique
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(testUser);
    mockPrisma.user.findUnique.mockResolvedValue(testUser);
  });

  it("returns 400 when episodeId is missing", async () => {
    const res = await app.request(
      "/blipps/availability?durationTier=5",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when durationTier is missing", async () => {
    const res = await app.request(
      "/blipps/availability?episodeId=ep1",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when episode not found", async () => {
    mockPrisma.episode.findUnique.mockResolvedValue(null);

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(404);
  });

  it("returns exact match when clip exists with user's voice", async () => {
    mockPrisma.episode.findUnique.mockResolvedValue({ podcastId: "pod1" });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    // resolveVoicePresetId falls through to user.defaultVoicePresetId
    mockPrisma.clip.findFirst.mockResolvedValue({
      id: "clip1",
      voicePreset: { name: "Coral" },
    });

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.available).toBe(true);
    expect(body.matchType).toBe("exact");
    expect(body.voicePresetName).toBe("Coral");
  });

  it("returns any_voice match when user has acceptAnyVoice and non-exact clip exists", async () => {
    const anyVoiceUser = { ...testUser, acceptAnyVoice: true };
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(anyVoiceUser);
    mockPrisma.user.findUnique.mockResolvedValue(anyVoiceUser);
    mockPrisma.episode.findUnique.mockResolvedValue({ podcastId: "pod1" });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.clip.findFirst
      .mockResolvedValueOnce(null) // exact match fails
      .mockResolvedValueOnce({
        id: "clip2",
        voicePreset: { name: "Shimmer" },
      }); // any voice succeeds

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.available).toBe(true);
    expect(body.matchType).toBe("any_voice");
    expect(body.voicePresetName).toBe("Shimmer");
  });

  it("returns unavailable with wait estimate when no clip exists", async () => {
    mockPrisma.episode.findUnique.mockResolvedValue({ podcastId: "pod1" });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.clip.findFirst.mockResolvedValue(null);
    mockPrisma.distillation.findUnique.mockResolvedValue(null);

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.available).toBe(false);
    expect(body.matchType).toBeNull();
    expect(body.estimatedWaitSeconds).toBe(180);
  });

  it("returns shorter wait when distillation is complete", async () => {
    mockPrisma.episode.findUnique.mockResolvedValue({ podcastId: "pod1" });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.clip.findFirst.mockResolvedValue(null);
    mockPrisma.distillation.findUnique.mockResolvedValue({
      status: "COMPLETED",
    });

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    const body = await res.json() as any;
    expect(body.estimatedWaitSeconds).toBe(90);
  });

  it("returns shortest wait when clip is generating audio", async () => {
    mockPrisma.episode.findUnique.mockResolvedValue({ podcastId: "pod1" });
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.clip.findFirst
      .mockResolvedValueOnce(null) // exact match
      .mockResolvedValueOnce({ status: "GENERATING_AUDIO" }); // in-progress check

    const res = await app.request(
      "/blipps/availability?episodeId=ep1&durationTier=5",
      {},
      env,
      mockExCtx
    );
    const body = await res.json() as any;
    expect(body.estimatedWaitSeconds).toBe(30);
  });
});
