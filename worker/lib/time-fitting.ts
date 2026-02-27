/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;

/** Available duration tiers in minutes for episode clips. */
export const DURATION_TIERS = [1, 2, 3, 5, 7, 10, 15] as const;

/** Union type of valid duration tier values. */
export type DurationTier = (typeof DURATION_TIERS)[number];

/** Intro overhead in words (e.g., "Good morning, here's your daily briefing..."). */
export const INTRO_WORDS = 30;

/** Outro overhead in words (e.g., "That's your briefing for today..."). */
export const OUTRO_WORDS = 15;

/** Transition overhead per segment in words (e.g., "Next, from podcast X..."). */
export const TRANSITION_WORDS = 15;

/** Minimum words per segment — ensures at least 1 minute of content. */
export const MIN_SEGMENT_WORDS = 150;

/** Word allocation result for a single episode segment. */
export interface WordAllocation {
  /** Index of the episode in the input array */
  index: number;
  /** Number of words allocated to this segment's narrative */
  allocatedWords: number;
  /** Nearest duration tier matching the allocated time */
  durationTier: DurationTier;
}

/**
 * Finds the closest available duration tier for a given number of minutes.
 *
 * @param minutes - Target duration in minutes (can be fractional)
 * @returns The nearest DurationTier value
 */
export function nearestTier(minutes: number): DurationTier {
  let best = DURATION_TIERS[0];
  let bestDist = Math.abs(minutes - best);

  for (const tier of DURATION_TIERS) {
    const dist = Math.abs(minutes - tier);
    if (dist < bestDist) {
      best = tier;
      bestDist = dist;
    }
  }

  return best;
}

/** Input episode descriptor for time allocation. */
export interface EpisodeInput {
  /** Word count of the episode's full transcript */
  transcriptWordCount: number;
}

/**
 * Allocates a word budget across episodes proportionally to their transcript length.
 *
 * Reserves overhead for intro, outro, and per-segment transitions, then distributes
 * the remaining word budget proportionally. Each segment gets at least MIN_SEGMENT_WORDS.
 * The allocated words are mapped to the nearest duration tier for clip caching.
 *
 * @param episodes - Array of episodes with transcript word counts
 * @param targetMinutes - Total briefing length target in minutes
 * @returns Array of word allocations, one per episode
 */
export function allocateWordBudget(
  episodes: EpisodeInput[],
  targetMinutes: number
): WordAllocation[] {
  if (episodes.length === 0) return [];

  const totalBudget = targetMinutes * WORDS_PER_MINUTE;
  const overhead =
    INTRO_WORDS + OUTRO_WORDS + TRANSITION_WORDS * episodes.length;
  const availableWords = Math.max(0, totalBudget - overhead);

  const totalTranscriptWords = episodes.reduce(
    (sum, ep) => sum + ep.transcriptWordCount,
    0
  );

  // Proportional allocation based on transcript length
  const allocations: WordAllocation[] = episodes.map((ep, index) => {
    const proportion =
      totalTranscriptWords > 0
        ? ep.transcriptWordCount / totalTranscriptWords
        : 1 / episodes.length;

    const rawWords = Math.round(availableWords * proportion);
    const allocatedWords = Math.max(rawWords, MIN_SEGMENT_WORDS);
    const durationMinutes = allocatedWords / WORDS_PER_MINUTE;

    return {
      index,
      allocatedWords,
      durationTier: nearestTier(durationMinutes),
    };
  });

  return allocations;
}
