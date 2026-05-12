import { describe, it, expect, vi } from "vitest";
import { CRON_JOB_REGISTRY, ensureCronJobsRegistered } from "../registry";

describe("registry", () => {
  it("CRON_JOB_REGISTRY has unique jobKeys", () => {
    const keys = CRON_JOB_REGISTRY.map((j) => j.jobKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("CRON_JOB_REGISTRY contains every cron job declared in worker/queues/index.ts", () => {
    // Guards against the drift that caused the original regression: a job added
    // to queues/index.ts but missing from the registry would still silently no-op
    // in prod. Codifies that the registry is the union of all runJob jobKeys.
    const expectedKeys = [
      "apple-discovery",
      "podcast-index-discovery",
      "episode-refresh",
      "monitoring",
      "user-lifecycle",
      "subscription-engagement",
      "data-retention",
      "recommendations",
      "listen-original-aggregation",
      "stale-job-reaper",
      "geo-tagging",
      "catalog-pregen",
      "manual-grant-expiry",
      "pulse-generate",
    ];
    const registryKeys = CRON_JOB_REGISTRY.map((j) => j.jobKey).sort();
    expect(registryKeys).toEqual(expectedKeys.sort());
  });

  describe("ensureCronJobsRegistered", () => {
    it("upserts every registry entry with create payload + empty update", async () => {
      const upsert = vi.fn().mockResolvedValue({});
      await ensureCronJobsRegistered({ cronJob: { upsert } } as any);

      expect(upsert).toHaveBeenCalledTimes(CRON_JOB_REGISTRY.length);

      // Spot-check one entry — full payload shape with empty update so admin
      // edits to enabled/intervalMinutes are preserved.
      const subEngagement = upsert.mock.calls.find(
        ([arg]) => arg.where.jobKey === "subscription-engagement",
      );
      expect(subEngagement).toBeDefined();
      expect(subEngagement![0]).toEqual({
        where: { jobKey: "subscription-engagement" },
        create: {
          jobKey: "subscription-engagement",
          label: expect.any(String),
          description: expect.any(String),
          intervalMinutes: 1440,
          defaultIntervalMinutes: 1440,
          runAtHour: null,
        },
        update: {},
      });
    });

    it("propagates upsert errors so the caller can log them", async () => {
      const upsert = vi.fn().mockRejectedValueOnce(new Error("boom"));
      await expect(
        ensureCronJobsRegistered({ cronJob: { upsert } } as any),
      ).rejects.toThrow("boom");
    });
  });
});
