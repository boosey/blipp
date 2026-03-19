# Prompt Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all LLM prompts from hardcoded constants to runtime-configurable PlatformConfig entries with an admin UI for inspection and editing, and enhance default prompts with notable quote extraction and podcast-voice narrative style.

**Architecture:** Prompts are stored as PlatformConfig entries (key-value with JSON value). The pipeline loads prompts at runtime via `getConfig()` with hardcoded defaults as fallback — zero downtime if no config exists. A new admin page provides a textarea editor per prompt with reset-to-default. Template variables in the narrative user prompt use `{{variable}}` syntax replaced at runtime.

**Tech Stack:** Hono API routes, PlatformConfig (Prisma), React admin page, existing `getConfig()` with 60s TTL cache.

**Decisions Log (for user review):**
1. **Storage:** PlatformConfig (existing table) — no schema changes needed
2. **Keys:** `prompt.claims.system`, `prompt.narrative.system.with_excerpts`, `prompt.narrative.system.no_excerpts`, `prompt.narrative.user_template`, `prompt.narrative.metadata_intro`
3. **Template variables:** `{{targetWords}}`, `{{durationMinutes}}`, `{{wpm}}`, `{{metadataBlock}}`, `{{claimsLabel}}`, `{{claimsJson}}` — simple string replacement, not a template engine
4. **Versioning:** Not in this phase — PlatformConfig audit log already tracks before/after for every change. A/B testing is future work.
5. **Claim schema update:** Add optional `notable_quote` field to the Zod schema and Claim interface
6. **Prompt enhancements:** Updated defaults include quote extraction guidance and podcast-voice (first-person plural) narrative style
7. **Admin page placement:** Under existing "AI" sidebar group as "Prompts"
8. **No new dependencies** — everything uses existing patterns

---

### Task 1: Create prompt defaults module

**Files:**
- Create: `worker/lib/prompt-defaults.ts`

This module exports all default prompt strings as named constants, making them importable by both the pipeline code and the admin API (for reset-to-default).

- [ ] **Step 1: Create the defaults module**

```typescript
// worker/lib/prompt-defaults.ts

/** Default system prompt for claims extraction (Stage 2). */
export const DEFAULT_CLAIMS_SYSTEM_PROMPT = `You are a podcast analyst. Extract all significant factual claims, insights, arguments, and notable statements from podcast transcripts.

For each claim, include:
- "claim": the factual assertion (one clear sentence)
- "speaker": who made the claim (use "Host" or "Guest" if name unknown)
- "importance": 1-10 rating (10 = critical takeaway, 1 = minor detail)
- "novelty": 1-10 rating (10 = surprising/counterintuitive, 1 = common knowledge)
- "excerpt": the verbatim passage from the transcript that contains or supports this claim — include enough surrounding context that someone could write a detailed summary from the excerpt alone (may be one sentence or a full exchange)
- "notable_quote": (optional) if the claim contains a particularly vivid, memorable, or authoritative direct quote from a speaker, include it here verbatim. Not every claim needs one — only when the speaker's exact words add impact or authority. Omit this field entirely if no quote stands out.

Guidelines:
- Extract every claim worth preserving — do NOT limit to a fixed number
- A dense 3-hour episode may yield 30-40 claims; a light 20-minute episode may yield 8-12
- EXCLUDE ALL ADVERTISEMENTS: Skip any sponsored segments, ad reads, product promotions, discount codes, affiliate pitches, or endorsements of sponsors. If a host says "this episode is brought to you by..." or promotes a product/service as part of a sponsorship, exclude ALL claims from that segment. Do not extract claims about sponsor products, services, or offers even if they sound factual.
- Skip filler, repetition, and off-topic tangents
- Excerpts must be VERBATIM from the transcript, not paraphrased
- Sort by importance descending

Return ONLY a JSON array. No markdown fences, no commentary.`;

/** Default system prompt for narrative generation with excerpts (Stage 3). */
export const DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS = `You are writing a spoken audio summary for a podcast briefing app. Write as if you ARE the podcast — use first-person plural ("we", "our") for statements made by the hosts, and attribute guest statements naturally ("our guest explained...", "as [name] put it...").

Rules:
- Write in a conversational, engaging tone suitable for audio — this should sound like a podcast recap, not a news report
- Cover claims in rough order of importance, but group related topics
- Use the EXCERPT text for accurate detail and context — do NOT invent facts beyond what the excerpts contain
- When a claim includes a notable_quote, weave it into the narrative as a direct quote attributed to the speaker. Use sparingly — 2-3 direct quotes max per briefing to keep it natural.
- Use natural transitions between topics
- For shorter briefings (1-3 minutes), focus only on the highest-impact claims
- For longer briefings (10+ minutes), include supporting context and nuance from excerpts
- Do NOT include stage directions, speaker labels, or markdown
- Do NOT use phrases like "In this episode" or "The podcast discussed" — you ARE the podcast
- Output ONLY the narrative text`;

/** Default system prompt for narrative generation without excerpts (Stage 3 fallback). */
export const DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS = `You are writing a spoken audio summary for a podcast briefing app. Write as if you ARE the podcast — use first-person plural ("we", "our") for host statements, and attribute guest statements naturally.

Rules:
- Write in a conversational, engaging tone suitable for audio
- Cover the most important claims first
- When a claim includes a notable_quote, weave it in as a direct quote
- Use natural transitions between topics
- Do NOT include stage directions, speaker labels, or markdown
- Do NOT use phrases like "In this episode" or "The podcast discussed" — you ARE the podcast
- Output ONLY the narrative text`;

/** Default user prompt template for narrative generation. Variables: {{targetWords}}, {{durationMinutes}}, {{wpm}}, {{metadataBlock}}, {{claimsLabel}}, {{claimsJson}} */
export const DEFAULT_NARRATIVE_USER_TEMPLATE = `TARGET: approximately {{targetWords}} words ({{durationMinutes}} minutes at {{wpm}} wpm).
{{metadataBlock}}
{{claimsLabel}}:
{{claimsJson}}`;

/** Default metadata intro block for narrative generation. */
export const DEFAULT_NARRATIVE_METADATA_INTRO = `Begin the narrative with a brief spoken introduction stating the podcast name and episode title.

Example: "From The Daily — The Election Results."

Then proceed directly into the content summary.`;

/** Config keys for all prompts. */
export const PROMPT_CONFIG_KEYS = {
  claimsSystem: "prompt.claims.system",
  narrativeSystemWithExcerpts: "prompt.narrative.system.with_excerpts",
  narrativeSystemNoExcerpts: "prompt.narrative.system.no_excerpts",
  narrativeUserTemplate: "prompt.narrative.user_template",
  narrativeMetadataIntro: "prompt.narrative.metadata_intro",
} as const;

/** Prompt metadata for admin display. */
export const PROMPT_METADATA: Record<string, { label: string; description: string; stage: string }> = {
  [PROMPT_CONFIG_KEYS.claimsSystem]: {
    label: "Claims Extraction — System Prompt",
    description: "Instructs the LLM how to extract claims from a podcast transcript. Used in Stage 2 (Distillation).",
    stage: "distillation",
  },
  [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: {
    label: "Narrative Generation — System Prompt (with excerpts)",
    description: "Instructs the LLM how to write the spoken narrative from claims + excerpts. Used in Stage 3 (Narrative Generation).",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: {
    label: "Narrative Generation — System Prompt (no excerpts)",
    description: "Fallback system prompt when claims lack excerpt data. Used in Stage 3.",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: {
    label: "Narrative Generation — User Prompt Template",
    description: "Template for the user message sent to the LLM. Variables: {{targetWords}}, {{durationMinutes}}, {{wpm}}, {{metadataBlock}}, {{claimsLabel}}, {{claimsJson}}",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: {
    label: "Narrative Generation — Metadata Intro",
    description: "Instructions for the episode intro line (podcast name + episode title). Injected into the user prompt via {{metadataBlock}}.",
    stage: "narrative",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/prompt-defaults.ts
git commit -m "feat: create prompt defaults module with enhanced prompts"
```

---

### Task 2: Add notable_quote to Claim schema

**Files:**
- Modify: `worker/lib/distillation.ts` (ClaimSchema, Claim interface)

- [ ] **Step 1: Update the Claim interface and Zod schema**

In `worker/lib/distillation.ts`, add `notable_quote` as optional:

```typescript
export interface Claim {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
  excerpt: string;
  notable_quote?: string;
}

const ClaimSchema = z.object({
  claim: z.string().min(1),
  speaker: z.string(),
  importance: z.number().min(1).max(10),
  novelty: z.number().min(1).max(10),
  excerpt: z.string(),
  notable_quote: z.string().optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/distillation.ts
git commit -m "feat: add optional notable_quote field to Claim schema"
```

---

### Task 3: Update distillation.ts to load prompts from config

**Files:**
- Modify: `worker/lib/distillation.ts`

Replace hardcoded prompt constants with `getConfig()` calls using defaults from the new module. Both `extractClaims()` and `generateNarrative()` need a `prisma` parameter added.

- [ ] **Step 1: Update extractClaims to accept prisma and load prompt from config**

Add `prisma` as the first parameter. Load the claims system prompt via `getConfig()` with the default as fallback. Remove the hardcoded `CLAIMS_SYSTEM_PROMPT` constant.

```typescript
import { getConfig } from "./config";
import {
  DEFAULT_CLAIMS_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  DEFAULT_NARRATIVE_USER_TEMPLATE,
  DEFAULT_NARRATIVE_METADATA_INTRO,
  PROMPT_CONFIG_KEYS,
} from "./prompt-defaults";

export async function extractClaims(
  prisma: any,  // NEW — first param
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
  // ... rest unchanged
}
```

- [ ] **Step 2: Update generateNarrative to load prompts from config and use template variables**

Add `prisma` as the first parameter. Load system prompt and user template from config. Replace the hardcoded user content string with template variable substitution.

```typescript
export async function generateNarrative(
  prisma: any,  // NEW — first param
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

  // Load prompts from config with defaults
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

  // Template variable substitution
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
  // ... rest unchanged
}
```

- [ ] **Step 3: Remove old hardcoded prompt constants**

Delete `CLAIMS_SYSTEM_PROMPT`, `NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS`, `NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS`, and the `buildMetadataIntro()` function from `distillation.ts`.

- [ ] **Step 4: Commit**

```bash
git add worker/lib/distillation.ts
git commit -m "feat: load prompts from PlatformConfig with hardcoded defaults"
```

---

### Task 4: Update queue handlers to pass prisma to distillation functions

**Files:**
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/narrative-generation.ts`

Both queue handlers already have a `prisma` instance (created via `createPrismaClient`). They just need to pass it as the first argument to `extractClaims()` and `generateNarrative()`.

- [ ] **Step 1: Update distillation queue handler**

Find the call to `extractClaims(llm, transcript, ...)` and add `prisma` as the first argument:
```typescript
const { claims, usage } = await extractClaims(prisma, llm, transcript, ...);
```

- [ ] **Step 2: Update narrative-generation queue handler**

Find the call to `generateNarrative(llm, claims, ...)` and add `prisma` as the first argument:
```typescript
const { narrative, usage } = await generateNarrative(prisma, llm, selectedClaims, ...);
```

- [ ] **Step 3: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/narrative-generation.ts
git commit -m "feat: pass prisma to extractClaims and generateNarrative for config loading"
```

---

### Task 5: Update tests for new function signatures

**Files:**
- Modify: `worker/lib/__tests__/distillation.test.ts` (if exists)
- Modify: `worker/queues/__tests__/distillation.test.ts` (if exists)
- Modify: `worker/queues/__tests__/narrative-generation.test.ts` (if exists)

Add mock `prisma` as the first argument to all `extractClaims()` and `generateNarrative()` calls in tests. The mock prisma needs `platformConfig.findUnique` returning null (so defaults are used).

- [ ] **Step 1: Find and update all test files that call extractClaims or generateNarrative**

```bash
grep -rn "extractClaims\|generateNarrative" worker/ --include="*.test.ts"
```

For each call, prepend `mockPrisma` as the first argument. Add to the mock prisma:
```typescript
platformConfig: { findUnique: vi.fn().mockResolvedValue(null) }
```

- [ ] **Step 2: Run tests to verify**

```bash
npx vitest run worker/queues/__tests__/distillation.test.ts worker/queues/__tests__/narrative-generation.test.ts worker/lib/__tests__/ --reporter=verbose
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: update distillation/narrative tests for prisma parameter"
```

---

### Task 6: Create admin prompts API route

**Files:**
- Create: `worker/routes/admin/prompts.ts`
- Modify: `worker/routes/admin/index.ts`

- [ ] **Step 1: Create the prompts admin route**

```typescript
// worker/routes/admin/prompts.ts
import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import { writeAuditLog } from "../../lib/audit-log";
import {
  PROMPT_CONFIG_KEYS,
  PROMPT_METADATA,
  DEFAULT_CLAIMS_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  DEFAULT_NARRATIVE_USER_TEMPLATE,
  DEFAULT_NARRATIVE_METADATA_INTRO,
} from "../../lib/prompt-defaults";

const DEFAULTS: Record<string, string> = {
  [PROMPT_CONFIG_KEYS.claimsSystem]: DEFAULT_CLAIMS_SYSTEM_PROMPT,
  [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: DEFAULT_NARRATIVE_USER_TEMPLATE,
  [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: DEFAULT_NARRATIVE_METADATA_INTRO,
};

const promptsRoutes = new Hono<{ Bindings: Env }>();

// GET / — List all prompts with current values (from config or defaults)
promptsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  const keys = Object.values(PROMPT_CONFIG_KEYS);
  let configs: any[] = [];
  try {
    configs = await prisma.platformConfig.findMany({
      where: { key: { in: keys } },
    });
  } catch {
    // Table may not exist
  }

  const configMap = new Map(configs.map((c: any) => [c.key, c]));

  const data = keys.map((key) => {
    const config = configMap.get(key);
    const meta = PROMPT_METADATA[key];
    return {
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? "",
      stage: meta?.stage ?? "unknown",
      value: config ? (config.value as string) : DEFAULTS[key],
      isDefault: !config,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
      updatedBy: config?.updatedBy ?? null,
    };
  });

  return c.json({ data });
});

// PATCH /:key — Update a prompt
promptsRoutes.patch("/:key", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = decodeURIComponent(c.req.param("key"));
  const body = await c.req.json<{ value: string }>();

  if (!Object.values(PROMPT_CONFIG_KEYS).includes(key as any)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  if (typeof body.value !== "string" || body.value.trim().length === 0) {
    return c.json({ error: "Prompt value must be a non-empty string" }, 400);
  }

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key } });
    const meta = PROMPT_METADATA[key];

    if (existing) {
      await prisma.platformConfig.update({
        where: { key },
        data: {
          value: body.value,
          description: meta?.description,
          updatedBy: auth?.userId ?? null,
        },
      });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.update",
        entityType: "PlatformConfig",
        entityId: key,
        before: { value: (existing.value as string).slice(0, 200) + "..." },
        after: { value: body.value.slice(0, 200) + "..." },
      }).catch(() => {});
    } else {
      await prisma.platformConfig.create({
        data: {
          key,
          value: body.value,
          description: meta?.description,
          updatedBy: auth?.userId ?? null,
        },
      });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.create",
        entityType: "PlatformConfig",
        entityId: key,
        after: { value: body.value.slice(0, 200) + "..." },
      }).catch(() => {});
    }

    return c.json({ data: { key, value: body.value, isDefault: false } });
  } catch {
    return c.json({ error: "Failed to update prompt" }, 503);
  }
});

// DELETE /:key — Reset prompt to default (deletes config entry)
promptsRoutes.delete("/:key", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = decodeURIComponent(c.req.param("key"));

  if (!Object.values(PROMPT_CONFIG_KEYS).includes(key as any)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key } });
    if (existing) {
      await prisma.platformConfig.delete({ where: { key } });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.reset",
        entityType: "PlatformConfig",
        entityId: key,
        before: { value: (existing.value as string).slice(0, 200) + "..." },
        after: { value: "DEFAULT" },
      }).catch(() => {});
    }

    return c.json({ data: { key, value: DEFAULTS[key], isDefault: true } });
  } catch {
    return c.json({ error: "Failed to reset prompt" }, 503);
  }
});

export { promptsRoutes };
```

- [ ] **Step 2: Register the route in admin/index.ts**

Add import and route registration:
```typescript
import { promptsRoutes } from "./prompts";
// ...
adminRoutes.route("/prompts", promptsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add worker/routes/admin/prompts.ts worker/routes/admin/index.ts
git commit -m "feat: admin API for prompt management (CRUD + reset to default)"
```

---

### Task 7: Create admin prompt management page

**Files:**
- Create: `src/pages/admin/prompt-management.tsx`
- Modify: `src/App.tsx` (add lazy route)
- Modify: `src/layouts/admin-layout.tsx` (add sidebar entry)

- [ ] **Step 1: Create the admin page**

```typescript
// src/pages/admin/prompt-management.tsx
import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Save, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAdminFetch } from "../../lib/admin-api";

interface PromptEntry {
  key: string;
  label: string;
  description: string;
  stage: string;
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export default function PromptManagement() {
  const apiFetch = useAdminFetch();
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: PromptEntry[] }>("/prompts");
      setPrompts(res.data);
      // Initialize edit values
      const values: Record<string, string> = {};
      for (const p of res.data) values[p.key] = p.value;
      setEditValues(values);
    } catch {
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async (key: string) => {
    setSaving(key);
    try {
      await apiFetch(`/prompts/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValues[key] }),
      });
      toast.success("Prompt updated");
      await load();
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSaving(null);
    }
  }, [apiFetch, editValues, load]);

  const handleReset = useCallback(async (key: string) => {
    setSaving(key);
    try {
      const res = await apiFetch<{ data: { value: string } }>(`/prompts/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      toast.success("Reset to default");
      setEditValues((prev) => ({ ...prev, [key]: res.data.value }));
      await load();
    } catch {
      toast.error("Failed to reset prompt");
    } finally {
      setSaving(null);
    }
  }, [apiFetch, load]);

  const isDirty = (key: string) => {
    const original = prompts.find((p) => p.key === key);
    return original && editValues[key] !== original.value;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Prompt Management</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[#1A2942] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Group by stage
  const stages = new Map<string, PromptEntry[]>();
  for (const p of prompts) {
    if (!stages.has(p.stage)) stages.set(p.stage, []);
    stages.get(p.stage)!.push(p);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prompt Management</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          View and edit LLM prompts used in the pipeline. Changes take effect within 60 seconds (config cache TTL).
        </p>
      </div>

      {Array.from(stages.entries()).map(([stage, entries]) => (
        <div key={stage}>
          <h2 className="text-lg font-semibold capitalize mb-3 text-[#60A5FA]">
            {stage === "distillation" ? "Stage 2: Distillation (Claims Extraction)" : "Stage 3: Narrative Generation"}
          </h2>
          <div className="space-y-3">
            {entries.map((prompt) => {
              const expanded = expandedKey === prompt.key;
              const dirty = isDirty(prompt.key);
              const isSaving = saving === prompt.key;

              return (
                <div
                  key={prompt.key}
                  className="bg-[#1A2942] border border-[#2A3F5F] rounded-lg overflow-hidden"
                >
                  {/* Header — always visible */}
                  <button
                    onClick={() => setExpandedKey(expanded ? null : prompt.key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1E3352] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{prompt.label}</span>
                        {!prompt.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B]">
                            customized
                          </span>
                        )}
                        {dirty && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3B82F6]/20 text-[#3B82F6]">
                            unsaved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">{prompt.description}</p>
                    </div>
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded editor */}
                  {expanded && (
                    <div className="px-4 pb-4 space-y-3">
                      <textarea
                        value={editValues[prompt.key] ?? ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                        }
                        className="w-full h-64 bg-[#0F1B2E] border border-[#2A3F5F] rounded-lg p-3 text-sm font-mono text-[#E5E7EB] placeholder:text-[#6B7280] resize-y focus:outline-none focus:border-[#3B82F6]"
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-[#6B7280]">
                          {prompt.updatedAt
                            ? `Last updated: ${new Date(prompt.updatedAt).toLocaleString()}`
                            : "Using default"}
                        </div>
                        <div className="flex items-center gap-2">
                          {!prompt.isDefault && (
                            <button
                              onClick={() => handleReset(prompt.key)}
                              disabled={isSaving}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset to Default
                            </button>
                          )}
                          <button
                            onClick={() => handleSave(prompt.key)}
                            disabled={isSaving || !dirty}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#3B82F6] text-white rounded hover:bg-[#2563EB] transition-colors disabled:opacity-50"
                          >
                            <Save className="w-3 h-3" />
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add lazy route in App.tsx**

In the admin route section, add:
```typescript
const PromptManagement = lazy(() => import("./pages/admin/prompt-management"));

// In admin Route children:
<Route path="prompt-management" element={<Suspense fallback={<AdminLoading />}><PromptManagement /></Suspense>} />
```

- [ ] **Step 3: Add sidebar entry in admin-layout.tsx**

In the "ai" sidebar group, add:
```typescript
import { MessageSquare } from "lucide-react";

// In the ai group children array:
{ path: "prompt-management", label: "Prompts", icon: MessageSquare },
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/prompt-management.tsx src/App.tsx src/layouts/admin-layout.tsx
git commit -m "feat: admin prompt management page with editor and reset-to-default"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `docs/admin-platform.md` (add Prompts page)
- Modify: `docs/api-reference.md` (add prompts endpoints)
- Modify: `docs/pipeline.md` (note configurable prompts)

- [ ] **Step 1: Add prompt management to admin platform docs**

Add a section for the Prompts page under the AI group, documenting the page, available prompts, and the template variable syntax.

- [ ] **Step 2: Add API endpoints to reference**

```markdown
### Prompts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/prompts` | List all prompts with current/default values |
| PATCH | `/api/admin/prompts/:key` | Update a prompt |
| DELETE | `/api/admin/prompts/:key` | Reset prompt to default |
```

- [ ] **Step 3: Note in pipeline docs that prompts are configurable**

Add a note in the Distillation and Narrative Generation sections that prompts are loaded from PlatformConfig at runtime and can be edited via Admin > AI > Prompts.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: document prompt management admin page and API endpoints"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 2: Run relevant tests**

```bash
npx vitest run worker/queues/__tests__/ worker/lib/__tests__/ --reporter=verbose
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: If all pass, final commit and summary**

```bash
git log --oneline feat/prompt-management ^main
```

Report the full list of commits and decision summary for user review.
