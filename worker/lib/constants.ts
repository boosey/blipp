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
 * Clamp a requested duration tier to the highest tier that is strictly less
 * than 75% of the episode length. Prevents producing a briefing longer than
 * (or nearly equal to) the source episode.
 *
 * If episodeDurationSeconds is unknown (null/undefined/0), returns the
 * requested tier unchanged. If no tier satisfies the constraint (episode is
 * shorter than ~2.67 minutes), returns the smallest tier so a briefing still
 * gets produced.
 */
export function clampTierToEpisodeLength(
  requestedTier: number,
  episodeDurationSeconds: number | null | undefined
): DurationTier {
  if (!episodeDurationSeconds || episodeDurationSeconds <= 0) {
    return (isValidDurationTier(requestedTier) ? requestedTier : DURATION_TIERS[0]);
  }
  const maxAllowedMinutes = (episodeDurationSeconds * 0.75) / 60;
  const candidates = DURATION_TIERS.filter(
    (t) => t <= requestedTier && t < maxAllowedMinutes
  );
  if (candidates.length === 0) return DURATION_TIERS[0];
  return candidates[candidates.length - 1];
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
