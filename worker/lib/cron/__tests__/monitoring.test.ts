import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMonitoringJob } from "../monitoring";
import { checkCostThresholds } from "../../cost-alerts";

vi.mock("../../cost-alerts", () => ({
  checkCostThresholds: vi.fn(),
}));

vi.mock("../../pricing-updater", () => ({
  refreshPricing: vi.fn().mockResolvedValue({ updated: 2 }),
}));

describe("monitoring", () => {
  const mockPrisma = {
    platformConfig: { upsert: vi.fn() },
    aiModelProvider: { findMany: vi.fn(), update: vi.fn() },
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

  it("should refresh pricing and check cost thresholds", async () => {
    (checkCostThresholds as any).mockResolvedValue([]);

    const result = await runMonitoringJob(mockPrisma as any, mockLogger as any);

    expect(result.pricingUpdated).toBe(2);
    expect(result.costAlerts).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith("Refreshing AI model pricing");
    expect(mockLogger.info).toHaveBeenCalledWith("All cost thresholds OK");
  });

  it("should warn and upsert config if cost alerts exist", async () => {
    const mockAlerts = [{ threshold: 100, current: 110 }];
    (checkCostThresholds as any).mockResolvedValue(mockAlerts);

    const result = await runMonitoringJob(mockPrisma as any, mockLogger as any);

    expect(result.costAlerts).toBe(1);
    expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "cost.alert.active" },
      update: { value: mockAlerts },
    }));
    expect(mockLogger.warn).toHaveBeenCalledWith("1 cost threshold(s) exceeded", expect.any(Object));
  });
});
