import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getConfig, clearConfigCache } from "../config";

describe("getConfig", () => {
  let mockPrisma: any;

  beforeEach(() => {
    vi.useFakeTimers();
    clearConfigCache();
    mockPrisma = {
      platformConfig: {
        findUnique: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns fallback when key not found", async () => {
    mockPrisma.platformConfig.findUnique.mockResolvedValue(null);

    const result = await getConfig(mockPrisma, "missing.key", "default-value");

    expect(result).toBe("default-value");
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledWith({
      where: { key: "missing.key" },
    });
  });

  it("returns parsed value when key exists", async () => {
    mockPrisma.platformConfig.findUnique.mockResolvedValue({
      key: "pipeline.enabled",
      value: false,
    });

    const result = await getConfig(mockPrisma, "pipeline.enabled", true);

    expect(result).toBe(false);
  });

  it("caches reads for 60s — second call within TTL does not hit DB", async () => {
    mockPrisma.platformConfig.findUnique.mockResolvedValue({
      key: "pipeline.enabled",
      value: true,
    });

    // First call hits DB
    const result1 = await getConfig(mockPrisma, "pipeline.enabled", false);
    expect(result1).toBe(true);
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);

    // Second call within TTL should use cache
    const result2 = await getConfig(mockPrisma, "pipeline.enabled", false);
    expect(result2).toBe(true);
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  it("cache expires after TTL — call after 60s hits DB again", async () => {
    mockPrisma.platformConfig.findUnique.mockResolvedValue({
      key: "pipeline.enabled",
      value: true,
    });

    // First call
    await getConfig(mockPrisma, "pipeline.enabled", false);
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);

    // Advance past TTL (60s)
    vi.advanceTimersByTime(61_000);

    // Update the mock to return a different value
    mockPrisma.platformConfig.findUnique.mockResolvedValue({
      key: "pipeline.enabled",
      value: false,
    });

    // Call after TTL should hit DB again
    const result = await getConfig(mockPrisma, "pipeline.enabled", true);
    expect(result).toBe(false);
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(2);
  });

  it("handles PlatformConfig table not existing — returns fallback", async () => {
    mockPrisma.platformConfig.findUnique.mockRejectedValue(
      new Error("relation \"PlatformConfig\" does not exist")
    );

    const result = await getConfig(mockPrisma, "pipeline.enabled", true);

    expect(result).toBe(true);
  });
});

describe("clearConfigCache", () => {
  let mockPrisma: any;

  beforeEach(() => {
    clearConfigCache();
    mockPrisma = {
      platformConfig: {
        findUnique: vi.fn().mockResolvedValue({
          key: "test.key",
          value: "cached-value",
        }),
      },
    };
  });

  it("clears cache so next call hits DB", async () => {
    // Populate cache
    await getConfig(mockPrisma, "test.key", "default");
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);

    // Without clearing, second call should use cache
    await getConfig(mockPrisma, "test.key", "default");
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(1);

    // Clear cache
    clearConfigCache();

    // Now it should hit DB again
    await getConfig(mockPrisma, "test.key", "default");
    expect(mockPrisma.platformConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});
