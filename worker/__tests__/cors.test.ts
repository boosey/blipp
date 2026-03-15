import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../types";
import { createMockEnv } from "../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

function createCorsApp(envOverrides: Partial<Env> = {}) {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", cors({
    origin: (origin, c) => {
      const allowedOrigins = c.env.ALLOWED_ORIGINS
        ? c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
        : [
            "http://localhost:8787",
            "http://localhost:5173",
            "https://podblipp.com",
            "https://www.podblipp.com",
          ];
      return allowedOrigins.includes(origin) ? origin : "";
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));

  app.get("/api/test", (c) => c.json({ ok: true }));

  return app;
}

describe("CORS Configuration", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  it("should set ACAO header for allowed origin (localhost:8787)", async () => {
    const app = createCorsApp();
    const res = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "http://localhost:8787" } },
      env,
      mockExCtx
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8787");
  });

  it("should set ACAO header for allowed origin (localhost:5173)", async () => {
    const app = createCorsApp();
    const res = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "http://localhost:5173" } },
      env,
      mockExCtx
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("should not set ACAO header for disallowed origin", async () => {
    const app = createCorsApp();
    const res = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "https://evil.com" } },
      env,
      mockExCtx
    );
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("should respect ALLOWED_ORIGINS env var", async () => {
    const app = createCorsApp();
    const customEnv = { ...env, ALLOWED_ORIGINS: "https://staging.blipp.app" };

    // Custom origin should be allowed
    const res1 = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "https://staging.blipp.app" } },
      customEnv,
      mockExCtx
    );
    expect(res1.headers.get("Access-Control-Allow-Origin")).toBe("https://staging.blipp.app");

    // Default origin should NOT be allowed when overridden
    const res2 = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "http://localhost:8787" } },
      customEnv,
      mockExCtx
    );
    const acao = res2.headers.get("Access-Control-Allow-Origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("should include credentials header", async () => {
    const app = createCorsApp();
    const res = await app.request(
      "/api/test",
      { method: "GET", headers: { Origin: "http://localhost:8787" } },
      env,
      mockExCtx
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("should handle preflight OPTIONS requests", async () => {
    const app = createCorsApp();
    const res = await app.request(
      "/api/test",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8787",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
      },
      env,
      mockExCtx
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8787");
  });
});
