import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { feedback } from "../feedback";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk1" })),
}));

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /feedback", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    mockPrisma.user.findUnique.mockResolvedValue({ id: "user1" });
    mockPrisma.feedback.create.mockResolvedValue({ id: "fb1" });

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/feedback", feedback);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });
  });

  it("creates feedback and returns 201", async () => {
    const res = await app.request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Great app!" }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
      data: { userId: "user1", message: "Great app!" },
    });
  });

  it("rejects empty message", async () => {
    const res = await app.request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("rejects missing message", async () => {
    const res = await app.request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, env, mockExCtx);

    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await app.request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    }, env, mockExCtx);

    expect(res.status).toBe(404);
  });
});
