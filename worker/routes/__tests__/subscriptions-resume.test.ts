import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { subscriptions } from "../subscriptions";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { generateResumeToken } from "../../lib/subscription-pause";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /subscriptions/resume (token-link)", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = { ...createMockEnv(), SUBSCRIPTION_RESUME_SECRET: "test-secret" };

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/", subscriptions);
  });

  it("redirects to error path on missing token", async () => {
    const res = await app.request("/resume", {}, env, mockExCtx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("resumeError=1");
  });

  it("redirects to error path on tampered token", async () => {
    const token = await generateResumeToken(env, "sub1");
    const tampered = token.slice(0, -3) + "XYZ";
    const res = await app.request(`/resume?token=${encodeURIComponent(tampered)}`, {}, env, mockExCtx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("resumeError=1");
  });

  it("redirects to error path when DB token does not match (already used / re-paused)", async () => {
    const token = await generateResumeToken(env, "sub1");
    mockPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      resumeToken: "different-token",
      podcast: { title: "My Pod" },
    });

    const res = await app.request(`/resume?token=${encodeURIComponent(token)}`, {}, env, mockExCtx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("resumeError=1");
    expect(mockPrisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("resumes the subscription and redirects with podcast title on valid token", async () => {
    const token = await generateResumeToken(env, "sub1");
    mockPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      resumeToken: token,
      podcast: { title: "My Pod" },
    });
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

    const res = await app.request(`/resume?token=${encodeURIComponent(token)}`, {}, env, mockExCtx);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/library?tab=subscriptions&resumed=");
    expect(location).toContain(encodeURIComponent("My Pod"));
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "sub1" }),
        data: expect.objectContaining({
          pausedAt: null,
          pauseReason: null,
          resumeToken: null,
        }),
      })
    );
  });
});
