# AI Model Configurator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI models configurable through the admin interface so operators can switch models without redeploying.

**Architecture:** Add a shared model registry (`worker/lib/ai-models.ts`), update lib functions to accept model parameters, wire queue handlers to read from PlatformConfig, and add an edit flow to the existing admin AI Models panel.

**Tech Stack:** TypeScript, Vitest, Hono, React, shadcn/ui Select component, PlatformConfig table

---

### Task 1: Create the AI model registry and config helper

**Files:**
- Create: `worker/lib/ai-models.ts`
- Test: `worker/lib/__tests__/ai-models.test.ts`

**Step 1: Write the test file**

```typescript
// worker/lib/__tests__/ai-models.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AI_MODELS, getModelConfig, type AIStage } from "../ai-models";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI_MODELS registry", () => {
  it("has entries for all 4 stages", () => {
    expect(AI_MODELS.stt.length).toBeGreaterThan(0);
    expect(AI_MODELS.distillation.length).toBeGreaterThan(0);
    expect(AI_MODELS.narrative.length).toBeGreaterThan(0);
    expect(AI_MODELS.tts.length).toBeGreaterThan(0);
  });

  it("each entry has provider, model, and label", () => {
    for (const stage of Object.values(AI_MODELS)) {
      for (const entry of stage) {
        expect(entry).toHaveProperty("provider");
        expect(entry).toHaveProperty("model");
        expect(entry).toHaveProperty("label");
      }
    }
  });
});

describe("getModelConfig", () => {
  const mockPrisma = {} as any;

  it("returns config value when set in PlatformConfig", async () => {
    (getConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    const result = await getModelConfig(mockPrisma, "distillation");
    expect(result).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    expect(getConfig).toHaveBeenCalledWith(mockPrisma, "ai.distillation.model", expect.any(Object));
  });

  it("returns fallback default when config is not set", async () => {
    (getConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
    const result = await getModelConfig(mockPrisma, "distillation");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("uses correct config key per stage", async () => {
    (getConfig as any).mockResolvedValue({ provider: "openai", model: "whisper-1" });
    await getModelConfig(mockPrisma, "stt");
    expect(getConfig).toHaveBeenCalledWith(mockPrisma, "ai.stt.model", expect.any(Object));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/ai-models.test.ts`
Expected: FAIL — module `../ai-models` not found

**Step 3: Write the implementation**

```typescript
// worker/lib/ai-models.ts
import { getConfig } from "./config";

export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export interface AIModelEntry {
  provider: string;
  model: string;
  label: string;
  comingSoon?: boolean;
}

export interface AIModelConfig {
  provider: string;
  model: string;
}

export const AI_MODELS: Record<AIStage, AIModelEntry[]> = {
  stt: [
    { provider: "openai", model: "whisper-1", label: "Whisper v1" },
  ],
  distillation: [
    { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Sonnet 4" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { provider: "anthropic", model: "claude-opus-4-20250514", label: "Opus 4" },
  ],
  narrative: [
    { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Sonnet 4" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { provider: "anthropic", model: "claude-opus-4-20250514", label: "Opus 4" },
  ],
  tts: [
    { provider: "openai", model: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS" },
    { provider: "openai", model: "tts-1", label: "TTS-1" },
    { provider: "openai", model: "tts-1-hd", label: "TTS-1 HD" },
    { provider: "elevenlabs", model: "eleven_turbo_v2_5", label: "ElevenLabs Turbo v2.5", comingSoon: true },
    { provider: "google", model: "standard", label: "Google Cloud TTS", comingSoon: true },
    { provider: "cloudflare", model: "workers-ai", label: "Cloudflare Workers AI", comingSoon: true },
  ],
};

const DEFAULTS: Record<AIStage, AIModelConfig> = {
  stt: { provider: "openai", model: "whisper-1" },
  distillation: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  narrative: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  tts: { provider: "openai", model: "gpt-4o-mini-tts" },
};

export async function getModelConfig(
  prisma: any,
  stage: AIStage
): Promise<AIModelConfig> {
  return getConfig(prisma, `ai.${stage}.model`, DEFAULTS[stage]);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/ai-models.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/lib/ai-models.ts worker/lib/__tests__/ai-models.test.ts
git commit -m "feat: add AI model registry and getModelConfig helper"
```

---

### Task 2: Add model parameter to distillation lib functions

**Files:**
- Modify: `worker/lib/distillation.ts`
- Modify: `worker/lib/__tests__/distillation.test.ts`

**Step 1: Update the tests**

In `worker/lib/__tests__/distillation.test.ts`:

- Change the test `"should use claude-sonnet-4-20250514 model"` in `extractClaims` describe block to:

```typescript
it("should use the provided model", async () => {
  const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
  await extractClaims(client, "transcript", "claude-haiku-4-5-20251001");

  const call = client.messages.create.mock.calls[0][0];
  expect(call.model).toBe("claude-haiku-4-5-20251001");
});

it("should default to claude-sonnet-4-20250514 when no model specified", async () => {
  const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
  await extractClaims(client, "transcript");

  const call = client.messages.create.mock.calls[0][0];
  expect(call.model).toBe("claude-sonnet-4-20250514");
});
```

- Change the test `"should use claude-sonnet-4-20250514 model"` in `generateNarrative` describe block to:

```typescript
it("should use the provided model", async () => {
  const client = createMockAnthropicClient("narrative text");
  await generateNarrative(client, claims, 3, "claude-haiku-4-5-20251001");

  const call = client.messages.create.mock.calls[0][0];
  expect(call.model).toBe("claude-haiku-4-5-20251001");
});

it("should default to claude-sonnet-4-20250514 when no model specified", async () => {
  const client = createMockAnthropicClient("narrative text");
  await generateNarrative(client, claims, 3);

  const call = client.messages.create.mock.calls[0][0];
  expect(call.model).toBe("claude-sonnet-4-20250514");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: FAIL — functions don't accept model parameter yet

**Step 3: Update the implementation**

In `worker/lib/distillation.ts`:

- `extractClaims`: add optional `model` parameter with default:

```typescript
export async function extractClaims(
  client: Anthropic,
  transcript: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<Claim[]> {
  const response = await client.messages.create({
    model,
    // ... rest unchanged
```

- `generateNarrative`: add optional `model` parameter with default:

```typescript
export async function generateNarrative(
  client: Anthropic,
  claims: Claim[],
  durationMinutes: number,
  model: string = "claude-sonnet-4-20250514"
): Promise<string> {
  const response = await client.messages.create({
    model,
    // ... rest unchanged
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: add configurable model parameter to extractClaims and generateNarrative"
```

---

### Task 3: Add model parameter to TTS lib function

**Files:**
- Modify: `worker/lib/tts.ts`
- Modify: `worker/lib/__tests__/tts.test.ts`

**Step 1: Update the test**

In `worker/lib/__tests__/tts.test.ts`, replace the test `"should call OpenAI with correct model and format"`:

```typescript
it("should use the provided model", async () => {
  const client = createMockOpenAIClient(fakeAudio);
  await generateSpeech(client, "Hello world", DEFAULT_VOICE, "tts-1-hd");

  const call = client.audio.speech.create.mock.calls[0][0];
  expect(call.model).toBe("tts-1-hd");
});

it("should default to gpt-4o-mini-tts when no model specified", async () => {
  const client = createMockOpenAIClient(fakeAudio);
  await generateSpeech(client, "Hello world");

  const call = client.audio.speech.create.mock.calls[0][0];
  expect(call.model).toBe("gpt-4o-mini-tts");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/lib/__tests__/tts.test.ts`
Expected: FAIL — `generateSpeech` doesn't accept 4th parameter for model

**Step 3: Update the implementation**

In `worker/lib/tts.ts`, add `model` parameter:

```typescript
export async function generateSpeech(
  client: OpenAI,
  text: string,
  voice: string = DEFAULT_VOICE,
  model: string = TTS_MODEL
): Promise<ArrayBuffer> {
  const response = await client.audio.speech.create({
    model,
    // ... rest unchanged
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/tts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/lib/tts.ts worker/lib/__tests__/tts.test.ts
git commit -m "feat: add configurable model parameter to generateSpeech"
```

---

### Task 4: Wire distillation queue handler to read model from config

**Files:**
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/__tests__/distillation.test.ts`

**Step 1: Update the test**

In `worker/queues/__tests__/distillation.test.ts`:

Add a mock for the ai-models module after the existing mocks (near line 30):

```typescript
vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" }),
}));
```

Add the import after the other imports (near line 41):

```typescript
import { getModelConfig } from "../../lib/ai-models";
```

In the `beforeEach` block, re-set the mock after `vi.clearAllMocks()`:

```typescript
(getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
```

Add a new test inside the main `describe("handleDistillation")`:

```typescript
it("reads distillation model from config and passes to extractClaims", async () => {
  (getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });

  mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue({ id: "job-1", requestId: "req-1" });
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step-1" });
  mockPrisma.pipelineStep.update.mockResolvedValue({});
  mockPrisma.distillation.findUnique.mockResolvedValue({
    id: "dist-1", episodeId: "ep-1", status: "TRANSCRIPT_READY", transcript: "Some transcript",
  });
  mockPrisma.distillation.update.mockResolvedValue({});
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

  const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1" }]);
  await handleDistillation(batch, mockEnv, mockCtx);

  expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "distillation");
  expect(extractClaims).toHaveBeenCalledWith(expect.anything(), "Some transcript", "claude-haiku-4-5-20251001");
});
```

**Step 2: Run tests to verify the new test fails**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: FAIL — `extractClaims` called without model argument

**Step 3: Update the queue handler**

In `worker/queues/distillation.ts`:

Add import at top:

```typescript
import { getModelConfig } from "../lib/ai-models";
```

Inside the `for` loop, before `extractClaims` is called (around line 147), add:

```typescript
const { model: distillationModel } = await getModelConfig(prisma, "distillation");
```

Pass it to `extractClaims`:

```typescript
const claims = await extractClaims(anthropic, existing.transcript, distillationModel);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "feat: wire distillation queue to read model from PlatformConfig"
```

---

### Task 5: Wire clip-generation queue handler to read models from config

**Files:**
- Modify: `worker/queues/clip-generation.ts`
- Modify: `worker/queues/__tests__/clip-generation.test.ts`

**Step 1: Update the test**

In `worker/queues/__tests__/clip-generation.test.ts`:

Add mock after existing mocks (near line 28):

```typescript
vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" }),
}));
```

Add import:

```typescript
import { getModelConfig } from "../../lib/ai-models";
```

In `beforeEach`, re-set after `vi.clearAllMocks()`:

```typescript
(getModelConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
```

Add test (put inside main `describe`):

```typescript
it("reads narrative and TTS models from config", async () => {
  (getModelConfig as any)
    .mockResolvedValueOnce({ provider: "anthropic", model: "claude-haiku-4-5-20251001" })  // narrative
    .mockResolvedValueOnce({ provider: "openai", model: "tts-1-hd" });                     // tts

  mockPrisma.pipelineJob.findUniqueOrThrow.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue(STEP);
  mockPrisma.pipelineStep.update.mockResolvedValue({});
  mockPrisma.clip.findUnique.mockResolvedValue(null);
  mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
  mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-1" });

  const batch = makeBatch([{ jobId: "job-1", episodeId: "ep-1", durationTier: 5 }]);
  await handleClipGeneration(batch, mockEnv, mockCtx);

  expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "narrative");
  expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "tts");
  expect(generateNarrative).toHaveBeenCalledWith(expect.anything(), expect.anything(), 5, "claude-haiku-4-5-20251001");
  expect(generateSpeech).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, "tts-1-hd");
});
```

**Step 2: Run tests to verify the new test fails**

Run: `npx vitest run worker/queues/__tests__/clip-generation.test.ts`
Expected: FAIL — `generateNarrative` and `generateSpeech` called without model args

**Step 3: Update the queue handler**

In `worker/queues/clip-generation.ts`:

Add import at top:

```typescript
import { getModelConfig } from "../lib/ai-models";
```

Inside the `for` loop, before `generateNarrative` (around line 177), add:

```typescript
const { model: narrativeModel } = await getModelConfig(prisma, "narrative");
const { model: ttsModel } = await getModelConfig(prisma, "tts");
```

Pass to function calls:

```typescript
const narrative = await generateNarrative(anthropic, claims, durationTier, narrativeModel);
```

```typescript
const audio = await generateSpeech(openai, narrative, undefined, ttsModel);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/clip-generation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/clip-generation.ts worker/queues/__tests__/clip-generation.test.ts
git commit -m "feat: wire clip-generation queue to read narrative and TTS models from config"
```

---

### Task 6: Wire transcription queue handler to read model from config

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/__tests__/transcription.test.ts`

**Step 1: Check current transcription test structure**

Read `worker/queues/__tests__/transcription.test.ts` to understand existing test patterns, then add a test verifying the STT model is read from config and passed to the Whisper call.

The transcription handler creates an OpenAI client inline (line 132-133 of `transcription.ts`) and calls `openai.audio.transcriptions.create({ model: "whisper-1" })`. Update this to use `getModelConfig`.

Add mock:

```typescript
vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "openai", model: "whisper-1" }),
}));
```

Add import and re-set in `beforeEach`.

Add a test that sets up a Whisper path (episode with no `transcriptUrl`) and verifies `getModelConfig` is called with `"stt"`.

**Step 2: Run to verify failure, then implement**

In `worker/queues/transcription.ts`:

Add import:

```typescript
import { getModelConfig } from "../lib/ai-models";
```

Before the Whisper call (around line 136), add:

```typescript
const { model: sttModel } = await getModelConfig(prisma, "stt");
```

Pass to the transcription create call:

```typescript
const transcription = await openai.audio.transcriptions.create({
  model: sttModel,
  file,
});
```

**Step 3: Run tests, verify pass, commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: wire transcription queue to read STT model from config"
```

---

### Task 7: Update admin frontend AI Models panel with edit flow

**Files:**
- Modify: `src/pages/admin/configuration.tsx`

**Step 1: Update the `AIModelsPanel` component**

The current `AIModelsPanel` at line 352-428 of `configuration.tsx`:
- Takes only `configs` prop — needs `apiFetch` and `onReload` too (same as `PipelineControlsPanel`)
- Has a dead "Change" button
- Reads from keys like `stt.provider` / `stt.model` — update to read from `ai.stt.model` (JSON object)

Replace the panel with a version that:

1. Imports the model registry from a shared location. Since `worker/lib/ai-models.ts` uses node imports, create a thin copy at `src/lib/ai-models.ts` with just the `AI_MODELS` constant and types (no server-side `getConfig` dependency).

2. Updates `getModelConfig` helper in the panel to read from the new `ai.<stage>.model` JSON config key:

```typescript
function getModelConfig(prefix: string): { provider: string; model: string } {
  const entry = configs.find((c) => c.key === `ai.${prefix}.model`);
  const val = entry?.value as { provider?: string; model?: string } | null;
  return {
    provider: val?.provider ?? "Unknown",
    model: val?.model ?? "Unknown",
  };
}
```

3. Adds state for which model card is being edited:

```typescript
const [editing, setEditing] = useState<string | null>(null);
```

4. Replaces the dead "Change" button with a conditional: if not editing, show the button that sets `editing` to the stage key. If editing, show a `<Select>` dropdown populated from `AI_MODELS[stage]`, with `comingSoon` entries disabled. On selection:

```typescript
const handleModelChange = async (stageKey: string, model: string) => {
  const entry = AI_MODELS[stageKey as keyof typeof AI_MODELS].find((m) => m.model === model);
  if (!entry || entry.comingSoon) return;
  setSaving(stageKey);
  try {
    await apiFetch(`/config/ai.${stageKey}.model`, {
      method: "PATCH",
      body: JSON.stringify({ value: { provider: entry.provider, model: entry.model } }),
    });
    onReload();
    setEditing(null);
  } catch (e) {
    console.error("Failed to update model:", e);
  } finally {
    setSaving(null);
  }
};
```

5. Update the parent `Configuration` component to pass `apiFetch` and `onReload` to `AIModelsPanel`:

```tsx
{selectedCategory === "ai-models" && (
  <AIModelsPanel configs={configs} apiFetch={apiFetch} onReload={load} />
)}
```

**Step 2: Create the shared model registry for frontend**

Create `src/lib/ai-models.ts` — a frontend-safe copy of just the types and `AI_MODELS` constant (no `getConfig` import):

```typescript
// src/lib/ai-models.ts
export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export interface AIModelEntry {
  provider: string;
  model: string;
  label: string;
  comingSoon?: boolean;
}

export const AI_MODELS: Record<AIStage, AIModelEntry[]> = {
  // ... same as worker/lib/ai-models.ts registry
};
```

**Step 3: Verify manually**

Run: `npm run dev`
Navigate to admin Configuration > AI Models. Verify:
- Cards show current model from config (or "Unknown" if no config set yet)
- "Change" button opens a dropdown
- Selecting a model updates the config and card refreshes
- Coming-soon entries are visible but grayed out / disabled

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai-models.ts src/pages/admin/configuration.tsx
git commit -m "feat: add AI model edit flow to admin configuration panel"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all affected tests**

```bash
npx vitest run worker/lib/__tests__/ai-models.test.ts worker/lib/__tests__/distillation.test.ts worker/lib/__tests__/tts.test.ts worker/queues/__tests__/distillation.test.ts worker/queues/__tests__/clip-generation.test.ts worker/queues/__tests__/transcription.test.ts
```

Expected: All PASS

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address any test/type issues from model configurator"
```
