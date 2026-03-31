import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { logsRoutes } from "../logs";
import { createMockEnv } from "../../../tests/helpers/mocks";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("public logs routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    (env as any).SCRIPT_TOKEN = "test-script-token";
    (env as any).CF_API_TOKEN = "cf-token";
    (env as any).CF_ACCOUNT_ID = "cf-account";

    app = new Hono<{ Bindings: Env }>();
    app.route("/logs", logsRoutes);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ success: true, result: { events: [] } }),
    }));
  });

  it("returns 401 without auth header", async () => {
    const res = await app.request("/logs/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeframe: { from: "-15m", to: "now" }, view: "events", limit: 10 }),
    }, env, mockExCtx);

    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong token", async () => {
    const res = await app.request("/logs/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ timeframe: { from: "-15m", to: "now" }, view: "events", limit: 10 }),
    }, env, mockExCtx);

    expect(res.status).toBe(401);
  });

  it("proxies query to CF API with valid token", async () => {
    const queryBody = { timeframe: { from: "-15m", to: "now" }, view: "events", limit: 10 };

    const res = await app.request("/logs/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-script-token",
      },
      body: JSON.stringify(queryBody),
    }, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/cf-account/workers/observability/telemetry/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(queryBody),
      })
    );
  });

  it("proxies keys to CF API with valid token", async () => {
    const keysBody = { timeframe: { from: "-1h", to: "now" } };

    const res = await app.request("/logs/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-script-token",
      },
      body: JSON.stringify(keysBody),
    }, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/cf-account/workers/observability/telemetry/keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(keysBody),
      })
    );
  });

  it("returns 503 when CF credentials missing", async () => {
    (env as any).CF_API_TOKEN = "";
    (env as any).CF_ACCOUNT_ID = "";

    const res = await app.request("/logs/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-script-token",
      },
      body: JSON.stringify({ timeframe: { from: "-15m", to: "now" }, view: "events", limit: 10 }),
    }, env, mockExCtx);

    expect(res.status).toBe(503);
  });
});
