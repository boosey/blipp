# Offline Audio Prefetch and Instant Playback — Design

**Date:** 2026-04-24
**Status:** Draft, pending user review
**Owner:** Alex Boudreaux

## Problem

Two related issues with audio playback today:

1. **Discernible delay between tap and playback.** Even on good networks, content audio doesn't start for ~1–3 seconds after a user taps a blipp. Root cause: `src/contexts/audio-context.tsx:122-129` does `await fetch(...)` then `await res.blob()` then `URL.createObjectURL(blob)` — the audio element's `src` isn't set until the entire file has downloaded. The browser never gets a chance to stream.
2. **No genuine offline support.** Users in low- or no-coverage areas (subway, plane, basement) cannot play blipps. The Service Worker has a `CacheFirst` rule on `/api/briefings/:id/audio` (`src/sw.ts:28-34`) that opportunistically caches plays, but it's capped at 50 entries with no byte budget and is subject to aggressive iOS Safari eviction. The fully-built `StorageManager` in `src/services/storage-manager.ts` (Capacitor Filesystem on native, Cache API on web, full eviction policy, IndexedDB manifest) has zero callers — `manager.store()`, `retrieve()`, and `markListened()` are never invoked anywhere in the app. The Settings → Storage UI is wired to it and is consequently misleading: it always shows 0 cached blipps regardless of what the SW cache holds, and "Clear All Downloads" clears nothing real.

The product bar for this work is **audio-only offline (v1)** with **near-instantaneous tap-to-play** — p50 < 100 ms on cache hit, p50 < 600 ms on cache miss. Full offline (feed metadata caching, outbox for progress writes) is tracked as a separate follow-up project.

## Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| Q1 | Throttled prefetch by network tier: next 2 on cellular, next 10 on Wi-Fi. Counts not user-tunable. | Pure Wi-Fi-only would not solve the cellular delay problem. Pure unbounded prefetch risks "this app ate my data plan" reviews. |
| Q2 | Storage cap is byte-budget only (existing 250 MB / 500 MB / 1 GB / 2 GB). Item count shown as info, not a cap. | Blipps vary in length. A "30 items" cap could mean 30 MB or 300 MB — confusing abstraction. |
| Q3 | Cold-start uses **R2 presigned URLs** for streaming playback (`audio.src = url` directly). | Even with prefetch, some taps land on uncached items. Streaming on first byte is required for "near instantaneous" in those cases. |
| Q4 | Scope: audio-only offline (v1). Full offline (feed cache, outbox, listened-state replay) tracked separately. | Most podcast apps ship audio-only as v1 offline. Outbox semantics are a separable project with their own conflict-resolution decisions. |
| Q5 | Prefetch trigger: feed events + while-listening top-up. | Pure feed-event prefetch misses the Play-All-then-skip case. Continuous background loop is over-engineered. |

## Architecture

Three layers, each with one job.

### 1. Server: presigned URL endpoint

New: `GET /api/briefings/:id/audio-url` → `{ url: string, expiresAt: number }`. Auth via existing global `clerkMiddleware()`. Returns a short-lived (5 minute TTL) R2 presigned GET URL for the briefing's audio object.

The existing `/api/briefings/:id/audio` proxy endpoint stays — admin tools (`worker/routes/admin/briefings.ts:192`) depend on it. The player stops using it.

### 2. Client: StorageManager as the single source of truth for cached audio

The existing `StorageManager` class is wired into the audio path. Three new methods:

- `getPlayableUrl(briefingId): Promise<string>` — returns a local `blob://` (web) or `file://` (native) URL if cached; otherwise fetches the presigned URL, returns it, and concurrently kicks off a background download-to-store so the next play of this item is instant.
- `prefetch(briefingId): Promise<void>` — fetch presigned URL, download bytes, call existing `store()`.
- `pruneNotInFeed(activeBriefingIds: string[]): Promise<void>` — eviction extension; reaps cached entries whose `briefingId` is no longer in the user's feed.

Eviction policy stays as documented (listened > 24h → unlistened oldest-cached → recently listened, never the currently-playing item). Prefetched-but-unplayed items sit in the unlistened bucket and are evicted oldest-cached-first if the budget is reached. The prefetcher will refill on the next feed event.

### 3. Client: Prefetcher coordinator (new)

New module `src/services/prefetcher.ts`. Singleton with the following surface:

- `scheduleFromFeed(items: FeedItem[])` — called when feed loads or refreshes. Filters out already-cached briefings, classifies network tier, takes first N, enqueues.
- `scheduleNextInQueue(audioQueue: FeedItem[], n: number = 2)` — called from audio-context when the currently-playing track fires `canplay`. Enqueues the next n items in the queue.
- `pause()` / `resume()` — driven by the audio context. While audio is actively buffering, prefetch is paused; once `canplay` fires, prefetch resumes.

Internal state:
- Single concurrent download (one in-flight `fetch` at a time).
- Queue of pending briefingIds.
- `online`/`offline` window event listeners drive a "paused" flag.
- `navigator.connection.type` (with `effectiveType` fallback, with conservative cellular default when neither is available — iOS Safari/WKWebView) determines tier.

### Rejected alternatives

- **SW-cache-only.** Capped at 50 entries, no byte budget, no user control, evicted aggressively on iOS, Settings UI is a lie.
- **Blob-fetch-on-tap with no streaming.** Even with prefetch, post-eviction or just-loaded items would still wait for full download before play.

## Data flow

### Tap-to-play path

```
user taps blipp
  ↓
audio-context calls storageManager.getPlayableUrl(briefingId)
  ↓
  cache HIT  → returns blob:// or file:// URL → audio.src = url → play() — INSTANT
  cache MISS → fetch /api/briefings/:id/audio-url → audio.src = presignedUrl → play()
                                                  → fire-and-forget: download bytes,
                                                    storageManager.store() so the
                                                    second play is instant
```

The mobile-gesture-unlock dance (silent WAV pre-play) and the intro jingle phase stay exactly as today. Content audio replaces the post-jingle `src` with the playable URL — same shape as today, just sourced differently.

### Prefetch path

```
feed loads / refreshes / app foregrounds
  ↓
prefetcher.scheduleFromFeed(feedItems)
  ↓
  filter out items already in StorageManager
  ↓
  classify network: cellular → first 2; wifi → first 10
    ("first" = top-of-feed order as returned by the feed API, i.e.,
     the order the user sees on screen — typically newest-first)
  ↓
  enqueue
  ↓
worker loop (single concurrent):
  for each pending briefingId:
    if !navigator.onLine break
    get presigned URL → fetch bytes → storageManager.store(briefingId, blob)
    if user starts playing something → pause until audio.canplay, then resume

audio.canplay (currently-playing track has buffered enough):
  prefetcher.scheduleNextInQueue(audioQueue, 2)
```

### Cross-cutting

- After every successful prefetch or feed load, fire `storageManager.pruneNotInFeed(currentFeedBriefingIds)` to reap items the user no longer has in feed (unsubscribed podcast, briefing aged out).
- `storageManager.markListened(briefingId)` is wired into the existing 30-second-of-content listened timer in `audio-context.tsx`. Adds ~1 LOC.
- Browser `online`/`offline` events drive the prefetcher's paused flag.

### Concurrency bounds

- 1 prefetch in flight at a time, period.
- Active playback pauses prefetch until `canplay` fires.
- No retry loop — if a prefetch fails, drop it and let the next feed event re-enqueue.

## Components and file changes

### New files

- `worker/routes/briefings-audio-url.ts` — single GET handler that resolves the briefing → R2 key → presigned URL. Mounted under existing briefings route group. ~40 LOC.
- `worker/lib/r2-presign.ts` — thin wrapper around AWS SigV4 presign for R2 (R2 supports S3-compatible presigning). ~60 LOC.
- `src/services/prefetcher.ts` — the coordinator. Singleton with `scheduleFromFeed`, `scheduleNextInQueue`, `pause`, `resume`. Internally manages queue + single-concurrent worker loop + `online`/`offline` listeners + Network Information API classification. ~200 LOC.
- `src/lib/network-tier.ts` — small utility returning `"wifi" | "cellular" | "offline"`. Wraps `navigator.onLine` + `navigator.connection`, with iOS Safari fallback. ~30 LOC.
- Tests: `src/__tests__/prefetcher.test.ts`, extensions to `src/__tests__/storage-manager.test.ts` (or equivalent path), `worker/routes/__tests__/briefings-audio-url.test.ts`.

### Modified files

- `src/services/storage-manager.ts` — add `getPlayableUrl(briefingId)`, `pruneNotInFeed(activeIds)`. Native vs web branch lives here, not in audio-context. ~80 LOC added.
- `src/contexts/audio-context.tsx` — replace the `fetch → blob → URL.createObjectURL` block in `beginContent` with `await storageManager.getPlayableUrl(briefing.id)`. Wire `storageManager.markListened(briefing.id)` into the existing 30s listened timer. ~15 LOC changed.
- `src/contexts/storage-context.tsx` — initialize the prefetcher singleton with the manager.
- Feed-load call sites (likely `src/pages/Home.tsx` and the feed hook): call `prefetcher.scheduleFromFeed(items)` after a successful feed fetch. One or two call sites.
- `src/components/storage-settings.tsx` — add a single "Prefetch on cellular: off / on" toggle (default off). No "next N" knobs. Wired to a `localStorage`-backed setting the prefetcher reads.
- `worker/routes/briefings.ts` (or wherever the audio routes mount) — register the new `audio-url` route.

### Explicitly NOT doing

- Not deleting `/api/briefings/:id/audio` — admin tools depend on it.
- Not refactoring `audio-context.tsx` beyond the one swap. Touch only the fetch block.
- Not adding range/resume to the prefetcher. Failed prefetches re-fetch from byte 0 next time.
- Not adding per-feed-item "downloaded" indicators. v1 promise is "automatic and invisible."
- Not adding a "Download All" button.

## Error handling

### Server: presigned URL endpoint

| Case | Behavior |
|---|---|
| Briefing not found / wrong user | 404 (existing auth pattern) |
| R2 object missing (audio not yet generated) | 409 with `{ error: "audio_not_ready" }`. Client treats as "skip; let pipeline finish." |
| Presign failure (bad credentials, R2 transient) | 500. Client logs and skips (prefetch) or surfaces "couldn't load" (tap-to-play). |
| Repeated presign for same briefing | Acceptable. Presign is cheap (no R2 call, just SigV4). No rate limit. |

### Client: `getPlayableUrl` (tap-to-play)

| Case | Behavior |
|---|---|
| Manifest says cached but `readBlob` returns null (corrupted / partial / OS-deleted) | Treat as miss. Best-effort `manager.remove()`, fall through to presigned URL fetch. |
| Presigned URL fetch fails (offline, 5xx) | Throw to audio-context, which surfaces existing "Failed to load audio" error state. No regression vs. today. |
| `audio.src = url` fails to play | Existing audio-context error path. No new code. |
| Background download-to-store fails after instant play succeeded | Silent. User got their playback; we'll re-prefetch on next feed event. |

### Client: prefetcher

| Case | Behavior |
|---|---|
| Prefetch fetch fails | Drop from queue. No in-session retry. Next feed event re-enqueues. |
| `storageManager.store()` throws because `evictUntilFits` couldn't free space | Log + drop. Means budget is full of protected items; user should clear or raise budget. |
| Network flips Wi-Fi → cellular mid-prefetch | Current download finishes (already in flight). Subsequent items get re-classified at dequeue time. |
| User goes offline mid-prefetch | `fetch` rejects → drop the item. `online` event resumes the loop on reconnect from current feed state. |
| User taps a blipp currently being prefetched | Tap path wins: cancel background fetch via `AbortController`, fetch presigned URL fresh for `audio.src`, restart prefetch as the background-store side of the tap path. |
| Storage budget too small to hold the current prefetch target | `evictUntilFits` runs. If still no room, store fails → drop, log. |

### Cross-cutting

| Case | Behavior |
|---|---|
| iOS aggressive eviction reaps a Capacitor file out from under us | `getPlayableUrl` cache-miss path covers it. Manifest entry cleaned on next read. |
| User clears app storage from Settings | Next feed event repopulates. Same as fresh install. |
| User logs out / switches accounts | New: `clearAll()` on signout. One `useEffect` watching Clerk auth state. |
| Briefing audio regenerated server-side with same `briefing.id` | Per data model (`Briefing.id` is cuid, audio bytes are immutable per `clipId` lineage), shouldn't happen — a regenerate makes a new clip and new briefing. Not handling it. |

### Explicitly NOT handling

- No exponential backoff or retry queue for prefetch.
- No "you're offline" toast on prefetch failures.
- No telemetry on prefetch hit rates (worth adding eventually; not v1).
- No reaping of cached files for budget-down changes — next `evictUntilFits` catches up on next store call.

## Testing strategy

### Unit-testable, high-value (vitest)

- `src/services/storage-manager.ts` extensions:
  - `getPlayableUrl` cache hit returns existing blob URL without network
  - `getPlayableUrl` cache miss fetches presigned URL, sets up background store
  - Corrupted-blob recovery (manifest yes, blob null → falls through cleanly)
  - `pruneNotInFeed` reaps absent entries, preserves currently-playing
  - Eviction with prefetched-but-unplayed items is oldest-cached-first within unlistened bucket

- `src/services/prefetcher.ts`:
  - `scheduleFromFeed` filters already-cached items
  - Cellular vs Wi-Fi classification picks right N
  - Single concurrency: enqueueing 5 results in 1 in-flight fetch
  - `online`/`offline` events pause/resume the loop
  - `pause` during active playback, `resume` on `canplay`
  - Tap-during-prefetch race: aborts in-flight, hands off to tap path, doesn't re-enqueue
  - `navigator.connection` absent → falls back to cellular-tier defaults

- `src/lib/network-tier.ts`: mock `navigator` shapes.

- `worker/routes/__tests__/briefings-audio-url.test.ts`:
  - 200 with `{ url, expiresAt }` for owner
  - 404 for cross-user briefing
  - 409 when audio R2 key is missing
  - URL TTL ≤ 5 minutes
  - URL is signed (basic shape check, not byte-for-byte SigV4)

### Integration-testable (vitest with mocked Capacitor + IndexedDB)

- `audio-context.tsx`: tap a feed item → `storageManager.getPlayableUrl` called with right `briefingId` → audio element receives expected URL.

### Manual smoke test plan

1. Fresh install on staging, log in, feed loads. DevTools → Application → IndexedDB / Cache: prefetched items appear.
2. Tap a prefetched item: playback starts in <200 ms. No `/api/briefings/:id/audio-url` request, only local blob URL.
3. Tap an item not yet prefetched (scroll bottom): one `/api/briefings/:id/audio-url` call, then presigned URL streams. Audio starts on first byte.
4. Airplane mode: previously-prefetched items still play instantly. Uncached items show "Failed to load audio."
5. Listen to one blipp; next 1-2 in queue prefetch (Network panel) before current finishes.
6. Cellular simulation (Network panel → Slow 3G + cellular flag): only 2 items prefetch.
7. Real iPhone Capacitor build: Filesystem writes survive force-quit + relaunch.
8. Sign out, sign in as different user: previous user's cached blipps gone.
9. Set budget to 250 MB, exceed it: eviction order is listened > 24h first, then unlistened oldest-cached.

### Explicitly NOT testing

- R2 SigV4 byte-for-byte. Trust the signing library; smoke against real R2 bucket suffices.
- iOS Safari pressure-based eviction. Cannot simulate in vitest. Behavior under eviction is "manifest yes, blob no" which IS unit-tested.
- Intro jingle, queue, listened-timer, media-session-metadata code in audio-context. Out of scope.
- E2E Playwright/iOS-detox. Cost-to-value isn't there for this team yet.

## Rollout

1. **Server first**: ship `/api/briefings/:id/audio-url` behind env flag `ENABLE_AUDIO_PRESIGN`. Deploy, verify presigning works in staging, R2 credentials correct, no auth holes. No client behavior changes yet.
2. **Client wiring**: ship StorageManager integration + prefetcher behind a single client flag. Default is environment-driven via a build-time constant read from `import.meta.env.MODE` (or equivalent): `true` in staging, `false` in production initially. A user can override their own default by setting `localStorage.setItem("blipp.prefetch.enabled", "true" | "false")` for QA / debugging. The flag gates the entire client-side change: when `false`, `audio-context` falls back to today's `fetch → blob → URL.createObjectURL` path and the prefetcher does not initialize.
3. **Production enable**: flip the localStorage default to `true` in production after a few days of staging soak.
4. **Cleanup pass**: ~2 weeks after stable, remove the feature flag and the `/api/briefings/:id/audio` blob-fetch path from the client. Server route stays for admin tools. The SW `CacheFirst` rule on `/api/briefings/:id/audio` in `src/sw.ts` becomes dead code (the player no longer hits that URL) and should be removed in this same cleanup pass.

## Success metrics

| Metric | Target | Measurement |
|---|---|---|
| Tap-to-first-byte (cache hit) | p50 < 100 ms, p95 < 200 ms | Console-logged timing in audio-context (tap → `audio.play()` resolved) |
| Tap-to-first-byte (cache miss, presigned) | p50 < 600 ms, p95 < 1500 ms | Same |
| Cache hit rate on tap | > 80% in normal usage | Prefetcher logs hit/miss to console |
| Storage budget compliance | 0 manifest entries above budget after 24h soak | Manual via Settings → Storage |

These are not piped to dashboards in v1. They're the "we sat with the app for an hour and these numbers held" bar. Real telemetry is a separate follow-up.

## Known risks

### Accepted (live with):

- **iOS WKWebView R2 presigned URL CORS.** Bucket needs `AllowedOrigins: ["https://podblipp.com", "https://staging.podblipp.com", "capacitor://localhost"]`. Smoke test #2 catches if it's missing.
- **Presigned URL TTL races.** 5 min TTL → "Play All" + walk away for 6 min could fail next track. Mitigation: presigned URLs fetched at play-time, not queue-time. Already in design.
- **First-day-after-launch storage spike.** Up to ~50 MB per user per Wi-Fi session. R2 egress cost is real. Check the bill the week after rollout.
- **Tap-during-prefetch race.** If AbortController/handoff has a bug, worst case is doubled fetch. Wasted bandwidth, not broken UX.

### Flagged but explicitly NOT solving in v1:

- Background prefetch with app closed (iOS Background App Refresh coordination is non-trivial).
- Per-item "downloaded" indicator UI (Q1/Q2 decisions).
- Outbox for offline progress/listened writes (tracked under "full offline" follow-up).
- Cross-device cache coherence for personalized audio (not relevant until ads ship).
- Telemetry on cache hit rates and prefetch effectiveness.

## Rollback plan

- Flip `blipp.prefetch.enabled` to `false`. Clients re-read on next page load. Players fall back to today's `/api/briefings/:id/audio` blob-fetch path, which is unchanged.
- Worst-case server: disable new route via `ENABLE_AUDIO_PRESIGN=false` env var on the worker.
- Either rollback path is < 5 minutes and zero data loss.

## Open follow-ups (not in v1 scope)

- **Full offline session** (Q4 follow-up): feed metadata cache + outbox/retry queue for `/feed/:id/progress` and listened writes + reconciliation rules for cross-device offline conflicts.
- **Telemetry**: pipe prefetch metrics to whatever observability stack ends up in place (Posthog, Sentry, custom).
- **Range/resume on partial downloads**: skipped in v1 for simplicity.
- **Per-item downloaded indicator UI** if users ask post-launch.
- **Background App Refresh prefetch** on Capacitor iOS for "open after push notification" instant playback.
