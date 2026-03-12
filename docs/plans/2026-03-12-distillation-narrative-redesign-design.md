# Distillation & Narrative Redesign — Design Spec

**Date:** 2026-03-12
**Status:** Draft

## Problem

The current pipeline has two critical limitations:

1. **Hardcoded 10 claims** — `extractClaims()` always asks for exactly 10 claims regardless of episode length or information density. A 3-hour dense interview gets the same 10 claims as a 20-minute news recap.

2. **Narrative generated solely from claims** — `generateNarrative()` receives only terse one-sentence claim objects. For longer duration tiers, the model must pad or hallucinate to fill the target word count since it has no source material to elaborate from.

Together these mean: short briefings work okay (10 claims → pick top 2-3), but longer briefings produce low-quality output filled with filler and invented details.

**Valid duration tiers:** 1, 2, 3, 5, 7, 10, 15 minutes. The longest tier (15 min at 150 wpm) targets ~2,250 words — far more than 10 one-sentence claims can support.

## Design Goals

- **Extract once, use for all tiers** — Distillation remains decoupled from `durationTier`. One extraction serves 1-min through 30-min narratives.
- **Variable claim count driven by information density** — No hardcoded cap. A dense episode yields more claims; a sparse one yields fewer.
- **Verbatim excerpts on each claim** — Each claim carries the source passage from the transcript, giving narrative generation real material to work with.
- **Duration-aware claim selection** — Narrative generation selects and prioritizes claims based on importance/novelty scores relative to the target duration.

## Updated Claim Shape

```typescript
interface Claim {
  claim: string;       // One-sentence factual assertion
  speaker: string;     // Who made the claim
  importance: number;  // 1-10 rating
  novelty: number;     // 1-10 rating
  excerpt: string;     // Verbatim source passage (the relevant discussion segment)
}
```

The `excerpt` field contains the verbatim transcript passage that supports the claim — could be 1 sentence for a quick factual statement or a full exchange for a nuanced argument. The model decides the appropriate excerpt length based on relevance.

**Storage:** Claims continue to live in `Distillation.claimsJson` (Postgres JSON column) and as a WorkProduct in R2. The larger payload from excerpts is acceptable — even 40 claims with ~100-word excerpts adds ~4,000 words, trivial compared to the full transcript already processed.

## Changes to `extractClaims()` (Pass 1)

### Prompt Changes

**Current:** "Extract the top 10 most important factual claims"

**New:** Extract all significant factual claims with no fixed count. The prompt will instruct the model to:

1. Identify every factual claim, insight, argument, or notable statement worth preserving
2. Score each by importance (1-10) and novelty (1-10)
3. Include the verbatim excerpt from the transcript that supports each claim
4. Self-regulate: skip trivial filler, repetitions, and off-topic tangents
5. Sort by importance descending

The model naturally extracts fewer claims from sparse content and more from dense content. We set a practical range in the prompt guidance ("typically 10-40 claims depending on episode density") to anchor expectations without enforcing a hard cap.

### Updated Prompt

```
You are a podcast analyst. Extract all significant factual claims, insights,
arguments, and notable statements from this transcript.

For each claim, include:
- "claim": the factual assertion (one clear sentence)
- "speaker": who made the claim
- "importance": 1-10 rating (10 = critical takeaway, 1 = minor detail)
- "novelty": 1-10 rating (10 = surprising/counterintuitive, 1 = common knowledge)
- "excerpt": the verbatim passage from the transcript that contains or supports
  this claim — include enough surrounding context that someone could write a
  detailed summary from the excerpt alone (may be one sentence or a full exchange)

Guidelines:
- Extract every claim worth preserving — do NOT limit to a fixed number
- A dense 3-hour episode may yield 30-40 claims; a light 20-minute episode may yield 8-12
- Skip filler, repetition, ads, and off-topic tangents
- Excerpts must be VERBATIM from the transcript, not paraphrased
- Sort by importance descending

Return ONLY a JSON array. No markdown fences, no commentary.

TRANSCRIPT:
{transcript}
```

### max_tokens Increase

Current: `2048`. With excerpts and variable count, increase to `8192`. A 40-claim response with ~100-word excerpts is roughly 5,000 words (~6,500 tokens).

## Changes to `generateNarrative()` (Pass 2)

### Duration-Aware Claim Selection

Before calling Claude, the narrative generator selects claims based on the target duration:

```typescript
function selectClaimsForDuration(
  claims: Claim[],
  durationMinutes: number
): Claim[] {
  // Sort by composite score: importance weighted higher than novelty
  const scored = claims
    .map(c => ({ ...c, score: c.importance * 0.7 + c.novelty * 0.3 }))
    .sort((a, b) => b.score - a.score);

  // Budget: ~2.5 claims per minute, capped at available claims
  const targetCount = Math.min(
    scored.length,
    Math.max(3, Math.ceil(durationMinutes * 2.5))
  );

  return scored.slice(0, targetCount);
}
```

This gives (for valid duration tiers 1/2/3/5/7/10/15):
| Duration | Target Claims | Notes |
|----------|--------------|-------|
| 1 min    | 3            | Top 3 by score |
| 2 min    | 5            | |
| 3 min    | 8            | |
| 5 min    | 13           | |
| 7 min    | 18           | |
| 10 min   | 25           | |
| 15 min   | 38           | Likely all claims for most episodes |

For the longest tiers, all claims will typically be selected — the model uses full excerpts to elaborate.

### Updated Narrative Prompt

```
You are a podcast script writer. Write a spoken narrative summarizing
the following claims and their source excerpts for a daily briefing
podcast segment.

TARGET: approximately {targetWords} words ({durationMinutes} minutes
at {WORDS_PER_MINUTE} wpm).

Rules:
- Write in a conversational, engaging tone suitable for audio
- Cover claims in rough order of importance, but group related topics
- Use the EXCERPT text for accurate detail and context — do NOT invent
  facts beyond what the excerpts contain
- Use natural transitions between topics
- For shorter briefings, focus only on the highest-impact claims
- For longer briefings, include supporting context and nuance from excerpts
- Do NOT include stage directions, speaker labels, or markdown
- Output ONLY the narrative text

CLAIMS AND EXCERPTS:
{selectedClaimsJson}
```

The key difference: the model now has real source material (excerpts) to draw from when elaborating, instead of inventing details from one-sentence claims.

### `generateNarrative()` Signature Change

The function signature stays the same — it still accepts `claims` and `durationMinutes`. Claim selection happens **outside** the function, in the queue handler:

```typescript
// In worker/queues/narrative-generation.ts (updated call site):
const allClaims = distillation.claimsJson as Claim[];
const selectedClaims = selectClaimsForDuration(allClaims, durationTier);

const { narrative, usage } = await generateNarrative(
  anthropic,
  selectedClaims,  // pre-filtered claims with excerpts
  durationTier,
  narrativeModel
);
```

Inside `generateNarrative()`, the only changes are the updated prompt text and a `max_tokens` bump from `4096` to `8192`. The 15-min tier targets ~2,250 words (~3,000 tokens), and with prompt overhead the current 4096 limit would risk truncation.

### `max_tokens` Summary

| Function | Current | New | Reason |
|----------|---------|-----|--------|
| `extractClaims()` | 2048 | 8192 | Variable claim count + excerpts |
| `generateNarrative()` | 4096 | 8192 | Longer narratives for higher tiers |

## Files Changed

### Modified Files

| File | Change |
|------|--------|
| `worker/lib/distillation.ts` | Update `Claim` interface (add `excerpt`), rewrite `extractClaims()` prompt, bump `max_tokens`, add `selectClaimsForDuration()`, update `generateNarrative()` prompt and signature |
| `worker/queues/narrative-generation.ts` | Import and call `selectClaimsForDuration()` before `generateNarrative()`, pass selected claims |
| `worker/lib/__tests__/distillation.test.ts` | Update mock claims to include `excerpt`, add tests for `selectClaimsForDuration()`, update prompt assertions |
| `worker/queues/__tests__/distillation.test.ts` | Update mock `claimsJson` to include `excerpt` field |
| `worker/queues/__tests__/narrative-generation.test.ts` | Update mock claims, add tests for claim selection logic |

### No Schema Changes Required

`Distillation.claimsJson` is a `Json` column — the shape change is transparent to Prisma. No migration needed.

### No Frontend Changes Required

The admin UI displays claims via `WorkProduct.metadata.claimCount` — the count still works. The actual claims JSON is not rendered in the UI.

## Backward Compatibility

**Existing distillations** have the old 10-claim format without `excerpt`. Two options:

1. **Option A: Lazy migration** — When narrative generation encounters claims without `excerpt`, it falls back to the current behavior (claims-only prompt). Old distillations work but produce lower quality narratives. New distillations get the improved format.

2. **Option B: Invalidate cache** — Mark existing distillations for re-processing. Forces re-extraction with the new prompt.

**Recommendation:** Option A. Existing clips already work. New subscriptions and re-triggered episodes get the improved extraction. We can add an admin action to re-trigger distillation for specific episodes if needed (this already exists via the pipeline admin UI).

**Fallback detection logic** in narrative generation:

```typescript
const allClaims = distillation.claimsJson as Claim[];
const hasExcerpts = allClaims.length > 0 && "excerpt" in allClaims[0];

if (hasExcerpts) {
  // New path: select claims, use excerpts-aware prompt
  const selected = selectClaimsForDuration(allClaims, durationTier);
  narrative = await generateNarrative(anthropic, selected, durationTier, model);
} else {
  // Legacy path: old claims without excerpts, use original prompt behavior
  narrative = await generateNarrative(anthropic, allClaims, durationTier, model);
}
```

`generateNarrative()` detects whether claims have excerpts and uses the appropriate prompt variant internally.

## Cost Impact

- **Distillation (Pass 1):** Output tokens increase from ~800 (10 claims) to ~3,000-6,000 (variable claims + excerpts). Input stays the same (full transcript). Cost increase is modest since input tokens dominate.
- **Narrative (Pass 2):** Input tokens increase because selected claims now include excerpts. For a 5-min briefing with 13 claims: maybe +2,000 input tokens. For a 15-min briefing with all claims: maybe +6,000 input tokens. Still well within model context limits.
- **Net:** Roughly 2-3x increase in total tokens per pipeline run. Acceptable for the quality improvement.

## WorkProduct Metadata Update

The CLAIMS WorkProduct metadata currently stores `{ claimCount }`. Update to:
```json
{
  "claimCount": 25,
  "hasExcerpts": true
}
```

The `hasExcerpts` flag lets downstream consumers (and admin UI) distinguish old-format from new-format claims. It is derived from the actual claim data:

```typescript
const hasExcerpts = Array.isArray(claims) && claims.length > 0 && "excerpt" in claims[0];
```

## Edge Cases

1. **Very short episodes (< 5 min):** May yield only 3-5 claims with brief excerpts. This is correct — there isn't much content.

2. **Very long episodes (3+ hours):** May yield 40+ claims. The `max_tokens: 8192` limit handles this. If the model truncates, the most important claims come first (sorted by importance) so the truncation loses only low-importance claims.

3. **Poor transcripts:** Garbled or low-quality transcripts produce poor claims regardless. The excerpt field doesn't make this worse — the model extracts what it can.

4. **Duration tier exceeds available material:** A user requests a 15-min briefing of a 10-min episode. `selectClaimsForDuration` selects all claims, and the narrative prompt's word target will naturally be larger than what the claims support. The model will produce a shorter narrative. The TTS stage already handles variable-length narratives gracefully.

## Testing Strategy

1. **Unit tests for `selectClaimsForDuration()`** — verify correct count and ordering for each duration tier
2. **Unit tests for updated prompts** — verify transcript and excerpt content appears in prompt
3. **Mock claim data updated** — all test fixtures include `excerpt` field
4. **Backward compat test** — verify narrative generation handles claims without `excerpt` gracefully (Option A fallback)
