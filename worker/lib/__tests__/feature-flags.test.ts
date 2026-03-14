import { describe, it, expect, vi } from "vitest";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

const { getConfig } = await import("../config");
const { isFeatureEnabled } = await import("../feature-flags");

describe("isFeatureEnabled", () => {
  it("returns false when flag is null", async () => {
    (getConfig as any).mockResolvedValueOnce(null);
    const result = await isFeatureEnabled({} as any, "test", {});
    expect(result).toBe(false);
  });

  it("returns false when flag is disabled", async () => {
    (getConfig as any).mockResolvedValueOnce({
      enabled: false,
      rolloutPercentage: 100,
      planAvailability: [],
      userAllowlist: [],
      userDenylist: [],
    });
    const result = await isFeatureEnabled({} as any, "test", {});
    expect(result).toBe(false);
  });

  it("returns true when flag is enabled with 100% rollout", async () => {
    (getConfig as any).mockResolvedValueOnce({
      enabled: true,
      rolloutPercentage: 100,
      planAvailability: [],
      userAllowlist: [],
      userDenylist: [],
    });
    const result = await isFeatureEnabled({} as any, "test", {});
    expect(result).toBe(true);
  });

  it("respects denylist", async () => {
    (getConfig as any).mockResolvedValueOnce({
      enabled: true,
      rolloutPercentage: 100,
      planAvailability: [],
      userAllowlist: [],
      userDenylist: ["user_blocked"],
    });
    const result = await isFeatureEnabled({} as any, "test", {
      userId: "user_blocked",
    });
    expect(result).toBe(false);
  });

  it("respects allowlist", async () => {
    (getConfig as any).mockResolvedValueOnce({
      enabled: true,
      rolloutPercentage: 0,
      planAvailability: [],
      userAllowlist: ["user_vip"],
      userDenylist: [],
    });
    const result = await isFeatureEnabled({} as any, "test", {
      userId: "user_vip",
    });
    expect(result).toBe(true);
  });
});
