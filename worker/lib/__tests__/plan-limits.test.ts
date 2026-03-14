import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkDurationLimit, checkSubscriptionLimit, checkWeeklyBriefingLimit } from "../plan-limits";

describe("checkDurationLimit", () => {
  it("returns null when durationTier is within limit", () => {
    expect(checkDurationLimit(5, 15)).toBeNull();
  });

  it("returns null when durationTier equals limit", () => {
    expect(checkDurationLimit(10, 10)).toBeNull();
  });

  it("returns error when durationTier exceeds limit", () => {
    const result = checkDurationLimit(15, 10);
    expect(result).toContain("10 minutes");
    expect(result).toContain("15-minute");
  });

  it("returns error for minimum tier exceeding minimal plan", () => {
    const result = checkDurationLimit(3, 1);
    expect(result).not.toBeNull();
  });
});

describe("checkSubscriptionLimit", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      subscription: { count: vi.fn() },
    };
  });

  it("returns null when limit is null (unlimited)", async () => {
    const result = await checkSubscriptionLimit("user1", null, mockPrisma);
    expect(result).toBeNull();
    expect(mockPrisma.subscription.count).not.toHaveBeenCalled();
  });

  it("returns null when under limit", async () => {
    mockPrisma.subscription.count.mockResolvedValue(2);
    const result = await checkSubscriptionLimit("user1", 5, mockPrisma);
    expect(result).toBeNull();
  });

  it("returns error when at limit", async () => {
    mockPrisma.subscription.count.mockResolvedValue(5);
    const result = await checkSubscriptionLimit("user1", 5, mockPrisma);
    expect(result).toContain("5 podcast subscriptions");
  });

  it("returns error when over limit", async () => {
    mockPrisma.subscription.count.mockResolvedValue(6);
    const result = await checkSubscriptionLimit("user1", 5, mockPrisma);
    expect(result).not.toBeNull();
  });
});

describe("checkWeeklyBriefingLimit", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      feedItem: { count: vi.fn() },
    };
  });

  it("returns null when limit is null (unlimited)", async () => {
    const result = await checkWeeklyBriefingLimit("user1", null, mockPrisma);
    expect(result).toBeNull();
    expect(mockPrisma.feedItem.count).not.toHaveBeenCalled();
  });

  it("returns null when under limit", async () => {
    mockPrisma.feedItem.count.mockResolvedValue(3);
    const result = await checkWeeklyBriefingLimit("user1", 10, mockPrisma);
    expect(result).toBeNull();
  });

  it("returns error when at limit", async () => {
    mockPrisma.feedItem.count.mockResolvedValue(10);
    const result = await checkWeeklyBriefingLimit("user1", 10, mockPrisma);
    expect(result).toContain("10 briefings per week");
  });

  it("queries feed items from the last 7 days", async () => {
    mockPrisma.feedItem.count.mockResolvedValue(0);
    await checkWeeklyBriefingLimit("user1", 10, mockPrisma);

    expect(mockPrisma.feedItem.count).toHaveBeenCalledWith({
      where: {
        userId: "user1",
        createdAt: { gte: expect.any(Date) },
      },
    });
  });
});
