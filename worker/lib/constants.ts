/** Available duration tiers in minutes for episode clips. */
export const DURATION_TIERS = [2, 5, 10, 15, 30] as const;

/** Union type of valid duration tier values. */
export type DurationTier = (typeof DURATION_TIERS)[number];

/** Type guard: checks if a number is a valid duration tier. */
export function isValidDurationTier(n: number): n is DurationTier {
  return (DURATION_TIERS as readonly number[]).includes(n);
}

/**
 * Pipeline stage enum value -> human-readable display name.
 * Keyed by Prisma PipelineStage enum values.
 * Includes CLIP_GENERATION for legacy data display.
 */
export const PIPELINE_STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation", // legacy
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};
