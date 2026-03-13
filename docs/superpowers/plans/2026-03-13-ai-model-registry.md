# AI Model Registry Implementation Plan

> **For agentic workers:** REQUIRED: Use Agent Teams (TeamCreate/TeamDelete) for multi-task implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static TypeScript model lists with a DB-backed registry of `stage → model → inference provider` with per-provider pricing, admin CRUD UI, and a daily pricing refresh cron.

**Architecture:** Two new Prisma models (`AiModel` + `AiModelProvider`) form the catalog. `PlatformConfig` continues to store the active model selection per stage — `getModelConfig()` is unchanged. The static `AI_MODELS` TS constant is removed; the frontend fetches available models from a new API. A pricing updater runs in the existing cron handler.

**Tech Stack:** Prisma 7, Hono v4, React 19, Vitest, Cloudflare Workers scheduled handler.

---

## Chunk 1: Schema, Seed, and API Foundation

### Task 1: Add AiModel + AiModelProvider to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums and models to schema**

Add after the `PlatformConfig` model:

```prisma
// ── AI Model Registry ──

enum AiStage {
  stt
  distillation
  narrative
  tts
}

model AiModel {
  id        String    @id @default(cuid())
  stage     AiStage
  modelId   String    // e.g. "whisper-1", "nova-3", "claude-sonnet-4-20250514"
  label     String    // e.g. "Whisper v1", "Deepgram Nova-3"
  developer String    // e.g. "openai", "deepgram", "anthropic"
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())

  providers AiModelProvider[]

  @@unique([stage, modelId])
}

model AiModelProvider {
  id                  String    @id @default(cuid())
  aiModelId           String
  provider            String    // inference provider: "openai", "cloudflare", "groq", "deepgram", etc.
  providerLabel       String    // display name: "Cloudflare Workers AI"
  pricePerMinute      Float?    // STT / TTS per audio minute
  priceInputPerMToken Float?    // LLM per 1M input tokens
  priceOutputPerMToken Float?   // LLM per 1M output tokens
  pricePerKChars      Float?    // TTS alt: per 1K characters
  isDefault           Boolean   @default(false)
  isAvailable         Boolean   @default(true)
  priceUpdatedAt      DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  model AiModel @relation(fields: [aiModelId], references: [id], onDelete: Cascade)

  @@unique([aiModelId, provider])
  @@index([aiModelId])
}
```

Also add `provider` to `SttBenchmarkResult` (nullable — existing rows have no provider):

```prisma
model SttBenchmarkResult {
  // ... existing fields ...
  model           String
  provider        String?  // inference provider used, e.g. "openai", "cloudflare" — add after model field
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Push schema to dev DB**

```bash
npx prisma db push
npx prisma generate
cp src/generated/prisma/index.ts <worktree>/src/generated/prisma/index.ts  # if in worktree
```

Expected: no errors, new tables visible in DB.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add AiModel, AiModelProvider, SttBenchmarkResult.provider"
```

---

### Task 2: Seed AiModel + AiModelProvider tables

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add seed data using upsert**

Append to the `main()` function in `prisma/seed.ts`. Use `upsert` so re-running is safe.

Pricing reference (per audio minute for STT, per 1M tokens for LLM):

```typescript
// ── AI Model Registry seed ──

type ProviderSeed = {
  provider: string;
  providerLabel: string;
  isDefault?: boolean;
  pricePerMinute?: number;
  priceInputPerMToken?: number;
  priceOutputPerMToken?: number;
  pricePerKChars?: number;
};

type ModelSeed = {
  stage: "stt" | "distillation" | "narrative" | "tts";
  modelId: string;
  label: string;
  developer: string;
  providers: ProviderSeed[];
};

const MODEL_SEEDS: ModelSeed[] = [
  // ── STT ──
  {
    stage: "stt", modelId: "whisper-1", label: "Whisper v1", developer: "openai",
    providers: [
      { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.006 },
      { provider: "cloudflare", providerLabel: "Cloudflare Workers AI", pricePerMinute: 0.0005 },
      { provider: "groq", providerLabel: "Groq", pricePerMinute: 0.000667 },
    ],
  },
  {
    stage: "stt", modelId: "nova-2", label: "Deepgram Nova-2", developer: "deepgram",
    providers: [
      { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0043 },
    ],
  },
  {
    stage: "stt", modelId: "nova-3", label: "Deepgram Nova-3", developer: "deepgram",
    providers: [
      { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0077 },
      { provider: "cloudflare", providerLabel: "Cloudflare Workers AI", pricePerMinute: 0.0052 },
    ],
  },
  {
    stage: "stt", modelId: "assemblyai-best", label: "AssemblyAI Best", developer: "assemblyai",
    providers: [
      { provider: "assemblyai", providerLabel: "AssemblyAI", isDefault: true, pricePerMinute: 0.015 },
    ],
  },
  {
    stage: "stt", modelId: "google-chirp", label: "Google Chirp", developer: "google",
    providers: [
      { provider: "google", providerLabel: "Google Cloud", isDefault: true, pricePerMinute: 0.024 },
    ],
  },
  // ── Distillation ──
  {
    stage: "distillation", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
    ],
  },
  {
    stage: "distillation", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
    ],
  },
  {
    stage: "distillation", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
    ],
  },
  // ── Narrative ──
  {
    stage: "narrative", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
    ],
  },
  {
    stage: "narrative", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
    ],
  },
  {
    stage: "narrative", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
    providers: [
      { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
    ],
  },
  // ── Audio Generation (TTS) ──
  {
    stage: "tts", modelId: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS", developer: "openai",
    providers: [
      { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.015 },
    ],
  },
  {
    stage: "tts", modelId: "tts-1", label: "TTS-1", developer: "openai",
    providers: [
      { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 15.0 },
    ],
  },
  {
    stage: "tts", modelId: "tts-1-hd", label: "TTS-1 HD", developer: "openai",
    providers: [
      { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 30.0 },
    ],
  },
];

for (const m of MODEL_SEEDS) {
  const aiModel = await prisma.aiModel.upsert({
    where: { stage_modelId: { stage: m.stage, modelId: m.modelId } },
    update: { label: m.label, developer: m.developer },
    create: { stage: m.stage, modelId: m.modelId, label: m.label, developer: m.developer },
  });
  for (const p of m.providers) {
    await prisma.aiModelProvider.upsert({
      where: { aiModelId_provider: { aiModelId: aiModel.id, provider: p.provider } },
      update: {
        providerLabel: p.providerLabel,
        pricePerMinute: p.pricePerMinute ?? null,
        priceInputPerMToken: p.priceInputPerMToken ?? null,
        priceOutputPerMToken: p.priceOutputPerMToken ?? null,
        pricePerKChars: p.pricePerKChars ?? null,
        isDefault: p.isDefault ?? false,
      },
      create: {
        aiModelId: aiModel.id,
        provider: p.provider,
        providerLabel: p.providerLabel,
        pricePerMinute: p.pricePerMinute ?? null,
        priceInputPerMToken: p.priceInputPerMToken ?? null,
        priceOutputPerMToken: p.priceOutputPerMToken ?? null,
        pricePerKChars: p.pricePerKChars ?? null,
        isDefault: p.isDefault ?? false,
      },
    });
  }
}
```

- [ ] **Step 2: Run seed**

```bash
npx prisma db seed
```

Expected: no errors, `aiModel` and `aiModelProvider` rows in DB.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): seed AiModel + AiModelProvider from current registry"
```

---

### Task 3: Admin API routes for model registry (TDD)

**Files:**
- Create: `worker/routes/admin/ai-models.ts`
- Create: `worker/routes/admin/__tests__/ai-models.test.ts`
- Modify: `worker/routes/admin/index.ts`
- Modify: `tests/helpers/mocks.ts`

- [ ] **Step 0: Add aiModel + aiModelProvider to createMockPrisma()**

In `tests/helpers/mocks.ts`, add to the returned object in `createMockPrisma()`:

```typescript
aiModel: modelMethods(),
aiModelProvider: modelMethods(),
sttExperiment: modelMethods(),        // if not already present
sttBenchmarkResult: modelMethods(),   // if not already present
```

Run existing tests to confirm no regressions:
```bash
npx vitest run worker/lib/__tests__/ai-models.test.ts
```

- [ ] **Step 1: Write failing tests**

Create `worker/routes/admin/__tests__/ai-models.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { aiModelsRoutes } from "../ai-models";
import { createMockPrisma } from "../../../../tests/helpers/mocks";

function buildApp(mockPrisma: ReturnType<typeof createMockPrisma>) {
  const app = new Hono();
  app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
  app.route("/", aiModelsRoutes);
  return app;
}

describe("GET /", () => {
  it("returns all models with providers", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.findMany.mockResolvedValue([
      {
        id: "m1", stage: "stt", modelId: "whisper-1", label: "Whisper v1",
        developer: "openai", isActive: true, createdAt: new Date(),
        providers: [
          { id: "p1", aiModelId: "m1", provider: "openai", providerLabel: "OpenAI",
            pricePerMinute: 0.006, priceInputPerMToken: null, priceOutputPerMToken: null,
            pricePerKChars: null, isDefault: true, isAvailable: true, priceUpdatedAt: null,
            createdAt: new Date(), updatedAt: new Date() },
        ],
      },
    ]);
    const app = buildApp(mockPrisma);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].modelId).toBe("whisper-1");
    expect(body.data[0].providers).toHaveLength(1);
  });

  it("filters by stage query param", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.findMany.mockResolvedValue([]);
    const app = buildApp(mockPrisma);
    const res = await app.request("/?stage=stt");
    expect(res.status).toBe(200);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stage: "stt" }) })
    );
  });
});

describe("POST /", () => {
  it("creates a new model", async () => {
    const mockPrisma = createMockPrisma();
    const created = { id: "m2", stage: "stt", modelId: "nova-x", label: "Nova X",
      developer: "deepgram", isActive: true, createdAt: new Date(), providers: [] };
    mockPrisma.aiModel.create.mockResolvedValue(created);
    const app = buildApp(mockPrisma);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "stt", modelId: "nova-x", label: "Nova X", developer: "deepgram" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.modelId).toBe("nova-x");
  });

  it("returns 400 if required fields missing", async () => {
    const mockPrisma = createMockPrisma();
    const app = buildApp(mockPrisma);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "stt" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /:id/providers", () => {
  it("adds a provider to a model", async () => {
    const mockPrisma = createMockPrisma();
    const created = { id: "p2", aiModelId: "m1", provider: "groq", providerLabel: "Groq",
      pricePerMinute: 0.000667, priceInputPerMToken: null, priceOutputPerMToken: null,
      pricePerKChars: null, isDefault: false, isAvailable: true,
      priceUpdatedAt: null, createdAt: new Date(), updatedAt: new Date() };
    mockPrisma.aiModelProvider.create.mockResolvedValue(created);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", providerLabel: "Groq", pricePerMinute: 0.000667 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.provider).toBe("groq");
  });
});

describe("PATCH /:id (toggle isActive)", () => {
  it("toggles model active state", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModel.update.mockResolvedValue({ id: "m1", isActive: false, providers: [] } as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /:id/providers/:providerId", () => {
  it("updates provider pricing", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModelProvider.update.mockResolvedValue({ id: "p1", pricePerMinute: 0.007 } as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers/p1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerMinute: 0.007 }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /:id/providers/:providerId", () => {
  it("removes a provider", async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma.aiModelProvider.delete.mockResolvedValue({} as any);
    const app = buildApp(mockPrisma);
    const res = await app.request("/m1/providers/p1", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run worker/routes/admin/__tests__/ai-models.test.ts
```

Expected: FAIL — `aiModelsRoutes` not found.

- [ ] **Step 3: Implement the routes**

Create `worker/routes/admin/ai-models.ts`:

```typescript
import { Hono } from "hono";
import type { Env } from "../../types";

export const aiModelsRoutes = new Hono<{ Bindings: Env }>();

// GET / — list models with providers, optional ?stage= and ?includeInactive=true filters
aiModelsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.query("stage");
  const includeInactive = c.req.query("includeInactive") === "true";
  const data = await prisma.aiModel.findMany({
    where: {
      ...(stage ? { stage } : {}),
      ...(!includeInactive && { isActive: true }),
    },
    include: { providers: { orderBy: { isDefault: "desc" } } },
    orderBy: [{ stage: "asc" }, { label: "asc" }],
  });
  return c.json({ data });
});

// POST / — create a new model
aiModelsRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const { stage, modelId, label, developer } = body;
  if (!stage || !modelId || !label || !developer) {
    return c.json({ error: "stage, modelId, label, and developer are required" }, 400);
  }
  const data = await prisma.aiModel.create({
    data: { stage, modelId, label, developer },
    include: { providers: true },
  });
  return c.json({ data }, 201);
});

// POST /:id/providers — add a provider to a model
aiModelsRoutes.post("/:id/providers", async (c) => {
  const prisma = c.get("prisma") as any;
  const aiModelId = c.req.param("id");
  const body = await c.req.json();
  const { provider, providerLabel, pricePerMinute, priceInputPerMToken,
          priceOutputPerMToken, pricePerKChars, isDefault } = body;
  if (!provider || !providerLabel) {
    return c.json({ error: "provider and providerLabel are required" }, 400);
  }
  const data = await prisma.aiModelProvider.create({
    data: {
      aiModelId, provider, providerLabel,
      pricePerMinute: pricePerMinute ?? null,
      priceInputPerMToken: priceInputPerMToken ?? null,
      priceOutputPerMToken: priceOutputPerMToken ?? null,
      pricePerKChars: pricePerKChars ?? null,
      isDefault: isDefault ?? false,
    },
  });
  return c.json({ data }, 201);
});

// PATCH /:id — toggle isActive on a model
aiModelsRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = await prisma.aiModel.update({
    where: { id },
    data: { ...("isActive" in body && { isActive: body.isActive }) },
    include: { providers: true },
  });
  return c.json({ data });
});

// PATCH /:id/providers/:providerId — update pricing or availability
// Using nested route to avoid collision with /:id matching "providers" as a model id
aiModelsRoutes.patch("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("providerId");
  const body = await c.req.json();
  const data = await prisma.aiModelProvider.update({
    where: { id },
    data: {
      ...("providerLabel" in body && { providerLabel: body.providerLabel }),
      ...("pricePerMinute" in body && { pricePerMinute: body.pricePerMinute }),
      ...("priceInputPerMToken" in body && { priceInputPerMToken: body.priceInputPerMToken }),
      ...("priceOutputPerMToken" in body && { priceOutputPerMToken: body.priceOutputPerMToken }),
      ...("pricePerKChars" in body && { pricePerKChars: body.pricePerKChars }),
      ...("isDefault" in body && { isDefault: body.isDefault }),
      ...("isAvailable" in body && { isAvailable: body.isAvailable }),
    },
  });
  return c.json({ data });
});

// DELETE /:id/providers/:providerId — remove a provider
aiModelsRoutes.delete("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("providerId");
  await prisma.aiModelProvider.delete({ where: { id } });
  return c.json({ success: true });
});
```

- [ ] **Step 4: Register routes in admin index**

In `worker/routes/admin/index.ts`, add:

```typescript
import { aiModelsRoutes } from "./ai-models";
// ...
adminRoutes.route("/ai-models", aiModelsRoutes);
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx vitest run worker/routes/admin/__tests__/ai-models.test.ts
```

Expected: 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add worker/routes/admin/ai-models.ts worker/routes/admin/__tests__/ai-models.test.ts worker/routes/admin/index.ts
git commit -m "feat(admin): AI model registry API routes"
```

---

## Chunk 2: Worker Integration + Pricing Cron

### Task 4: Add getModelRegistry() to worker/lib/ai-models.ts

**Files:**
- Modify: `worker/lib/ai-models.ts`
- Modify: `worker/lib/__tests__/ai-models.test.ts`

- [ ] **Step 1: Add failing test**

Add to `worker/lib/__tests__/ai-models.test.ts`:

```typescript
import { getModelRegistry } from "../ai-models";

describe("getModelRegistry", () => {
  it("returns models for a given stage from DB", async () => {
    const mockPrisma = { aiModel: { findMany: vi.fn() } };
    mockPrisma.aiModel.findMany.mockResolvedValue([
      {
        id: "m1", stage: "stt", modelId: "whisper-1", label: "Whisper v1",
        developer: "openai", isActive: true, createdAt: new Date(),
        providers: [
          { id: "p1", provider: "openai", providerLabel: "OpenAI",
            pricePerMinute: 0.006, isDefault: true, isAvailable: true },
        ],
      },
    ]);
    const result = await getModelRegistry(mockPrisma, "stt");
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe("whisper-1");
    expect(result[0].providers).toHaveLength(1);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stage: "stt", isActive: true } })
    );
  });

  it("returns all stages when no stage given", async () => {
    const mockPrisma = { aiModel: { findMany: vi.fn().mockResolvedValue([]) } };
    await getModelRegistry(mockPrisma);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run worker/lib/__tests__/ai-models.test.ts
```

- [ ] **Step 3: Add getModelRegistry to worker/lib/ai-models.ts**

```typescript
export async function getModelRegistry(
  prisma: any,
  stage?: AIStage
): Promise<any[]> {
  return prisma.aiModel.findMany({
    where: { isActive: true, ...(stage ? { stage } : {}) },
    include: { providers: { where: { isAvailable: true }, orderBy: { isDefault: "desc" } } },
    orderBy: { label: "asc" },
  });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run worker/lib/__tests__/ai-models.test.ts
```

Expected: all tests passing (previously passing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/ai-models.ts worker/lib/__tests__/ai-models.test.ts
git commit -m "feat(ai-models): add getModelRegistry() backed by DB"
```

---

### Task 5: Add provider field to STT providers + benchmark runner

**Files:**
- Modify: `worker/lib/stt-providers.ts`
- Modify: `worker/lib/stt-benchmark-runner.ts`
- Modify: `worker/routes/admin/stt-benchmark.ts`

- [ ] **Step 1: Add `provider` field to SttProvider interface**

In `worker/lib/stt-providers.ts`, update `SttProvider`:

```typescript
export interface SttProvider {
  name: string;
  modelId: string;
  provider: string;  // inference provider key, e.g. "openai", "cloudflare", "deepgram"
  transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult>;
  poll?(jobId: string, env: Env): Promise<SttPollResult>;
}
```

Then add `provider` to each provider object:

```typescript
const WhisperProvider: SttProvider = { name: "OpenAI Whisper", modelId: "whisper-1", provider: "openai", ... };
const DeepgramProvider: SttProvider = { name: "Deepgram Nova-2", modelId: "nova-2", provider: "deepgram", ... };
const DeepgramNova3Provider: SttProvider = { name: "Deepgram Nova-3", modelId: "nova-3", provider: "deepgram", ... };
const AssemblyAIProvider: SttProvider = { name: "AssemblyAI Best", modelId: "assemblyai-best", provider: "assemblyai", ... };
const GoogleSttProvider: SttProvider = { name: "Google Chirp", modelId: "google-chirp", provider: "google", ... };
```

- [ ] **Step 2: Update benchmark runner to record provider**

In `worker/lib/stt-benchmark-runner.ts`, wherever a `SttBenchmarkResult` is created or updated with status COMPLETED, add `provider: provider.provider`. Find the `prisma.sttBenchmarkResult.update(...)` calls and add:

```typescript
provider: provider.provider,
```

- [ ] **Step 3: Update stt-benchmark route — validate against DB**

In `worker/routes/admin/stt-benchmark.ts`, the model validation currently checks against `STT_PROVIDERS`. Add DB validation as a secondary check or keep as-is for now (the static provider list is still authoritative for what's actually implemented).

No change needed here — the route already validates against `STT_PROVIDERS` which is the correct implementation registry.

- [ ] **Step 4: Run related tests**

```bash
npx vitest run worker/queues/__tests__/transcription.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add worker/lib/stt-providers.ts worker/lib/stt-benchmark-runner.ts
git commit -m "feat(stt): add provider field to SttProvider, record in benchmark results"
```

---

### Task 6: Daily pricing updater cron

**Files:**
- Create: `worker/lib/pricing-updater.ts`
- Modify: `worker/queues/index.ts` (scheduled handler)

The cron runs on the existing `*/30 * * * *` schedule but only refreshes prices once per day using a `PlatformConfig` timestamp gate.

- [ ] **Step 1: Create pricing-updater.ts**

```typescript
// worker/lib/pricing-updater.ts
/**
 * Pricing updater — called from the daily cron gate in the scheduled handler.
 * Each provider function returns current known prices. These are static for now;
 * replace with HTTP calls when providers expose pricing APIs.
 */

interface ProviderPrice {
  modelId: string;
  provider: string;
  pricePerMinute?: number;
  priceInputPerMToken?: number;
  priceOutputPerMToken?: number;
  pricePerKChars?: number;
}

/**
 * Returns current known prices for all tracked model/provider combos.
 * Extend this function when providers add pricing APIs.
 */
function getKnownPrices(): ProviderPrice[] {
  return [
    { modelId: "whisper-1", provider: "openai",      pricePerMinute: 0.006 },
    { modelId: "whisper-1", provider: "cloudflare",  pricePerMinute: 0.0005 },
    { modelId: "whisper-1", provider: "groq",        pricePerMinute: 0.000667 },
    { modelId: "nova-2",    provider: "deepgram",    pricePerMinute: 0.0043 },
    { modelId: "nova-3",    provider: "deepgram",    pricePerMinute: 0.0077 },
    { modelId: "nova-3",    provider: "cloudflare",  pricePerMinute: 0.0052 },
    { modelId: "assemblyai-best", provider: "assemblyai", pricePerMinute: 0.015 },
    { modelId: "google-chirp",    provider: "google",     pricePerMinute: 0.024 },
    { modelId: "claude-sonnet-4-20250514", provider: "anthropic", priceInputPerMToken: 3.0,  priceOutputPerMToken: 15.0 },
    { modelId: "claude-haiku-4-5-20251001", provider: "anthropic", priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
    { modelId: "claude-opus-4-20250514",   provider: "anthropic", priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
    { modelId: "gpt-4o-mini-tts", provider: "openai", pricePerMinute: 0.015 },
    { modelId: "tts-1",    provider: "openai", pricePerKChars: 15.0 },
    { modelId: "tts-1-hd", provider: "openai", pricePerKChars: 30.0 },
  ];
}

export async function refreshPricing(prisma: any): Promise<{ updated: number }> {
  const prices = getKnownPrices();
  const now = new Date();
  let updated = 0;

  for (const p of prices) {
    // Find the AiModel for this modelId (any stage — modelId is unique enough per provider)
    const providers = await prisma.aiModelProvider.findMany({
      where: { provider: p.provider, model: { modelId: p.modelId } },
      include: { model: true },
    });

    for (const row of providers) {
      await prisma.aiModelProvider.update({
        where: { id: row.id },
        data: {
          pricePerMinute: p.pricePerMinute ?? null,
          priceInputPerMToken: p.priceInputPerMToken ?? null,
          priceOutputPerMToken: p.priceOutputPerMToken ?? null,
          pricePerKChars: p.pricePerKChars ?? null,
          priceUpdatedAt: now,
        },
      });
      updated++;
    }
  }

  return { updated };
}
```

- [ ] **Step 2: Add daily gate to scheduled handler**

In `worker/queues/index.ts`, inside `scheduled()`, add after the feed refresh enqueue:

```typescript
// Refresh AI model pricing once per day
const lastPriceRefresh = await getConfig<string | null>(prisma, "pricing.lastRefreshedAt", null);
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
if (!lastPriceRefresh || new Date(lastPriceRefresh) < oneDayAgo) {
  const { refreshPricing } = await import("../lib/pricing-updater");
  const { updated } = await refreshPricing(prisma);
  log.info("pricing_refreshed", { updated });
  await prisma.platformConfig.upsert({
    where: { key: "pricing.lastRefreshedAt" },
    update: { value: new Date().toISOString() },
    create: { key: "pricing.lastRefreshedAt", value: new Date().toISOString(), description: "Last pricing refresh timestamp" },
  });
}
```

- [ ] **Step 3: Add import at top of index.ts** (or use dynamic import as shown above — dynamic is fine for an infrequent cron path).

- [ ] **Step 4: Commit**

```bash
git add worker/lib/pricing-updater.ts worker/queues/index.ts
git commit -m "feat(cron): daily AI pricing refresh in scheduled handler"
```

---

## Chunk 3: Frontend

### Task 7: Update frontend types and slim down ai-models.ts

**Files:**
- Modify: `src/lib/ai-models.ts`
- Modify: `src/types/admin.ts`

- [ ] **Step 1: Add API response types to src/types/admin.ts**

```typescript
// In src/types/admin.ts, add:

export interface AiModelProviderEntry {
  id: string;
  aiModelId: string;
  provider: string;
  providerLabel: string;
  pricePerMinute: number | null;
  priceInputPerMToken: number | null;
  priceOutputPerMToken: number | null;
  pricePerKChars: number | null;
  isDefault: boolean;
  isAvailable: boolean;
  priceUpdatedAt: string | null;
}

export interface AiModelEntry {
  id: string;
  stage: string;
  modelId: string;
  label: string;
  developer: string;
  isActive: boolean;
  providers: AiModelProviderEntry[];
}
```

Note: `AiModelEntry` here is the API response shape. The existing local `AIModelEntry` interface in `src/lib/ai-models.ts` (used in the static list) can be retired once all consumers use the API.

- [ ] **Step 2: Slim down src/lib/ai-models.ts**

Remove `AI_MODELS` constant and `AIModelEntry`/`AIModelConfig` interfaces (now in `src/types/admin.ts`). Keep only what the frontend truly needs at module level (no API call):

```typescript
/**
 * Canonical stage identifiers and display labels.
 * Model data is now DB-backed — fetch from GET /api/admin/ai-models.
 */

export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export const STAGE_LABELS: Record<AIStage, string> = {
  stt: "Transcription",
  distillation: "Distillation",
  narrative: "Narrative Generation",
  tts: "Audio Generation",
};
```

- [ ] **Step 3: Update worker/lib/ai-models.ts**

`worker/lib/ai-models.ts` currently re-exports `AIModelEntry` and `AIModelConfig` from `src/lib/ai-models.ts`. Since Task 7 Step 2 removes those from `src/lib/ai-models.ts`, the re-export line will break. Fix it explicitly:

Replace the top of `worker/lib/ai-models.ts`:

```typescript
// BEFORE (broken after Step 2):
export type { AIStage, AIModelEntry, AIModelConfig } from "../../src/lib/ai-models";
export { STAGE_LABELS, AI_MODELS } from "../../src/lib/ai-models";
import type { AIStage, AIModelConfig } from "../../src/lib/ai-models";
import { AI_MODELS } from "../../src/lib/ai-models";

// AFTER — preserve the getConfig import at the top, it is required by getModelConfig():
import { getConfig } from "./config";
export type { AIStage } from "../../src/lib/ai-models";
export { STAGE_LABELS } from "../../src/lib/ai-models";
import type { AIStage } from "../../src/lib/ai-models";

export interface AIModelConfig {
  provider: string;
  model: string;
}
```

Remove `AI_MODELS` from imports (it no longer exists in `src/lib/ai-models.ts` after Step 2). The `DEFAULTS` map in `worker/lib/ai-models.ts` can stay as-is since it uses inline values, not `AI_MODELS`.

- [ ] **Step 4: Fix any broken imports**

```bash
npx tsc --noEmit 2>&1 | grep "ai-models\|AIModelEntry\|AIModelConfig"
```

Fix any imports that broke. Configuration.tsx was importing `AI_MODELS` and `AIModelEntry` — these will need updating in the next task.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models.ts src/types/admin.ts worker/lib/ai-models.ts
git commit -m "refactor(ai-models): slim frontend to stage labels only, move types to admin.ts"
```

---

### Task 8: Update admin configuration page to fetch models from API

**Files:**
- Modify: `src/pages/admin/configuration.tsx`

The model selector in the AI Models category currently reads from the static `AI_MODELS` object. Replace with an API fetch.

- [ ] **Step 1: Add model registry fetch to configuration.tsx**

Remove the `AI_MODELS` import. Add a fetch for each stage's models:

```typescript
// Replace:
// import { AI_MODELS, STAGE_LABELS } from "@/lib/ai-models";
// With:
import { STAGE_LABELS } from "@/lib/ai-models";
import type { AiModelEntry } from "@/types/admin";

// Add state alongside other state:
const [modelRegistry, setModelRegistry] = useState<AiModelEntry[]>([]);

// Add to the existing useEffect that loads config (or add a new one):
useEffect(() => {
  apiFetch("/ai-models").then((res: any) => setModelRegistry(res.data ?? []));
}, []);
```

- [ ] **Step 2: Update model selector to use modelRegistry**

Replace references to `AI_MODELS[stageKey as AIStage]` with:

```typescript
// Get models for a stage from the registry
function getStageModels(stage: string): AiModelEntry[] {
  return modelRegistry.filter((m) => m.stage === stage);
}

// Get model label from registry
function getModelLabel(stageKey: string, modelId: string): string {
  const m = modelRegistry.find((m) => m.stage === stageKey && m.modelId === modelId);
  return m?.label ?? modelId;
}
```

Update the model selector render (previously `stageModels.map(...)`) to iterate `getStageModels(mt.key)` and show `m.label`.

- [ ] **Step 3: Run configuration tests**

```bash
npx vitest run src/__tests__/admin/configuration.test.tsx
```

Update mocks if needed (the test may need `apiFetch` mocked to return model registry data).

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/configuration.tsx
git commit -m "feat(config-page): fetch AI models from DB registry instead of static list"
```

---

### Task 9: Admin UI — Model Registry section

**Files:**
- Create: `src/pages/admin/model-registry.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/layouts/AdminLayout.tsx` (add nav link)

This is a new admin page (not a section of configuration) since it's a full CRUD interface.

- [ ] **Step 1: Create model-registry.tsx page**

The page shows:
- Tab bar with stage filters (All / Transcription / Distillation / Narrative Generation / Audio Generation)
- Table of models for selected stage: columns = Model, Developer, Providers (count), Default Provider, Actions
- Expand row to see provider list with pricing columns
- "Add Model" button → inline form (stage, modelId, label, developer)
- Per-model "Add Provider" button → inline form (provider, providerLabel, pricing fields)
- Per-provider "Edit" (pricing only) and "Remove" actions

Use `useFetch<{ data: AiModelEntry[] }>("/api/admin/ai-models")` for initial load, then manual refetch after mutations via `useApiFetch`.

Key pricing display helper:
```typescript
function formatPrice(p: AiModelProviderEntry): string {
  if (p.pricePerMinute != null) return `$${p.pricePerMinute.toFixed(5)}/min`;
  if (p.priceInputPerMToken != null) return `$${p.priceInputPerMToken}/$${p.priceOutputPerMToken} /1M tokens`;
  if (p.pricePerKChars != null) return `$${p.pricePerKChars}/1K chars`;
  return "—";
}
```

- [ ] **Step 2: Add route in src/App.tsx**

```tsx
// Add with other lazy admin routes:
const ModelRegistryPage = lazy(() => import("./pages/admin/model-registry"));

// Add route:
<Route path="/admin/model-registry" element={<ModelRegistryPage />} />
```

- [ ] **Step 3: Add nav link in AdminLayout**

Add "Model Registry" link alongside other admin nav items.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/model-registry.tsx src/App.tsx src/layouts/AdminLayout.tsx
git commit -m "feat(admin): model registry page with full CRUD for models and providers"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npx vitest run worker/lib/__tests__/ai-models.test.ts worker/routes/admin/__tests__/ai-models.test.ts src/__tests__/admin/configuration.test.tsx
```

Expected: all pass.

- [ ] **TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "pre-existing-known-errors"
```

No new errors introduced by this feature.

- [ ] **Smoke test in dev**

```bash
npm run dev
```

Navigate to `/admin/model-registry`. Verify: models load from DB, Add Model form works, Add Provider form works, prices display correctly.

- [ ] **Final commit + push**

See `superpowers:finishing-a-development-branch` skill for merge/PR options.
