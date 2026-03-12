# Distillation & Narrative Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded 10-claim extraction with variable density-driven extraction including verbatim excerpts, and add duration-aware claim selection to narrative generation.

**Architecture:** Two changes to `worker/lib/distillation.ts`: (1) `extractClaims()` gets a new prompt that extracts variable claims with excerpts, (2) new `selectClaimsForDuration()` function filters claims by composite score for the target duration. `generateNarrative()` gets an updated prompt that uses excerpts. The queue handlers get minimal changes — narrative-generation imports the selector and applies it before calling `generateNarrative()`. Backward compat: claims without `excerpt` fall back to legacy behavior.

**Tech Stack:** TypeScript, Anthropic SDK, Vitest, Prisma (no schema changes)

**Spec:** `docs/plans/2026-03-12-distillation-narrative-redesign-design.md`

---

## Chunk 1: Core Library Changes

### Task 1: Update Claim interface and add excerpt field

**Files:**
- Modify: `worker/lib/distillation.ts:7-17`
- Modify: `worker/lib/__tests__/distillation.test.ts:22-25,72-74`

- [ ] **Step 1: Update the Claim interface**

In `worker/lib/distillation.ts`, add the `excerpt` field to the `Claim` interface:

```typescript
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
```

- [ ] **Step 2: Update test fixtures to include excerpt field**

In `worker/lib/__tests__/distillation.test.ts`, update `sampleClaims` (line 22) and `claims` (line 72):

```typescript
// Line 22 — sampleClaims in extractClaims tests
const sampleClaims: Claim[] = [
  { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
  { claim: "Costs will drop by 40%", speaker: "Dr. Smith", importance: 8, novelty: 6, excerpt: "Our models show costs will drop by 40% within the next five years as automation scales." },
];

// Line 72 — claims in generateNarrative tests
const claims: Claim[] = [
  { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
];
```

- [ ] **Step 3: Run tests to verify fixtures pass with new field**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: All 8 tests pass (the Claim interface change is additive)

- [ ] **Step 4: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: add excerpt field to Claim interface"
```

---

### Task 2: Rewrite extractClaims() prompt for variable claims with excerpts

**Files:**
- Modify: `worker/lib/distillation.ts:30-70`
- Modify: `worker/lib/__tests__/distillation.test.ts:21-68`

- [ ] **Step 1: Write test asserting new prompt content**

In `worker/lib/__tests__/distillation.test.ts`, add a new test after the "should pass the transcript in the prompt" test (line 47):

```typescript
it("should ask for variable claims with excerpts in the prompt", async () => {
  const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
  await extractClaims(client, "My transcript");

  const call = client.messages.create.mock.calls[0][0];
  const prompt = call.messages[0].content;
  // Should NOT ask for fixed "top 10"
  expect(prompt).not.toContain("top 10");
  // Should ask for excerpts
  expect(prompt).toContain("excerpt");
  expect(prompt).toContain("verbatim");
  // Should use higher max_tokens
  expect(call.max_tokens).toBe(8192);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts -t "should ask for variable claims"`
Expected: FAIL — prompt still contains "top 10" and max_tokens is 2048

- [ ] **Step 3: Rewrite the extractClaims() prompt and bump max_tokens**

In `worker/lib/distillation.ts`, replace the `extractClaims` function body (lines 30-70):

```typescript
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
  const text = raw.replace(/^\`\`\`(?:json)?\s*\n?/i, "").replace(/\n?\`\`\`\s*$/i, "").trim();
  const claims: Claim[] = JSON.parse(text);

  const usage: AiUsage = {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: calculateCost(response.model, response.usage.input_tokens, response.usage.output_tokens),
  };

  return { claims, usage };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: All tests pass including the new prompt assertion

- [ ] **Step 5: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: rewrite extractClaims prompt for variable claims with excerpts"
```

---

### Task 3: Add selectClaimsForDuration() function

**Files:**
- Modify: `worker/lib/distillation.ts` (add new exported function after `extractClaims`)
- Modify: `worker/lib/__tests__/distillation.test.ts` (add new describe block)

- [ ] **Step 1: Write failing tests for selectClaimsForDuration**

In `worker/lib/__tests__/distillation.test.ts`, add the import of `selectClaimsForDuration` to the imports (line 3) and add a new `describe` block at the bottom of the file:

Update the import:
```typescript
import {
  extractClaims,
  generateNarrative,
  selectClaimsForDuration,
  WORDS_PER_MINUTE,
  type Claim,
} from "../distillation";
```

Add test block:
```typescript
describe("selectClaimsForDuration", () => {
  // 10 claims with varying importance/novelty scores
  const claims: Claim[] = Array.from({ length: 10 }, (_, i) => ({
    claim: `Claim ${i + 1}`,
    speaker: "Host",
    importance: 10 - i,         // 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
    novelty: Math.max(1, 5 - i), // 5, 4, 3, 2, 1, 1, 1, 1, 1, 1
    excerpt: `Excerpt for claim ${i + 1}`,
  }));

  it("returns minimum 3 claims for 1-minute tier", () => {
    const result = selectClaimsForDuration(claims, 1);
    expect(result).toHaveLength(3);
  });

  it("returns ~2.5 * duration claims for mid-range tiers", () => {
    const result = selectClaimsForDuration(claims, 3);
    // Math.ceil(3 * 2.5) = 8, capped at 10 available
    expect(result).toHaveLength(8);
  });

  it("caps at available claims count", () => {
    const result = selectClaimsForDuration(claims, 15);
    // Math.ceil(15 * 2.5) = 38, but only 10 available
    expect(result).toHaveLength(10);
  });

  it("sorts by composite score (importance 0.7 + novelty 0.3)", () => {
    const result = selectClaimsForDuration(claims, 1);
    // Top 3 by composite: claim 1 (10*0.7+5*0.3=8.5), claim 2 (9*0.7+4*0.3=7.5), claim 3 (8*0.7+3*0.3=6.5)
    expect(result[0].claim).toBe("Claim 1");
    expect(result[1].claim).toBe("Claim 2");
    expect(result[2].claim).toBe("Claim 3");
  });

  it("returns all claims when duration would require more than available", () => {
    const fewClaims = claims.slice(0, 2);
    const result = selectClaimsForDuration(fewClaims, 5);
    expect(result).toHaveLength(2);
  });

  it("handles empty claims array", () => {
    const result = selectClaimsForDuration([], 5);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts -t "selectClaimsForDuration"`
Expected: FAIL — `selectClaimsForDuration` is not exported from distillation.ts

- [ ] **Step 3: Implement selectClaimsForDuration**

In `worker/lib/distillation.ts`, add this function after the closing `}` of `extractClaims()` (after line 70ish, before `generateNarrative()`):

```typescript
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
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: All tests pass including the 6 new selectClaimsForDuration tests

- [ ] **Step 5: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: add selectClaimsForDuration for duration-aware claim filtering"
```

---

### Task 4: Update generateNarrative() prompt to use excerpts with backward compat

**Files:**
- Modify: `worker/lib/distillation.ts:84-126` (the generateNarrative function)
- Modify: `worker/lib/__tests__/distillation.test.ts`

- [ ] **Step 1: Write tests for the updated prompt behavior**

In `worker/lib/__tests__/distillation.test.ts`, add tests inside the existing `describe("generateNarrative")` block:

```typescript
it("should use excerpts-aware prompt when claims have excerpt field", async () => {
  const claimsWithExcerpts: Claim[] = [
    { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I believe AI will completely transform how we deliver healthcare services." },
  ];
  const client = createMockAnthropicClient("narrative text");
  await generateNarrative(client, claimsWithExcerpts, 3);

  const call = client.messages.create.mock.calls[0][0];
  expect(call.messages[0].content).toContain("CLAIMS AND EXCERPTS");
  expect(call.messages[0].content).toContain("EXCERPT text for accurate detail");
  expect(call.max_tokens).toBe(8192);
});

it("should use legacy prompt when claims lack excerpt field", async () => {
  const legacyClaims = [
    { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7 },
  ] as Claim[];
  const client = createMockAnthropicClient("narrative text");
  await generateNarrative(client, legacyClaims, 3);

  const call = client.messages.create.mock.calls[0][0];
  expect(call.messages[0].content).toContain("CLAIMS:");
  expect(call.messages[0].content).not.toContain("CLAIMS AND EXCERPTS");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts -t "should use excerpts-aware prompt"`
Expected: FAIL — current prompt uses "CLAIMS:" not "CLAIMS AND EXCERPTS"

- [ ] **Step 3: Update generateNarrative() with dual-prompt and max_tokens bump**

Replace the `generateNarrative` function in `worker/lib/distillation.ts`:

```typescript
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
```

- [ ] **Step 4: Run all distillation tests**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: update generateNarrative prompt to use excerpts with legacy fallback"
```

---

## Chunk 2: Queue Handler Changes

### Task 5: Update narrative-generation queue to use selectClaimsForDuration

**Files:**
- Modify: `worker/queues/narrative-generation.ts:1-9,106-129`
- Modify: `worker/queues/__tests__/narrative-generation.test.ts`

- [ ] **Step 1: Update test mock data to include excerpts**

In `worker/queues/__tests__/narrative-generation.test.ts`, update the `DISTILLATION` constant (line 64) and add the `selectClaimsForDuration` mock:

Update the mock setup at line 13 to also mock `selectClaimsForDuration`:
```typescript
vi.mock("../../lib/distillation", () => ({
  generateNarrative: vi.fn().mockResolvedValue({
    narrative: "A warm narrative about technology trends.",
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
  }),
  selectClaimsForDuration: vi.fn().mockImplementation((claims: any[]) => claims),
}));
```

Update the import (line 45):
```typescript
import { generateNarrative, selectClaimsForDuration } from "../../lib/distillation";
```

Update DISTILLATION constant (line 64):
```typescript
const DISTILLATION = {
  id: "dist-1",
  episodeId: "ep-1",
  status: "COMPLETED",
  claimsJson: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "Here is the verbatim excerpt for this claim." }],
};
```

Re-set the mock in `beforeEach` (after line 84):
```typescript
(selectClaimsForDuration as any).mockImplementation((claims: any[]) => claims);
```

- [ ] **Step 2: Write test asserting selectClaimsForDuration is called**

Add a new test in the main `describe("handleNarrativeGeneration")` block:

```typescript
it("calls selectClaimsForDuration before generating narrative", async () => {
  mockPrisma.workProduct.findFirst.mockResolvedValue(null);
  mockPrisma.distillation.findFirst.mockResolvedValue(DISTILLATION);
  mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

  const { mockBatch } = makeBatch(msgBody);
  await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

  expect(selectClaimsForDuration).toHaveBeenCalledWith(
    DISTILLATION.claimsJson,
    5 // durationTier from msgBody
  );
});

it("skips selectClaimsForDuration for legacy claims without excerpts", async () => {
  const legacyDistillation = {
    ...DISTILLATION,
    claimsJson: [{ claim: "Old claim", speaker: "Host", importance: 9, novelty: 7 }],
  };
  mockPrisma.workProduct.findFirst.mockResolvedValue(null);
  mockPrisma.distillation.findFirst.mockResolvedValue(legacyDistillation);
  mockPrisma.clip.upsert.mockResolvedValue({ id: "clip-1" });

  const { mockBatch } = makeBatch(msgBody);
  await handleNarrativeGeneration(mockBatch, mockEnv, mockCtx);

  expect(selectClaimsForDuration).not.toHaveBeenCalled();
  // All claims passed directly to generateNarrative
  expect(generateNarrative).toHaveBeenCalledWith(
    expect.anything(),
    legacyDistillation.claimsJson,
    5,
    expect.any(String)
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run worker/queues/__tests__/narrative-generation.test.ts -t "calls selectClaimsForDuration"`
Expected: FAIL — `selectClaimsForDuration` is not called in the queue handler

- [ ] **Step 4: Update the narrative-generation queue handler**

In `worker/queues/narrative-generation.ts`:

Update the import (line 5):
```typescript
import { generateNarrative, selectClaimsForDuration } from "../lib/distillation";
```

Replace the claims loading + narrative generation section (around lines 106-129). Find this block:
```typescript
        const claims = distillation.claimsJson as any[];

        // Read model config
        const { model: narrativeModel } = await getModelConfig(prisma, "narrative");

        // Generate narrative from claims (Pass 2)
        await writeEvent(prisma, step.id, "INFO", `Generating ${durationTier}-minute narrative from ${claims.length} claims via ${narrativeModel}`);
        const narrativeTimer = log.timer("narrative_generation");
        const { narrative, usage: narrativeUsage } = await generateNarrative(
          anthropic,
          claims,
          durationTier,
          narrativeModel
        );
```

Replace with:
```typescript
        const allClaims = distillation.claimsJson as any[];

        // Select claims for this duration tier (filters by importance/novelty composite score)
        const hasExcerpts = allClaims.length > 0 && "excerpt" in allClaims[0];
        const claims = hasExcerpts
          ? selectClaimsForDuration(allClaims, durationTier)
          : allClaims;

        // Read model config
        const { model: narrativeModel } = await getModelConfig(prisma, "narrative");

        // Generate narrative from claims (Pass 2)
        await writeEvent(prisma, step.id, "INFO", `Generating ${durationTier}-minute narrative from ${claims.length}/${allClaims.length} claims via ${narrativeModel}`);
        const narrativeTimer = log.timer("narrative_generation");
        const { narrative, usage: narrativeUsage } = await generateNarrative(
          anthropic,
          claims,
          durationTier,
          narrativeModel
        );
```

- [ ] **Step 5: Run all narrative generation tests**

Run: `npx vitest run worker/queues/__tests__/narrative-generation.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add worker/queues/narrative-generation.ts worker/queues/__tests__/narrative-generation.test.ts
git commit -m "feat: integrate selectClaimsForDuration in narrative queue handler"
```

---

### Task 6: Update distillation queue handler WorkProduct metadata

**Files:**
- Modify: `worker/queues/distillation.ts:88-96,160-168`
- Modify: `worker/queues/__tests__/distillation.test.ts`

- [ ] **Step 1: Update test assertions for new metadata shape**

In `worker/queues/__tests__/distillation.test.ts`, update the mock data and the WorkProduct assertion.

Update the `extractClaims` mock (line 24 and line 62) to include `excerpt`:
```typescript
// In the vi.mock and the beforeEach re-set:
(extractClaims as any).mockResolvedValue({
  claims: [{ claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "Verbatim excerpt from the transcript." }],
  usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: null },
});
```

Update the WorkProduct metadata assertion in the "creates PipelineStep and extracts claims" test (line 130):
```typescript
metadata: { claimCount: 1, hasExcerpts: true },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts -t "creates PipelineStep"`
Expected: FAIL — metadata is `{ claimCount: 1 }`, not `{ claimCount: 1, hasExcerpts: true }`

- [ ] **Step 3: Update metadata in distillation queue handler**

In `worker/queues/distillation.ts`, update both WorkProduct creation spots:

**Fresh extraction path (line 160-168):**
Replace `metadata: { claimCount: claims.length },` with:
```typescript
metadata: {
  claimCount: claims.length,
  hasExcerpts: claims.length > 0 && "excerpt" in claims[0],
},
```

**Cache backfill path (line 88-96):**
Replace `metadata: { claimCount: Array.isArray(existing.claimsJson) ? (existing.claimsJson as any[]).length : 0 },` with:
```typescript
metadata: {
  claimCount: Array.isArray(existing.claimsJson) ? (existing.claimsJson as any[]).length : 0,
  hasExcerpts: Array.isArray(existing.claimsJson) && (existing.claimsJson as any[]).length > 0 && "excerpt" in (existing.claimsJson as any[])[0],
},
```

- [ ] **Step 4: Run all distillation queue tests**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "feat: add hasExcerpts flag to CLAIMS WorkProduct metadata"
```

---

## Chunk 3: Verify Full Integration

### Task 7: Run full test suite and verify no regressions

**Files:**
- None (verification only)

- [ ] **Step 1: Run all distillation-related tests**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts worker/queues/__tests__/distillation.test.ts worker/queues/__tests__/narrative-generation.test.ts`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 3: Run full test suite (if time permits)**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run`
Expected: All tests pass (pre-existing failures in discover.test.tsx and settings.test.tsx are acceptable)

- [ ] **Step 4: Commit any fixes if needed**

---

### Task 8: Update jsdoc comments in distillation.ts

**Files:**
- Modify: `worker/lib/distillation.ts` (JSDoc only)

- [ ] **Step 1: Update extractClaims JSDoc**

Replace the JSDoc block above `extractClaims()`:
```typescript
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
```

- [ ] **Step 2: Update generateNarrative JSDoc**

Replace the JSDoc block above `generateNarrative()`:
```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add worker/lib/distillation.ts
git commit -m "docs: update jsdoc for revised distillation functions"
```
