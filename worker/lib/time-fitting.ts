/**
 * Time-fitting utilities.
 *
 * DURATION_TIERS and DurationTier have moved to constants.ts.
 * Re-exported here for backward compatibility.
 *
 * allocateWordBudget, nearestTier, and related multi-episode
 * allocation functions were removed (unused — pipeline processes
 * single episodes per job).
 */
export { DURATION_TIERS, type DurationTier } from "./constants";

/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;
