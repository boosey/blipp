import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { briefings } from "../briefings";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";
import { verifyAudioToken } from "../../lib/audio-token";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "user_1" })),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "../../lib/admin-helpers";

function buildApp(prisma: any) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", prisma);
    await next();
  });
  app.route("/", briefings);
  return app;
}

describe("GET /:id/audio-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue({ id: "user_db_1", clerkId: "user_1" });
  });

  it("returns a signed URL for the briefing owner", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3" },
    });
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_1/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; expiresAt: number };
    expect(body.url).toMatch(/\/api\/briefings\/br_1\/audio\?t=[A-Za-z0-9_-]+&exp=\d+/);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(body.expiresAt).toBeGreaterThan(nowSec);
    expect(body.expiresAt - nowSec).toBeLessThanOrEqual(310);

    const params = new URL(`http://x${body.url.replace("/api/briefings/br_1/audio", "")}`).searchParams;
    const result = await verifyAudioToken(createMockEnv(), {
      briefingId: "br_1",
      userId: "user_db_1",
      token: params.get("t")!,
      exp: Number(params.get("exp")),
    });
    expect(result).toBe("ok");
  });

  it("returns 404 for a briefing owned by a different user", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findFirst.mockResolvedValue(null); // not owned by caller
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_other/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 audio_not_ready when audioKey missing", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: null },
    });
    const app = buildApp(prisma);
    const res = await app.request(
      "/br_1/audio-url",
      { method: "GET" },
      { ...createMockEnv() },
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("audio_not_ready");
  });

  it("returns 503 when ENABLE_AUDIO_TOKEN=false", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3" },
    });
    const app = buildApp(prisma);
    const env = { ...createMockEnv(), ENABLE_AUDIO_TOKEN: "false" };
    const res = await app.request("/br_1/audio-url", { method: "GET" }, env);
    expect(res.status).toBe(503);
  });
});
