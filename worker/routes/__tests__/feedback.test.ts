import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { feedback } from "../feedback";
import type { Env } from "../../types";

function createApp(kvStore: Record<string, string> = {}) {
  const kv = {
    get: vi.fn(async (key: string) => kvStore[key] ?? null),
    put: vi.fn(async (key: string, value: string) => {
      kvStore[key] = value;
    }),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.use("/*", async (c, next) => {
    (c.env as any) = { RATE_LIMIT_KV: kv };
    await next();
  });
  app.route("/api/feedback", feedback);
  return { app, kv, kvStore };
}

function post(app: Hono, body: any) {
  return app.request("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("accepts valid feedback", async () => {
    const { app } = createApp();
    const res = await post(app, { email: "a@b.com", message: "Great app!", category: "general" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects missing email", async () => {
    const { app } = createApp();
    const res = await post(app, { message: "Hello" });
    expect(res.status).toBe(400);
  });

  it("rejects short message", async () => {
    const { app } = createApp();
    const res = await post(app, { email: "a@b.com", message: "Hi" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid category", async () => {
    const { app } = createApp();
    const res = await post(app, { email: "a@b.com", message: "Hello world", category: "spam" });
    expect(res.status).toBe(400);
  });

  it("rate limits after 5 submissions", async () => {
    const hour = new Date().toISOString().slice(0, 13);
    const kvStore: Record<string, string> = {
      [`feedback:rate:a@b.com:${hour}`]: "5",
    };
    const { app } = createApp(kvStore);
    const res = await post(app, { email: "a@b.com", message: "Hello world" });
    expect(res.status).toBe(429);
  });

  it("defaults category to general", async () => {
    const { app, kv } = createApp();
    const res = await post(app, { email: "a@b.com", message: "Hello world" });
    expect(res.status).toBe(200);
    const storedCall = kv.put.mock.calls.find(
      (call: any[]) => (call[0] as string).startsWith("feedback:2")
    );
    expect(storedCall).toBeDefined();
    const stored = JSON.parse(storedCall![1] as string);
    expect(stored.category).toBe("general");
  });
});
