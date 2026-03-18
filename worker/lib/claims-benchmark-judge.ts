import { z } from "zod";
import type { LlmProvider, LlmCompletionOptions } from "./llm-providers";
import type { Claim } from "./distillation";
import type { ModelPricing, AiUsage } from "./ai-usage";
import { calculateTokenCost } from "./ai-usage";

// -- Zod schemas --

const VerdictSchema = z.object({
  baselineIndex: z.number(),
  status: z.enum(["COVERED", "PARTIALLY_COVERED", "MISSING"]),
  matchedCandidateIndex: z.number().nullable(),
  reason: z.string(),
});

const HallucinationSchema = z.object({
  candidateIndex: z.number(),
  reason: z.string(),
});

const JudgeOutputSchema = z.object({
  verdicts: z.array(VerdictSchema).min(1),
  hallucinations: z.array(HallucinationSchema),
});

export type JudgeVerdict = z.infer<typeof VerdictSchema>;
export type JudgeHallucination = z.infer<typeof HallucinationSchema>;
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// -- Prompts --

export const JUDGE_SYSTEM_PROMPT = `You are an impartial evaluator comparing podcast claim extractions.
You will receive a BASELINE set of claims (the reference standard) and a CANDIDATE set of claims extracted from the same transcript by a different model. Evaluate how well the candidate covers the baseline.`;

export function buildJudgeUserMessage(
  baselineClaims: Claim[],
  candidateClaims: Claim[]
): string {
  return `BASELINE CLAIMS (reference):
${JSON.stringify(baselineClaims, null, 2)}

CANDIDATE CLAIMS:
${JSON.stringify(candidateClaims, null, 2)}

For each baseline claim, determine if the candidate covers it:
- COVERED: candidate has a claim expressing the same core assertion
- PARTIALLY_COVERED: candidate touches on the topic but misses key detail or nuance
- MISSING: candidate does not capture this claim at all

Also identify HALLUCINATIONS: candidate claims that appear factually incorrect or that misattribute statements. Note: a candidate claim that is valid but absent from the baseline is NOT a hallucination — the candidate may have found a legitimate claim the baseline missed. Only flag claims that are fabricated or misrepresent what was said.

Return ONLY JSON with one verdict per baseline claim:
{
  "verdicts": [
    { "baselineIndex": 0, "status": "COVERED" | "PARTIALLY_COVERED" | "MISSING", "matchedCandidateIndex": number | null, "reason": "brief explanation" }
  ],
  "hallucinations": [
    { "candidateIndex": number, "reason": "why this is fabricated or misattributed" }
  ]
}`;
}

// -- Parsing --

export function parseJudgeResponse(text: string): JudgeOutput {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Judge returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  const validation = JudgeOutputSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Judge output failed schema validation: ${issues}`);
  }

  return validation.data;
}

// -- Score computation (deterministic, server-side) --

export function computeScores(
  verdicts: JudgeVerdict[],
  baselineClaims: Claim[]
): { coverageScore: number; weightedCoverageScore: number } {
  const covered = verdicts.filter((v) => v.status !== "MISSING").length;
  const coverageScore = (covered / verdicts.length) * 100;

  const totalWeight = baselineClaims.reduce(
    (sum, c) => sum + c.importance,
    0
  );
  const achievedWeight = verdicts.reduce((sum, v) => {
    const weight = baselineClaims[v.baselineIndex].importance;
    if (v.status === "COVERED") return sum + weight;
    if (v.status === "PARTIALLY_COVERED") return sum + weight * 0.5;
    return sum;
  }, 0);
  const weightedCoverageScore = (achievedWeight / totalWeight) * 100;

  return { coverageScore, weightedCoverageScore };
}

// -- Full judge call --

export async function judgeClaims(
  llm: LlmProvider,
  baselineClaims: Claim[],
  candidateClaims: Claim[],
  providerModelId: string,
  env: any,
  pricing: ModelPricing | null = null
): Promise<{ output: JudgeOutput; coverageScore: number; weightedCoverageScore: number; usage: AiUsage }> {
  const options: LlmCompletionOptions = {
    system: JUDGE_SYSTEM_PROMPT,
    cacheSystemPrompt: true,
  };

  const result = await llm.complete(
    [{ role: "user", content: buildJudgeUserMessage(baselineClaims, candidateClaims) }],
    providerModelId,
    4096,
    env,
    options
  );

  const output = parseJudgeResponse(result.text);
  const { coverageScore, weightedCoverageScore } = computeScores(
    output.verdicts,
    baselineClaims
  );

  const usage: AiUsage = {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: calculateTokenCost(
      pricing,
      result.inputTokens,
      result.outputTokens,
      result.cacheCreationTokens,
      result.cacheReadTokens
    ),
    cacheCreationTokens: result.cacheCreationTokens,
    cacheReadTokens: result.cacheReadTokens,
  };

  return { output, coverageScore, weightedCoverageScore, usage };
}
