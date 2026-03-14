import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

const { getConfig } = await import("../config");
const { checkCostThresholds } = await import("../cost-alerts");

beforeEach(() => {
  // Return correct threshold per key
  (getConfig as any).mockImplementation(
    (_prisma: any, key: string, fallback: number) => {
      if (key === "cost.alert.dailyThreshold") return Promise.resolve(5.0);
      if (key === "cost.alert.weeklyThreshold") return Promise.resolve(25.0);
      return Promise.resolve(fallback);
    }
  );
});

describe("checkCostThresholds", () => {
  it("returns empty array when under thresholds", async () => {
    const prisma = {
      pipelineStep: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { cost: 2.0 } }) // daily
          .mockResolvedValueOnce({ _sum: { cost: 10.0 } }), // weekly
      },
    };

    const alerts = await checkCostThresholds(prisma);
    expect(alerts).toHaveLength(0);
  });

  it("returns daily alert when daily threshold exceeded", async () => {
    const prisma = {
      pipelineStep: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { cost: 7.5 } }) // daily > 5.0
          .mockResolvedValueOnce({ _sum: { cost: 10.0 } }), // weekly < 25.0
      },
    };

    const alerts = await checkCostThresholds(prisma);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("daily");
    expect(alerts[0].actual).toBe(7.5);
  });

  it("returns both alerts when both thresholds exceeded", async () => {
    const prisma = {
      pipelineStep: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { cost: 7.5 } }) // daily > 5.0
          .mockResolvedValueOnce({ _sum: { cost: 30.0 } }), // weekly > 25.0
      },
    };

    const alerts = await checkCostThresholds(prisma);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].type).toBe("daily");
    expect(alerts[1].type).toBe("weekly");
  });
});
