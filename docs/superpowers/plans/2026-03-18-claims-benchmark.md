# Claims Extraction Benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins benchmark claims extraction models against a baseline, with LLM-as-judge evaluation producing coverage scores, hallucination counts, and side-by-side comparison views.

**Architecture:** Two-phase execution engine (extraction → judging) following the STT benchmark pattern. Standalone system with dedicated DB models, API routes, runner, judge module, and admin page. Results aggregated into a comparison grid with per-episode drill-down.

**Tech Stack:** Prisma (DB models), Hono (API routes), React + shadcn/ui (admin page), R2 (claims/verdicts storage), Zod (validation)

**Spec:** `docs/superpowers/specs/2026-03-18-claims-benchmark-design.md`

---

## File Structure

```
prisma/schema.prisma                              — Add ClaimsExperiment + ClaimsBenchmarkResult models
worker/routes/admin/claims-benchmark.ts            — API routes (~500 lines)
worker/routes/admin/index.ts                       — Register route
worker/lib/claims-benchmark-runner.ts              — Two-phase execution engine (~250 lines)
worker/lib/claims-benchmark-judge.ts               — Judge prompt, parsing, score computation (~150 lines)
worker/lib/__tests__/claims-benchmark-judge.test.ts — Judge module tests
worker/lib/__tests__/claims-benchmark-runner.test.ts — Runner tests
src/pages/admin/claims-benchmark.tsx               — Admin page (~1500 lines)
src/types/admin.ts                                 — Type additions (~80 lines)
```

---

### Task 1: Database Schema

**Files:**
- Modify: `prisma/schema.prisma` (after line ~592, where SttBenchmarkResult ends)
- Modify: `prisma/schema.prisma` (Episode model, add relation)

- [ ] **Step 1: Add ClaimsExperimentStatus enum and ClaimsExperiment model**

Add after the `SttBenchmarkResult` model:

```prisma
enum ClaimsExperimentStatus {
  PENDING
  RUNNING
  JUDGING
  COMPLETED
  FAILED
  CANCELLED
}

model ClaimsExperiment {
  id                String                   @id @default(cuid())
  name              String
  status            ClaimsExperimentStatus   @default(PENDING)
  baselineModelId   String
  baselineProvider  String
  judgeModelId      String
  judgeProvider     String
  config            Json
  totalTasks        Int                      @default(0)
  doneTasks         Int                      @default(0)
  totalJudgeTasks   Int                      @default(0)
  doneJudgeTasks    Int                      @default(0)
  errorMessage      String?
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt
  completedAt       DateTime?
  results           ClaimsBenchmarkResult[]
}

model ClaimsBenchmarkResult {
  id                    String    @id @default(cuid())
  experimentId          String
  episodeId             String
  model                 String
  provider              String
  isBaseline            Boolean   @default(false)
  status                String    @default("PENDING")
  claimCount            Int?
  inputTokens           Int?
  outputTokens          Int?
  costDollars           Float?
  latencyMs             Int?
  coverageScore         Float?
  weightedCoverageScore Float?
  hallucinations        Int?
  judgeStatus           String?
  r2ClaimsKey           String?
  r2JudgeKey            String?
  errorMessage          String?
  createdAt             DateTime  @default(now())
  completedAt           DateTime?

  experiment ClaimsExperiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  episode    Episode          @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([experimentId, episodeId, model, provider])
  @@index([experimentId])
}
```

- [ ] **Step 2: Add relation on Episode model**

Find the Episode model (around line 173) and add:

```prisma
claimsBenchmarkResults ClaimsBenchmarkResult[]
```

Place it near the existing `benchmarkResults SttBenchmarkResult[]` line.

- [ ] **Step 3: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

Verify no errors. Regenerate `src/generated/prisma/index.ts` barrel export if needed.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add ClaimsExperiment and ClaimsBenchmarkResult models"
```

---

### Task 2: TypeScript Type Contracts

**Files:**
- Modify: `src/types/admin.ts` (after STT types, around line 694)

- [ ] **Step 1: Add claims benchmark types**

Add after the existing STT types:

```typescript
// ---------------------------------------------------------------------------
// Claims Benchmark
// ---------------------------------------------------------------------------

export type ClaimsExperimentStatus =
  | "PENDING"
  | "RUNNING"
  | "JUDGING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ClaimsExperiment {
  id: string;
  name: string;
  status: ClaimsExperimentStatus;
  baselineModelId: string;
  baselineProvider: string;
  judgeModelId: string;
  judgeProvider: string;
  config: {
    models: { modelId: string; provider: string }[];
    episodeIds: string[];
  };
  totalTasks: number;
  doneTasks: number;
  totalJudgeTasks: number;
  doneJudgeTasks: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ClaimsBenchmarkResult {
  id: string;
  experimentId: string;
  episodeId: string;
  model: string;
  provider: string;
  isBaseline: boolean;
  status: string;
  claimCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  costDollars?: number;
  latencyMs?: number;
  coverageScore?: number;
  weightedCoverageScore?: number;
  hallucinations?: number;
  judgeStatus?: string;
  r2ClaimsKey?: string;
  r2JudgeKey?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  // Joined from Episode
  episodeTitle?: string;
  podcastTitle?: string;
}

export interface ClaimsResultsGrid {
  model: string;
  provider: string;
  avgCoverage: number;
  avgWeightedCoverage: number;
  avgHallucinations: number;
  avgClaimCount: number;
  avgCost: number;
  avgLatency: number;
  completedCount: number;
  failedCount: number;
}

export interface ClaimsEligibleEpisode {
  id: string;
  title: string;
  podcastTitle: string;
  podcastImageUrl?: string;
  durationSeconds?: number;
  transcriptSizeBytes?: number;
}

export interface ClaimsJudgeVerdict {
  baselineIndex: number;
  status: "COVERED" | "PARTIALLY_COVERED" | "MISSING";
  matchedCandidateIndex: number | null;
  reason: string;
}

export interface ClaimsJudgeHallucination {
  candidateIndex: number;
  reason: string;
}

export interface ClaimsJudgeOutput {
  verdicts: ClaimsJudgeVerdict[];
  hallucinations: ClaimsJudgeHallucination[];
  coverageScore: number;
  weightedCoverageScore: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/admin.ts
git commit -m "feat(types): add claims benchmark type contracts"
```

---

### Task 3: Judge Module

**Files:**
- Create: `worker/lib/claims-benchmark-judge.ts`
- Create: `worker/lib/__tests__/claims-benchmark-judge.test.ts`

- [ ] **Step 1: Write judge tests**

```typescript
// worker/lib/__tests__/claims-benchmark-judge.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  computeScores,
  parseJudgeResponse,
  judgeClaims,
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserMessage,
} from "../claims-benchmark-judge";
import type { Claim } from "../distillation";

const baselineClaims: Claim[] = [
  { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 10, novelty: 7, excerpt: "AI will transform healthcare" },
  { claim: "Costs drop 40%", speaker: "Dr. Smith", importance: 6, novelty: 5, excerpt: "Costs will drop by 40%" },
  { claim: "Timeline is 5 years", speaker: "Dr. Smith", importance: 4, novelty: 3, excerpt: "Within five years" },
];

describe("computeScores", () => {
  it("computes 100% coverage when all claims covered", () => {
    const verdicts = [
      { baselineIndex: 0, status: "COVERED" as const, matchedCandidateIndex: 0, reason: "match" },
      { baselineIndex: 1, status: "COVERED" as const, matchedCandidateIndex: 1, reason: "match" },
      { baselineIndex: 2, status: "COVERED" as const, matchedCandidateIndex: 2, reason: "match" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    expect(scores.coverageScore).toBe(100);
    expect(scores.weightedCoverageScore).toBe(100);
  });

  it("computes 0% coverage when all claims missing", () => {
    const verdicts = [
      { baselineIndex: 0, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 1, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 2, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    expect(scores.coverageScore).toBe(0);
    expect(scores.weightedCoverageScore).toBe(0);
  });

  it("counts PARTIALLY_COVERED as covered in simple score, half in weighted", () => {
    const verdicts = [
      { baselineIndex: 0, status: "PARTIALLY_COVERED" as const, matchedCandidateIndex: 0, reason: "partial" },
      { baselineIndex: 1, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 2, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    // 1 of 3 not missing = 33.33%
    expect(scores.coverageScore).toBeCloseTo(33.33, 1);
    // importance: 10*0.5 + 6*0 + 4*0 = 5, total = 20 → 25%
    expect(scores.weightedCoverageScore).toBe(25);
  });
});

describe("parseJudgeResponse", () => {
  it("parses valid JSON response", () => {
    const json = JSON.stringify({
      verdicts: [{ baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" }],
      hallucinations: [],
    });
    const result = parseJudgeResponse(json);
    expect(result.verdicts).toHaveLength(1);
    expect(result.hallucinations).toHaveLength(0);
  });

  it("strips markdown fences", () => {
    const json = "```json\n" + JSON.stringify({
      verdicts: [{ baselineIndex: 0, status: "MISSING", matchedCandidateIndex: null, reason: "not found" }],
      hallucinations: [],
    }) + "\n```";
    const result = parseJudgeResponse(json);
    expect(result.verdicts).toHaveLength(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJudgeResponse("not json")).toThrow("Judge returned invalid JSON");
  });

  it("throws on missing verdicts", () => {
    expect(() => parseJudgeResponse(JSON.stringify({ hallucinations: [] }))).toThrow("schema validation");
  });
});

describe("buildJudgeUserMessage", () => {
  it("includes both claim sets", () => {
    const candidateClaims: Claim[] = [
      { claim: "AI changes medicine", speaker: "Host", importance: 8, novelty: 6, excerpt: "AI changes medicine" },
    ];
    const msg = buildJudgeUserMessage(baselineClaims, candidateClaims);
    expect(msg).toContain("BASELINE CLAIMS");
    expect(msg).toContain("CANDIDATE CLAIMS");
    expect(msg).toContain("AI transforms healthcare");
    expect(msg).toContain("AI changes medicine");
  });
});

describe("JUDGE_SYSTEM_PROMPT", () => {
  it("exists and mentions impartial evaluator", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("impartial evaluator");
  });
});

describe("computeScores edge cases", () => {
  it("handles single claim", () => {
    const claims: Claim[] = [
      { claim: "Test", speaker: "Host", importance: 5, novelty: 3, excerpt: "test" },
    ];
    const verdicts = [
      { baselineIndex: 0, status: "COVERED" as const, matchedCandidateIndex: 0, reason: "match" },
    ];
    const scores = computeScores(verdicts, claims);
    expect(scores.coverageScore).toBe(100);
    expect(scores.weightedCoverageScore).toBe(100);
  });
});

describe("judgeClaims", () => {
  it("calls LLM with system prompt and returns computed scores", async () => {
    const mockLlm = {
      name: "MockLLM",
      provider: "mock",
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          verdicts: [
            { baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" },
          ],
          hallucinations: [],
        }),
        model: "mock-model",
        inputTokens: 500,
        outputTokens: 200,
      }),
    };
    const baseline: Claim[] = [
      { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 10, novelty: 7, excerpt: "AI will transform" },
    ];
    const candidate: Claim[] = [
      { claim: "AI changes medicine", speaker: "Host", importance: 8, novelty: 6, excerpt: "AI changes medicine" },
    ];

    const result = await judgeClaims(mockLlm, baseline, candidate, "mock-model", {});
    expect(result.coverageScore).toBe(100);
    expect(result.output.verdicts).toHaveLength(1);
    expect(result.usage.inputTokens).toBe(500);
    // Verify system prompt was passed with caching
    const callOptions = mockLlm.complete.mock.calls[0][4];
    expect(callOptions.system).toContain("impartial evaluator");
    expect(callOptions.cacheSystemPrompt).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run worker/lib/__tests__/claims-benchmark-judge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement judge module**

```typescript
// worker/lib/claims-benchmark-judge.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run worker/lib/__tests__/claims-benchmark-judge.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/claims-benchmark-judge.ts worker/lib/__tests__/claims-benchmark-judge.test.ts
git commit -m "feat: add claims benchmark judge module with scoring and tests"
```

---

### Task 4: Benchmark Runner

**Files:**
- Create: `worker/lib/claims-benchmark-runner.ts`
- Create: `worker/lib/__tests__/claims-benchmark-runner.test.ts`

- [ ] **Step 1: Write runner tests**

Test the two-phase execution engine. Key scenarios:
- Returns `{ done: true }` when no pending tasks remain
- Phase 1: picks baseline tasks first, runs `extractClaims()`, stores to R2, updates result row
- Phase 1 → Phase 2 transition when all extractions complete
- Phase 2: loads claims from R2, calls judge, computes scores, updates result row
- Phase 2 completion marks experiment COMPLETED
- Task failure marks result FAILED and increments progress
- Experiment fails if >50% tasks fail

Follow the pattern from `worker/queues/__tests__/distillation.test.ts` for mocking prisma, env, and LLM providers. Mock `extractClaims` and `judgeClaims` rather than the LLM provider directly — test at the runner level, not the LLM level.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run worker/lib/__tests__/claims-benchmark-runner.test.ts
```

- [ ] **Step 3: Implement runner**

```typescript
// worker/lib/claims-benchmark-runner.ts
import type { Env } from "../types";
import { extractClaims, type Claim } from "./distillation";
import { judgeClaims } from "./claims-benchmark-judge";
import { getLlmProviderImpl } from "./llm-providers";
import { getModelPricing } from "./ai-usage";
import { getWorkProduct } from "./work-products";
import { wpKey } from "./work-products";

export interface RunNextResult {
  done: boolean;
  phase: "extraction" | "judging";
  progress: { done: number; total: number; current?: string };
}

/**
 * Execute the next pending task in a claims benchmark experiment.
 * Called repeatedly by the frontend polling loop.
 */
export async function runNextTask(
  experimentId: string,
  env: Env,
  prisma: any
): Promise<RunNextResult> {
  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment || experiment.status === "CANCELLED") {
    return { done: true, phase: "extraction", progress: { done: 0, total: 0 } };
  }

  // Phase 1: Extraction
  if (experiment.status === "RUNNING") {
    // Prioritize baseline tasks
    const pending = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId, status: "PENDING" },
      orderBy: [{ isBaseline: "desc" }, { createdAt: "asc" }],
      include: { episode: { include: { podcast: true } } },
    });

    if (!pending) {
      // All extractions done — transition to JUDGING
      await prisma.claimsExperiment.update({
        where: { id: experimentId },
        data: { status: "JUDGING" },
      });
      return {
        done: false,
        phase: "judging",
        progress: { done: 0, total: experiment.totalJudgeTasks },
      };
    }

    await handleExtraction(pending, experiment, env, prisma);

    return {
      done: false,
      phase: "extraction",
      progress: {
        done: experiment.doneTasks + 1,
        total: experiment.totalTasks,
        current: `${pending.episode?.podcast?.title ?? ""} — ${pending.episode?.title ?? pending.episodeId}`,
      },
    };
  }

  // Phase 2: Judging
  if (experiment.status === "JUDGING") {
    const pending = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId, isBaseline: false, judgeStatus: "PENDING" },
      include: { episode: { include: { podcast: true } } },
    });

    if (!pending) {
      // All judging done — transition to COMPLETED
      await prisma.claimsExperiment.update({
        where: { id: experimentId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return { done: true, phase: "judging", progress: { done: experiment.doneJudgeTasks, total: experiment.totalJudgeTasks } };
    }

    await handleJudging(pending, experiment, env, prisma);

    return {
      done: false,
      phase: "judging",
      progress: {
        done: experiment.doneJudgeTasks + 1,
        total: experiment.totalJudgeTasks,
        current: `Judging ${pending.model} on ${pending.episode?.title ?? pending.episodeId}`,
      },
    };
  }

  return { done: true, phase: "extraction", progress: { done: experiment.doneTasks, total: experiment.totalTasks } };
}

async function handleExtraction(
  result: any,
  experiment: any,
  env: Env,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: { status: "RUNNING" },
  });

  try {
    // Load transcript
    const transcriptKey = wpKey({ type: "TRANSCRIPT", episodeId: result.episodeId });
    const transcriptData = await getWorkProduct(env.R2, transcriptKey);
    if (!transcriptData) throw new Error("Transcript not found in R2");
    const transcript = new TextDecoder().decode(transcriptData);

    // Resolve model
    const providerRow = await prisma.aiModelProvider.findFirst({
      where: { provider: result.provider, model: { modelId: result.model } },
    });
    if (!providerRow) throw new Error(`No provider config for ${result.model}:${result.provider}`);
    const llm = getLlmProviderImpl(result.provider);
    const pricing = await getModelPricing(prisma, result.model, result.provider);

    // Extract claims
    const start = Date.now();
    const { claims, usage } = await extractClaims(
      llm,
      transcript,
      providerRow.providerModelId,
      8192,
      env,
      pricing
    );
    const latencyMs = Date.now() - start;

    // Store claims in R2
    const r2Key = `benchmark/claims/${experiment.id}/${result.episodeId}/${result.model}:${result.provider}.json`;
    await env.R2.put(r2Key, JSON.stringify(claims));

    // Update result
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        status: "COMPLETED",
        claimCount: claims.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costDollars: usage.cost,
        latencyMs,
        r2ClaimsKey: r2Key,
        completedAt: new Date(),
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneTasks: { increment: 1 } },
    });
  } catch (err) {
    await markFailed(result, experiment.id, err, prisma);
  }
}

async function handleJudging(
  result: any,
  experiment: any,
  env: Env,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: { judgeStatus: "RUNNING" },
  });

  try {
    // Load baseline claims for this episode
    const baseline = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId: experiment.id, episodeId: result.episodeId, isBaseline: true, status: "COMPLETED" },
    });
    if (!baseline?.r2ClaimsKey) throw new Error("Baseline claims not found");

    const baselineBytes = await getWorkProduct(env.R2, baseline.r2ClaimsKey);
    if (!baselineBytes) throw new Error("Baseline claims R2 object not found");
    const baselineClaims: Claim[] = JSON.parse(new TextDecoder().decode(baselineBytes));

    // Load candidate claims
    if (!result.r2ClaimsKey) throw new Error("Candidate claims not found");
    const candidateBytes = await getWorkProduct(env.R2, result.r2ClaimsKey);
    if (!candidateBytes) throw new Error("Candidate claims R2 object not found");
    const candidateClaims: Claim[] = JSON.parse(new TextDecoder().decode(candidateBytes));

    // Resolve judge model
    const judgeProviderRow = await prisma.aiModelProvider.findFirst({
      where: { provider: experiment.judgeProvider, model: { modelId: experiment.judgeModelId } },
    });
    if (!judgeProviderRow) throw new Error(`No provider config for judge ${experiment.judgeModelId}:${experiment.judgeProvider}`);
    const llm = getLlmProviderImpl(experiment.judgeProvider);
    const pricing = await getModelPricing(prisma, experiment.judgeModelId, experiment.judgeProvider);

    // Run judge
    const { output, coverageScore, weightedCoverageScore } = await judgeClaims(
      llm,
      baselineClaims,
      candidateClaims,
      judgeProviderRow.providerModelId,
      env,
      pricing
    );

    // Store verdicts in R2
    const r2Key = `benchmark/judge/${experiment.id}/${result.episodeId}/${result.model}:${result.provider}.json`;
    await env.R2.put(r2Key, JSON.stringify(output));

    // Update result
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        judgeStatus: "COMPLETED",
        coverageScore,
        weightedCoverageScore,
        hallucinations: output.hallucinations.length,
        r2JudgeKey: r2Key,
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneJudgeTasks: { increment: 1 } },
    });
  } catch (err) {
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        judgeStatus: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneJudgeTasks: { increment: 1 } },
    });
  }
}

async function markFailed(
  result: any,
  experimentId: string,
  err: unknown,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  });
  const experiment = await prisma.claimsExperiment.update({
    where: { id: experimentId },
    data: { doneTasks: { increment: 1 } },
  });

  // Check >50% failure threshold
  const failedCount = await prisma.claimsBenchmarkResult.count({
    where: { experimentId, status: "FAILED" },
  });
  if (failedCount > experiment.totalTasks / 2) {
    await prisma.claimsExperiment.update({
      where: { id: experimentId },
      data: { status: "FAILED", errorMessage: "Over 50% of tasks failed" },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run worker/lib/__tests__/claims-benchmark-runner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add worker/lib/claims-benchmark-runner.ts worker/lib/__tests__/claims-benchmark-runner.test.ts
git commit -m "feat: add claims benchmark runner with two-phase execution"
```

---

### Task 5: API Routes

**Files:**
- Create: `worker/routes/admin/claims-benchmark.ts`
- Modify: `worker/routes/admin/index.ts` (add import + route registration)

- [ ] **Step 1: Create the route file**

**Reference:** `worker/routes/admin/stt-benchmark.ts` (660 lines). Mirror its structure closely — same Hono pattern, same pagination/sort helpers, same error handling. Adapt the STT-specific logic (speeds, WER, audio) to claims-specific logic (judge, verdicts, coverage).

Implement these endpoints:

1. `GET /eligible-episodes` — Query episodes that have a WorkProduct with `type = "TRANSCRIPT"`. Join Episode → WorkProduct to get `sizeBytes`. Paginate with `parsePagination(c)`, search by episode title or podcast title. Return `ClaimsEligibleEpisode[]`. Reference: STT benchmark lines 16-69 (similar but filters on `transcriptUrl` instead).

2. `POST /experiments` — Validate body: `{ name: string, baselineModelId: string, baselineProvider: string, judgeModelId: string, judgeProvider: string, models: {modelId, provider}[], episodeIds: string[] }`. Create `ClaimsExperiment`. Pre-generate all `ClaimsBenchmarkResult` rows as a cartesian product (models × episodes). Mark rows where `model === baselineModelId && provider === baselineProvider` as `isBaseline: true`. Set `totalTasks = models.length * episodes.length` and `totalJudgeTasks = (models.length - 1) * episodes.length` (exclude baseline from judging). Set `judgeStatus: "PENDING"` on non-baseline rows, `judgeStatus: null` on baseline rows. Write audit log via `writeAuditLog()` from `worker/lib/audit-log.ts`. Reference: STT benchmark lines 214-292.

3. `GET /experiments` — Paginated list. Reference: STT benchmark lines 297-329.

4. `GET /experiments/:id` — Detail with status counts. Use `prisma.claimsBenchmarkResult.groupBy({ by: ["status"], where: { experimentId }, _count: true })` and same for `judgeStatus`. Reference: STT benchmark lines 334-378.

5. `POST /experiments/:id/run` — **CRITICAL: Transition PENDING → RUNNING on first call before calling runner.** The runner only handles RUNNING and JUDGING statuses. Code:

```typescript
routes.post("/experiments/:id/run", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const experiment = await prisma.claimsExperiment.findUnique({ where: { id } });
  if (!experiment) return c.json({ error: "Not found" }, 404);
  if (experiment.status === "CANCELLED") return c.json({ error: "Cancelled" }, 400);

  // First run: transition PENDING → RUNNING
  if (experiment.status === "PENDING") {
    await prisma.claimsExperiment.update({
      where: { id },
      data: { status: "RUNNING" },
    });
  }

  const result = await runNextTask(id, c.env, prisma);
  return c.json(result);
});
```

6. `POST /experiments/:id/cancel` — Set status CANCELLED. Reference: STT benchmark lines 426-444.

7. `DELETE /experiments/:id` — Delete experiment (cascades results). Clean up R2 with paginated listing:

```typescript
// R2 cleanup with pagination (max 1000 per list call)
for (const prefix of [`benchmark/claims/${id}/`, `benchmark/judge/${id}/`]) {
  let cursor: string | undefined;
  do {
    const listed = await c.env.R2.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => c.env.R2.delete(obj.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
```

Write audit log. Reference: STT benchmark lines 585-612.

8. `GET /experiments/:id/results` — Return results with episode join, compute grid aggregation. Group completed non-baseline results by (model, provider), compute averages. Find winners (best coverage, lowest cost, best coverage-per-dollar ratio). Baseline row included in results but not in grid. Reference: STT benchmark lines 449-580 (adapt from WER/speed grouping to coverage/provider grouping).

9. `GET /results/:id/claims` — Fetch from R2 via `r2ClaimsKey`. Reference: STT benchmark lines 109-132.

10. `GET /results/:id/verdicts` — Fetch from R2 via `r2JudgeKey`. Same pattern as above.

- [ ] **Step 2: Register route in admin index**

In `worker/routes/admin/index.ts`:

```typescript
import { claimsBenchmarkRoutes } from "./claims-benchmark";
// ... in the route registration section:
adminRoutes.route("/claims-benchmark", claimsBenchmarkRoutes);
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add worker/routes/admin/claims-benchmark.ts worker/routes/admin/index.ts
git commit -m "feat: add claims benchmark API routes"
```

---

### Task 6: Admin Frontend Page

**Files:**
- Create: `src/pages/admin/claims-benchmark.tsx`
- Modify: `src/App.tsx` (add lazy route)
- Modify: `src/layouts/admin-layout.tsx` (add sidebar nav item)

- [ ] **Step 1: Add route and nav entry**

In `src/App.tsx`, add the lazy import and route (follow existing admin page pattern):

```typescript
const ClaimsBenchmark = lazy(() => import("./pages/admin/claims-benchmark"));
// In admin routes:
<Route path="claims-benchmark" element={<ClaimsBenchmark />} />
```

In `src/layouts/admin-layout.tsx`, add a nav item under the "AI" group (near STT Benchmark):

```typescript
{ label: "Claims Benchmark", href: "/admin/claims-benchmark", icon: FlaskConical }
```

**Primary reference: `src/pages/admin/stt-benchmark.tsx` (~2000 lines).** Follow its patterns for state management, dialog structure, polling, and results display. The claims benchmark UI has more complexity (6-step setup vs 5, two-phase progress, verdict badges) but the skeleton is the same.

- [ ] **Step 2: Build the experiments list view**

Mirror STT benchmark's experiment list. Components:
- Experiments table: name, status badge (use `Badge` from shadcn), model count, progress bar (`doneTasks/totalTasks` for extraction, `doneJudgeTasks/totalJudgeTasks` for judging), created date
- "New Experiment" button → opens `Dialog` (shadcn)
- Delete button with `AlertDialog` confirmation
- Use `useAdminFetch()` from `src/lib/admin-api.ts` for all API calls
- Fetch experiments from `GET /api/admin/claims-benchmark/experiments`

- [ ] **Step 3: Build the experiment setup dialog**

Multi-step form using `useState` for step tracking (same pattern as STT benchmark). Steps:

1. **Name** — `Input` component
2. **Baseline Model** — `Select` dropdown. Fetch models from `GET /api/admin/ai-models?stage=distillation`. Show: label, provider, `$X.XX/M input tokens`
3. **Judge Model** — `Select` dropdown. Fetch all models from `GET /api/admin/ai-models`. Pre-fill from platform config (`GET /api/admin/config?key=ai.benchmark.judgeModel`). Show warning `Alert` if admin changes from default: *"Changing the judge model may make results incomparable with previous experiments."*
4. **Candidate Models** — Checkbox grid (filter out baseline). Show label, provider, pricing.
5. **Episodes** — Searchable table with pagination. Fetch from `GET /api/admin/claims-benchmark/eligible-episodes`. Columns: checkbox, podcast title, episode title, duration, transcript size. "Select N Random" button.
6. **Cost Estimate** — Frontend computation: `estimatedTokens = transcriptSizeBytes / 4` per episode. Extraction cost: `(1 + candidateCount) * episodeCount * estimatedTokens * priceInputPerMToken / 1_000_000`. Judging cost: `candidateCount * episodeCount * 2000 * judgePriceInput / 1_000_000`. Show breakdown + total.

Submit: `POST /api/admin/claims-benchmark/experiments` with full config.

- [ ] **Step 4: Build the run/progress view**

When experiment status is PENDING/RUNNING/JUDGING:
- "Start" button (calls `POST /experiments/:id/run`) and "Cancel" button
- Progress bar using shadcn `Progress` component
- Phase label: "Extracting claims... (12/30)" or "Judging candidates... (5/18)"
- Auto-poll: `setInterval` calling `POST /experiments/:id/run` every 2 seconds while `!done`. Clear interval on unmount or when done.
- Two progress bars when in JUDGING: extraction (complete, 100%) + judging (in progress)
- Reference: STT benchmark's polling pattern (search for `setInterval` in `stt-benchmark.tsx`)

- [ ] **Step 5: Build the results dashboard**

Three sub-views using `Tabs` (shadcn):

**Summary Grid:** Table (`Table` from shadcn) with baseline pinned at top (dimmed row with "Baseline" badge), candidate rows sorted by coverage descending. Columns: model, provider, avg coverage %, avg weighted coverage %, avg hallucinations, avg claim count (show baseline avg as reference), avg cost ($), avg latency (ms), completed/failed. Highlight winner cells with green background. Best coverage-per-dollar = `coverageScore / costDollars` (show as additional column or tooltip).

**Episode Detail:** Click episode → expandable section or `Sheet` (shadcn). Two-column layout:
- Left: baseline claims sorted by importance descending. Each claim shows: importance badge, claim text, speaker, excerpt (collapsible).
- Right: for each selected candidate model, show its claims with verdict badge next to the matching baseline claim: green `Badge` for COVERED, yellow for PARTIALLY_COVERED, red for MISSING. Show judge's reason on hover/expand.
- Bottom section: hallucinated claims in orange with reason text.
- Fetch verdicts from `GET /api/admin/claims-benchmark/results/:id/verdicts`.

**Per-Model Drill-Down:** Click model row in grid → table of episodes for that model. Columns: episode title, coverage %, weighted coverage %, hallucinations, claim count, cost, latency. Sortable. Identifies weak episodes (low coverage highlighted).

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/claims-benchmark.tsx src/App.tsx src/layouts/admin-layout.tsx
git commit -m "feat: add claims benchmark admin page with setup, execution, and results views"
```

---

### Task 7: Integration Testing & Polish

**Files:**
- Modify: various (bug fixes from integration testing)

- [ ] **Step 1: Run full typecheck**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run all tests**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run
```

Fix any failures.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev`). Navigate to `/admin/claims-benchmark`.
- Create a test experiment with 1-2 episodes and 2 models
- Verify experiment creation (check DB has result rows)
- Run the experiment (watch progress)
- Verify results display correctly

- [ ] **Step 4: Update API reference docs**

Add the new claims benchmark endpoints to `docs/api-reference.md` under a new "Claims Benchmark" section in the Admin Pipeline group.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: claims extraction benchmark - integration fixes and docs"
```
