import { z } from "zod";
import type { LlmProvider, LlmCompletionOptions } from "./llm-providers";
import { calculateTokenCost, type AiUsage, type ModelPricing } from "./ai-usage";
import { getConfig } from "./config";
import {
  DEFAULT_CLAIMS_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  DEFAULT_NARRATIVE_USER_TEMPLATE,
  DEFAULT_NARRATIVE_METADATA_INTRO,
  PROMPT_CONFIG_KEYS,
} from "./prompt-defaults";

/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;

/** A single factual claim extracted from a podcast transcript. */
export interface Claim {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
  excerpt: string;
  notable_quote?: string;
}

/** Episode metadata for the narrative intro. */
export interface EpisodeMetadata {
  podcastTitle: string;
  episodeTitle: string;
  publishedAt: Date;
  durationSeconds: number | null;
  briefingMinutes: number;
}

const ClaimSchema = z.object({
  claim: z.string().min(1),
  speaker: z.string(),
  importance: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  excerpt: z.string(),
  notable_quote: z.string().optional(),
});

const ClaimsArraySchema = z.array(ClaimSchema).min(1);

/**
 * Pass 1: Extracts all significant claims from a podcast transcript.
 */
export async function extractClaims(
  prisma: any,
  llm: LlmProvider,
  transcript: string,
  providerModelId: string,
  maxTokens: number,
  env: any,
  pricing: ModelPricing | null = null
): Promise<{ claims: Claim[]; usage: AiUsage }> {
  const systemPrompt = await getConfig(
    prisma,
    PROMPT_CONFIG_KEYS.claimsSystem,
    DEFAULT_CLAIMS_SYSTEM_PROMPT
  );

  const options: LlmCompletionOptions = {
    system: systemPrompt as string,
    cacheSystemPrompt: true,
  };

  const result = await llm.complete(
    [
      {
        role: "user",
        content: `TRANSCRIPT:\n${transcript}`,
      },
    ],
    providerModelId,
    maxTokens,
    env,
    options
  );

  const text = result.text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }

  // Handle common LLM wrapping patterns: { "claims": [...] } or { "results": [...] }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const arrayValue = obj.claims ?? obj.results ?? obj.data;
    if (Array.isArray(arrayValue)) {
      parsed = arrayValue;
    }
  }

  const validation = ClaimsArraySchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`LLM output failed schema validation: ${issues}`);
  }
  const claims: Claim[] = validation.data;

  const usage: AiUsage = {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: calculateTokenCost(pricing, result.inputTokens, result.outputTokens, result.cacheCreationTokens, result.cacheReadTokens),
    cacheCreationTokens: result.cacheCreationTokens,
    cacheReadTokens: result.cacheReadTokens,
  };

  return { claims, usage };
}

/**
 * Selects and prioritizes claims for a target duration tier.
 */
export function selectClaimsForDuration(
  claims: Claim[],
  durationMinutes: number
): Claim[] {
  if (claims.length === 0) return [];

  const scored = claims
    .map((c) => ({ ...c, _score: c.importance * 0.7 + c.novelty * 0.3 }))
    .sort((a, b) => b._score - a._score);

  const targetCount = Math.min(
    scored.length,
    Math.max(3, Math.ceil(durationMinutes * 2.5))
  );

  return scored.slice(0, targetCount).map(({ _score, ...claim }) => claim);
}

/**
 * Pass 2: Generates a spoken narrative from extracted claims at a target duration.
 */
export async function generateNarrative(
  prisma: any,
  llm: LlmProvider,
  claims: Claim[],
  durationMinutes: number,
  providerModelId: string,
  maxTokens: number,
  env: any,
  pricing: ModelPricing | null = null,
  metadata?: EpisodeMetadata
): Promise<{ narrative: string; usage: AiUsage }> {
  const targetWords = Math.round(durationMinutes * WORDS_PER_MINUTE);
  const hasExcerpts = claims.length > 0 && "excerpt" in claims[0];

  const systemPrompt = hasExcerpts
    ? await getConfig(prisma, PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts, DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS)
    : await getConfig(prisma, PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts, DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS);

  const metadataIntro = metadata
    ? await getConfig(prisma, PROMPT_CONFIG_KEYS.narrativeMetadataIntro, DEFAULT_NARRATIVE_METADATA_INTRO)
    : "";

  const userTemplate = await getConfig(
    prisma,
    PROMPT_CONFIG_KEYS.narrativeUserTemplate,
    DEFAULT_NARRATIVE_USER_TEMPLATE
  );

  const userContent = (userTemplate as string)
    .replace("{{targetWords}}", String(targetWords))
    .replace("{{durationMinutes}}", String(durationMinutes))
    .replace("{{wpm}}", String(WORDS_PER_MINUTE))
    .replace("{{metadataBlock}}", metadataIntro as string)
    .replace("{{claimsLabel}}", hasExcerpts ? "CLAIMS AND EXCERPTS" : "CLAIMS")
    .replace("{{claimsJson}}", JSON.stringify(claims, null, 2));

  const options: LlmCompletionOptions = {
    system: systemPrompt as string,
    cacheSystemPrompt: true,
  };

  const result = await llm.complete(
    [{ role: "user", content: userContent }],
    providerModelId,
    maxTokens,
    env,
    options
  );

  const usage: AiUsage = {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: calculateTokenCost(pricing, result.inputTokens, result.outputTokens, result.cacheCreationTokens, result.cacheReadTokens),
    cacheCreationTokens: result.cacheCreationTokens,
    cacheReadTokens: result.cacheReadTokens,
  };

  return { narrative: result.text, usage };
}
