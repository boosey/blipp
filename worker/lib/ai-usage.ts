/** Standardized AI usage metadata returned by all AI helper functions. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
}

/**
 * Per-model pricing: cost per 1M units (tokens for LLMs, seconds for Whisper, characters for TTS).
 */
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Anthropic Claude (per 1M tokens)
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5-20251001": { inputPer1M: 1, outputPer1M: 5 },
  "claude-opus-4-20250514": { inputPer1M: 15, outputPer1M: 75 },
  // OpenAI Whisper (inputTokens ≈ seconds; $0.006/min = $100/1M seconds)
  "whisper-1": { inputPer1M: 100, outputPer1M: 0 },
  // Deepgram Nova-2 ($0.0043/min ≈ $72/1M seconds)
  "nova-2": { inputPer1M: 72, outputPer1M: 0 },
  // AssemblyAI Best ($0.015/min ≈ $250/1M seconds)
  "assemblyai-best": { inputPer1M: 250, outputPer1M: 0 },
  // Google Chirp ($0.024/min ≈ $400/1M seconds)
  "google-chirp": { inputPer1M: 400, outputPer1M: 0 },
  // OpenAI TTS (inputTokens = character count; per 1M characters)
  "gpt-4o-mini-tts": { inputPer1M: 12, outputPer1M: 0 },
  "tts-1": { inputPer1M: 15, outputPer1M: 0 },
  "tts-1-hd": { inputPer1M: 30, outputPer1M: 0 },
};

/** Calculate cost from model pricing table. Returns null if model not in registry. */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}
