# Phase 5A: Briefing Audio Assembly — Implementation Plan

**Date:** 2026-03-14
**Branch:** `feat/briefing-audio-assembly` (from `main` after review merge)
**Depends on:** Phase 1 (security), Phase 3 (code quality) recommended but not blocking
**Design doc:** [`2026-03-14-wasm-audio-processing-design.md`](./2026-03-14-wasm-audio-processing-design.md)
**Master plan ref:** [`2026-03-14-master-review-plan.md`](./2026-03-14-master-review-plan.md) Phase 5A items 5A.1-5A.8

---

## Summary

Transform Blipp's raw TTS clips into polished audio briefings with intro/outro jingles and spoken episode metadata. This is Phase 1 of the audio processing roadmap: frame-level MP3 concatenation only. No Wasm, no PCM decoding, no crossfading, zero new dependencies.

**Output:** `[intro.mp3] + [clip.mp3] + [outro.mp3]` stored in R2, served via a dedicated endpoint.

**Constraints:**
- Peak memory: ~29MB (15-min clip at 128kbps + jingles)
- CPU: near-zero (binary array concatenation)
- No volume normalization (jingles must be pre-mastered to match TTS output levels)
- Hard cuts between segments (jingles must have built-in fades)

---

## Task 1: Upload Jingle Assets to R2

**Goal:** Pre-mastered intro and outro MP3 files available at well-known R2 keys.

### R2 Keys

```
assets/jingles/intro.mp3
assets/jingles/outro.mp3
```

### Asset Requirements

| Property | Requirement |
|----------|-------------|
| Format | MP3, CBR preferred |
| Sample rate | 24kHz mono (matches OpenAI TTS output) |
| Duration | 2-5 seconds each |
| Loudness | Pre-mastered to ~-16 LUFS (speech target) |
| Fades | Built into the audio file (fade-in on intro, fade-out on outro) |

### Upload Commands

```bash
# From project root with wrangler authenticated
wrangler r2 object put blipp-audio/assets/jingles/intro.mp3 \
  --file ./assets/jingles/intro.mp3 \
  --content-type audio/mpeg

wrangler r2 object put blipp-audio/assets/jingles/outro.mp3 \
  --file ./assets/jingles/outro.mp3 \
  --content-type audio/mpeg
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `assets/jingles/intro.mp3` | Create — placeholder jingle for dev/test (can be a sine tone with fade) |
| `assets/jingles/outro.mp3` | Create — placeholder jingle for dev/test |
| `worker/lib/audio/constants.ts` | Create — R2 key constants (see Task 3) |

### Acceptance Criteria

- [ ] `wrangler r2 object get blipp-audio/assets/jingles/intro.mp3` returns a valid MP3
- [ ] `wrangler r2 object get blipp-audio/assets/jingles/outro.mp3` returns a valid MP3
- [ ] Both files are 24kHz mono MP3, 2-5 seconds, with built-in fades
- [ ] Keys are defined as constants in `worker/lib/audio/constants.ts`

---

## Task 2: Narrative Prompt Metadata Intro

**Goal:** The LLM-generated narrative opens with spoken metadata identifying the podcast, episode, timing, and clip length.

### Current State

`generateNarrative()` in `worker/lib/distillation.ts` receives `claims` and `durationMinutes` but has no access to episode/podcast metadata. The narrative generation queue handler (`worker/queues/narrative-generation.ts`) calls `generateNarrative()` at line 140 and does have access to `episodeId` and `durationTier` but does not pass episode metadata into the function.

### Approach

Add an optional `episodeMetadata` parameter to `generateNarrative()`. The queue handler loads the episode (with podcast relation) and passes the metadata through. The prompt instructs the LLM to open with a spoken intro.

### Files to Modify

| File | Change |
|------|--------|
| `worker/lib/distillation.ts` | Add `EpisodeMetadata` interface; add optional `metadata` param to `generateNarrative()`; prepend metadata intro instructions to prompt |
| `worker/queues/narrative-generation.ts` | Load episode with podcast relation; pass metadata to `generateNarrative()` |
| `worker/lib/__tests__/distillation.test.ts` | Add tests for prompt metadata inclusion |

### Code: `worker/lib/distillation.ts`

Add after the `Claim` interface:

```typescript
/** Episode metadata for the narrative intro. */
export interface EpisodeMetadata {
  podcastTitle: string;
  episodeTitle: string;
  publishedAt: Date;
  durationSeconds: number | null;
  briefingMinutes: number;
}
```

Update the `generateNarrative` signature:

```typescript
export async function generateNarrative(
  llm: LlmProvider,
  claims: Claim[],
  durationMinutes: number,
  providerModelId: string,
  maxTokens: number,
  env: any,
  pricing: ModelPricing | null = null,
  metadata?: EpisodeMetadata  // <-- new optional param
): Promise<{ narrative: string; usage: AiUsage }>
```

Add a metadata intro block to the prompt (prepended to both the excerpt and non-excerpt variants):

```typescript
function buildMetadataIntro(metadata: EpisodeMetadata): string {
  const originalMinutes = metadata.durationSeconds
    ? Math.round(metadata.durationSeconds / 60)
    : null;
  const originalLength = originalMinutes
    ? `Originally ${originalMinutes} minutes`
    : "Original length unknown";

  return `
Begin the narrative with a brief spoken introduction stating:
- The podcast name ("${metadata.podcastTitle}")
- The episode title ("${metadata.episodeTitle}")
- When it was released (use a relative date like "released yesterday" or "from March 12th")
- The original episode length (${originalLength})
- The briefing length (${metadata.briefingMinutes} minutes)

Example: "From The Daily, episode The Election Results, released yesterday. Originally 45 minutes — here's your 5-minute briefing."

Then proceed directly into the content summary.
`;
}
```

Insert this block right before the `CLAIMS` or `CLAIMS AND EXCERPTS` section in both prompt variants.

### Code: `worker/queues/narrative-generation.ts`

After loading the distillation (around line 109), load the episode with its podcast:

```typescript
// Load episode metadata for narrative intro
const episode = await prisma.episode.findUnique({
  where: { id: episodeId },
  select: {
    title: true,
    publishedAt: true,
    durationSeconds: true,
    podcast: { select: { title: true } },
  },
});

const episodeMetadata: EpisodeMetadata | undefined = episode
  ? {
      podcastTitle: episode.podcast.title,
      episodeTitle: episode.title,
      publishedAt: episode.publishedAt,
      durationSeconds: episode.durationSeconds,
      briefingMinutes: durationTier,
    }
  : undefined;
```

Pass `episodeMetadata` to the `generateNarrative()` call:

```typescript
const { narrative, usage: narrativeUsage } = await generateNarrative(
  llm,
  claims,
  durationTier,
  narrProviderModelId,
  8192,
  env,
  narrativePricing,
  episodeMetadata  // <-- new arg
);
```

### Tests

```typescript
// worker/lib/__tests__/distillation.test.ts — additions

describe("generateNarrative with metadata", () => {
  it("includes podcast title in prompt when metadata provided", async () => {
    const metadata: EpisodeMetadata = {
      podcastTitle: "The Daily",
      episodeTitle: "Election Results",
      publishedAt: new Date("2026-03-12"),
      durationSeconds: 2700,
      briefingMinutes: 5,
    };

    await generateNarrative(mockLlm, testClaims, 5, "model", 8192, {}, null, metadata);

    const prompt = mockLlm.complete.mock.calls[0][0][0].content;
    expect(prompt).toContain("The Daily");
    expect(prompt).toContain("Election Results");
    expect(prompt).toContain("Originally 45 minutes");
    expect(prompt).toContain("5 minutes");
  });

  it("omits metadata block when metadata not provided", async () => {
    await generateNarrative(mockLlm, testClaims, 5, "model", 8192, {});

    const prompt = mockLlm.complete.mock.calls[0][0][0].content;
    expect(prompt).not.toContain("Begin the narrative with a brief spoken introduction");
  });

  it("handles missing durationSeconds gracefully", async () => {
    const metadata: EpisodeMetadata = {
      podcastTitle: "Test Pod",
      episodeTitle: "Test Ep",
      publishedAt: new Date(),
      durationSeconds: null,
      briefingMinutes: 3,
    };

    await generateNarrative(mockLlm, testClaims, 3, "model", 8192, {}, null, metadata);

    const prompt = mockLlm.complete.mock.calls[0][0][0].content;
    expect(prompt).toContain("Original length unknown");
  });
});
```

### Acceptance Criteria

- [ ] `generateNarrative()` accepts optional `EpisodeMetadata` parameter
- [ ] When metadata is provided, the prompt includes podcast title, episode title, release date reference, original length, and briefing length
- [ ] When metadata is omitted (backward compat), prompt is unchanged from current behavior
- [ ] When `durationSeconds` is null, prompt says "Original length unknown"
- [ ] Narrative generation queue handler loads episode+podcast and passes metadata
- [ ] All existing `distillation.test.ts` tests continue to pass
- [ ] Three new metadata-specific tests pass

---

## Task 3: Audio Assembly Module

**Goal:** A self-contained module that assembles `[intro] + [clip] + [outro]` with graceful fallback.

### Files to Create

| File | Description |
|------|-------------|
| `worker/lib/audio/constants.ts` | Jingle R2 key constants |
| `worker/lib/audio/assembly.ts` | `assembleBriefingAudio()` function |
| `worker/lib/audio/types.ts` | `AssemblyResult` type |
| `worker/lib/audio/__tests__/assembly.test.ts` | Assembly unit tests |

### Code: `worker/lib/audio/constants.ts`

```typescript
/** R2 keys for pre-mastered jingle assets. */
export const JINGLE_INTRO_KEY = "assets/jingles/intro.mp3";
export const JINGLE_OUTRO_KEY = "assets/jingles/outro.mp3";
```

### Code: `worker/lib/audio/types.ts`

```typescript
export interface AssemblyResult {
  /** The assembled MP3 audio buffer. */
  audio: ArrayBuffer;
  /** Total size in bytes. */
  sizeBytes: number;
  /** Whether jingles were included (false = fallback to raw clip). */
  hasJingles: boolean;
  /** Whether assembly fell back to raw clip due to error. */
  isFallback: boolean;
}
```

### Code: `worker/lib/audio/assembly.ts`

```typescript
import { concatMp3Buffers } from "../mp3-concat";
import { JINGLE_INTRO_KEY, JINGLE_OUTRO_KEY } from "./constants";
import type { AssemblyResult } from "./types";

/**
 * Assembles a complete briefing audio from clip + jingle assets.
 *
 * Loads intro and outro jingles from R2, concatenates them around the
 * clip audio, and returns the assembled buffer. If jingles are missing,
 * they are silently omitted. If any error occurs during assembly, falls
 * back to the raw clip audio — assembly must never block briefing delivery.
 *
 * @param clipAudio - The raw TTS clip MP3 buffer
 * @param r2 - R2 bucket binding
 * @param log - Logger for warnings on fallback
 * @returns AssemblyResult with the assembled (or fallback) audio
 */
export async function assembleBriefingAudio(
  clipAudio: ArrayBuffer,
  r2: R2Bucket,
  log?: { warn?: (action: string, data: Record<string, unknown>) => void }
): Promise<AssemblyResult> {
  try {
    // Load jingle assets (null if not uploaded yet — that's fine)
    const [introObj, outroObj] = await Promise.all([
      r2.get(JINGLE_INTRO_KEY),
      r2.get(JINGLE_OUTRO_KEY),
    ]);

    const intro = introObj ? await introObj.arrayBuffer() : null;
    const outro = outroObj ? await outroObj.arrayBuffer() : null;

    const parts: ArrayBuffer[] = [];
    if (intro) parts.push(intro);
    parts.push(clipAudio);
    if (outro) parts.push(outro);

    const hasJingles = intro !== null || outro !== null;

    // If no jingles, skip concatenation overhead — just return the clip
    if (!hasJingles) {
      return {
        audio: clipAudio,
        sizeBytes: clipAudio.byteLength,
        hasJingles: false,
        isFallback: false,
      };
    }

    const assembled = concatMp3Buffers(parts);

    return {
      audio: assembled,
      sizeBytes: assembled.byteLength,
      hasJingles: true,
      isFallback: false,
    };
  } catch (err) {
    // Assembly must never block briefing delivery — fall back to raw clip
    log?.warn?.("assembly_fallback", {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      audio: clipAudio,
      sizeBytes: clipAudio.byteLength,
      hasJingles: false,
      isFallback: true,
    };
  }
}
```

### Memory Budget Analysis

From the design doc, Phase 1 operates entirely on compressed MP3 data:

| Clip Duration | MP3 Size (128kbps) | + Jingles (~0.4MB) | Total in Memory |
|---------------|--------------------|--------------------|-----------------|
| 1 min | ~1 MB | ~1.4 MB | ~2.8 MB (input + output) |
| 5 min | ~5 MB | ~5.4 MB | ~10.8 MB |
| 15 min | ~14 MB | ~14.4 MB | ~28.8 MB |
| 30 min | ~28 MB | ~28.4 MB | ~56.8 MB |

Peak memory is ~57MB for the largest supported tier (30 min) counting both the input buffers and the output buffer simultaneously. This is well under the 128MB Workers limit. No streaming needed.

The `concatMp3Buffers()` function allocates a single output `Uint8Array` of the combined size and copies each input into it. The input `ArrayBuffer`s are then eligible for GC once the function returns. Actual peak is `sum(inputs) + output`.

### Acceptance Criteria

- [ ] `assembleBriefingAudio()` returns concatenated audio when both jingles are present
- [ ] Returns clip with intro only when outro is missing
- [ ] Returns clip with outro only when intro is missing
- [ ] Returns raw clip (no concat overhead) when neither jingle is uploaded
- [ ] Falls back to raw clip on any error (R2 failure, concat failure)
- [ ] `isFallback` flag is `true` only on error path
- [ ] `hasJingles` flag accurately reflects whether jingles were included
- [ ] Logs a warning on fallback, does not throw

---

## Task 4: Stage 5 Integration

**Goal:** Wire audio assembly into the briefing-assembly queue handler so assembled audio is stored in R2 per-briefing.

### Current Flow (data-only)

```
briefing-assembly queue message
  -> load BriefingRequest + PipelineJobs
  -> for each completed job:
       -> find FeedItems
       -> upsert Briefing (userId + clipId)
       -> update FeedItem to READY with briefingId
  -> mark BriefingRequest COMPLETED
```

### New Flow (data + audio)

```
briefing-assembly queue message
  -> check BRIEFING_ASSEMBLY_AUDIO_ENABLED config (Task 6)
  -> load BriefingRequest + PipelineJobs
  -> for each completed job:
       -> find FeedItems
       -> upsert Briefing (userId + clipId)
       -> IF audio assembly enabled:
            -> load clip audio from R2 (AUDIO_CLIP WorkProduct key)
            -> assembleBriefingAudio(clipAudio, r2, log)
            -> store assembled audio in R2 at BRIEFING_AUDIO key
            -> create WorkProduct record (type: BRIEFING_AUDIO)
       -> update FeedItem to READY with briefingId
  -> mark BriefingRequest COMPLETED
```

### Files to Modify

| File | Change |
|------|--------|
| `worker/queues/briefing-assembly.ts` | Import assembly module + config; add audio assembly after Briefing upsert |
| `worker/lib/work-products.ts` | Update `BRIEFING_AUDIO` key params to include `briefingId` instead of `userId`+`date` |

### Key Design Decision: R2 Key for Assembled Audio

The current `BRIEFING_AUDIO` WorkProduct key uses `userId` + `date`:
```
wp/briefing/{userId}/{date}.mp3
```

This is wrong for per-briefing audio — multiple briefings per user per day would collide. Change to use `briefingId`:

```typescript
// worker/lib/work-products.ts — update BRIEFING_AUDIO variant
| { type: "BRIEFING_AUDIO"; briefingId: string }

// New key format:
case "BRIEFING_AUDIO":
  return `wp/briefing/${params.briefingId}.mp3`;
```

This is a non-breaking change: no BRIEFING_AUDIO WorkProducts exist in production today (Stage 5 is data-only). The old `userId`+`date` key format was never used.

### Code: `worker/queues/briefing-assembly.ts` Changes

Add imports at top:

```typescript
import { assembleBriefingAudio } from "../lib/audio/assembly";
import { wpKey, getWorkProduct, putWorkProduct } from "../lib/work-products";
import { getConfig } from "../lib/config";
```

Inside the `for (const fi of feedItems)` loop, after the Briefing upsert and before the FeedItem update:

```typescript
// Upsert Briefing (existing code)
const briefing = await prisma.briefing.upsert({ ... });

// Audio assembly (new code)
const assemblyEnabled = await getConfig(
  prisma,
  "BRIEFING_ASSEMBLY_AUDIO_ENABLED",
  false
);

if (assemblyEnabled) {
  try {
    // Load the raw clip audio from R2
    const clipR2Key = wpKey({
      type: "AUDIO_CLIP",
      episodeId: job.episodeId,
      durationTier: job.durationTier,
      voice: "default",
    });
    const clipAudio = await getWorkProduct(env.R2, clipR2Key);

    if (clipAudio) {
      const result = await assembleBriefingAudio(clipAudio, env.R2, log);

      // Store assembled audio in R2
      const briefingR2Key = wpKey({
        type: "BRIEFING_AUDIO",
        briefingId: briefing.id,
      });
      await putWorkProduct(env.R2, briefingR2Key, result.audio);

      // Create WorkProduct record
      await prisma.workProduct.create({
        data: {
          type: "BRIEFING_AUDIO",
          userId: fi.userId,
          r2Key: briefingR2Key,
          sizeBytes: result.sizeBytes,
          metadata: {
            hasJingles: result.hasJingles,
            isFallback: result.isFallback,
          },
        },
      });

      log.info("briefing_audio_assembled", {
        briefingId: briefing.id,
        hasJingles: result.hasJingles,
        isFallback: result.isFallback,
        sizeBytes: result.sizeBytes,
      });
    } else {
      log.info("briefing_audio_skip_no_clip", {
        briefingId: briefing.id,
        clipR2Key,
      });
    }
  } catch (err) {
    // Audio assembly failure must not block briefing delivery
    log.error("briefing_audio_error", {
      briefingId: briefing.id,
    }, err);
  }
}

// Update FeedItem to READY (existing code)
await prisma.feedItem.update({ ... });
```

### Why `assemblyEnabled` Check Is Inside the Loop

The config check could be hoisted above the loop for efficiency. However, putting it inside means:
1. Only one extra DB query (the config is cached with 60s TTL after the first call)
2. If the config changes mid-batch, new messages respect it immediately
3. Keeps the audio assembly block self-contained and easy to remove later

In practice, the 60s config cache means the check is free after the first call. Either placement is fine; the code above favors clarity.

### `putWorkProduct` Content-Type Fix

The current `putWorkProduct` does not set `httpMetadata.contentType`. Audio files served directly from R2 (or via the admin preview) need this. Update `putWorkProduct` to accept optional metadata:

```typescript
// worker/lib/work-products.ts
export async function putWorkProduct(
  r2: R2Bucket,
  key: string,
  data: ArrayBuffer | string,
  options?: { contentType?: string }
): Promise<void> {
  await r2.put(key, data, options?.contentType ? {
    httpMetadata: { contentType: options.contentType },
  } : undefined);
}
```

Callers storing audio should pass `{ contentType: "audio/mpeg" }`. Existing callers are unaffected (parameter is optional).

### Acceptance Criteria

- [ ] When `BRIEFING_ASSEMBLY_AUDIO_ENABLED` is `false` (default), assembly is skipped entirely — same behavior as today
- [ ] When enabled, clip audio is loaded from R2 and assembled with jingles
- [ ] Assembled audio stored at `wp/briefing/{briefingId}.mp3` in R2
- [ ] WorkProduct record created with type `BRIEFING_AUDIO`
- [ ] If clip audio not found in R2, assembly is skipped (logged) but FeedItem still marked READY
- [ ] If assembly throws, error is caught and logged, FeedItem still marked READY
- [ ] Existing Briefing upsert and FeedItem update behavior unchanged
- [ ] `putWorkProduct` sets content-type when provided
- [ ] `wpKey` for `BRIEFING_AUDIO` uses `briefingId` (not `userId`+`date`)

---

## Task 5: Briefing Audio Endpoint

**Goal:** `GET /api/briefings/:id/audio` serves the assembled MP3 from R2.

### Endpoint Design

```
GET /api/briefings/:id/audio
```

- **Auth:** `requireAuth` (Clerk — already applied globally)
- **Scoping:** User can only access their own briefings
- **Response:** Raw MP3 body with `Content-Type: audio/mpeg`
- **Fallback:** If no assembled audio exists, redirect to raw clip endpoint (backward compat)

### Files to Create/Modify

| File | Change |
|------|--------|
| `worker/routes/briefings.ts` | Add `GET /:id/audio` handler |
| `worker/routes/index.ts` | No change (briefings route already mounted) |

### Code: `worker/routes/briefings.ts`

Add after the existing `/generate` POST handler:

```typescript
/**
 * GET /:id/audio — Stream assembled briefing audio from R2.
 *
 * Looks up the BRIEFING_AUDIO WorkProduct for this briefing.
 * Falls back to the raw clip if no assembled audio exists.
 * User-scoped: only the briefing owner can access.
 */
briefings.get("/:id/audio", async (c) => {
  const briefingId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  // Load briefing with clip (for fallback) — scoped to current user
  const briefing = await prisma.briefing.findFirst({
    where: { id: briefingId, userId: user.id },
    include: {
      clip: { select: { audioKey: true } },
    },
  });

  if (!briefing) {
    return c.json({ error: "Briefing not found" }, 404);
  }

  // Try assembled audio first
  const assembledKey = `wp/briefing/${briefingId}.mp3`;
  const assembledObj = await c.env.R2.get(assembledKey);

  if (assembledObj) {
    const body = await assembledObj.arrayBuffer();
    return new Response(body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Fallback: serve raw clip audio
  if (briefing.clip?.audioKey) {
    const clipObj = await c.env.R2.get(briefing.clip.audioKey);
    if (clipObj) {
      const body = await clipObj.arrayBuffer();
      return new Response(body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(body.byteLength),
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }

  return c.json({ error: "Audio not found" }, 404);
});
```

### Why Not Redirect to Clip Endpoint

The raw clip endpoint (`/api/clips/:episodeId/:durationTier`) uses a different key scheme (`clips/{episodeId}/{durationTier}.mp3`) and is not scoped to users (security issue noted in Phase 1). A redirect would leak the clip URL structure. Instead, we serve the fallback audio directly from this user-scoped endpoint.

### Acceptance Criteria

- [ ] `GET /api/briefings/:id/audio` returns assembled MP3 with correct content-type
- [ ] Returns 404 if briefing does not belong to the authenticated user
- [ ] Returns 404 if briefing does not exist
- [ ] Falls back to raw clip audio when no assembled audio exists in R2
- [ ] Returns 404 if neither assembled nor raw audio is available
- [ ] Response includes `Cache-Control: public, max-age=86400`
- [ ] Response includes accurate `Content-Length` header

---

## Task 6: Feature Toggle

**Goal:** `BRIEFING_ASSEMBLY_AUDIO_ENABLED` PlatformConfig flag controls whether Stage 5 performs audio assembly.

### Config Key

```
BRIEFING_ASSEMBLY_AUDIO_ENABLED = false (default)
```

This is separate from the existing `pipeline.stage.BRIEFING_ASSEMBLY.enabled` key which gates whether Stage 5 runs at all. The audio assembly toggle only controls whether Stage 5 produces audio output or remains data-only.

### Files to Modify

| File | Change |
|------|--------|
| `prisma/seed.ts` | Add default PlatformConfig entry (or document manual insertion) |
| `worker/queues/briefing-assembly.ts` | Read config in the audio assembly block (already shown in Task 4) |

### Config Access Pattern

Uses the existing `getConfig()` from `worker/lib/config.ts` with 60s TTL cache:

```typescript
const assemblyEnabled = await getConfig(
  prisma,
  "BRIEFING_ASSEMBLY_AUDIO_ENABLED",
  false // disabled by default
);
```

### Admin UI

The toggle is manageable via the existing Admin > Configuration page which supports arbitrary PlatformConfig CRUD. No new admin UI is needed.

### Seed Data

Add to `prisma/seed.ts` (or add via Admin UI after deployment):

```typescript
await prisma.platformConfig.upsert({
  where: { key: "BRIEFING_ASSEMBLY_AUDIO_ENABLED" },
  create: {
    key: "BRIEFING_ASSEMBLY_AUDIO_ENABLED",
    value: false,
    description: "Enable audio assembly (intro + clip + outro jingles) in Stage 5. Requires jingle assets uploaded to R2.",
  },
  update: {},
});
```

### Deployment Workflow

1. Deploy code with assembly support (default: disabled)
2. Upload jingle assets to R2 (Task 1)
3. Test manually: set `BRIEFING_ASSEMBLY_AUDIO_ENABLED = true`, trigger a briefing, verify assembled audio
4. Enable globally when satisfied

### Acceptance Criteria

- [ ] Audio assembly is skipped when config is `false` (default)
- [ ] Audio assembly runs when config is `true`
- [ ] Config is readable via existing Admin > Configuration page
- [ ] No schema migration needed (PlatformConfig is key-value)
- [ ] Default `false` value is documented in seed data

---

## Task 7: Frontend Audio Source Update

**Goal:** The briefing player uses the new assembled audio endpoint instead of the raw clip URL.

### Current State

`src/pages/briefing-player.tsx` (line 122) uses:

```tsx
<audio src={item.briefing!.clip.audioUrl} ... />
```

Where `audioUrl` is `/api/clips/{episodeId}/{durationTier}` (mapped by `mapClip()` in `worker/routes/feed.ts`).

### New Behavior

Use the briefing audio endpoint when a briefing ID is available:

```tsx
<audio
  src={item.briefing ? `/api/briefings/${item.briefing.id}/audio` : undefined}
  ...
/>
```

The new endpoint handles fallback internally — if no assembled audio exists, it serves the raw clip. The frontend does not need to know which version it receives.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/briefing-player.tsx` | Update `<audio src>` to use briefing audio endpoint |

### Code: `src/pages/briefing-player.tsx`

Replace the guard check and audio source:

```tsx
// Old:
if (!item || !item.briefing?.clip?.audioUrl) {
  return ( ... "Briefing not available." ... );
}

// New:
if (!item || !item.briefing) {
  return ( ... "Briefing not available." ... );
}
```

```tsx
// Old:
<audio
  ref={audioRef}
  src={item.briefing!.clip.audioUrl}
  ...
/>

// New:
<audio
  ref={audioRef}
  src={`/api/briefings/${item.briefing!.id}/audio`}
  ...
/>
```

### Impact on Feed List

Any other components that construct audio URLs from `briefing.clip.audioUrl` should also be updated. Search for `audioUrl` usage in `src/`:

The `FeedItem` type in `src/types/feed.ts` still includes `clip.audioUrl` — this remains available as a fallback reference but is no longer the primary audio source for playback. The type does not need to change.

### Acceptance Criteria

- [ ] Briefing player loads audio from `/api/briefings/{id}/audio`
- [ ] Player correctly plays both assembled audio and raw-clip fallback (transparent to user)
- [ ] Player shows "Briefing not available" when no briefing exists (same as before)
- [ ] No other components break from the audio source change
- [ ] `clip.audioUrl` remains in the feed response for backward compat / admin use

---

## Task 8: Assembly Tests

**Goal:** Comprehensive test coverage for the assembly module, Stage 5 integration, and the briefing audio endpoint.

### Test Files to Create/Modify

| File | Tests |
|------|-------|
| `worker/lib/audio/__tests__/assembly.test.ts` | Unit tests for `assembleBriefingAudio()` |
| `worker/queues/__tests__/briefing-assembly.test.ts` | Add integration tests for audio assembly path |
| `worker/routes/__tests__/briefings.test.ts` | Add tests for `GET /:id/audio` endpoint |

### Unit Tests: `worker/lib/audio/__tests__/assembly.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleBriefingAudio } from "../assembly";

function makeMp3Buffer(id: number, size = 100): ArrayBuffer {
  const buf = new Uint8Array(size);
  buf[0] = 0xff;
  buf[1] = 0xfb;
  buf[2] = id;
  return buf.buffer;
}

function createMockR2(intro: ArrayBuffer | null, outro: ArrayBuffer | null) {
  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.includes("intro") && intro) {
        return { arrayBuffer: () => Promise.resolve(intro) };
      }
      if (key.includes("outro") && outro) {
        return { arrayBuffer: () => Promise.resolve(outro) };
      }
      return null;
    }),
    put: vi.fn(),
  } as unknown as R2Bucket;
}

describe("assembleBriefingAudio", () => {
  const clipAudio = makeMp3Buffer(0x01, 1000);

  it("concatenates intro + clip + outro when both jingles present", async () => {
    const intro = makeMp3Buffer(0x10, 200);
    const outro = makeMp3Buffer(0x20, 200);
    const r2 = createMockR2(intro, outro);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
    // Output should be larger than clip alone (intro + clip + outro)
    // Exact size depends on ID3 header stripping; at minimum > clip
    expect(result.sizeBytes).toBeGreaterThan(clipAudio.byteLength);
  });

  it("concatenates intro + clip when only intro is present", async () => {
    const intro = makeMp3Buffer(0x10, 200);
    const r2 = createMockR2(intro, null);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(clipAudio.byteLength);
  });

  it("concatenates clip + outro when only outro is present", async () => {
    const outro = makeMp3Buffer(0x20, 200);
    const r2 = createMockR2(null, outro);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(clipAudio.byteLength);
  });

  it("returns raw clip without concat when no jingles uploaded", async () => {
    const r2 = createMockR2(null, null);

    const result = await assembleBriefingAudio(clipAudio, r2);

    expect(result.hasJingles).toBe(false);
    expect(result.isFallback).toBe(false);
    expect(result.audio).toBe(clipAudio); // same reference, no copy
    expect(result.sizeBytes).toBe(clipAudio.byteLength);
  });

  it("falls back to raw clip when R2.get throws", async () => {
    const r2 = {
      get: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
    } as unknown as R2Bucket;
    const mockLog = { warn: vi.fn() };

    const result = await assembleBriefingAudio(clipAudio, r2, mockLog);

    expect(result.isFallback).toBe(true);
    expect(result.hasJingles).toBe(false);
    expect(result.audio).toBe(clipAudio);
    expect(mockLog.warn).toHaveBeenCalledWith("assembly_fallback", {
      error: "R2 unavailable",
    });
  });

  it("falls back to raw clip when arrayBuffer() throws", async () => {
    const r2 = {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.reject(new Error("corrupt")),
      }),
    } as unknown as R2Bucket;
    const mockLog = { warn: vi.fn() };

    const result = await assembleBriefingAudio(clipAudio, r2, mockLog);

    expect(result.isFallback).toBe(true);
    expect(result.audio).toBe(clipAudio);
  });

  it("output starts with intro bytes when intro is present", async () => {
    const introBytes = new Uint8Array([0xff, 0xfb, 0xaa, 0xbb]);
    const r2 = createMockR2(introBytes.buffer, null);

    const result = await assembleBriefingAudio(clipAudio, r2);
    const output = new Uint8Array(result.audio);

    // First buffer's bytes (including any ID3 header) are preserved
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xfb);
  });
});
```

### Stage 5 Integration Tests: additions to `worker/queues/__tests__/briefing-assembly.test.ts`

Add a new `describe("audio assembly")` block:

```typescript
describe("audio assembly", () => {
  it("assembles audio when BRIEFING_ASSEMBLY_AUDIO_ENABLED is true", async () => {
    // Config: audio assembly enabled
    (getConfig as any).mockImplementation(async (p: any, key: string) => {
      if (key === "BRIEFING_ASSEMBLY_AUDIO_ENABLED") return true;
      return true; // stage enabled
    });

    mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.pipelineJob.findMany.mockResolvedValue([
      makeCompletedJob({ id: "job-1", episodeId: "ep-1", clipId: "clip-1", durationTier: 5 }),
    ]);
    mockPrisma.feedItem.findMany.mockResolvedValue([{ id: "fi-1", userId: "user-1" }]);
    mockPrisma.briefing.upsert.mockResolvedValue({ id: "briefing-1" });
    mockPrisma.feedItem.update.mockResolvedValue({});
    mockPrisma.briefingRequest.update.mockResolvedValue({});
    mockPrisma.workProduct.create.mockResolvedValue({});

    // R2: return clip audio for getWorkProduct call
    const clipAudio = new Uint8Array([0xff, 0xfb, 0x01, 0x02]).buffer;
    (env.R2.get as any).mockResolvedValue({
      arrayBuffer: () => Promise.resolve(clipAudio),
    });

    const msg = createMsg({ requestId: "req-1" });
    await handleBriefingAssembly(createBatch([msg]), env, ctx);

    // WorkProduct created for assembled audio
    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "BRIEFING_AUDIO",
          userId: "user-1",
        }),
      })
    );

    // R2 put called for assembled audio
    expect(env.R2.put).toHaveBeenCalled();

    expect(msg.ack).toHaveBeenCalled();
  });

  it("skips audio assembly when config is disabled (default)", async () => {
    (getConfig as any).mockImplementation(async (p: any, key: string) => {
      if (key === "BRIEFING_ASSEMBLY_AUDIO_ENABLED") return false;
      return true;
    });

    mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
    mockPrisma.feedItem.findMany.mockResolvedValue([{ id: "fi-1", userId: "user-1" }]);
    mockPrisma.briefing.upsert.mockResolvedValue({ id: "briefing-1" });
    mockPrisma.feedItem.update.mockResolvedValue({});
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    const msg = createMsg({ requestId: "req-1" });
    await handleBriefingAssembly(createBatch([msg]), env, ctx);

    // No WorkProduct created for audio
    expect(mockPrisma.workProduct.create).not.toHaveBeenCalled();
    // FeedItem still marked READY
    expect(mockPrisma.feedItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "READY" }),
      })
    );
  });

  it("still marks FeedItem READY when audio assembly fails", async () => {
    (getConfig as any).mockImplementation(async (p: any, key: string) => {
      if (key === "BRIEFING_ASSEMBLY_AUDIO_ENABLED") return true;
      return true;
    });

    mockPrisma.briefingRequest.findUnique.mockResolvedValue(makeRequest());
    mockPrisma.pipelineJob.findMany.mockResolvedValue([makeCompletedJob()]);
    mockPrisma.feedItem.findMany.mockResolvedValue([{ id: "fi-1", userId: "user-1" }]);
    mockPrisma.briefing.upsert.mockResolvedValue({ id: "briefing-1" });
    mockPrisma.feedItem.update.mockResolvedValue({});
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    // R2 get throws
    (env.R2.get as any).mockRejectedValue(new Error("R2 down"));

    const msg = createMsg({ requestId: "req-1" });
    await handleBriefingAssembly(createBatch([msg]), env, ctx);

    // FeedItem still marked READY despite audio failure
    expect(mockPrisma.feedItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "READY" }),
      })
    );
  });
});
```

### Briefing Audio Endpoint Tests: `worker/routes/__tests__/briefings-audio.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

// Standard mocks...
const mockPrisma = createMockPrisma();
const mockEnv = createMockEnv();

// Mock getCurrentUser
vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

// Import the route module
import { briefings } from "../briefings";

function createApp() {
  const app = new Hono<{ Bindings: any }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", mockPrisma);
    await next();
  });
  app.route("/briefings", briefings);
  return app;
}

describe("GET /briefings/:id/audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$disconnect.mockResolvedValue(undefined);
  });

  it("returns 404 when briefing does not exist", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request("/briefings/br-1/audio", {}, mockEnv);
    expect(res.status).toBe(404);
  });

  it("returns assembled audio from R2 when available", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValue({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });
    const audioData = new Uint8Array([0xff, 0xfb, 0x01]).buffer;
    (mockEnv.R2.get as any).mockResolvedValue({
      arrayBuffer: () => Promise.resolve(audioData),
    });

    const app = createApp();
    const res = await app.request("/briefings/br-1/audio", {}, mockEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("falls back to raw clip when no assembled audio", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValue({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });

    const clipAudio = new Uint8Array([0xff, 0xfb, 0x02]).buffer;
    (mockEnv.R2.get as any)
      .mockResolvedValueOnce(null) // assembled audio not found
      .mockResolvedValueOnce({     // raw clip found
        arrayBuffer: () => Promise.resolve(clipAudio),
      });

    const app = createApp();
    const res = await app.request("/briefings/br-1/audio", {}, mockEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 404 when neither assembled nor raw audio exists", async () => {
    mockPrisma.briefing.findFirst.mockResolvedValue({
      id: "br-1",
      userId: "user-1",
      clip: { audioKey: "clips/ep-1/5.mp3" },
    });
    (mockEnv.R2.get as any).mockResolvedValue(null);

    const app = createApp();
    const res = await app.request("/briefings/br-1/audio", {}, mockEnv);

    expect(res.status).toBe(404);
  });
});
```

### Full Test Matrix

| Test | Module | What It Verifies |
|------|--------|-----------------|
| `assembly: intro + clip + outro` | assembly.ts | Happy path concatenation |
| `assembly: intro only` | assembly.ts | Missing outro graceful |
| `assembly: outro only` | assembly.ts | Missing intro graceful |
| `assembly: no jingles` | assembly.ts | Returns raw clip without concat |
| `assembly: R2 error fallback` | assembly.ts | Error produces raw clip + warning |
| `assembly: arrayBuffer error fallback` | assembly.ts | Corrupt R2 object produces raw clip |
| `assembly: output starts with intro` | assembly.ts | Byte-level correctness |
| `stage5: assembles when enabled` | briefing-assembly.ts | End-to-end integration |
| `stage5: skips when disabled` | briefing-assembly.ts | Feature toggle respected |
| `stage5: still READY on assembly fail` | briefing-assembly.ts | Error isolation |
| `endpoint: returns assembled audio` | briefings.ts | 200 + correct content-type |
| `endpoint: falls back to raw clip` | briefings.ts | Assembled missing, clip returned |
| `endpoint: 404 not found` | briefings.ts | No briefing for user |
| `endpoint: 404 no audio at all` | briefings.ts | Neither assembled nor raw exists |
| `narrative: includes metadata` | distillation.ts | Prompt contains podcast/episode info |
| `narrative: omits metadata` | distillation.ts | Backward compat |
| `narrative: null durationSeconds` | distillation.ts | Graceful missing data |

### Acceptance Criteria

- [ ] All 17 tests pass
- [ ] Assembly module has 100% branch coverage (happy path, missing jingles, error fallback)
- [ ] Stage 5 tests cover enabled/disabled/error paths
- [ ] Endpoint tests cover assembled/fallback/404 paths
- [ ] Narrative tests cover with-metadata/without-metadata/null-duration paths
- [ ] All pre-existing tests continue to pass

---

## Implementation Order

```
Task 1: Upload jingle assets to R2
  |
Task 2: Narrative prompt metadata intro ─────────┐
  |                                               |
Task 3: Audio assembly module                     | (parallel)
  |                                               |
Task 6: Feature toggle (seed config)              |
  |                                               |
Task 4: Stage 5 integration (depends on 3, 6) ───┘
  |
Task 5: Briefing audio endpoint (depends on 4)
  |
Task 7: Frontend audio source update (depends on 5)
  |
Task 8: Assembly tests (parallel with 4-7, finalized after all)
```

Tasks 2 and 3 can run in parallel. Task 8 (tests) can be developed alongside each task but the full suite should be verified last.

**Estimated effort:** 2-3 days.

---

## Error Handling Summary

The golden rule: **audio assembly must never block briefing delivery.**

| Failure Mode | Behavior |
|-------------|----------|
| Jingle assets not uploaded to R2 | Briefing audio = raw clip (no jingles). `hasJingles: false`. |
| R2 `get()` throws for jingles | Fallback to raw clip. `isFallback: true`. Warning logged. |
| R2 `get()` throws for clip audio | Assembly skipped entirely. FeedItem still marked READY. Error logged. |
| `concatMp3Buffers()` throws | Fallback to raw clip. `isFallback: true`. Warning logged. |
| R2 `put()` throws for assembled audio | Error caught in Stage 5 outer try/catch. FeedItem still marked READY. Error logged. |
| WorkProduct DB create fails | Error caught in Stage 5 outer try/catch. FeedItem still marked READY. Audio in R2 is orphaned (acceptable). |
| Feature toggle disabled | Assembly block never executes. Zero overhead. |
| Assembled audio missing at serve time | Endpoint falls back to raw clip from `clip.audioKey`. |
| Both assembled and raw audio missing | Endpoint returns 404. |

---

## Files Changed Summary

### New Files (5)

| File | Purpose |
|------|---------|
| `worker/lib/audio/constants.ts` | Jingle R2 key constants |
| `worker/lib/audio/types.ts` | `AssemblyResult` type |
| `worker/lib/audio/assembly.ts` | `assembleBriefingAudio()` function |
| `worker/lib/audio/__tests__/assembly.test.ts` | Assembly unit tests |
| `worker/routes/__tests__/briefings-audio.test.ts` | Endpoint tests |

### Modified Files (7)

| File | Change |
|------|--------|
| `worker/lib/distillation.ts` | Add `EpisodeMetadata`, optional param to `generateNarrative()`, prompt metadata block |
| `worker/lib/work-products.ts` | Update `BRIEFING_AUDIO` key to use `briefingId`; add `contentType` option to `putWorkProduct()` |
| `worker/queues/narrative-generation.ts` | Load episode+podcast, pass metadata to `generateNarrative()` |
| `worker/queues/briefing-assembly.ts` | Import assembly; add audio assembly block after Briefing upsert |
| `worker/routes/briefings.ts` | Add `GET /:id/audio` handler |
| `src/pages/briefing-player.tsx` | Update `<audio src>` to use briefing audio endpoint |
| `worker/lib/__tests__/distillation.test.ts` | Add metadata prompt tests |
| `worker/queues/__tests__/briefing-assembly.test.ts` | Add audio assembly integration tests |

---

## What Comes Next: Phase 2 (Wasm Audio Processing)

Phase 2 is **not planned for initial launch**. It only becomes necessary when Phase 1's hard cuts between jingles and clips are insufficient for the listening experience.

Phase 2 would add:
- **Volume normalization** via LUFS analysis on decoded PCM samples
- **Crossfading** (smooth transitions between jingle and clip instead of hard cuts)
- **Background music bed** (low-volume music mixed under speech)
- **Ad audio insertion** (using existing `adAudioUrl`/`adAudioKey` Briefing fields)

The approach: decode MP3 to PCM (Float32Array), apply DSP transformations in TypeScript, re-encode to MP3 via `wasm-media-encoders` (LAME compiled to Wasm, 66KB gzipped). This requires a spike test to confirm Cloudflare Workers runtime compatibility, a `limits.cpu_ms: 300000` wrangler config change, and chunked streaming for clips > 10 minutes.

See the [full design doc](./2026-03-14-wasm-audio-processing-design.md) Phase 2 section for details.
