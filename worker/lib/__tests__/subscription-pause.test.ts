import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateResumeToken,
  verifyResumeToken,
  pauseSubscription,
  resumeSubscription,
  isSubscriptionInactive,
} from "../subscription-pause";

const env = { SUBSCRIPTION_RESUME_SECRET: "test-secret-abc-123" };

describe("subscription-pause: resume token", () => {
  it("round-trips a generated token", async () => {
    const token = await generateResumeToken(env, "sub-abc");
    const verified = await verifyResumeToken(env, token);
    expect(verified).not.toBeNull();
    expect(verified!.subscriptionId).toBe("sub-abc");
    expect(verified!.issuedAt).toBeGreaterThan(0);
  });

  it("rejects a tampered token", async () => {
    const token = await generateResumeToken(env, "sub-abc");
    const tampered = token.slice(0, -3) + "AAA";
    const result = await verifyResumeToken(env, tampered);
    expect(result).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await generateResumeToken(env, "sub-abc");
    const result = await verifyResumeToken(
      { SUBSCRIPTION_RESUME_SECRET: "different-secret" },
      token
    );
    expect(result).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyResumeToken(env, "")).toBeNull();
    expect(await verifyResumeToken(env, "garbage")).toBeNull();
    expect(await verifyResumeToken(env, "v1.sub.123")).toBeNull();
    expect(await verifyResumeToken(env, "v2.sub.123.abc")).toBeNull();
  });
});

describe("subscription-pause: pauseSubscription", () => {
  function makeMockPrisma() {
    return {
      subscription: { updateMany: vi.fn(), findUnique: vi.fn() },
      feedItem: { updateMany: vi.fn() },
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("returns null when row is already paused (count=0)", async () => {
    const prisma = makeMockPrisma();
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    const result = await pauseSubscription(prisma as any, env, {
      subscriptionId: "sub1",
      reason: "user",
    });
    expect(result).toBeNull();
    expect(prisma.feedItem.updateMany).not.toHaveBeenCalled();
  });

  it("cancels in-flight FeedItems on pause", async () => {
    const prisma = makeMockPrisma();
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub1",
      userId: "u1",
      podcastId: "p1",
      resumeToken: "v1.sub1.1.sig",
    });
    prisma.feedItem.updateMany.mockResolvedValue({ count: 2 });

    const result = await pauseSubscription(prisma as any, env, {
      subscriptionId: "sub1",
      reason: "inactivity:5_episodes",
    });

    expect(result).not.toBeNull();
    expect(prisma.feedItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          podcastId: "p1",
          source: "SUBSCRIPTION",
          status: { in: ["PENDING", "PROCESSING"] },
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
  });
});

describe("subscription-pause: isSubscriptionInactive", () => {
  function makePrisma(items: { listened: boolean }[]) {
    return {
      feedItem: { findMany: vi.fn().mockResolvedValue(items) },
    };
  }

  it("inactive=false when fewer than N delivered episodes", async () => {
    const prisma = makePrisma([{ listened: false }, { listened: false }]);
    const r = await isSubscriptionInactive(prisma as any, { userId: "u", podcastId: "p", n: 5 });
    expect(r.inactive).toBe(false);
    expect(r.deliveredCount).toBe(2);
  });

  it("inactive=true when all of last N are unlistened", async () => {
    const prisma = makePrisma(Array.from({ length: 5 }, () => ({ listened: false })));
    const r = await isSubscriptionInactive(prisma as any, { userId: "u", podcastId: "p", n: 5 });
    expect(r.inactive).toBe(true);
  });

  it("inactive=false when any of last N is listened", async () => {
    const prisma = makePrisma([
      { listened: false }, { listened: false }, { listened: true }, { listened: false }, { listened: false },
    ]);
    const r = await isSubscriptionInactive(prisma as any, { userId: "u", podcastId: "p", n: 5 });
    expect(r.inactive).toBe(false);
  });

  it("inactive=false when n=0", async () => {
    const prisma = makePrisma(Array.from({ length: 5 }, () => ({ listened: false })));
    const r = await isSubscriptionInactive(prisma as any, { userId: "u", podcastId: "p", n: 0 });
    expect(r.inactive).toBe(false);
    expect(prisma.feedItem.findMany).not.toHaveBeenCalled();
  });
});

describe("subscription-pause: resumeSubscription", () => {
  it("returns true when transition happened", async () => {
    const prisma = { subscription: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    expect(await resumeSubscription(prisma as any, "sub1")).toBe(true);
  });

  it("returns false when row already unpaused", async () => {
    const prisma = { subscription: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    expect(await resumeSubscription(prisma as any, "sub1")).toBe(false);
  });
});
