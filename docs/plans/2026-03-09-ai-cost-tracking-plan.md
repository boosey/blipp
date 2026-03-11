# AI Cost Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track actual AI model usage costs per pipeline step, with aggregated views per request, per stage, and per model over time periods.

**Architecture:** Add `model`, `inputTokens`, `outputTokens` fields to `PipelineStep`. Modify AI helper functions to return usage metadata alongside results. Queue handlers write usage to PipelineStep on completion. Enhance analytics API with per-model and per-stage aggregation endpoints. Update admin frontend with new views.

**Tech Stack:** Prisma schema migration, TypeScript, Hono API routes, React + Recharts

---

### Task 1: Add schema fields to PipelineStep

**Files:**
- Modify: `prisma/schema.prisma:263-282` (PipelineStep model)

**Step 1: Add fields to PipelineStep model**

In `prisma/schema.prisma`, add three fields to `PipelineStep` after the `cost` field (line 275):

```prisma
model PipelineStep {
  id            String             @id @default(cuid())
  jobId         String
  stage         PipelineStage
  status        PipelineStepStatus @default(PENDING)
  cached        Boolean            @default(false)
  input         Json?
  output        Json?
  errorMessage  String?
  startedAt     DateTime?
  completedAt   DateTime?
  durationMs    Int?
  cost          Float?
  model         String?
  inputTokens   Int?
  outputTokens  Int?
  retryCount    Int                @default(0)
  workProductId String?
  createdAt     DateTime           @default(now())

  job         PipelineJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)
  workProduct WorkProduct? @relation(fields: [workProductId], references: [id])
}
```

**Step 2: Push schema to database**

Run: `npx prisma db push`
Expected: Schema changes applied successfully

**Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: Prisma client regenerated

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add model, inputTokens, outputTokens fields to PipelineStep"
```

---

### Task 2: Define AiUsage type and update AI helper return types

**Files:**
- Create: `worker/lib/ai-usage.ts`
- Modify: `worker/lib/distillation.ts`
- Modify: `worker/lib/tts.ts`
- Modify: `worker/lib/whisper-chunked.ts`

**Step 1: Create shared AiUsage type**

Create `worker/lib/ai-usage.ts`:

```typescript
/** Usage metadata returned from AI API calls for cost tracking. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null; // null if API doesn't report cost
}
```

**Step 2: Update `extractClaims` to return usage**

In `worker/lib/distillation.ts`, change `extractClaims` return type and capture usage from the Anthropic response:

```typescript
import type { AiUsage } from "./ai-usage";

export async function extractClaims(
  client: Anthropic,
  transcript: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<{ claims: Claim[]; usage: AiUsage }> {
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a podcast analyst. Extract the top 10 most important factual claims from this transcript.

Return ONLY a JSON array of objects with these fields:
- "claim": the factual assertion (one sentence)
- "speaker": who made the claim
- "importance": 1-10 rating
- "novelty": 1-10 rating

Sort by importance descending. Return valid JSON only, no markdown fences.

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
    cost: null,
  };

  return { claims, usage };
}
```

**Step 3: Update `generateNarrative` to return usage**

In `worker/lib/distillation.ts`, change `generateNarrative` similarly:

```typescript
export async function generateNarrative(
  client: Anthropic,
  claims: Claim[],
  durationMinutes: number,
  model: string = "claude-sonnet-4-20250514"
): Promise<{ narrative: string; usage: AiUsage }> {
  const targetWords = Math.round(durationMinutes * WORDS_PER_MINUTE);

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a podcast script writer. Write a spoken narrative summarizing these claims for a daily briefing podcast segment.

TARGET: approximately ${targetWords} words (${durationMinutes} minutes at ${WORDS_PER_MINUTE} wpm).

Rules:
- Write in a conversational, engaging tone suitable for audio
- Cover the most important claims first
- Use natural transitions between topics
- Do NOT include stage directions, speaker labels, or markdown
- Output ONLY the narrative text

CLAIMS:
${JSON.stringify(claims, null, 2)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const usage: AiUsage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: null,
  };

  return { narrative: text, usage };
}
```

**Step 4: Update `generateSpeech` to return usage**

In `worker/lib/tts.ts`:

```typescript
import type { AiUsage } from "./ai-usage";

export async function generateSpeech(
  client: OpenAI,
  text: string,
  voice: string = DEFAULT_VOICE,
  model: string = TTS_MODEL
): Promise<{ audio: ArrayBuffer; usage: AiUsage }> {
  const response = await client.audio.speech.create({
    model,
    voice: voice as any,
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
      "Maintain a steady, engaging pace. Pause naturally between topics.",
  });

  const audio = await response.arrayBuffer();

  // TTS doesn't return token counts — use character count as proxy
  const usage: AiUsage = {
    model,
    inputTokens: text.length,
    outputTokens: 0,
    cost: null,
  };

  return { audio, usage };
}
```

**Step 5: Update `transcribeChunked` to return usage**

In `worker/lib/whisper-chunked.ts`:

```typescript
import type { AiUsage } from "./ai-usage";

export async function transcribeChunked(
  client: OpenAI,
  audioUrl: string,
  totalBytes: number,
  model: string
): Promise<{ transcript: string; usage: AiUsage }> {
  const chunks: string[] = [];
  let offset = 0;
  let totalDurationSeconds = 0;

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE, totalBytes) - 1;
    const res = await fetch(audioUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
    });
    const blob = await res.blob();
    const file = new File([blob], "chunk.mp3", { type: "audio/mpeg" });

    const transcription = await client.audio.transcriptions.create({
      model,
      file,
    });
    chunks.push(transcription.text);
    // Estimate duration from byte range (MP3 ~128kbps = 16KB/s)
    totalDurationSeconds += (end - offset + 1) / 16000;
    offset = end + 1;
  }

  const usage: AiUsage = {
    model,
    inputTokens: Math.round(totalDurationSeconds),
    outputTokens: 0,
    cost: null,
  };

  return { transcript: chunks.join(" "), usage };
}
```

**Step 6: Commit**

```bash
git add worker/lib/ai-usage.ts worker/lib/distillation.ts worker/lib/tts.ts worker/lib/whisper-chunked.ts
git commit -m "feat: return AiUsage from all AI helper functions"
```

---

### Task 3: Update queue handlers to capture and store usage

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/clip-generation.ts`

**Step 1: Update transcription handler**

In `worker/queues/transcription.ts`, update the Whisper calls to capture usage and write it to PipelineStep.

For the chunked path (line 159), change:
```typescript
transcript = await transcribeChunked(openai, episode.audioUrl, contentLength, sttModel);
```
to:
```typescript
const chunkedResult = await transcribeChunked(openai, episode.audioUrl, contentLength, sttModel);
transcript = chunkedResult.transcript;
sttUsage = chunkedResult.usage;
```

For the single-file path (lines 166-170), capture usage:
```typescript
const transcription = await openai.audio.transcriptions.create({
  model: sttModel,
  file,
});
transcript = transcription.text;
sttUsage = {
  model: sttModel,
  inputTokens: Math.round((audioBlob.size) / 16000), // estimate seconds from bytes
  outputTokens: 0,
  cost: null,
};
```

Declare `let sttUsage: AiUsage | null = null;` near the top of the try block (after `let transcript: string;`). Import `AiUsage` from `../lib/ai-usage`.

In the PipelineStep completion update (lines 196-204), add the usage fields:
```typescript
await prisma.pipelineStep.update({
  where: { id: step.id },
  data: {
    status: "COMPLETED",
    completedAt: new Date(),
    durationMs: Date.now() - startTime,
    workProductId: wp.id,
    ...(sttUsage ? {
      model: sttUsage.model,
      inputTokens: sttUsage.inputTokens,
      outputTokens: sttUsage.outputTokens,
      cost: sttUsage.cost,
    } : {}),
  },
});
```

Note: Tier 1 (RSS transcript) and Tier 2 (Podcast Index) have no AI cost — `sttUsage` stays null and fields remain null.

**Step 2: Update distillation handler**

In `worker/queues/distillation.ts`, update the `extractClaims` call (line 138):

Change:
```typescript
const claims = await extractClaims(anthropic, existing.transcript, distillationModel);
```
to:
```typescript
const { claims, usage: claimsUsage } = await extractClaims(anthropic, existing.transcript, distillationModel);
```

In the PipelineStep completion update (lines 164-172), add usage fields:
```typescript
await prisma.pipelineStep.update({
  where: { id: step.id },
  data: {
    status: "COMPLETED",
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    workProductId: wp.id,
    model: claimsUsage.model,
    inputTokens: claimsUsage.inputTokens,
    outputTokens: claimsUsage.outputTokens,
    cost: claimsUsage.cost,
  },
});
```

**Step 3: Update clip-generation handler**

In `worker/queues/clip-generation.ts`, this stage makes two AI calls (narrative + TTS). We need to combine their usage.

Update narrative call (lines 171-176):
```typescript
const { narrative, usage: narrativeUsage } = await generateNarrative(
  anthropic,
  claims,
  durationTier,
  narrativeModel
);
```

Update TTS call (line 183):
```typescript
const { audio, usage: ttsUsage } = await generateSpeech(openai, narrative, undefined, ttsModel);
```

In the PipelineStep completion update (lines 239-247), combine both usages. Since this step has two different models, store the narrative model (the more expensive one) and sum tokens:
```typescript
await prisma.pipelineStep.update({
  where: { id: step.id },
  data: {
    status: "COMPLETED",
    completedAt: new Date(),
    durationMs: Date.now() - startTime,
    workProductId: audioWp.id,
    model: `${narrativeUsage.model}+${ttsUsage.model}`,
    inputTokens: narrativeUsage.inputTokens + ttsUsage.inputTokens,
    outputTokens: narrativeUsage.outputTokens + ttsUsage.outputTokens,
    cost: (narrativeUsage.cost ?? 0) + (ttsUsage.cost ?? 0) || null,
  },
});
```

**Step 4: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/distillation.ts worker/queues/clip-generation.ts
git commit -m "feat: capture AI usage in pipeline step completion"
```

---

### Task 4: Update admin types for cost tracking

**Files:**
- Modify: `src/types/admin.ts:101-114` (PipelineStep interface)
- Modify: `src/types/admin.ts:499-507` (StepProgress interface)
- Modify: `src/types/admin.ts:359-365` (CostBreakdownData interface)

**Step 1: Add fields to PipelineStep type**

In `src/types/admin.ts`, update the `PipelineStep` interface (line 101):

```typescript
export interface PipelineStep {
  id: string;
  jobId: string;
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  cost?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
  createdAt: string;
}
```

**Step 2: Add fields to StepProgress type**

In `src/types/admin.ts`, update `StepProgress` (line 499):

```typescript
export interface StepProgress {
  stage: PipelineStage;
  status: PipelineStepStatus;
  cached: boolean;
  durationMs?: number;
  cost?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  workProducts?: WorkProductSummary[];
}
```

**Step 3: Add ModelCostData type for new per-model endpoint**

Add at the end of the Analytics section in `src/types/admin.ts`:

```typescript
export interface ModelCostData {
  models: {
    model: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }[];
  byStage: {
    stage: string;
    stageName: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }[];
}
```

**Step 4: Commit**

```bash
git add src/types/admin.ts
git commit -m "feat: add AI usage fields to admin type contracts"
```

---

### Task 5: Add per-model cost analytics API endpoint

**Files:**
- Modify: `worker/routes/admin/analytics.ts`

**Step 1: Add `/costs/by-model` endpoint**

In `worker/routes/admin/analytics.ts`, add a new endpoint after the existing `/costs` route (after line 114):

```typescript
// GET /costs/by-model - Cost breakdown by model and by stage
analyticsRoutes.get("/costs/by-model", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);

  try {
    const steps = await prisma.pipelineStep.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        model: { not: null },
      },
      select: {
        stage: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
      },
    });

    // Group by model
    const modelMap = new Map<string, { totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }>();
    for (const s of steps) {
      const key = s.model!;
      const entry = modelMap.get(key) ?? { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, callCount: 0 };
      entry.totalCost += s.cost ?? 0;
      entry.totalInputTokens += s.inputTokens ?? 0;
      entry.totalOutputTokens += s.outputTokens ?? 0;
      entry.callCount += 1;
      modelMap.set(key, entry);
    }

    const models = Array.from(modelMap.entries())
      .map(([model, data]) => ({ model, ...data, totalCost: round(data.totalCost) }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Group by stage
    const stageMap = new Map<string, { totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }>();
    for (const s of steps) {
      const key = s.stage;
      const entry = stageMap.get(key) ?? { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, callCount: 0 };
      entry.totalCost += s.cost ?? 0;
      entry.totalInputTokens += s.inputTokens ?? 0;
      entry.totalOutputTokens += s.outputTokens ?? 0;
      entry.callCount += 1;
      stageMap.set(key, entry);
    }

    const byStage = Array.from(stageMap.entries())
      .map(([stage, data]) => ({
        stage,
        stageName: STAGE_DISPLAY_NAMES[stage as keyof typeof STAGE_DISPLAY_NAMES] ?? stage,
        ...data,
        totalCost: round(data.totalCost),
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    return c.json({ data: { models, byStage } });
  } catch {
    return c.json({ data: { models: [], byStage: [] } });
  }
});
```

**Step 2: Commit**

```bash
git add worker/routes/admin/analytics.ts
git commit -m "feat: add /costs/by-model analytics endpoint"
```

---

### Task 6: Update existing tests for new return types

**Files:**
- Modify: any existing tests that call `extractClaims`, `generateNarrative`, `generateSpeech`, or `transcribeChunked`

**Step 1: Find and update tests**

Search for test files that import these functions:
```bash
npx grep -r "extractClaims\|generateNarrative\|generateSpeech\|transcribeChunked" tests/ worker/queues/__tests__/
```

Update each test to destructure the new return shapes:
- `extractClaims` now returns `{ claims, usage }` instead of `Claim[]`
- `generateNarrative` now returns `{ narrative, usage }` instead of `string`
- `generateSpeech` now returns `{ audio, usage }` instead of `ArrayBuffer`
- `transcribeChunked` now returns `{ transcript, usage }` instead of `string`

For mocks, update `mockResolvedValue` to return the new shape, e.g.:
```typescript
// Before:
mockExtractClaims.mockResolvedValue([{ claim: "test", speaker: "host", importance: 9, novelty: 8 }]);
// After:
mockExtractClaims.mockResolvedValue({
  claims: [{ claim: "test", speaker: "host", importance: 9, novelty: 8 }],
  usage: { model: "claude-sonnet-4-20250514", inputTokens: 100, outputTokens: 50, cost: null },
});
```

**Step 2: Run tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/ worker/queues/__tests__/
git commit -m "test: update tests for new AI helper return types"
```

---

### Task 7: Add per-model cost widget to admin analytics page

**Files:**
- Modify: `src/pages/admin/analytics.tsx`
- Modify: `src/types/admin.ts` (if not already done in Task 4)

**Step 1: Add ModelCostWidget component**

In `src/pages/admin/analytics.tsx`, add a new widget that fetches from `/analytics/costs/by-model` and displays:
- A bar chart of cost per model
- A table of cost per stage with token counts
- Use existing design patterns (colors, card style, MetricItem, etc.)

```typescript
function ModelCostWidget({ data }: { data: ModelCostData }) {
  return (
    <div className="bg-[#1A2942] rounded-lg border border-white/5 p-5 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[#14B8A6]" />
          <span className="text-sm font-semibold text-[#F9FAFB]">Cost by Model</span>
        </div>
      </div>

      {/* Bar chart of cost by model */}
      <div className="flex-1 min-h-0 mb-4" style={{ minHeight: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.models} layout="vertical" margin={{ top: 4, right: 4, left: 80, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(v: number) => `$${v}`} />
            <YAxis
              type="category"
              dataKey="model"
              tick={{ fontSize: 9, fill: "#9CA3AF" }}
              width={80}
              tickFormatter={(v: string) => v.split("-").slice(0, 3).join("-")}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="totalCost" fill="#14B8A6" radius={[0, 4, 4, 0]} name="Cost" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stage breakdown table */}
      <div className="pt-2 border-t border-white/5">
        <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-2 block">By Stage</span>
        <div className="space-y-1.5">
          {data.byStage.map((s) => (
            <div key={s.stage} className="flex items-center justify-between text-xs">
              <span className="text-[#9CA3AF]">{s.stageName}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">{s.callCount} calls</span>
                <span className="text-[10px] text-[#9CA3AF] font-mono tabular-nums">{formatNumber(s.totalInputTokens)} in</span>
                <span className="font-mono tabular-nums text-[#F9FAFB]">{formatCost(s.totalCost)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Import `Cpu` from `lucide-react` and `ModelCostData` from `@/types/admin`.

**Step 2: Integrate into the page**

In the `Analytics` component, add state for the new data and fetch it alongside other analytics:

```typescript
const [modelCosts, setModelCosts] = useState<ModelCostData | null>(null);
```

Add to the `Promise.all` in `load()`:
```typescript
apiFetch<{ data: ModelCostData }>(`/analytics/costs/by-model${qs}`).then((r) => setModelCosts(r.data)).catch(console.error),
```

Change the grid from 2x2 to accommodate the new widget. Add a 3rd row or make the layout 3-column on wider screens. Simplest: add a full-width row below the 2x2 grid:

```tsx
{/* Model Cost Widget - full width below the grid */}
{modelCosts ? <ModelCostWidget data={modelCosts} /> : <Skeleton className="h-[300px] bg-white/5 rounded-lg" />}
```

**Step 3: Commit**

```bash
git add src/pages/admin/analytics.tsx
git commit -m "feat: add model cost breakdown widget to analytics page"
```

---

### Task 8: Update existing cost endpoint to include model/token data

**Files:**
- Modify: `worker/routes/admin/analytics.ts:35-114`

**Step 1: Include model and token fields in cost queries**

In the existing `/costs` endpoint, update the `select` to include the new fields so the daily cost breakdown can show more detail:

```typescript
steps = await prisma.pipelineStep.findMany({
  where: {
    createdAt: { gte: from, lte: to },
    status: "COMPLETED",
    model: { not: null },
  },
  select: { stage: true, cost: true, model: true, inputTokens: true, outputTokens: true, createdAt: true },
});
```

Change the filter from `cost: { not: null }` to `model: { not: null }` so steps with usage data but null cost (common for Anthropic which doesn't return cost directly) are still included.

**Step 2: Commit**

```bash
git add worker/routes/admin/analytics.ts
git commit -m "feat: include model/token data in cost analytics queries"
```

---

### Task 9: Verify end-to-end and update docs

**Files:**
- Modify: `docs/data-model.md` (add new PipelineStep fields)
- Modify: `docs/pipeline.md` (mention cost tracking)
- Modify: `docs/api-reference.md` (add new endpoint)

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 2: Run tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run`
Expected: All tests pass

**Step 3: Update docs**

Add the new fields to the PipelineStep section in `docs/data-model.md`.

Add a "Cost Tracking" section to `docs/pipeline.md` explaining that AI usage is captured per step.

Add `GET /api/admin/analytics/costs/by-model` to `docs/api-reference.md` with response shape.

**Step 4: Commit**

```bash
git add docs/
git commit -m "docs: document AI cost tracking fields and endpoint"
```
