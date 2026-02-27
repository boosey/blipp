import { describe, it, expect } from "vitest";
import {
  nearestTier,
  allocateWordBudget,
  WORDS_PER_MINUTE,
  DURATION_TIERS,
  INTRO_WORDS,
  OUTRO_WORDS,
  TRANSITION_WORDS,
  MIN_SEGMENT_WORDS,
} from "../time-fitting";

describe("nearestTier", () => {
  it("should return exact match for tier values", () => {
    expect(nearestTier(1)).toBe(1);
    expect(nearestTier(5)).toBe(5);
    expect(nearestTier(15)).toBe(15);
  });

  it("should round to nearest tier", () => {
    expect(nearestTier(1.3)).toBe(1);
    expect(nearestTier(1.8)).toBe(2);
    expect(nearestTier(4)).toBe(3); // 4 is equidistant from 3 and 5, first match wins
    expect(nearestTier(6)).toBe(5); // 6 is equidistant from 5 and 7, first match wins
    expect(nearestTier(12)).toBe(10);
    expect(nearestTier(13)).toBe(15);
  });

  it("should handle extreme values", () => {
    expect(nearestTier(0)).toBe(1);
    expect(nearestTier(100)).toBe(15);
  });

  it("should return 1 for values less than 1.5", () => {
    expect(nearestTier(0.5)).toBe(1);
    expect(nearestTier(1.4)).toBe(1);
  });
});

describe("allocateWordBudget", () => {
  it("should allocate proportionally based on transcript length", () => {
    const episodes = [
      { transcriptWordCount: 3000 },
      { transcriptWordCount: 1000 },
    ];

    const allocs = allocateWordBudget(episodes, 10);

    // First episode has 3x the words, should get more allocation
    expect(allocs[0].allocatedWords).toBeGreaterThan(
      allocs[1].allocatedWords
    );
    expect(allocs).toHaveLength(2);
  });

  it("should enforce minimum segment words", () => {
    const episodes = [
      { transcriptWordCount: 10000 },
      { transcriptWordCount: 10 }, // Tiny transcript
    ];

    const allocs = allocateWordBudget(episodes, 5);

    // Even the tiny episode should get at least MIN_SEGMENT_WORDS
    expect(allocs[1].allocatedWords).toBeGreaterThanOrEqual(
      MIN_SEGMENT_WORDS
    );
  });

  it("should assign valid duration tiers", () => {
    const episodes = [
      { transcriptWordCount: 2000 },
      { transcriptWordCount: 3000 },
      { transcriptWordCount: 5000 },
    ];

    const allocs = allocateWordBudget(episodes, 15);

    for (const alloc of allocs) {
      expect(DURATION_TIERS).toContain(alloc.durationTier);
    }
  });

  it("should return empty array for empty episodes", () => {
    expect(allocateWordBudget([], 10)).toEqual([]);
  });

  it("should preserve episode indices", () => {
    const episodes = [
      { transcriptWordCount: 1000 },
      { transcriptWordCount: 2000 },
      { transcriptWordCount: 3000 },
    ];

    const allocs = allocateWordBudget(episodes, 10);

    expect(allocs[0].index).toBe(0);
    expect(allocs[1].index).toBe(1);
    expect(allocs[2].index).toBe(2);
  });

  it("should account for overhead (intro, outro, transitions)", () => {
    const episodes = [{ transcriptWordCount: 5000 }];
    const targetMinutes = 10;
    const totalBudget = targetMinutes * WORDS_PER_MINUTE;
    const overhead =
      INTRO_WORDS + OUTRO_WORDS + TRANSITION_WORDS * episodes.length;

    const allocs = allocateWordBudget(episodes, targetMinutes);

    // The allocated words should be totalBudget minus overhead
    expect(allocs[0].allocatedWords).toBe(totalBudget - overhead);
  });

  it("should distribute equally when all transcripts same length", () => {
    const episodes = [
      { transcriptWordCount: 1000 },
      { transcriptWordCount: 1000 },
    ];

    const allocs = allocateWordBudget(episodes, 10);

    expect(allocs[0].allocatedWords).toBe(allocs[1].allocatedWords);
  });
});
