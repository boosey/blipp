/** Standardized AI usage metadata returned by all AI helper functions. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  /** Tokens written to prompt cache on this request (Anthropic). */
  cacheCreationTokens?: number;
  /** Tokens read from prompt cache on this request (Anthropic — 90% cheaper). */
  cacheReadTokens?: number;
  /** STT: input audio duration; TTS: output audio duration. */
  audioSeconds?: number;
  /** TTS: input character count. */
  charCount?: number;
}

/** Pricing info from the AiModelProvider table. */
export interface ModelPricing {
  pricePerMinute?: number | null;
  priceInputPerMToken?: number | null;
  priceOutputPerMToken?: number | null;
  pricePerKChars?: number | null;
}

/** Fetch pricing for a model+provider combo from the database. */
export async function getModelPricing(
  prisma: any,
  modelId: string,
  provider: string
): Promise<ModelPricing | null> {
  const row = await prisma.aiModelProvider.findFirst({
    where: { provider, model: { modelId } },
  });
  if (!row) return null;
  return {
    pricePerMinute: row.pricePerMinute,
    priceInputPerMToken: row.priceInputPerMToken,
    priceOutputPerMToken: row.priceOutputPerMToken,
    pricePerKChars: row.pricePerKChars,
  };
}

/**
 * Calculate cost for LLM token-based models (per 1M tokens).
 * When cache tokens are provided, adjusts pricing:
 *   - cache writes: 1.25x input price
 *   - cache reads:  0.1x input price
 *   - remaining input tokens: standard price
 */
export function calculateTokenCost(
  pricing: ModelPricing | null,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number
): number | null {
  if (!pricing?.priceInputPerMToken) return null;
  const inputPrice = pricing.priceInputPerMToken;
  const outputPrice = pricing.priceOutputPerMToken ?? 0;

  const cacheWrite = cacheCreationTokens ?? 0;
  const cacheRead = cacheReadTokens ?? 0;
  // Anthropic's usage.input_tokens already excludes cache_creation_input_tokens
  // and cache_read_input_tokens — they are reported as separate counters. Use
  // input_tokens as-is for the standard-rate portion. (Older code subtracted
  // cache tokens here, which double-discounted cached prompts.)
  const standardInput = inputTokens;

  return (
    (standardInput * inputPrice +
      cacheWrite * inputPrice * 1.25 +
      cacheRead * inputPrice * 0.1 +
      outputTokens * outputPrice) /
    1_000_000
  );
}

/** Calculate cost for audio models (per minute). */
export function calculateAudioCost(
  pricing: ModelPricing | null,
  durationSeconds: number
): number | null {
  if (!pricing?.pricePerMinute) return null;
  return (durationSeconds / 60) * pricing.pricePerMinute;
}

/** Calculate cost for character-based models like TTS (per 1K chars). */
export function calculateCharCost(
  pricing: ModelPricing | null,
  charCount: number
): number | null {
  if (!pricing?.pricePerKChars) return null;
  return (charCount / 1000) * pricing.pricePerKChars;
}
