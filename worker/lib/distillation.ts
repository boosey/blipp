import type Anthropic from "@anthropic-ai/sdk";
import { calculateCost, type AiUsage } from "./ai-usage";

/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;

/** A single factual claim extracted from a podcast transcript. */
export interface Claim {
  /** The factual assertion itself */
  claim: string;
  /** Who made the claim in the episode */
  speaker: string;
  /** 1-10 rating of how important the claim is */
  importance: number;
  /** 1-10 rating of how novel/surprising the claim is */
  novelty: number;
  /** Verbatim source passage from the transcript supporting this claim */
  excerpt: string;
}

/**
 * Pass 1: Extracts all significant claims from a podcast transcript.
 *
 * Sends the full transcript to Claude and asks for structured JSON output
 * with claims including verbatim excerpts, ranked by importance and novelty.
 * Claim count varies based on content density (typically 10-40).
 *
 * @param client - Anthropic SDK client instance
 * @param transcript - Full episode transcript text
 * @returns Array of extracted claims with excerpts, sorted by importance
 * @throws If the Claude API call fails or returns unparseable JSON
 */
export async function extractClaims(
  client: Anthropic,
  transcript: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<{ claims: Claim[]; usage: AiUsage }> {
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [
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
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const claims: Claim[] = JSON.parse(text);

  const usage: AiUsage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: calculateCost(response.model, response.usage.input_tokens, response.usage.output_tokens),
  };

  return { claims, usage };
}

/**
 * Selects and prioritizes claims for a target duration tier.
 *
 * Sorts claims by a composite score (70% importance, 30% novelty) and
 * returns the top N claims where N scales with the target duration
 * (~2.5 claims per minute, minimum 3).
 */
export function selectClaimsForDuration(
  claims: Claim[],
  durationMinutes: number
): Claim[] {
  if (claims.length === 0) return [];

  const scored = claims
    .map(c => ({ ...c, _score: c.importance * 0.7 + c.novelty * 0.3 }))
    .sort((a, b) => b._score - a._score);

  const targetCount = Math.min(
    scored.length,
    Math.max(3, Math.ceil(durationMinutes * 2.5))
  );

  // Strip the internal _score field before returning
  return scored.slice(0, targetCount).map(({ _score, ...claim }) => claim);
}

/**
 * Pass 2: Generates a spoken narrative from extracted claims at a target duration.
 *
 * Calculates a target word count from the desired duration in minutes and
 * instructs Claude to produce a podcast-ready script. When claims include
 * verbatim excerpts, uses an excerpts-aware prompt for higher quality
 * output. Falls back to a simpler prompt for legacy claims without excerpts.
 *
 * @param client - Anthropic SDK client instance
 * @param claims - Array of claims (pre-filtered by selectClaimsForDuration)
 * @param durationMinutes - Target segment length in minutes
 * @returns Narrative text suitable for TTS conversion
 * @throws If the Claude API call fails
 */
export async function generateNarrative(
  client: Anthropic,
  claims: Claim[],
  durationMinutes: number,
  model: string = "claude-sonnet-4-20250514"
): Promise<{ narrative: string; usage: AiUsage }> {
  const targetWords = Math.round(durationMinutes * WORDS_PER_MINUTE);
  const hasExcerpts = claims.length > 0 && "excerpt" in claims[0];

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

CLAIMS:
${JSON.stringify(claims, null, 2)}`;

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const narrative =
    response.content[0].type === "text" ? response.content[0].text : "";

  const usage: AiUsage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: calculateCost(response.model, response.usage.input_tokens, response.usage.output_tokens),
  };

  return { narrative, usage };
}
