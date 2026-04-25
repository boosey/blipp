import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { briefings } from "../briefings";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";
import { signAudioToken } from "../../lib/audio-token";

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

const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
function makeEnvWithR2() {
  const env = createMockEnv();
  (env.R2 as any).get = vi.fn().mockResolvedValue({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(audioBytes);
        controller.close();
      },
    }),
    arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    size: audioBytes.byteLength,
    etag: '"abc"',
  });
  return env;
}

describe("GET /:id/audio with token auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams audio with a valid token (no Clerk auth)", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findUnique.mockResolvedValue({ userId: "user_db_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3", audioContentType: "audio/mpeg" },
    });

    const env = makeEnvWithR2();
    const { token, exp } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: 300,
    });

    const app = buildApp(prisma);
    const res = await app.request(`/br_1/audio?t=${token}&exp=${exp}`, { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(getCurrentUser as any).not.toHaveBeenCalled();
  });

  it("returns 401 token_expired when exp is past", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findUnique.mockResolvedValue({ userId: "user_db_1" });
    const env = makeEnvWithR2();
    const past = Math.floor(Date.now() / 1000) - 10;
    const { token } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: -100,
    });

    const app = buildApp(prisma);
    const res = await app.request(`/br_1/audio?t=${token}&exp=${past}`, { method: "GET" }, env);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("token_expired");
  });

  it("returns 401 on tampered token", async () => {
    const prisma = createMockPrisma();
    prisma.briefing.findUnique.mockResolvedValue({ userId: "user_db_1" });
    const env = makeEnvWithR2();
    const { token, exp } = await signAudioToken(env, {
      briefingId: "br_1",
      userId: "user_db_1",
      ttlSeconds: 300,
    });
    const tampered = token.slice(0, -3) + "AAA";

    const app = buildApp(prisma);
    const res = await app.request(`/br_1/audio?t=${tampered}&exp=${exp}`, { method: "GET" }, env);
    expect(res.status).toBe(401);
  });

  it("falls through to Clerk auth when no token present (regression)", async () => {
    const prisma = createMockPrisma();
    (getCurrentUser as any).mockResolvedValue({ id: "user_db_1", clerkId: "user_1" });
    prisma.briefing.findFirst.mockResolvedValue({
      id: "br_1",
      userId: "user_db_1",
      clip: { audioKey: "clips/abc.mp3", audioContentType: "audio/mpeg" },
    });
    const env = makeEnvWithR2();

    const app = buildApp(prisma);
    const res = await app.request("/br_1/audio", { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(getCurrentUser as any).toHaveBeenCalled();
  });
});
