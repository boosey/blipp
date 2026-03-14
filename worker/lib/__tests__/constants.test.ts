import { describe, it, expect } from "vitest";
import { DURATION_TIERS, isValidDurationTier, PIPELINE_STAGE_NAMES, type DurationTier } from "../constants";

describe("DURATION_TIERS", () => {
  it("has all expected tiers", () => {
    expect(DURATION_TIERS).toEqual([1, 2, 3, 5, 7, 10, 15, 30]);
  });
});

describe("isValidDurationTier", () => {
  it("returns true for all valid tiers", () => {
    for (const tier of [1, 2, 3, 5, 7, 10, 15, 30]) {
      expect(isValidDurationTier(tier)).toBe(true);
    }
  });

  it("returns false for invalid values", () => {
    for (const n of [0, 4, 6, 8, 20, -1, 100]) {
      expect(isValidDurationTier(n)).toBe(false);
    }
  });
});

describe("PIPELINE_STAGE_NAMES", () => {
  it("has all pipeline stages", () => {
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("TRANSCRIPTION");
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("DISTILLATION");
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("NARRATIVE_GENERATION");
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("AUDIO_GENERATION");
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("BRIEFING_ASSEMBLY");
    expect(PIPELINE_STAGE_NAMES).toHaveProperty("CLIP_GENERATION"); // legacy
  });
});
