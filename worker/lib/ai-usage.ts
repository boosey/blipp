/** Standardized AI usage metadata returned by all AI helper functions. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
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

/** Calculate cost for LLM token-based models (per 1M tokens). */
export function calculateTokenCost(
  pricing: ModelPricing | null,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (!pricing?.priceInputPerMToken) return null;
  return (
    (inputTokens * pricing.priceInputPerMToken +
      outputTokens * (pricing.priceOutputPerMToken ?? 0)) /
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
