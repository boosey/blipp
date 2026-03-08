export const DURATION_TIERS = [1, 2, 3, 5, 7, 10, 15] as const;
export type DurationTier = (typeof DURATION_TIERS)[number];
