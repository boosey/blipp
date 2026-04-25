import { describe, it, expect, vi, beforeEach } from "vitest";
import { runUserLifecycleJob } from "../user-lifecycle";
import { getConfig } from "../../config";

vi.mock("../../config", () => ({
  getConfig: vi.fn(),
}));

describe("user-lifecycle", () => {
  const mockPrisma = {
    plan: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
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

  it("should find users with expired trials", async () => {
    (getConfig as any).mockResolvedValue(14); // trialDays
    mockPrisma.plan.findFirst.mockResolvedValue({ id: "plan1" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", email: "e1@test.com" },
    ]);

    const result = await runUserLifecycleJob(mockPrisma as any, mockLogger as any);

    expect(result.expiredCount).toBe(1);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        planId: "plan1",
        stripeCustomerId: null,
      }),
    }));
  });

  it("should warn if no default plan found", async () => {
    (getConfig as any).mockResolvedValue(14);
    mockPrisma.plan.findFirst.mockResolvedValue(null);

    const result = await runUserLifecycleJob(mockPrisma as any, mockLogger as any);

    expect(result.checked).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No default plan found"));
  });
});
