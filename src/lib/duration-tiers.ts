export const DURATION_TIERS = [2, 5, 10, 15, 30] as const;
export type DurationTier = (typeof DURATION_TIERS)[number];
