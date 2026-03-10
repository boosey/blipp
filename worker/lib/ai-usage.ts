/** Standardized AI usage metadata returned by all AI helper functions. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
}
