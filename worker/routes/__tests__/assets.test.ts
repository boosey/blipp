import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { assetsRoutes } from "../assets";
import { createMockEnv } from "../../../tests/helpers/mocks";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /assets/:path", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.route("/assets", assetsRoutes);
  });

  it("returns MP3 with correct headers when jingle exists in R2", async () => {
    const audioData = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer;
    (env.R2 as any).get.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(audioData),
    });

    const res = await app.request("/assets/jingles/intro.mp3", {}, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect((env.R2 as any).get).toHaveBeenCalledWith("assets/jingles/intro.mp3");
  });

  it("returns 404 when jingle does not exist in R2", async () => {
    (env.R2 as any).get.mockResolvedValueOnce(null);

    const res = await app.request("/assets/jingles/outro.mp3", {}, env, mockExCtx);

    expect(res.status).toBe(404);
    expect((env.R2 as any).get).toHaveBeenCalledWith("assets/jingles/outro.mp3");
  });

  it("rejects paths outside jingles directory with 404 without calling R2", async () => {
    const res = await app.request("/assets/../../secret.txt", {}, env, mockExCtx);

    expect(res.status).toBe(404);
    expect((env.R2 as any).get).not.toHaveBeenCalled();
  });
});
