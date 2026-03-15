# Client-Side Jingle Playback

**Date:** 2026-03-15
**Status:** Approved

## Problem

Briefings are raw TTS audio with no sonic branding. When users play feed items back-to-back, clips run together with nothing to mark boundaries. The server-side assembly approach (concat intro + clip + outro MP3s in the briefing-assembly pipeline stage) adds pipeline complexity, R2 storage for assembled copies, and makes jingle changes require re-assembly of all existing briefings.

## Decision

Play intro/outro jingles on the client by sequencing them through the existing `<audio>` element, the same way pre-roll and post-roll ads are already sequenced. Cache jingle files via the browser Cache API for offline access.

## Playback Flow

```
[preroll ad (IMA)] -> [intro jingle] -> [briefing content] -> [outro jingle] -> [postroll ad (IMA)]
```

Each transition is a src swap on the `<audio>` element, triggered by the `ended` event. Jingles are 2-5 seconds each.

## Architecture

### Jingle Cache (`src/lib/jingle-cache.ts`)

Module-level cache using the browser Cache API (`caches.open("blipp-jingles")`).

- Eagerly primes cache on first call to `getJingleUrl`
- Stores responses in Cache API for offline use
- Converts cached responses to blob object URLs (held in a module-level Map for instant reuse)
- `getJingleUrl(type: "intro" | "outro"): Promise<string | null>` — returns a blob URL or null if unavailable
- **Non-blocking**: returns null immediately if the jingle hasn't been fetched yet rather than blocking playback. The eager prime means both jingles are fetched in parallel on first call; subsequent calls return the cached blob URL synchronously from the Map (wrapped in a resolved Promise).
- Null return = graceful skip (no jingles uploaded yet, fetch failed, offline with empty cache, Cache API unavailable)

Hardcoded asset paths:
```
/api/assets/jingles/intro.mp3
/api/assets/jingles/outro.mp3
```

### AdState Extension (`src/types/ads.ts`)

```typescript
export type AdState =
  | "none"
  | "loading-ad-config"
  | "preroll"
  | "intro-jingle"   // NEW
  | "content"
  | "outro-jingle"   // NEW
  | "postroll";
```

### Audio Context Changes (`src/contexts/audio-context.tsx`)

**New state**: `contentDurationRef` (useRef) — preserves the briefing's duration across jingle transitions so the UI always shows the content duration, not the jingle's duration.

**`startContentPlayback` modification:**
After preroll completes (or if no preroll), check for cached intro jingle URL via `getJingleUrl("intro")`. If available, set `adState` to `"intro-jingle"`, force `playbackRate` to 1x on the audio element, and play the jingle. If unavailable, proceed directly to content (current behavior).

**`handleEnded` modification:**
```
intro-jingle ended  -> start actual content playback:
                       set src to briefing audio URL
                       restore user's playbackRate
                       set adState = "content"

content ended       -> store current duration in contentDurationRef
                       check for outro jingle via getJingleUrl("outro")
                       if available: set adState = "outro-jingle", force rate to 1x, play
                       otherwise: fall through to postroll/end

outro-jingle ended  -> check for postroll ad (existing logic)
                       if no postroll: set adState = "none"
```

**`handleError` modification:**
When `adState` is `"intro-jingle"` or `"outro-jingle"`, skip to the next segment instead of halting playback with an error message. Intro error → start content. Outro error → proceed to postroll/end.

**`handleTimeUpdate` / `handleLoadedMetadata` modification:**
Gate these handlers to skip state updates during jingle states. This prevents `currentTime` and `duration` from reflecting the jingle's short timeline. The UI stays frozen at the last content values.

**`seek` guard:**
The existing guard (`adState !== "content" && adState !== "none"`) already blocks seeking during jingle states. No change needed, but works correctly by exclusion.

**`setRate` guard:**
During jingle states, `setRate` updates the stored `playbackRate` state (so the preference is preserved) but does NOT apply it to the audio element. When content starts, the stored rate is applied.

**Media Session `isInAd` guard:**
Update the `isInAd` check to include jingle states:
```typescript
const isInAd = adState === "preroll" || adState === "postroll"
  || adState === "intro-jingle" || adState === "outro-jingle";
```
This disables hardware/lock-screen seek controls during jingles.

**UI behavior during jingles:**
- Progress bar: frozen — shows 0% during intro (no time/duration updates), stays at last content position during outro
- Artwork/metadata: shows briefing info (podcast image, episode title) — NOT an "Ad" or "Jingle" badge
- Seek bar & skip buttons: disabled
- Playback rate button: works (updates stored preference) but audible rate stays 1x
- Play/pause: works normally
- Time display: shows content times (0:00/duration during intro, final position/duration during outro)

### Mini-Player & Player-Sheet Changes

Both components define `const inAd = adState === "preroll" || adState === "postroll"`. During jingle states, `inAd` is false, so the components correctly show briefing info rather than an "Ad" badge.

However, the progress bar in `mini-player.tsx` uses `currentTime / duration`. Since `handleTimeUpdate` and `handleLoadedMetadata` are gated during jingles, `currentTime` and `duration` retain their content values, and the progress bar naturally shows the correct frozen position. No changes needed to these components.

### Asset Route (`worker/routes/assets.ts`)

Public R2 proxy — does NOT use `requireAuth`:
```
GET /api/assets/jingles/intro.mp3
GET /api/assets/jingles/outro.mp3
```

- Reads from R2 keys `assets/jingles/intro.mp3` and `assets/jingles/outro.mp3`
- Returns `Content-Type: audio/mpeg`, `Cache-Control: public, max-age=31536000, immutable`
- Returns 404 if file not in R2

Mounted in `worker/index.ts` on `/api/assets`. Note: the global `clerkMiddleware()` on `/api/*` still runs (populates auth context) but does not reject unauthenticated requests — only `requireAuth` does that. The Prisma middleware also runs but is harmless (creates a client that won't be used). Rate limiting applies but is acceptable for two cacheable static assets.

### Server-Side Assembly Removal

Remove all server-side jingle assembly code:

**Delete files:**
- `worker/lib/audio/assembly.ts`
- `worker/lib/audio/types.ts`
- `worker/lib/audio/constants.ts`
- `worker/lib/audio/__tests__/assembly.test.ts`
- `worker/lib/mp3-concat.ts`
- `worker/lib/__tests__/mp3-concat.test.ts`
- `worker/routes/__tests__/briefings-audio.test.ts`

**Modify files:**
- `worker/queues/briefing-assembly.ts` — Remove the `assembleBriefingAudio` call block and the `BRIEFING_ASSEMBLY_AUDIO_ENABLED` config check. Remove imports of `assembleBriefingAudio`, `getConfig`. Stage 5 returns to data-only: links Clips to Briefings and marks FeedItems READY.
- `worker/queues/__tests__/briefing-assembly.test.ts` — Remove the "audio assembly" describe block and related mock setup for `assembleBriefingAudio`.
- `worker/routes/briefings.ts` — Remove assembled audio lookup (`wp/briefing/${briefingId}.mp3`). Always serve raw clip audio directly.
- `worker/lib/work-products.ts` — Remove `BRIEFING_AUDIO` case from `WpKeyParams` type and `wpKey()` function.
- `worker/lib/user-data.ts` — Remove `await env.R2.delete(\`wp/briefing/${b.id}.mp3\`)` line (dead cleanup code).
- `src/pages/admin/podcast-settings.tsx` — Remove `BRIEFING_ASSEMBLY_AUDIO_ENABLED` from the config entries list.
- `prisma/seed.ts` — Remove `BRIEFING_ASSEMBLY_AUDIO_ENABLED` seed entry.

**Prisma schema:** The `BRIEFING_AUDIO` value in the `WorkProductType` enum is left in place. Removing it requires a migration and is not worth it for a dead enum value. It can be cleaned up in a future schema migration.

**Plan doc preservation:** `docs/plans/2026-03-14-wasm-audio-processing-design.md` is intentionally kept — it documents the Phase 2 wasm design for potential future use. The decision record references it.

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/lib/jingle-cache.ts` | Cache API wrapper, blob URL management |
| `worker/routes/assets.ts` | Public R2 proxy for static assets |
| `docs/decisions/2026-03-15-client-side-jingles.md` | Decision record |

### Modified Files
| File | Change |
|------|--------|
| `src/types/ads.ts` | Add `"intro-jingle"` and `"outro-jingle"` to `AdState` |
| `src/contexts/audio-context.tsx` | Jingle sequencing, `handleError`/`handleTimeUpdate`/`handleLoadedMetadata` guards, `contentDurationRef`, Media Session `isInAd` update |
| `worker/index.ts` | Mount assets route |
| `worker/queues/briefing-assembly.ts` | Remove assembly audio block + config check |
| `worker/queues/__tests__/briefing-assembly.test.ts` | Remove assembly test block + mocks |
| `worker/routes/briefings.ts` | Remove assembled audio fallback |
| `worker/lib/work-products.ts` | Remove `BRIEFING_AUDIO` from `WpKeyParams` and `wpKey()` |
| `worker/lib/user-data.ts` | Remove dead briefing audio R2 cleanup |
| `src/pages/admin/podcast-settings.tsx` | Remove `BRIEFING_ASSEMBLY_AUDIO_ENABLED` config entry |
| `prisma/seed.ts` | Remove `BRIEFING_ASSEMBLY_AUDIO_ENABLED` seed |

### Deleted Files
| File | Reason |
|------|--------|
| `worker/lib/audio/assembly.ts` | Server-side assembly no longer needed |
| `worker/lib/audio/types.ts` | Only used by assembly |
| `worker/lib/audio/constants.ts` | Only used by assembly |
| `worker/lib/audio/__tests__/assembly.test.ts` | Tests for deleted module |
| `worker/lib/mp3-concat.ts` | Only used by assembly |
| `worker/lib/__tests__/mp3-concat.test.ts` | Tests for deleted module |
| `worker/routes/__tests__/briefings-audio.test.ts` | Tests assembled audio fallback |

### Documentation Updates
| File | Change |
|------|--------|
| `docs/pipeline.md` | Remove `wp/briefing/{userId}/{date}.mp3` from work product table, update Stage 5 description |
| `docs/architecture.md` | Remove "Partial assembly is supported" reference |
| `docs/data-model.md` | Note `BRIEFING_AUDIO` work product type as deprecated/unused |

## Error Handling

Every failure mode results in graceful skip — jingles are never required:

| Failure | Behavior |
|---------|----------|
| Jingle not uploaded to R2 | 404 from asset route, `getJingleUrl` returns null, jingle skipped |
| Fetch fails (offline, no cache) | `getJingleUrl` returns null, jingle skipped |
| Audio element fails to play jingle | `handleError` detects jingle state, skips to next segment |
| Cache API unavailable | `getJingleUrl` falls back to direct fetch, no persistent caching |
| Jingle cache still priming on first play | `getJingleUrl` returns null (non-blocking), jingle skipped; cached for next play |

## Testing

### `src/lib/jingle-cache.ts`
Mock the Cache API (`caches.open`) and `fetch`. Test: cache miss fetches and stores, cache hit returns blob URL, fetch failure returns null, Cache API unavailable returns null.

### `src/contexts/audio-context.tsx`
Extend existing audio context tests (if any) or add integration tests: verify jingle states sequence correctly, verify `handleError` during jingle skips forward, verify `handleTimeUpdate`/`handleLoadedMetadata` are gated during jingles.

### `worker/routes/assets.ts`
Route test: mock R2, verify 200 with correct headers for existing file, verify 404 for missing file.

## Jingle File Requirements

Files uploaded to R2 at `assets/jingles/intro.mp3` and `assets/jingles/outro.mp3`:
- Format: MP3
- Duration: 2-5 seconds
- Sample rate: 24kHz mono (match TTS output)
- Loudness: ~-16 LUFS (match TTS speech levels)
- Built-in fades (fade-in on intro, fade-out on outro) since transitions are hard cuts
- Upload via `wrangler r2 object put`
