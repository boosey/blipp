import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { podcasts } from "../podcasts";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../lib/plan-limits", () => ({
  getUserWithPlan: vi.fn(),
  checkDurationLimit: vi.fn().mockReturnValue(null),
  checkSubscriptionLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/podcast-index", () => ({
  PodcastIndexClient: vi.fn(),
}));

import { getCurrentUser } from "../../lib/admin-helpers";
import { getUserWithPlan } from "../../lib/plan-limits";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /subscribe", () => {
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
    app.route("/", podcasts);

    (getUserWithPlan as any).mockResolvedValue({
      id: "user1",
      clerkId: "clerk1",
      plan: { maxDurationMinutes: 15, maxPodcastSubscriptions: null },
    });
    (getCurrentUser as any).mockResolvedValue({ id: "user1", clerkId: "clerk1" });
  });

  it("requires durationTier", async () => {
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl: "https://example.com/feed", title: "Test" }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toContain("durationTier");
  });

  it("rejects invalid durationTier", async () => {
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl: "https://example.com/feed", title: "Test", durationTier: 4 }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("creates subscription with durationTier and triggers pipeline for latest episode", async () => {
    mockPrisma.podcast.upsert.mockResolvedValue({ id: "pod1", feedUrl: "https://example.com/feed" });
    mockPrisma.subscription.upsert.mockResolvedValue({ id: "sub1", userId: "user1", podcastId: "pod1", durationTier: 5 });
    mockPrisma.episode.findFirst.mockResolvedValue({ id: "ep1", podcastId: "pod1" });
    mockPrisma.feedItem.upsert.mockResolvedValue({ id: "fi1", status: "PENDING" });
    mockPrisma.briefingRequest.create.mockResolvedValue({ id: "req1" });
    mockPrisma.feedItem.update.mockResolvedValue({ id: "fi1" });

    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedUrl: "https://example.com/feed",
        title: "Test Pod",
        durationTier: 5,
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ durationTier: 5 }),
      })
    );
    expect((env.ORCHESTRATOR_QUEUE as any).send).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req1", action: "evaluate" })
    );
  });

  it("skips pipeline dispatch when no episodes exist", async () => {
    mockPrisma.podcast.upsert.mockResolvedValue({ id: "pod1", feedUrl: "https://example.com/feed" });
    mockPrisma.subscription.upsert.mockResolvedValue({ id: "sub1", userId: "user1", podcastId: "pod1", durationTier: 5 });
    mockPrisma.episode.findFirst.mockResolvedValue(null);

    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedUrl: "https://example.com/feed",
        title: "Test Pod",
        durationTier: 5,
      }),
    }, env, mockExCtx);

    expect(res.status).toBe(201);
    expect(mockPrisma.feedItem.upsert).not.toHaveBeenCalled();
    expect((env.ORCHESTRATOR_QUEUE as any).send).not.toHaveBeenCalled();
  });
});

describe("PATCH /subscribe/:podcastId", () => {
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
    app.route("/", podcasts);

    (getUserWithPlan as any).mockResolvedValue({
      id: "user1",
      clerkId: "clerk1",
      plan: { maxDurationMinutes: 15, maxPodcastSubscriptions: null },
    });
  });

  it("rejects invalid durationTier", async () => {
    const res = await app.request("/subscribe/pod1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationTier: 99 }),
    }, env, mockExCtx);
    expect(res.status).toBe(400);
  });

  it("updates subscription durationTier", async () => {
    mockPrisma.subscription.update.mockResolvedValue({ id: "sub1", durationTier: 10 });

    const res = await app.request("/subscribe/pod1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationTier: 10 }),
    }, env, mockExCtx);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.subscription.durationTier).toBe(10);
  });
});
