import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const { requestIdMiddleware } = await import("../request-id");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("requestIdMiddleware", () => {
  it("generates a UUID when no x-request-id header is sent", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requestIdMiddleware);
    app.get("/test", (c) => c.json({ requestId: c.get("requestId") }));

    const res = await app.request("/test", {}, createMockEnv(), mockExCtx);
    const header = res.headers.get("x-request-id");
    expect(header).toBeTruthy();
    expect(header).toMatch(/^[0-9a-f-]{36}$/);

    const body: any = await res.json();
    expect(body.requestId).toBe(header);
  });

  it("echoes client-provided x-request-id", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("/*", requestIdMiddleware);
    app.get("/test", (c) => c.json({ requestId: c.get("requestId") }));

    const res = await app.request(
      "/test",
      { headers: { "x-request-id": "abc-123" } },
      createMockEnv(),
      mockExCtx
    );
    expect(res.headers.get("x-request-id")).toBe("abc-123");

    const body: any = await res.json();
    expect(body.requestId).toBe("abc-123");
  });
});
