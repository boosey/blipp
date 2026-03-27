import { describe, it, expect } from "vitest";
import { DURATION_TIERS, WORDS_PER_MINUTE } from "../time-fitting";

describe("time-fitting re-exports", () => {
  it("re-exports DURATION_TIERS from constants", () => {
    expect(DURATION_TIERS).toEqual([2, 5, 10, 15, 30]);
  });

  it("exports WORDS_PER_MINUTE", () => {
    expect(WORDS_PER_MINUTE).toBe(150);
  });
});
