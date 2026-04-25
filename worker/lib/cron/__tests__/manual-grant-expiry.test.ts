import { describe, it, expect, vi, beforeEach } from "vitest";
import { runManualGrantExpiryJob } from "../manual-grant-expiry";
import { recomputeEntitlement } from "../../entitlement";

vi.mock("../../entitlement", () => ({
  recomputeEntitlement: vi.fn().mockResolvedValue({}),
}));

describe("manual-grant-expiry", () => {
  const mockPrisma = {
    billingSubscription: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expire manual grants and recompute entitlement", async () => {
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      { id: "sub1", userId: "u1" },
    ]);
    mockPrisma.billingSubscription.update.mockResolvedValue({});

    const result = await runManualGrantExpiryJob(mockPrisma as any, mockLogger as any);

    expect(result.expired).toBe(1);
    expect(result.downgraded).toBe(1);
    expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub1" },
      data: { status: "EXPIRED" },
    });
    expect(recomputeEntitlement).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("should skip if no grants are expired", async () => {
    mockPrisma.billingSubscription.findMany.mockResolvedValue([]);

    const result = await runManualGrantExpiryJob(mockPrisma as any, mockLogger as any);

    expect(result.expired).toBe(0);
    expect(mockPrisma.billingSubscription.update).not.toHaveBeenCalled();
  });
});
