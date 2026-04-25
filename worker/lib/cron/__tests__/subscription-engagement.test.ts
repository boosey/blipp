import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSubscriptionEngagementJob } from "../subscription-engagement";
import { getConfig } from "../../config";
import { createMockEnv } from "../../../../tests/helpers/mocks";

vi.mock("../../config", () => ({
  getConfig: vi.fn(),
}));

function setConfig(values: Record<string, unknown>) {
  (getConfig as any).mockImplementation(async (_p: unknown, key: string, fallback: unknown) =>
    key in values ? values[key] : fallback
  );
}

function makeMockPrisma() {
  return {
    subscription: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    feedItem: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("subscription-engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when subscription.autoPauseEnabled is false", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": false, "subscription.pauseInactiveEpisodes": 5 });

    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, createMockEnv());

    expect(result.scanned).toBe(0);
    expect(result.paused).toBe(0);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it("no-ops when N is 0", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": true, "subscription.pauseInactiveEpisodes": 0 });

    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, createMockEnv());

    expect(result.paused).toBe(0);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it("pauses a sub with N consecutive unlistened READY items, enqueues email", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": true, "subscription.pauseInactiveEpisodes": 5 });

    prisma.subscription.findMany.mockResolvedValue([
      { id: "sub1", userId: "u1", podcastId: "p1" },
    ]);
    // Inactivity check returns 5 unlistened items
    prisma.feedItem.findMany.mockResolvedValueOnce(
      Array.from({ length: 5 }, () => ({ listened: false }))
    );
    // Pause transition (atomic updateMany)
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      userId: "u1",
      podcastId: "p1",
      resumeToken: "v1.sub1.123.sig",
    });
    prisma.feedItem.updateMany.mockResolvedValue({ count: 0 });

    const env = createMockEnv();
    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, env);

    expect(result.scanned).toBe(1);
    expect(result.paused).toBe(1);
    expect(result.emailsEnqueued).toBe(1);
    expect((env.SUBSCRIPTION_PAUSE_EMAIL_QUEUE.send as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub1",
        userId: "u1",
        podcastId: "p1",
        episodesUnlistened: 5,
        reason: "inactivity:5_episodes",
      })
    );
  });

  it("does not pause when fewer than N delivered episodes (brand-new sub)", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": true, "subscription.pauseInactiveEpisodes": 5 });

    prisma.subscription.findMany.mockResolvedValue([
      { id: "sub2", userId: "u2", podcastId: "p2" },
    ]);
    prisma.feedItem.findMany.mockResolvedValueOnce(
      Array.from({ length: 3 }, () => ({ listened: false }))
    );

    const env = createMockEnv();
    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, env);

    expect(result.paused).toBe(0);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(env.SUBSCRIPTION_PAUSE_EMAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it("does not pause when at least one of the last N was listened", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": true, "subscription.pauseInactiveEpisodes": 5 });

    prisma.subscription.findMany.mockResolvedValue([
      { id: "sub3", userId: "u3", podcastId: "p3" },
    ]);
    prisma.feedItem.findMany.mockResolvedValueOnce([
      { listened: false },
      { listened: false },
      { listened: true },
      { listened: false },
      { listened: false },
    ]);

    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, createMockEnv());

    expect(result.paused).toBe(0);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("skips already-paused subs (atomic updateMany returns count: 0)", async () => {
    const prisma = makeMockPrisma();
    setConfig({ "subscription.autoPauseEnabled": true, "subscription.pauseInactiveEpisodes": 5 });

    prisma.subscription.findMany.mockResolvedValue([
      { id: "sub4", userId: "u4", podcastId: "p4" },
    ]);
    prisma.feedItem.findMany.mockResolvedValueOnce(
      Array.from({ length: 5 }, () => ({ listened: false }))
    );
    // Race: row was paused between scan and updateMany — count=0 means no transition
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    const env = createMockEnv();
    const result = await runSubscriptionEngagementJob(prisma as any, logger as any, env);

    expect(result.paused).toBe(0);
    expect(env.SUBSCRIPTION_PAUSE_EMAIL_QUEUE.send).not.toHaveBeenCalled();
  });
});
