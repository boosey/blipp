import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { briefings } from "../briefings";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk1" })),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../lib/plan-limits", () => ({
  getUserWithPlan: vi.fn(),
  checkDurationLimit: vi.fn().mockReturnValue(null),
  checkWeeklyBriefingLimit: vi.fn().mockResolvedValue(null),
}));

import { getUserWithPlan } from "../../lib/plan-limits";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /generate (on-demand)", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/", briefings);

    (getUserWithPlan as any).mockResolvedValue({
      id: "user1",
      tier: "PRO",
      plan: { maxDurationMinutes: 15, briefingsPerWeek: null },
    });
  });

  it("requires durationTier", async () => {
    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "pod1" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("requires podcastId", async () => {
    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationTier: 5 }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("creates FeedItem and dispatches to pipeline for specific episode", async () => {
    mockPrisma.episode.findUniqueOrThrow.mockResolvedValue({ id: "ep1", podcastId: "pod1" });
    mockPrisma.feedItem.upsert.mockResolvedValue({ id: "fi1", status: "PENDING" });
    mockPrisma.briefingRequest.create.mockResolvedValue({ id: "req1" });
    mockPrisma.feedItem.update.mockResolvedValue({ id: "fi1" });

    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "pod1", episodeId: "ep1", durationTier: 5 }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.feedItem.upsert).toHaveBeenCalled();
    expect(mockPrisma.briefingRequest.create).toHaveBeenCalled();
    expect((env.ORCHESTRATOR_QUEUE as any).send).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req1", action: "evaluate" })
    );
  });

  it("resolves latest episode when no episodeId given", async () => {
    mockPrisma.episode.findFirst.mockResolvedValue({ id: "ep-latest", podcastId: "pod1" });
    mockPrisma.feedItem.upsert.mockResolvedValue({ id: "fi1", status: "PENDING" });
    mockPrisma.briefingRequest.create.mockResolvedValue({ id: "req1" });
    mockPrisma.feedItem.update.mockResolvedValue({ id: "fi1" });

    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "pod1", durationTier: 3 }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.episode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { podcastId: "pod1" },
        orderBy: { publishedAt: "desc" },
      })
    );
  });

  it("returns 404 when no episodes found for podcast", async () => {
    mockPrisma.episode.findFirst.mockResolvedValue(null);

    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "pod1", durationTier: 5 }),
    }, env, mockExCtx);

    expect(res.status).toBe(404);
  });

  it("skips pipeline dispatch for already-processed FeedItem", async () => {
    mockPrisma.episode.findUniqueOrThrow.mockResolvedValue({ id: "ep1", podcastId: "pod1" });
    mockPrisma.feedItem.upsert.mockResolvedValue({ id: "fi1", status: "READY" });

    const res = await app.request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "pod1", episodeId: "ep1", durationTier: 5 }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.briefingRequest.create).not.toHaveBeenCalled();
    expect((env.ORCHESTRATOR_QUEUE as any).send).not.toHaveBeenCalled();
  });
});
