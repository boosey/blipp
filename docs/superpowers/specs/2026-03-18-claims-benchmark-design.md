# Claims Extraction Benchmark — Design Spec

**Date:** 2026-03-18
**Status:** Draft
**Author:** Claude + boose

---

## Purpose

Allow admins to compare claims extraction quality across AI models. The admin selects a baseline model (the "ground truth"), candidate models to test, and a set of episodes. The system runs claims extraction for each (model, episode) pair, then uses an LLM judge to evaluate how well each candidate covers the baseline's claims. This informs model selection decisions — finding the cheapest model that still produces good extractions.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Claims extraction only (not narrative) | Claims extraction is where model quality diverges most and where cost savings matter |
| Episode eligibility | Episodes with TRANSCRIPT WorkProduct in R2 | Broadest pool, no extra STT cost |
| Quality evaluation | LLM-as-judge comparing candidate vs baseline | Semantic comparison needed; text similarity too brittle |
| Judge model selection | Admin-selectable per experiment, default from platform config | Flexibility with warning that changing judge invalidates comparisons |
| Architecture | Standalone system, pattern-matched to STT benchmark | Rule of Three — don't abstract until third benchmark type arrives |
| Execution model | Two-phase: extraction → judging | Guarantees baseline exists before any judging |

---

## Data Model

### `ClaimsExperiment`

```prisma
model ClaimsExperiment {
  id                String                   @id @default(cuid())
  name              String
  status            ClaimsExperimentStatus   @default(PENDING)
  baselineModelId   String                   // AI model registry modelId
  baselineProvider  String                   // provider name
  judgeModelId      String                   // model used for evaluation
  judgeProvider     String                   // provider for judge model
  config            Json                     // { models: [{modelId, provider}], episodeIds: string[] }
  totalTasks        Int                      @default(0)  // episodes × (baseline + candidates)
  doneTasks         Int                      @default(0)
  totalJudgeTasks   Int                      @default(0)  // episodes × candidates (no baseline)
  doneJudgeTasks    Int                      @default(0)
  errorMessage      String?
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt
  completedAt       DateTime?
  results           ClaimsBenchmarkResult[]
}

enum ClaimsExperimentStatus {
  PENDING
  RUNNING
  JUDGING
  COMPLETED
  FAILED
  CANCELLED
}
```

### `ClaimsBenchmarkResult`

```prisma
model ClaimsBenchmarkResult {
  id                    String    @id @default(cuid())
  experimentId          String
  episodeId             String
  model                 String    // AI model registry modelId
  provider              String    // provider name (non-nullable — always known at creation)
  isBaseline            Boolean   @default(false)
  status                String    @default("PENDING")  // PENDING|RUNNING|COMPLETED|FAILED
  claimCount            Int?
  inputTokens           Int?
  outputTokens          Int?
  costDollars           Float?
  latencyMs             Int?
  coverageScore         Float?    // 0-100, computed server-side from verdicts. Null for baseline.
  weightedCoverageScore Float?    // 0-100, importance-weighted, computed server-side. Null for baseline.
  hallucinations        Int?      // count from verdicts, null for baseline
  judgeStatus           String?   // PENDING|RUNNING|COMPLETED|FAILED, null for baseline
  r2ClaimsKey           String?   // R2 key for full claims JSON
  r2JudgeKey            String?   // R2 key for per-claim verdicts JSON
  errorMessage          String?
  createdAt             DateTime  @default(now())
  completedAt           DateTime?

  experiment ClaimsExperiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  episode    Episode          @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([experimentId, episodeId, model, provider])
  @@index([experimentId])
}
```

### Episode Model Change

Add a named relation on the existing `Episode` model:

```prisma
// In Episode model, add:
claimsBenchmarkResults ClaimsBenchmarkResult[]
```

### Platform Config Keys

- `ai.benchmark.judgeModel` — default judge model ID
- `ai.benchmark.judgeProvider` — default judge provider

---

## Experiment Setup Flow (Admin UI)

Multi-step dialog:

1. **Name** — text input
2. **Baseline Model** — dropdown of active models from AI registry (`stage=distillation`). Shows label, provider, input pricing.
3. **Judge Model** — dropdown (all active models, any stage). Pre-filled from `ai.benchmark.judgeModel` platform config. Warning banner if changed: *"Changing the judge model may make results incomparable with previous experiments."*
4. **Candidate Models** — checkbox grid of active distillation models (baseline auto-excluded). Shows label, provider, pricing.
5. **Episodes** — searchable, paginated picker. Eligibility: episodes with WorkProduct `type=TRANSCRIPT`. Columns: podcast title, episode title, duration, transcript size. "Select N Random" button.
6. **Cost Estimate** — breakdown:
   - Extraction: (1 baseline + N candidates) × M episodes × estimated tokens × price/M
   - Judging: N candidates × M episodes × ~2K tokens × judge price/M
   - Total

Transcript token count estimated from WorkProduct `sizeBytes`: approximately 1 token per 4 bytes for English text. This is a rough estimate shown to the admin before committing — actual costs are tracked precisely during execution.

---

## Execution Engine

Two-phase runner called via frontend polling (`POST /experiments/:id/run` every ~2s).

### Phase 1 — Extraction (`status: RUNNING`)

1. Find next result row with `status: PENDING` (prioritize `isBaseline: true`)
2. Load transcript from R2 using `wpKey({ type: "TRANSCRIPT", episodeId })` helper
3. Resolve model for the API call:
   - Look up `AiModelProvider` from DB: `prisma.aiModelProvider.findFirst({ where: { provider, model: { modelId } } })`
   - Get `providerModelId` (the provider-specific model ID, may differ from registry `modelId`)
   - Get `LlmProvider` instance via `getLlmProviderImpl(provider)`
   - Get pricing via `getModelPricing(prisma, modelId, provider)`
4. Call `extractClaims(llm, transcript, providerModelId, 8192, env, pricing)`
5. Store claims JSON in R2: `benchmark/claims/${experimentId}/${episodeId}/${model}:${provider}.json`
6. Update result: `claimCount`, `costDollars`, `latencyMs`, `inputTokens`, `outputTokens`, `r2ClaimsKey`, `status: COMPLETED`
7. Increment `doneTasks`
8. When all extraction tasks complete → transition to `JUDGING`

### Phase 2 — Judging (`status: JUDGING`)

1. Find next non-baseline result with `judgeStatus: PENDING`
2. Load baseline claims + candidate claims from R2
3. Resolve judge model: look up `providerModelId` from `AiModelProvider`, get `LlmProvider` via `getLlmProviderImpl()`
4. Call judge model with structured prompt (see below), `maxTokens: 4096`
5. Parse response (strip fences, JSON.parse, Zod validate)
6. Compute `coverageScore` and `weightedCoverageScore` server-side from verdicts (see formulas below)
7. Store verdicts in R2: `benchmark/judge/${experimentId}/${episodeId}/${model}:${provider}.json`
8. Update result: `coverageScore`, `weightedCoverageScore`, `hallucinations` (count from verdicts), `r2JudgeKey`, `judgeStatus: COMPLETED`
9. Increment `doneJudgeTasks`
10. When all judge tasks complete → transition to `COMPLETED`

### Progress Response

```typescript
{
  done: boolean;
  phase: "extraction" | "judging";
  progress: { done: number; total: number; current?: string };
}
```

### Error Handling

- Individual task failure → mark result FAILED with `errorMessage`, continue to next task
- If >50% of tasks fail → mark experiment FAILED
- Admin can cancel at any time → CANCELLED status, stop processing
- Cancelled experiments are terminal — no resume. Admin must create a new experiment.

### Audit Logging

Experiment creation and deletion are logged via `writeAuditLog()` from `worker/lib/audit-log.ts`.

### R2 Cleanup

On experiment deletion, list R2 objects under `benchmark/claims/${experimentId}/` and `benchmark/judge/${experimentId}/` with pagination (R2 `list()` returns max 1000 per call). Delete in batches.

---

## Judge Prompt

### System Prompt (cached via prompt caching)

```
You are an impartial evaluator comparing podcast claim extractions.
You will receive a BASELINE set of claims (the reference standard) and
a CANDIDATE set of claims extracted from the same transcript by a
different model. Evaluate how well the candidate covers the baseline.
```

### User Message

```
BASELINE CLAIMS (reference):
[{claim, speaker, importance, novelty, excerpt}, ...]

CANDIDATE CLAIMS:
[{claim, speaker, importance, novelty, excerpt}, ...]

For each baseline claim, determine if the candidate covers it:
- COVERED: candidate has a claim expressing the same core assertion
- PARTIALLY_COVERED: candidate touches on the topic but misses key detail or nuance
- MISSING: candidate does not capture this claim at all

Also identify HALLUCINATIONS: candidate claims that appear factually
incorrect or that misattribute statements. Note: a candidate claim that
is valid but absent from the baseline is NOT a hallucination — the
candidate may have found a legitimate claim the baseline missed. Only
flag claims that are fabricated or misrepresent what was said.

Return ONLY JSON with one verdict per baseline claim:
{
  "verdicts": [
    {
      "baselineIndex": 0,
      "status": "COVERED" | "PARTIALLY_COVERED" | "MISSING",
      "matchedCandidateIndex": number | null,
      "reason": "brief explanation"
    }
  ],
  "hallucinations": [
    { "candidateIndex": number, "reason": "why this is fabricated or misattributed" }
  ]
}
```

### Zod Schema

```typescript
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
```

### Server-Side Score Computation

Scores are computed deterministically from verdicts, not by the LLM:

```typescript
// coverageScore: % of baseline claims that are COVERED or PARTIALLY_COVERED
const covered = verdicts.filter(v => v.status !== "MISSING").length;
const coverageScore = (covered / verdicts.length) * 100;

// weightedCoverageScore: same but weighted by baseline claim importance
// COVERED = 1.0, PARTIALLY_COVERED = 0.5, MISSING = 0.0
const totalWeight = baselineClaims.reduce((sum, c) => sum + c.importance, 0);
const achievedWeight = verdicts.reduce((sum, v) => {
  const weight = baselineClaims[v.baselineIndex].importance;
  if (v.status === "COVERED") return sum + weight;
  if (v.status === "PARTIALLY_COVERED") return sum + weight * 0.5;
  return sum;
}, 0);
const weightedCoverageScore = (achievedWeight / totalWeight) * 100;
```

This ensures scores are consistent across experiments regardless of judge model behavior.

### Cost Estimate

~2-4K input tokens + ~1K output tokens per judgment. At Sonnet pricing ($3/$15 per M): ~$0.02 per judgment. A 10-episode × 3-candidate experiment costs ~$0.60 in judging.

---

## Results Dashboard

### Summary Grid (default)

One row per candidate model:

| Column | Description |
|--------|-------------|
| Model / Provider | Model label + provider badge |
| Avg Coverage (%) | Mean `coverageScore` across episodes |
| Avg Weighted Coverage (%) | Mean `weightedCoverageScore` |
| Avg Hallucinations | Mean hallucination count |
| Avg Claim Count | With baseline avg shown for reference |
| Avg Cost ($) | Per-episode extraction cost |
| Avg Latency (ms) | Per-episode extraction time |
| Completed / Failed | Task counts |

Baseline row pinned at top as reference (100% coverage, its cost/latency = the bar to beat). Winners highlighted: best coverage, lowest cost, best coverage-per-dollar.

### Episode Detail View

Click episode to see side-by-side comparison:
- Left: baseline claims sorted by importance
- Right: candidate claims with verdict badges (green=COVERED, yellow=PARTIAL, red=MISSING)
- Hallucinated claims flagged in orange at bottom
- Expandable rows for excerpts and judge reasoning

### Per-Model Drill-Down

Click model row to see per-episode breakdown:
- Table: episode title, coverage, weighted coverage, hallucinations, cost, latency
- Identifies weak episodes for that model

---

## API Endpoints

All under `/api/admin/claims-benchmark/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/eligible-episodes` | Episodes with TRANSCRIPT WorkProduct. Paginated, searchable. |
| POST | `/experiments` | Create experiment + pre-generate result rows |
| GET | `/experiments` | Paginated experiment list |
| GET | `/experiments/:id` | Detail with status counts |
| POST | `/experiments/:id/run` | Execute next pending task |
| POST | `/experiments/:id/cancel` | Cancel experiment |
| DELETE | `/experiments/:id` | Delete + R2 cleanup |
| GET | `/experiments/:id/results` | Results + grid + winners |
| GET | `/results/:id/claims` | Claims JSON from R2 |
| GET | `/results/:id/verdicts` | Judge verdicts from R2 |

---

## File Structure

```
worker/routes/admin/claims-benchmark.ts      — API routes
worker/lib/claims-benchmark-runner.ts        — Two-phase execution engine
worker/lib/claims-benchmark-judge.ts         — Judge prompt, parsing, Zod schema
src/pages/admin/claims-benchmark.tsx         — Admin page (setup + results)
src/types/admin.ts                           — Type additions
prisma/schema.prisma                         — ClaimsExperiment + ClaimsBenchmarkResult
```

Registered in `worker/routes/admin/index.ts`.

---

## R2 Key Structure

```
benchmark/claims/{experimentId}/{episodeId}/{model}:{provider}.json
benchmark/judge/{experimentId}/{episodeId}/{model}:{provider}.json
```

Cleaned up on experiment deletion.

---

## Future Considerations

- When a third benchmark type is needed, extract common patterns (experiment CRUD, status machine, polling runner, progress tracking) into a shared framework
- Narrative generation benchmark would follow this same structure with different metrics
- TTS quality benchmark would need audio comparison (MOS scoring or similar)
