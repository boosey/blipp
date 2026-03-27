/** Default max chunk size for STT byte-range downloads (25MB). */
export const DEFAULT_STT_CHUNK_SIZE = 25 * 1024 * 1024;

/** Default max input characters for TTS providers (conservative fallback). */
export const DEFAULT_TTS_MAX_INPUT_CHARS = 4096;

/** Minimum audio file size to be considered valid (10KB). */
export const MIN_AUDIO_SIZE_BYTES = 10_000;

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

/**
 * Max concurrent feed-refresh queue consumers (mirrors wrangler.jsonc max_concurrency).
 * Displayed read-only in admin UI. Change requires redeploy.
 */
export const FEED_REFRESH_MAX_CONSUMERS = 50;

/** Assumed MP3 bitrate (128kbps) in bytes per second, for duration estimation. */
export const ASSUMED_BITRATE_BYTES_PER_SEC = 128 * 1000 / 8; // 16000

/** Approximate bytes per STT input token (used for cost estimation). */
export const STT_BYTES_PER_TOKEN = 16000;
