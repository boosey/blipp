# Phase 3: Code Quality & Brittleness Fixes — Implementation Plan

**Date:** 2026-03-14
**Estimated effort:** 3-4 days
**Source:** [Master Review Plan](./2026-03-14-master-review-plan.md) Phase 3, [Code Quality Analysis](./2026-03-14-code-quality-analysis.md)
**Branch:** `refactor/phase3-quality` (from `refactor/code-review`)

---

## Dependency Graph

```
Task 9 (stage name maps)          ── no deps
Task 2 (DURATION_TIERS)           ── no deps
Task 3 (queue message types)      ── no deps
Task 4 (resolveStageModel)        ── no deps
Task 6 (feed-refresh detection)   ── no deps
Task 7 (RSS validation)           ── no deps
Task 1 (Zod LLM validation)       ── no deps
Task 5 (stage handler boilerplate) ── depends on Task 3, Task 4
Task 8 (clip-cache removal)       ── no deps (but do after Task 5 if parallelizing)
Task 10 (dead code removal)       ── depends on Task 2, Task 9
```

Tasks 1-4, 6, 7, 9 can all run in parallel. Task 5 should run after 3 and 4. Task 10 should run last.

---

## Task 1: Add Zod Validation for LLM JSON Output (B1)

### Problem

`worker/lib/distillation.ts:58-62` strips markdown fences then calls `JSON.parse(text)` and casts the result to `Claim[]` with zero structural validation. If the LLM returns a JSON object with a `claims` key instead of a bare array, or returns elements missing `importance`/`novelty` fields, the code silently produces garbage that corrupts downstream `selectClaimsForDuration`.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/distillation.ts` | Add Zod schema, validate after JSON.parse |
| `package.json` | Add `zod` dependency |
| `worker/lib/__tests__/distillation.test.ts` | Add validation tests |

### Implementation

**1. Install Zod:**

```bash
npm install zod --legacy-peer-deps
```

**2. Define schema in `worker/lib/distillation.ts`:**

Add after the `Claim` interface (line 14):

```typescript
import { z } from "zod";

const ClaimSchema = z.object({
  claim: z.string().min(1),
  speaker: z.string(),
  importance: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  excerpt: z.string(),
});

const ClaimsArraySchema = z.array(ClaimSchema).min(1);
```

**3. Replace the unvalidated parse in `extractClaims` (lines 58-62):**

Replace:
```typescript
const text = result.text
  .replace(/^```(?:json)?\s*\n?/i, "")
  .replace(/\n?```\s*$/i, "")
  .trim();
const claims: Claim[] = JSON.parse(text);
```

With:
```typescript
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
```

### Tests to Add

In `worker/lib/__tests__/distillation.test.ts`, add a new `describe("extractClaims validation")` block:

1. **Valid bare array** — Mock LLM returning `[{ claim: "...", speaker: "...", importance: 5, novelty: 7, excerpt: "..." }]`. Should succeed.
2. **Wrapped in object** — Mock LLM returning `{ "claims": [{ ... }] }`. Should unwrap and succeed.
3. **Invalid JSON** — Mock LLM returning `"Here are the claims..."`. Should throw `LLM returned invalid JSON`.
4. **Missing required field** — Mock LLM returning `[{ claim: "x" }]` (no importance/novelty). Should throw schema validation error.
5. **Empty array** — Mock LLM returning `[]`. Should throw `min(1)` validation error.
6. **importance out of range** — Mock LLM returning claim with `importance: 15`. Should throw validation error.
7. **Markdown fences still stripped** — Mock LLM returning `` ```json\n[...]\n``` ``. Should parse correctly.

### Acceptance Criteria

- [ ] `zod` is in `package.json` dependencies
- [ ] `extractClaims` validates LLM output against `ClaimSchema` after JSON.parse
- [ ] Wrapped objects `{ claims: [...] }` are auto-unwrapped
- [ ] Invalid JSON throws descriptive error with first 200 chars of response
- [ ] Schema validation failures throw error listing up to 3 issues
- [ ] All 7 new tests pass
- [ ] Existing `distillation.test.ts` tests still pass

---

## Task 2: Consolidate DURATION_TIERS into Shared Constant (B3)

### Problem

`DURATION_TIERS = [1, 2, 3, 5, 7, 10, 15, 30]` is defined in 5 separate locations:
- `worker/lib/time-fitting.ts:5` (exported)
- `worker/lib/plan-limits.ts:5` (local)
- `src/lib/duration-tiers.ts:1` (exported)
- `src/components/podcast-card.tsx:14` (local)
- `src/pages/admin/requests.tsx:87` (local, and **wrong** — missing 2, 7, 30)

Route files (`podcasts.ts`, `briefings.ts`) import from `time-fitting.ts`, which is fine but semantically wrong — duration tiers are not a time-fitting concept.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/constants.ts` | **Create** — single source of truth for backend |
| `worker/lib/time-fitting.ts` | Remove `DURATION_TIERS`, `DurationTier`; import from constants |
| `worker/lib/plan-limits.ts` | Remove local `DURATION_TIERS`; import from constants; add `isValidDurationTier()` |
| `worker/routes/podcasts.ts` | Import from `constants.ts` instead of `time-fitting.ts` |
| `worker/routes/briefings.ts` | Import from `constants.ts` instead of `time-fitting.ts` |
| `src/lib/duration-tiers.ts` | Keep as frontend source; content unchanged |
| `src/components/podcast-card.tsx` | Remove local const; import from `src/lib/duration-tiers.ts` |
| `src/pages/admin/requests.tsx` | Remove local const; import from `src/lib/duration-tiers.ts` |
| `worker/lib/__tests__/time-fitting.test.ts` | Update imports |

### Implementation

**1. Create `worker/lib/constants.ts`:**

```typescript
/** Available duration tiers in minutes for episode clips. */
export const DURATION_TIERS = [1, 2, 3, 5, 7, 10, 15, 30] as const;

/** Union type of valid duration tier values. */
export type DurationTier = (typeof DURATION_TIERS)[number];

/** Type guard: checks if a number is a valid duration tier. */
export function isValidDurationTier(n: number): n is DurationTier {
  return (DURATION_TIERS as readonly number[]).includes(n);
}
```

**2. Update `worker/lib/time-fitting.ts`:**

Remove lines 1-8 (the `DURATION_TIERS`, `DurationTier` definitions). Add import:

```typescript
import { DURATION_TIERS, type DurationTier } from "./constants";
export { DURATION_TIERS, type DurationTier }; // re-export for backward compat
```

Keep `WORDS_PER_MINUTE` where it is (it's used by distillation.ts too, and semantically belongs with time-fitting or could later move to constants).

**3. Update `worker/lib/plan-limits.ts`:**

Remove line 5 (`const DURATION_TIERS = ...`). The file does not actually use `DURATION_TIERS` — it only defines it as dead local code. Delete it.

**4. Update route imports:**

In `worker/routes/podcasts.ts`, change:
```typescript
import { DURATION_TIERS } from "../lib/time-fitting";
```
to:
```typescript
import { isValidDurationTier, DURATION_TIERS } from "../lib/constants";
```

Replace the validation pattern:
```typescript
if (!body.durationTier || !(DURATION_TIERS as readonly number[]).includes(body.durationTier)) {
```
with:
```typescript
if (!body.durationTier || !isValidDurationTier(body.durationTier)) {
```

Same change in `worker/routes/briefings.ts`.

**5. Update frontend files:**

In `src/components/podcast-card.tsx`, remove line 14 (`const DURATION_TIERS = ...`) and add:
```typescript
import { DURATION_TIERS } from "../lib/duration-tiers";
```

In `src/pages/admin/requests.tsx`, remove line 87 (`const DURATION_TIERS = [1, 3, 5, 10, 15]`) and add:
```typescript
import { DURATION_TIERS } from "../../lib/duration-tiers";
```

### Tests to Add

In `worker/lib/__tests__/constants.test.ts` (new file):

1. **isValidDurationTier returns true for all valid tiers** — Loop through `[1, 2, 3, 5, 7, 10, 15, 30]`.
2. **isValidDurationTier returns false for invalid values** — Test `0`, `4`, `6`, `8`, `20`, `-1`, `100`.
3. **DURATION_TIERS is frozen** — Verify `Object.isFrozen(DURATION_TIERS)` (const assertion).
4. **DurationTier type** — Compile-time only; ensure `const x: DurationTier = 5` compiles and `const y: DurationTier = 4` does not (via `// @ts-expect-error` comment in test).

### Acceptance Criteria

- [ ] `worker/lib/constants.ts` is the single backend definition of `DURATION_TIERS`
- [ ] `isValidDurationTier()` is used in all route validation
- [ ] `plan-limits.ts` no longer has a local DURATION_TIERS
- [ ] `time-fitting.ts` imports from `constants.ts` (and re-exports for backward compat)
- [ ] Frontend files import from `src/lib/duration-tiers.ts`
- [ ] No file inlines the `[1, 2, 3, 5, 7, 10, 15, 30]` literal array
- [ ] `requests.tsx` now has the complete tier list (was missing 2, 7, 30)
- [ ] All existing tests pass with updated imports

---

## Task 3: Create Shared Queue Message Types (C2)

### Problem

Each queue handler defines its own message interface locally. The orchestrator and other producers construct these messages inline with no shared type. A field rename in the consumer breaks silently at runtime.

Current local types:
- `orchestrator.ts:5-10` — `OrchestratorMessage`
- `transcription.ts:14-18` — `TranscriptionMessage`
- `distillation.ts:13-17` — `DistillationMessage`
- `narrative-generation.ts:12-18` — `NarrativeGenerationMessage`
- `audio-generation.ts:14-19` — `AudioGenerationMessage`
- `briefing-assembly.ts:6-9` — `BriefingAssemblyMessage`

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/queue-messages.ts` | **Create** — shared message type definitions |
| `worker/queues/orchestrator.ts` | Remove local types; import from shared |
| `worker/queues/transcription.ts` | Remove local type; import from shared |
| `worker/queues/distillation.ts` | Remove local type; import from shared |
| `worker/queues/narrative-generation.ts` | Remove local type; import from shared |
| `worker/queues/audio-generation.ts` | Remove local type; import from shared |
| `worker/queues/briefing-assembly.ts` | Remove local type; import from shared |
| `worker/queues/index.ts` | Use proper message types instead of `as MessageBatch<any>` |

### Implementation

**1. Create `worker/lib/queue-messages.ts`:**

```typescript
/**
 * Shared queue message type definitions.
 *
 * Both producers (orchestrator, routes, feed-refresh) and consumers (queue handlers)
 * import from this file to ensure message shapes stay in sync.
 */

/** Orchestrator queue — pipeline control messages. */
export interface OrchestratorMessage {
  requestId: string;
  action: "evaluate" | "job-stage-complete" | "job-failed";
  jobId?: string;
  errorMessage?: string;
}

/** Briefing request item — stored as JSON in BriefingRequest.items. */
export interface BriefingRequestItem {
  podcastId: string;
  episodeId: string | null;
  durationTier: number;
  useLatest: boolean;
}

/** Transcription queue. */
export interface TranscriptionMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}

/** Distillation queue. */
export interface DistillationMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}

/** Narrative generation queue. */
export interface NarrativeGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}

/** Audio generation queue. */
export interface AudioGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}

/** Briefing assembly queue. */
export interface BriefingAssemblyMessage {
  requestId: string;
  type?: "manual";
}

/** Feed refresh queue. */
export interface FeedRefreshMessage {
  podcastId?: string;
  type?: "manual" | "cron";
}
```

**2. Update each queue handler:**

In each file, remove the local `interface XxxMessage { ... }` block and add:

```typescript
import type { TranscriptionMessage } from "../lib/queue-messages";
```

(Repeat for each handler with the appropriate type.)

In `orchestrator.ts`, also remove the local `BriefingRequestItem` interface and import it.

**3. Update `worker/queues/index.ts`:**

Replace `batch as MessageBatch<any>` casts with properly typed casts:

```typescript
import type {
  TranscriptionMessage,
  DistillationMessage,
  NarrativeGenerationMessage,
  AudioGenerationMessage,
  BriefingAssemblyMessage,
  OrchestratorMessage,
} from "../lib/queue-messages";

// In the switch:
case "transcription":
  return handleTranscription(batch as MessageBatch<TranscriptionMessage>, env, ctx);
case "distillation":
  return handleDistillation(batch as MessageBatch<DistillationMessage>, env, ctx);
// ... etc
```

**4. Update producers to import message types:**

In `worker/routes/podcasts.ts` and `worker/routes/briefings.ts`, wherever an orchestrator message is constructed:

```typescript
import type { OrchestratorMessage } from "../lib/queue-messages";

// Existing inline send is fine since TypeScript will check the literal against the type
// at the queue.send() call if we type the queue binding properly. For now, this
// creates documentation-level safety.
```

In `worker/queues/feed-refresh.ts`, add:
```typescript
import type { OrchestratorMessage } from "../lib/queue-messages";
```

### Tests to Add

No runtime tests needed — this is a pure type-level refactoring. Verify via:

1. `npm run typecheck` passes with zero errors.
2. All existing queue handler tests still pass (imports changed but behavior unchanged).

### Acceptance Criteria

- [ ] `worker/lib/queue-messages.ts` exists with all 7 message types + `BriefingRequestItem`
- [ ] No queue handler file defines its own message interface
- [ ] `worker/queues/index.ts` uses specific message types instead of `any`
- [ ] `npm run typecheck` passes
- [ ] All existing queue handler tests pass

---

## Task 4: Extract `resolveStageModel()` Helper (C3/R2)

### Problem

Four queue handlers repeat the same 4-step model resolution dance:
1. `getModelConfig(prisma, stage)` — get provider + model name
2. `getModelPricing(prisma, model, provider)` — get pricing info
3. `prisma.aiModelProvider.findFirst(...)` — look up `providerModelId`
4. `get{Type}ProviderImpl(provider)` — get the provider implementation

This is copy-pasted in `transcription.ts:186-197`, `distillation.ts:146-154`, `narrative-generation.ts:127-135`, `audio-generation.ts:128-136`.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/model-resolution.ts` | **Create** — unified model resolution helper |
| `worker/queues/transcription.ts` | Replace 4-step dance with `resolveStageModel()` call |
| `worker/queues/distillation.ts` | Same |
| `worker/queues/narrative-generation.ts` | Same |
| `worker/queues/audio-generation.ts` | Same |
| `worker/lib/__tests__/model-resolution.test.ts` | **Create** — unit tests |

### Implementation

**1. Create `worker/lib/model-resolution.ts`:**

```typescript
import { getModelConfig } from "./ai-models";
import { getModelPricing, type ModelPricing } from "./ai-usage";
import type { LlmProvider } from "./llm-providers";
import type { SttProvider } from "./stt-providers";
import type { TtsProvider } from "./tts-providers";
import type { AIStage } from "./ai-models";

export interface ResolvedModel {
  provider: string;
  model: string;
  providerModelId: string;
  pricing: ModelPricing | null;
}

/**
 * Resolves the AI model configuration for a pipeline stage.
 *
 * Combines the 4-step lookup pattern into a single call:
 * 1. Read stage config (provider + model name)
 * 2. Look up pricing from DB
 * 3. Resolve providerModelId from aiModelProvider table
 *
 * @throws Error if no model is configured for the stage
 */
export async function resolveStageModel(
  prisma: any,
  stage: AIStage
): Promise<ResolvedModel> {
  const config = await getModelConfig(prisma, stage);
  if (!config) {
    const stageNames: Record<AIStage, string> = {
      stt: "STT",
      distillation: "Distillation",
      narrative: "Narrative",
      tts: "TTS",
    };
    throw new Error(
      `No AI model configured for ${stageNames[stage]} stage -- configure one in Admin > Configuration`
    );
  }

  const { provider, model } = config;
  const pricing = await getModelPricing(prisma, model, provider);

  const dbProvider = await prisma.aiModelProvider.findFirst({
    where: { provider, model: { modelId: model } },
  });
  const providerModelId = dbProvider?.providerModelId ?? model;

  return { provider, model, providerModelId, pricing };
}
```

**2. Update `worker/queues/distillation.ts`:**

Remove:
```typescript
import { getModelConfig } from "../lib/ai-models";
import { getModelPricing } from "../lib/ai-usage";
import { getLlmProviderImpl } from "../lib/llm-providers";
```

Add:
```typescript
import { resolveStageModel } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
```

Replace lines 146-154:
```typescript
const distillationConfig = await getModelConfig(prisma, "distillation");
if (!distillationConfig) throw new Error("No AI model configured for Distillation stage -- configure one in Admin > Configuration");
const { provider: distillationProvider, model: distillationModel } = distillationConfig;
const distillationPricing = await getModelPricing(prisma, distillationModel, distillationProvider);
const dbDistProvider = await prisma.aiModelProvider.findFirst({
  where: { provider: distillationProvider, model: { modelId: distillationModel } },
});
const distProviderModelId = dbDistProvider?.providerModelId ?? distillationModel;
const llm = getLlmProviderImpl(distillationProvider);
```

With:
```typescript
const resolved = await resolveStageModel(prisma, "distillation");
const llm = getLlmProviderImpl(resolved.provider);
```

Then use `resolved.providerModelId` and `resolved.pricing` where `distProviderModelId` and `distillationPricing` were used.

**3. Apply same pattern to `narrative-generation.ts`, `audio-generation.ts`, `transcription.ts`:**

Each replaces their 4-step block with:
```typescript
const resolved = await resolveStageModel(prisma, "narrative"); // or "tts" or "stt"
const impl = getLlmProviderImpl(resolved.provider); // or getTtsProviderImpl / getProviderImpl
```

For transcription, the resolve call is inside the Tier 3 STT fallback branch (line 186). Only replace that specific block.

### Tests to Add

In `worker/lib/__tests__/model-resolution.test.ts`:

1. **Happy path** — Mock `getModelConfig` returning `{ provider: "openai", model: "gpt-4o" }`, mock `getModelPricing` returning pricing, mock `prisma.aiModelProvider.findFirst` returning `{ providerModelId: "gpt-4o-2024-08-06" }`. Verify all fields in result.
2. **No config** — Mock `getModelConfig` returning `null`. Should throw with stage name in message.
3. **No DB provider row** — Mock `findFirst` returning `null`. Should fall back: `providerModelId === model`.
4. **No pricing** — Mock `getModelPricing` returning `null`. Should return `pricing: null`.

### Acceptance Criteria

- [ ] `worker/lib/model-resolution.ts` exists with `resolveStageModel()`
- [ ] All 4 queue handlers use `resolveStageModel()` instead of inline 4-step pattern
- [ ] Each handler no longer imports `getModelConfig` or `getModelPricing` directly
- [ ] Error messages still reference the human-readable stage name
- [ ] All 4 model-resolution tests pass
- [ ] All existing queue handler tests pass

---

## Task 5: Extract Pipeline Stage Handler Boilerplate (R1)

### Problem

The four AI stage handlers (`transcription.ts`, `distillation.ts`, `narrative-generation.ts`, `audio-generation.ts`) each repeat ~50 lines of identical lifecycle boilerplate:

1. `createPrismaClient(env.HYPERDRIVE)` + try/finally `$disconnect()`
2. `createPipelineLogger({ stage, prisma })`
3. `checkStageEnabled(prisma, batch, STAGE, log)`
4. For each message: load job, update to `IN_PROGRESS`, create `PipelineStep`, do work, update step, notify orchestrator
5. On error: update step to `FAILED`, notify orchestrator `job-failed`

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/stage-handler.ts` | **Create** — shared stage handler wrapper |
| `worker/queues/distillation.ts` | Refactor to use `runStageHandler()` |
| `worker/queues/narrative-generation.ts` | Same |
| `worker/queues/audio-generation.ts` | Same |
| `worker/queues/transcription.ts` | Partial — transcription has unique cache logic, so only extract the outer shell |

### Implementation

**1. Create `worker/lib/stage-handler.ts`:**

```typescript
import { createPrismaClient } from "./db";
import { createPipelineLogger } from "./logger";
import { checkStageEnabled } from "./queue-helpers";
import { writeEvent } from "./pipeline-events";
import type { Env } from "../types";

/** Context provided to the stage-specific processing function. */
export interface StageContext {
  prisma: any;
  env: Env;
  log: ReturnType<typeof createPipelineLogger> extends Promise<infer T> ? T : never;
  job: { id: string; requestId: string; episodeId: string; durationTier: number; [key: string]: any };
  step: { id: string };
  startTime: number;
  writeEvent: (level: string, message: string, data?: Record<string, unknown>) => Promise<void>;
}

/** Result returned by the stage processor. */
export interface StageResult {
  /** WorkProduct ID to link to the step */
  workProductId?: string;
  /** AI usage metrics to record on the step */
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number | null;
  };
  /** If true, the step was a cache hit — mark as SKIPPED */
  cached?: boolean;
}

type StageProcessor<TMsg> = (
  ctx: StageContext,
  message: TMsg
) => Promise<StageResult>;

/**
 * Wraps a pipeline stage handler with standardized lifecycle management.
 *
 * Handles: Prisma client creation/teardown, logging, stage-enabled check,
 * job status transitions, PipelineStep creation, error handling, and
 * orchestrator notification.
 *
 * @param stageName - Prisma PipelineStage enum value (e.g. "DISTILLATION")
 * @param logName - Human-readable stage name for logs (e.g. "distillation")
 * @param processFn - Stage-specific processing function
 */
export function createStageHandler<TMsg extends { jobId: string; episodeId: string; type?: "manual" }>(
  stageName: string,
  logName: string,
  processFn: StageProcessor<TMsg>
) {
  return async function handler(
    batch: MessageBatch<TMsg>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const prisma = createPrismaClient(env.HYPERDRIVE);

    try {
      const log = await createPipelineLogger({ stage: logName, prisma });
      log.info("batch_start", { messageCount: batch.messages.length });

      if (!(await checkStageEnabled(prisma, batch, stageName, log))) return;

      for (const msg of batch.messages) {
        const { jobId, episodeId } = msg.body;
        const startTime = Date.now();
        let stepId: string | undefined;
        let requestId: string | undefined;

        try {
          // Load job
          const job = await prisma.pipelineJob.findUniqueOrThrow({
            where: { id: jobId },
          });
          requestId = job.requestId;

          // Update job status
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "IN_PROGRESS" },
          });

          // Create PipelineStep
          const step = await prisma.pipelineStep.create({
            data: {
              jobId,
              stage: stageName,
              status: "IN_PROGRESS",
              startedAt: new Date(),
            },
          });
          stepId = step.id;

          // Run stage-specific processing
          const result = await processFn(
            {
              prisma,
              env,
              log,
              job,
              step,
              startTime,
              writeEvent: (level, message, data) =>
                writeEvent(prisma, step.id, level, message, data),
            },
            msg.body
          );

          // Update step based on result
          const completedAt = new Date();
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: result.cached ? "SKIPPED" : "COMPLETED",
              cached: result.cached ?? false,
              completedAt,
              durationMs: Date.now() - startTime,
              ...(result.workProductId ? { workProductId: result.workProductId } : {}),
              ...(result.usage ? {
                model: result.usage.model,
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                cost: result.usage.cost,
              } : {}),
            },
          });

          // Notify orchestrator
          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
          });

          msg.ack();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          // Mark step as FAILED
          await prisma.pipelineStep
            .updateMany({
              where: { jobId, stage: stageName, status: "IN_PROGRESS" },
              data: {
                status: "FAILED",
                errorMessage,
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
              },
            })
            .catch(() => {});

          // Write error event
          if (stepId) {
            await writeEvent(prisma, stepId, "ERROR", `${logName} failed: ${errorMessage}`).catch(() => {});
          }

          log.error("episode_error", { episodeId, jobId }, err);

          // Notify orchestrator of failure
          if (requestId) {
            await env.ORCHESTRATOR_QUEUE.send({
              requestId,
              action: "job-failed",
              jobId,
              errorMessage,
            }).catch(() => {});
          }

          msg.ack();
        }
      }
    } finally {
      ctx.waitUntil(prisma.$disconnect());
    }
  };
}
```

**2. Refactor `worker/queues/distillation.ts` as the reference example:**

Replace the entire 267-line file with ~80 lines:

```typescript
import { createStageHandler, type StageContext, type StageResult } from "../lib/stage-handler";
import { extractClaims } from "../lib/distillation";
import { resolveStageModel } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct } from "../lib/work-products";
import type { DistillationMessage } from "../lib/queue-messages";

async function processDistillation(
  ctx: StageContext,
  message: DistillationMessage
): Promise<StageResult> {
  const { prisma, env, log, job, step, writeEvent } = ctx;
  const { episodeId } = message;

  await writeEvent("INFO", "Checking cache for completed distillation");

  // Cache check
  const existing = await prisma.distillation.findUnique({ where: { episodeId } });

  if (existing?.status === "COMPLETED") {
    await writeEvent("INFO", "Cache hit -- completed distillation found, skipping");

    let existingWp = await prisma.workProduct.findFirst({
      where: { type: "CLAIMS", episodeId },
    });

    if (!existingWp && existing.claimsJson) {
      const claimsStr = JSON.stringify(existing.claimsJson);
      const r2Key = wpKey({ type: "CLAIMS", episodeId });
      await putWorkProduct(env.R2, r2Key, claimsStr);
      existingWp = await prisma.workProduct.create({
        data: {
          type: "CLAIMS", episodeId, r2Key,
          sizeBytes: new TextEncoder().encode(claimsStr).byteLength,
          metadata: {
            claimCount: Array.isArray(existing.claimsJson) ? (existing.claimsJson as any[]).length : 0,
            hasExcerpts: Array.isArray(existing.claimsJson) && (existing.claimsJson as any[]).length > 0 && "excerpt" in (existing.claimsJson as any[])[0],
          },
        },
      });
    }

    await prisma.pipelineJob.update({
      where: { id: job.id },
      data: { distillationId: existing.id },
    });

    return { cached: true, workProductId: existingWp?.id };
  }

  if (!existing?.transcript) {
    await writeEvent("ERROR", "No transcript available -- transcription stage must run first");
    throw new Error("No transcript available -- run transcription first");
  }

  await prisma.distillation.update({
    where: { id: existing.id },
    data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
  });

  // Resolve model and extract claims
  const resolved = await resolveStageModel(prisma, "distillation");
  const llm = getLlmProviderImpl(resolved.provider);
  await writeEvent("INFO", `Sending transcript to ${llm.name} (${resolved.providerModelId}) for claim extraction`);

  const elapsed = log.timer("claude_extraction");
  const { claims, usage: claimsUsage } = await extractClaims(llm, existing.transcript, resolved.providerModelId, 8192, env, resolved.pricing);
  elapsed();

  await writeEvent("INFO", `Extracted ${claims.length} claims from transcript`);
  log.info("claims_extracted", { episodeId, claimCount: claims.length });

  // Save results
  await prisma.distillation.update({
    where: { id: existing.id },
    data: { status: "COMPLETED", claimsJson: claims as any },
  });

  const claimsJson = JSON.stringify(claims);
  const r2Key = wpKey({ type: "CLAIMS", episodeId });
  await putWorkProduct(env.R2, r2Key, claimsJson);
  const wp = await prisma.workProduct.create({
    data: {
      type: "CLAIMS", episodeId, r2Key,
      sizeBytes: new TextEncoder().encode(claimsJson).byteLength,
      metadata: { claimCount: claims.length, hasExcerpts: claims.length > 0 && "excerpt" in claims[0] },
    },
  });

  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: { distillationId: existing.id },
  });

  return {
    workProductId: wp.id,
    usage: { model: claimsUsage.model, inputTokens: claimsUsage.inputTokens, outputTokens: claimsUsage.outputTokens, cost: claimsUsage.cost },
  };
}

export const handleDistillation = createStageHandler<DistillationMessage>(
  "DISTILLATION",
  "distillation",
  processDistillation
);
```

**3. Apply same pattern to `narrative-generation.ts` and `audio-generation.ts`.**

Each becomes: import `createStageHandler`, define a `processXxx` function containing only the stage-specific logic (cache check + AI call + save), and export `handleXxx = createStageHandler(...)`.

**4. For `transcription.ts` — partial extraction only.**

Transcription is more complex (3-tier waterfall, unique error handling for distillation upsert). Two options:
- **Option A:** Use `createStageHandler` but with a much larger `processFn` that contains the waterfall logic. The outer boilerplate (Prisma, logging, step creation, error handling) is still deduplicated.
- **Option B:** Leave transcription as-is for now. It benefits less since its cache check and error handling have unique branches (distillation upsert on failure).

**Recommendation:** Option A. Even though `processFn` is large, the outer boilerplate (~50 lines) is still removed and the error handling is standardized. The distillation-upsert-on-failure can move to a `try/catch` inside `processFn` that rethrows after the upsert.

### Tests to Add

In `worker/lib/__tests__/stage-handler.test.ts`:

1. **Happy path** — `processFn` returns `{ workProductId: "wp1", usage: {...} }`. Verify: PipelineStep created with `IN_PROGRESS`, then updated to `COMPLETED` with usage fields. Orchestrator notified with `job-stage-complete`.
2. **Cache hit** — `processFn` returns `{ cached: true }`. Verify step marked `SKIPPED` with `cached: true`.
3. **Stage disabled** — Mock `checkStageEnabled` returning false. Verify no processing, all messages acked.
4. **ProcessFn throws** — Verify step marked `FAILED`, orchestrator notified `job-failed`, error event written, message acked.
5. **Job not found** — Mock `findUniqueOrThrow` throwing. Verify error handling fires.

### Acceptance Criteria

- [ ] `worker/lib/stage-handler.ts` exists with `createStageHandler()`
- [ ] `distillation.ts`, `narrative-generation.ts`, `audio-generation.ts` use `createStageHandler`
- [ ] `transcription.ts` uses `createStageHandler` (Option A) or is documented as intentionally not using it (Option B)
- [ ] Each refactored handler is reduced by ~50+ lines
- [ ] All 5 stage-handler unit tests pass
- [ ] All existing queue handler tests pass (behavior unchanged)
- [ ] Error messages and orchestrator notifications are identical to pre-refactor

---

## Task 6: Fix New-Episode Detection Heuristic (B2)

### Problem

`worker/queues/feed-refresh.ts:112` detects new episodes via:
```typescript
const isNew = Date.now() - new Date(episode.createdAt).getTime() < 60_000;
```

This 60-second window is fragile: slow DB operations, clock skew, or batch processing delays can cause false negatives (missing new episodes) or false positives (re-processing old ones during a cold start).

### Files to Modify

| File | Action |
|------|--------|
| `worker/queues/feed-refresh.ts` | Replace timestamp heuristic with GUID-based detection |
| `worker/queues/__tests__/feed-refresh.test.ts` | Add tests for new-episode detection |

### Implementation

**Replace the timestamp heuristic with a pre-fetch set of existing GUIDs.**

Before the episode upsert loop (before line 87), query existing episode GUIDs for this podcast:

```typescript
// Collect existing GUIDs for this podcast to detect truly new episodes
const existingEpisodes = await prisma.episode.findMany({
  where: { podcastId: podcast.id },
  select: { guid: true },
});
const existingGuids = new Set(existingEpisodes.map((e: any) => e.guid));
```

Then replace lines 111-115:
```typescript
// Detect new episodes: createdAt within last 60 seconds
const isNew = Date.now() - new Date(episode.createdAt).getTime() < 60_000;
if (isNew) {
  newEpisodeIds.push(episode.id);
}
```

With:
```typescript
// New episode = GUID wasn't in the database before this refresh
if (!existingGuids.has(ep.guid)) {
  newEpisodeIds.push(episode.id);
}
```

This approach:
- Is deterministic (no timing dependency)
- Works correctly even if upsert matches an existing record
- Costs one extra query per podcast (small: just GUIDs), but eliminates all timing bugs

### Tests to Add

In `worker/queues/__tests__/feed-refresh.test.ts`:

1. **New episode detected** — Mock `findMany` for episodes returning empty set (no existing GUIDs). Feed has 2 episodes. Verify both are detected as new and subscriber pipeline is dispatched.
2. **Existing episode not re-processed** — Mock `findMany` returning `[{ guid: "ep-1" }]`. Feed has `ep-1` and `ep-2`. Verify only `ep-2` is detected as new.
3. **All episodes existing** — All feed GUIDs already in DB. Verify `newEpisodeIds` is empty and no subscriber dispatch happens.

### Acceptance Criteria

- [ ] No `60_000` or `Date.now()` comparison in feed-refresh episode detection
- [ ] Detection uses GUID pre-fetch set
- [ ] Existing episodes are never re-dispatched to pipeline
- [ ] New episodes are always detected regardless of timing
- [ ] All 3 new tests pass
- [ ] All existing feed-refresh tests pass

---

## Task 7: Validate RSS Feed Episode Fields (B8)

### Problem

`worker/lib/rss-parser.ts:97` maps RSS items to `ParsedEpisode` without validating required fields. Episodes with empty titles, missing GUIDs, or invalid dates are returned as-is. The downstream `feed-refresh.ts` filters on `ep.guid && ep.audioUrl` (line 88), but other consumers may not.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/rss-parser.ts` | Add per-episode validation, skip invalid entries |
| `worker/lib/__tests__/rss-parser.test.ts` | Add validation test cases |

### Implementation

**1. Add a validation filter after the `items.map()` in `parseRssFeed` (after line 126):**

Replace:
```typescript
const episodes: ParsedEpisode[] = items.map((item: any) => {
  // ... existing mapping ...
  return { title, description, audioUrl, publishedAt, durationSeconds, guid, transcriptUrl };
});
```

With:
```typescript
const episodes: ParsedEpisode[] = [];

for (const item of items) {
  // ... existing mapping logic (unchanged) ...

  const episode: ParsedEpisode = {
    title: item.title ?? "",
    description: item.description ?? item["itunes:summary"] ?? "",
    audioUrl: item.enclosure?.["@_url"] ?? "",
    publishedAt: item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString(),
    durationSeconds: parseDuration(item["itunes:duration"]),
    guid,
    transcriptUrl,
  };

  // Validate required fields — skip episodes that are unusable
  if (!episode.guid) continue;  // No GUID = no dedup key, skip
  if (!episode.audioUrl) continue;  // No audio URL = nothing to process, skip
  if (!episode.title) episode.title = "Untitled Episode";  // Fallback for display

  // Validate date — replace garbage dates with null-safe fallback
  if (episode.publishedAt === "Invalid Date" || isNaN(new Date(episode.publishedAt).getTime())) {
    episode.publishedAt = new Date().toISOString();
  }

  episodes.push(episode);
}
```

This matches the existing downstream filter in `feed-refresh.ts:88` (`if (!ep.guid || !ep.audioUrl) continue`) but moves the validation to the parser where it belongs, and handles additional edge cases (invalid dates, missing titles).

**2. Remove the redundant filter in `feed-refresh.ts:88`:**

The line `if (!ep.guid || !ep.audioUrl) continue;` is now redundant since the parser guarantees these fields. However, keep it as a belt-and-suspenders guard but add a comment:

```typescript
// Belt-and-suspenders: parser already filters these, but guard against malformed input
if (!ep.guid || !ep.audioUrl) continue;
```

### Tests to Add

In `worker/lib/__tests__/rss-parser.test.ts`:

1. **Episode with missing guid is skipped** — RSS item has no `guid` element. Verify it is not in the returned episodes array.
2. **Episode with missing enclosure is skipped** — No `enclosure` tag. Verify skipped.
3. **Episode with empty title gets fallback** — Title is `""`. Verify title becomes `"Untitled Episode"`.
4. **Episode with invalid pubDate gets current date** — `pubDate` is `"not a date"`. Verify `publishedAt` is a valid ISO string.
5. **Valid episode passes through** — Normal episode with all fields. Verify all fields mapped correctly.
6. **Mixed valid/invalid episodes** — Feed with 3 items (1 valid, 1 no guid, 1 no audio). Verify exactly 1 episode returned.

### Acceptance Criteria

- [ ] `parseRssFeed` skips episodes with no GUID or no audio URL
- [ ] Empty titles get `"Untitled Episode"` fallback
- [ ] Invalid dates are replaced with current date
- [ ] Valid episodes are unchanged
- [ ] All 6 new tests pass
- [ ] All existing `rss-parser.test.ts` tests pass

---

## Task 8: Remove Legacy clip-cache.ts Dual-Write (R4)

### Problem

`worker/queues/audio-generation.ts:147` writes audio to the legacy `clips/` R2 prefix via `putClip()`, then immediately writes the same data to `wp/clip/` via `putWorkProduct()`. This doubles R2 storage and creates a consistency risk. The clip route (`worker/routes/clips.ts:15`) reads from the `clips/` prefix.

### Files to Modify

| File | Action |
|------|--------|
| `worker/queues/audio-generation.ts` | Remove `putClip()` call; update `audioKey` to use `wp/` path |
| `worker/routes/clips.ts` | Read from `wp/clip/` path with `clips/` fallback |
| `worker/lib/clip-cache.ts` | Delete file (or mark deprecated with TODO) |
| `worker/lib/__tests__/clip-cache.test.ts` | Delete or update |

### Implementation

**1. Update `worker/queues/audio-generation.ts`:**

Remove import:
```typescript
import { putClip } from "../lib/clip-cache";
```

Remove the legacy write (line 147):
```typescript
// Store in R2 (legacy path)
await putClip(env.R2, episodeId, durationTier, audio);
```

Update `audioKey` (line 166) to use the WorkProduct path:
```typescript
// Before:
const audioKey = `clips/${episodeId}/${durationTier}.mp3`;

// After:
const audioKey = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: "default" });
```

The `audioKey` stored on the Clip record is used by `clips.ts` to locate the audio. By changing it to the `wp/` path, the route will find it there.

**2. Update `worker/routes/clips.ts` to support both old and new paths:**

```typescript
clips.get("/:episodeId/:durationTier", async (c) => {
  const episodeId = c.req.param("episodeId");
  const durationTier = c.req.param("durationTier").replace(/\.mp3$/, "");

  // Try new WorkProduct path first, fall back to legacy path for pre-migration clips
  const wpPath = `wp/clip/${episodeId}/${durationTier}/default.mp3`;
  const legacyPath = `clips/${episodeId}/${durationTier}.mp3`;

  let obj = await c.env.R2.get(wpPath);
  if (!obj) {
    obj = await c.env.R2.get(legacyPath);
  }
  if (!obj) {
    return c.json({ error: "Clip not found" }, 404);
  }

  const body = await obj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
```

**3. Delete `worker/lib/clip-cache.ts`:**

The `putBriefing` and `briefingKey` functions are not used anywhere (the master plan Phase 5A will use `wp/briefing/` path). The `getClip` function is also unused. Delete the entire file.

**4. Delete or update `worker/lib/__tests__/clip-cache.test.ts`:**

If tests exist, delete them since the module is gone.

### Tests to Add

In `worker/routes/__tests__/clips.test.ts` (new or existing):

1. **Serves from wp/ path** — Mock R2.get for `wp/clip/ep1/5/default.mp3` returning audio. Verify 200 response with `audio/mpeg` content type.
2. **Falls back to legacy path** — Mock R2.get for `wp/` returning null, `clips/` returning audio. Verify still serves.
3. **404 when neither exists** — Both paths return null. Verify 404.

### Acceptance Criteria

- [ ] `audio-generation.ts` no longer imports or calls `putClip()`
- [ ] `Clip.audioKey` is set to the `wp/clip/...` path for new clips
- [ ] `clips.ts` route tries `wp/` path first, falls back to `clips/` for legacy data
- [ ] `clip-cache.ts` is deleted
- [ ] No other file imports from `clip-cache.ts`
- [ ] All 3 new clip route tests pass
- [ ] Existing audio-generation tests pass

---

## Task 9: Consolidate Stage Name Maps (B11/R3)

### Problem

Three separate stage-name maps exist across the codebase:

1. `worker/lib/config.ts:46-52` — `STAGE_NAMES` (5 entries, no CLIP_GENERATION)
2. `worker/lib/config.ts:55-62` — `STAGE_DISPLAY_NAMES` (6 entries, includes CLIP_GENERATION)
3. `worker/routes/admin/dashboard.ts:217-224` — `STAGE_LABELS` (6 entries, lowercase "generation"/"assembly")
4. `src/lib/ai-models.ts:8-13` — `STAGE_LABELS` (4 entries, keyed by AIStage: stt/distillation/narrative/tts)

The first three overlap with inconsistent capitalization. The fourth uses different keys entirely.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/constants.ts` | Add `PIPELINE_STAGE_NAMES` (single authoritative map for PipelineStage enum values) |
| `worker/lib/config.ts` | Remove `STAGE_NAMES` and `STAGE_DISPLAY_NAMES`; add deprecation re-export or just remove |
| `worker/routes/admin/dashboard.ts` | Remove local `STAGE_LABELS`; import from constants |
| All importers of `STAGE_NAMES`/`STAGE_DISPLAY_NAMES` | Update imports |

### Implementation

**1. Add to `worker/lib/constants.ts` (created in Task 2):**

```typescript
/**
 * Pipeline stage enum value -> human-readable display name.
 * Keyed by Prisma PipelineStage enum values.
 * Includes CLIP_GENERATION for legacy data display.
 */
export const PIPELINE_STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation",  // legacy
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};
```

**2. Update `worker/lib/config.ts`:**

Remove `STAGE_NAMES` (lines 46-52) and `STAGE_DISPLAY_NAMES` (lines 55-62) entirely.

**3. Update all importers:**

Find all files importing `STAGE_NAMES` or `STAGE_DISPLAY_NAMES` from config:

```bash
grep -r "STAGE_NAMES\|STAGE_DISPLAY_NAMES" worker/ --include="*.ts" -l
```

- `worker/routes/admin/dashboard.ts` — Replace `import { STAGE_DISPLAY_NAMES } from "../../lib/config"` with `import { PIPELINE_STAGE_NAMES } from "../../lib/constants"`. Replace `STAGE_DISPLAY_NAMES[...]` with `PIPELINE_STAGE_NAMES[...]`.
- Remove the local `STAGE_LABELS` block from dashboard.ts (lines 217-224) and replace its usages with `PIPELINE_STAGE_NAMES`.
- Any other files importing `STAGE_NAMES` from config: update to import `PIPELINE_STAGE_NAMES` from constants.

**4. Leave `src/lib/ai-models.ts` `STAGE_LABELS` untouched:**

It uses different keys (`stt`, `distillation`, `narrative`, `tts`) which are the AI config stage keys, not Prisma enum values. This is a separate namespace and should stay. The `worker/lib/ai-models.ts` re-exports it for backend use, which is fine.

### Tests to Add

No new tests needed. Verify:
1. `npm run typecheck` passes
2. `worker/routes/admin/__tests__/dashboard.test.ts` passes
3. Any test referencing `STAGE_NAMES` or `STAGE_DISPLAY_NAMES` is updated

### Acceptance Criteria

- [ ] `PIPELINE_STAGE_NAMES` is the single backend map for PipelineStage enum -> display name
- [ ] `STAGE_NAMES` and `STAGE_DISPLAY_NAMES` are removed from `config.ts`
- [ ] Dashboard.ts local `STAGE_LABELS` is removed
- [ ] All importers updated
- [ ] `npm run typecheck` and all tests pass

---

## Task 10: Remove Dead Code (R10)

### Problem

Several modules and enum values are no longer used:

1. **`worker/lib/time-fitting.ts`** — `allocateWordBudget()`, `nearestTier()`, `EpisodeInput`, `WordAllocation`, `INTRO_WORDS`, `OUTRO_WORDS`, `TRANSITION_WORDS`, `MIN_SEGMENT_WORDS` are unused. The pipeline processes single episodes per job; multi-episode word budget allocation never shipped. However, `DURATION_TIERS` and `DurationTier` are used (now re-exported from `constants.ts` per Task 2).

2. **`PipelineStage.CLIP_GENERATION`** in Prisma schema — Legacy enum value. Existing data may reference it (in `PipelineStep.stage`, `PipelineJob.currentStage`), so it cannot be removed from the DB without a migration. But references in application code should be removed.

3. **`mp3-concat.ts`** — **NOT dead code.** Needed for Phase 5A (briefing audio assembly). Keep it.

### Files to Modify

| File | Action |
|------|--------|
| `worker/lib/time-fitting.ts` | Remove unused exports; keep only re-exports from constants |
| `worker/lib/__tests__/time-fitting.test.ts` | Remove tests for deleted functions |
| `worker/lib/constants.ts` | Ensure `PIPELINE_STAGE_NAMES` has a `CLIP_GENERATION` entry (for legacy display) |
| `prisma/schema.prisma` | Add clearer comment on `CLIP_GENERATION` explaining it is DB-only legacy |

### Implementation

**1. Slim down `worker/lib/time-fitting.ts`:**

The file currently exports: `WORDS_PER_MINUTE`, `DURATION_TIERS`, `DurationTier`, `nearestTier`, `EpisodeInput`, `WordAllocation`, `allocateWordBudget`, `INTRO_WORDS`, `OUTRO_WORDS`, `TRANSITION_WORDS`, `MIN_SEGMENT_WORDS`.

After Task 2, `DURATION_TIERS` and `DurationTier` are re-exported from `constants.ts`. Check if anything imports `WORDS_PER_MINUTE` from this file:

- `worker/lib/distillation.ts:5` imports `WORDS_PER_MINUTE` from itself (line 5 — wait, distillation.ts defines its own `WORDS_PER_MINUTE` on line 5). Check if there is a cross-import.

Looking at the code: `distillation.ts:5` defines `export const WORDS_PER_MINUTE = 150;` locally. And `time-fitting.ts:2` also defines `export const WORDS_PER_MINUTE = 150;`. These are duplicated but independent. No cross-import.

Check all imports of `time-fitting.ts`:

```bash
grep -r "from.*time-fitting" worker/ src/ --include="*.ts"
```

Expected results: `podcasts.ts`, `briefings.ts` (import `DURATION_TIERS`), test file. After Task 2, those import from `constants.ts` instead.

If no remaining imports of time-fitting functions exist, the file can be reduced to just re-exports (for backward compat) or deleted entirely. Since Task 2 already re-exports from time-fitting, and we want to remove the dead functions:

Replace `worker/lib/time-fitting.ts` with:

```typescript
/**
 * Time-fitting utilities.
 *
 * DURATION_TIERS and DurationTier have moved to constants.ts.
 * Re-exported here for backward compatibility.
 *
 * allocateWordBudget, nearestTier, and related multi-episode
 * allocation functions were removed (unused — pipeline processes
 * single episodes per job).
 */
export { DURATION_TIERS, type DurationTier } from "./constants";

/** Words spoken per minute for podcast-style narration. */
export const WORDS_PER_MINUTE = 150;
```

**2. Update `worker/lib/__tests__/time-fitting.test.ts`:**

Remove all tests for `allocateWordBudget`, `nearestTier`, `EpisodeInput`, `WordAllocation`, etc. Keep only:
- Test that `DURATION_TIERS` re-export works (imported from time-fitting, verify values)
- Test that `WORDS_PER_MINUTE` equals 150

Or if the test file only tests `allocateWordBudget` and `nearestTier`, delete it and rely on `constants.test.ts` (from Task 2).

**3. Prisma schema comment:**

In `prisma/schema.prisma`, update the `CLIP_GENERATION` line:

```prisma
enum PipelineStage {
  TRANSCRIPTION
  DISTILLATION
  CLIP_GENERATION // DEPRECATED: legacy value from pre-v2 pipeline. Kept for existing DB rows only. Do not use in new code.
  NARRATIVE_GENERATION
  AUDIO_GENERATION
  BRIEFING_ASSEMBLY
}
```

**4. Remove `CLIP_GENERATION` references in application code:**

Search for `CLIP_GENERATION` in TypeScript files:

- `worker/lib/config.ts` — Was in `STAGE_DISPLAY_NAMES` (already removed in Task 9; now in `PIPELINE_STAGE_NAMES` in `constants.ts` with a `// legacy` comment)
- `worker/routes/admin/dashboard.ts` — Was in local `STAGE_LABELS` (already removed in Task 9)
- `worker/queues/index.ts:46-51` — Queue name `"clip-generation"` maps to `handleAudioGeneration`. This is a runtime queue name from `wrangler.jsonc`, NOT the enum. Keep it.

No application code actively uses the `PipelineStage.CLIP_GENERATION` enum value to write data, so no code changes needed beyond what Task 9 already handles.

### Tests to Add

No new tests beyond what Tasks 2 and 9 already add. Verify:
1. `npm run typecheck` passes (no imports of removed exports)
2. All existing tests pass or are updated

### Acceptance Criteria

- [ ] `time-fitting.ts` contains only `WORDS_PER_MINUTE` and re-exports of `DURATION_TIERS`/`DurationTier`
- [ ] `allocateWordBudget`, `nearestTier`, `EpisodeInput`, `WordAllocation`, and overhead constants are removed
- [ ] `time-fitting.test.ts` is updated (or removed) to match
- [ ] `mp3-concat.ts` is NOT deleted (needed for Phase 5A)
- [ ] `CLIP_GENERATION` has a clear deprecation comment in the Prisma schema
- [ ] `npm run typecheck` passes
- [ ] All tests pass

---

## Execution Order

### Parallel Batch 1 (no dependencies)

| Task | Estimated Time | Agent |
|------|---------------|-------|
| Task 1 — Zod validation | 1.5h | Agent A |
| Task 2 — DURATION_TIERS consolidation | 1h | Agent B |
| Task 3 — Queue message types | 1h | Agent C |
| Task 4 — resolveStageModel() | 1h | Agent D |
| Task 6 — Feed-refresh detection | 0.5h | Agent E |
| Task 7 — RSS validation | 0.5h | Agent F |
| Task 9 — Stage name maps | 0.5h | Agent G |

### Sequential Batch 2 (depends on Batch 1)

| Task | Depends On | Estimated Time |
|------|-----------|---------------|
| Task 5 — Stage handler boilerplate | Tasks 3, 4 | 2h |
| Task 8 — clip-cache removal | None (but easier after Task 5) | 0.5h |
| Task 10 — Dead code removal | Tasks 2, 9 | 0.5h |

### Verification

After all tasks:

```bash
npm run typecheck              # Zero errors
npm test                       # All tests pass
npm run build                  # Production build succeeds
```

---

## Risk Notes

1. **Task 5 (stage handler) is the highest-risk change.** It touches all 4 queue handlers simultaneously. If the abstraction doesn't fit transcription's unique needs, fall back to Option B (leave transcription as-is).

2. **Task 8 (clip-cache removal) requires checking production R2 data.** Existing clips are stored at `clips/` prefix. The fallback in `clips.ts` handles this, but a data migration (copying `clips/*` to `wp/clip/*`) should be planned for later to eliminate the fallback.

3. **Task 1 (Zod) adds a new dependency.** Zod is ~50KB gzipped. Verify it doesn't blow the Workers bundle size limit (10MB uncompressed). It should be fine — the current bundle is well under that.

4. **Task 10 removes `allocateWordBudget` which has tests.** Confirm no code path calls it before deleting. Search: `grep -r "allocateWordBudget\|nearestTier" worker/ src/ --include="*.ts"` (excluding test files and time-fitting.ts itself).

5. **Task 3 is type-only with no runtime behavior change.** It is safe but must be verified against the full test suite to catch any typing regressions from the `any` -> specific type transitions in `index.ts`.
