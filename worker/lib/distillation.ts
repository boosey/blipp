import { z } from "zod";
import type { LlmProvider } from "./llm-providers";
import { calculateTokenCost, type AiUsage, type ModelPricing } from "./ai-usage";

/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;

/** A single factual claim extracted from a podcast transcript. */
export interface Claim {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
  excerpt: string;
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
});

const ClaimsArraySchema = z.array(ClaimSchema).min(1);

/**
 * Pass 1: Extracts all significant claims from a podcast transcript.
 */
export async function extractClaims(
  llm: LlmProvider,
  transcript: string,
  providerModelId: string,
  maxTokens: number,
  env: any,
  pricing: ModelPricing | null = null
): Promise<{ claims: Claim[]; usage: AiUsage }> {
  const result = await llm.complete(
    [
      {
        role: "user",
        content: `You are a podcast analyst. Extract all significant factual claims, insights, arguments, and notable statements from this transcript.

For each claim, include:
- "claim": the factual assertion (one clear sentence)
- "speaker": who made the claim
- "importance": 1-10 rating (10 = critical takeaway, 1 = minor detail)
- "novelty": 1-10 rating (10 = surprising/counterintuitive, 1 = common knowledge)
- "excerpt": the verbatim passage from the transcript that contains or supports this claim — include enough surrounding context that someone could write a detailed summary from the excerpt alone (may be one sentence or a full exchange)

Guidelines:
- Extract every claim worth preserving — do NOT limit to a fixed number
- A dense 3-hour episode may yield 30-40 claims; a light 20-minute episode may yield 8-12
- Skip filler, repetition, ads, and off-topic tangents
- Excerpts must be VERBATIM from the transcript, not paraphrased
- Sort by importance descending

Return ONLY a JSON array. No markdown fences, no commentary.

TRANSCRIPT:
${transcript}`,
      },
    ],
    providerModelId,
    maxTokens,
    env
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
    cost: calculateTokenCost(pricing, result.inputTokens, result.outputTokens),
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

function buildMetadataIntro(metadata: EpisodeMetadata): string {
  const originalMinutes = metadata.durationSeconds
    ? Math.round(metadata.durationSeconds / 60)
    : null;
  const originalLength = originalMinutes
    ? `Originally ${originalMinutes} minutes`
    : "Original length unknown";

  return `
Begin the narrative with a brief spoken introduction stating:
- The podcast name ("${metadata.podcastTitle}")
- The episode title ("${metadata.episodeTitle}")
- When it was released (use a relative date like "released yesterday" or "from March 12th")
- The original episode length (${originalLength})
- The briefing length (${metadata.briefingMinutes} minutes)

Example: "From The Daily, episode The Election Results, released yesterday. Originally 45 minutes — here's your 5-minute briefing."

Then proceed directly into the content summary.
`;
}

/**
 * Pass 2: Generates a spoken narrative from extracted claims at a target duration.
 */
export async function generateNarrative(
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
  const metadataBlock = metadata ? buildMetadataIntro(metadata) : "";

  const prompt = hasExcerpts
    ? `You are a podcast script writer. Write a spoken narrative summarizing the following claims and their source excerpts for a daily briefing podcast segment.

TARGET: approximately ${targetWords} words (${durationMinutes} minutes at ${WORDS_PER_MINUTE} wpm).

Rules:
- Write in a conversational, engaging tone suitable for audio
- Cover claims in rough order of importance, but group related topics
- Use the EXCERPT text for accurate detail and context — do NOT invent facts beyond what the excerpts contain
- Use natural transitions between topics
- For shorter briefings, focus only on the highest-impact claims
- For longer briefings, include supporting context and nuance from excerpts
- Do NOT include stage directions, speaker labels, or markdown
- Output ONLY the narrative text
${metadataBlock}
CLAIMS AND EXCERPTS:
${JSON.stringify(claims, null, 2)}`
    : `You are a podcast script writer. Write a spoken narrative summarizing these claims for a daily briefing podcast segment.

TARGET: approximately ${targetWords} words (${durationMinutes} minutes at ${WORDS_PER_MINUTE} wpm).

Rules:
- Write in a conversational, engaging tone suitable for audio
- Cover the most important claims first
- Use natural transitions between topics
- Do NOT include stage directions, speaker labels, or markdown
- Output ONLY the narrative text
${metadataBlock}
CLAIMS:
${JSON.stringify(claims, null, 2)}`;

  const result = await llm.complete(
    [{ role: "user", content: prompt }],
    providerModelId,
    maxTokens,
    env
  );

  const usage: AiUsage = {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: calculateTokenCost(pricing, result.inputTokens, result.outputTokens),
  };

  return { narrative: result.text, usage };
}
