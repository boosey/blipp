# Offline Prefetch — Smoke Test Runbook

Companion to [`plans/2026-04-24-offline-prefetch.md`](./plans/2026-04-24-offline-prefetch.md) Task 14 and [`specs/2026-04-24-offline-prefetch-design.md`](./specs/2026-04-24-offline-prefetch-design.md) "Manual smoke test plan". This file contains the exact browser-console snippets and pass/fail criteria for each of the 9 checks, so any future session can resume without re-deriving them from code.

## Reference state

| Object | Value |
|---|---|
| Storage Cache name | `blipp-storage` |
| IndexedDB name | `blipp-storage` |
| Object store | `manifest` (keyPath: `briefingId`) |
| Manifest entry fields | `briefingId, cachedAt, sizeBytes, listenedAt, expiresAt` |
| Audio cache key | `/blipp-audio/{briefingId}` |
| `WIFI_TAKE` (max prefetch on wifi) | 10 |
| `CELLULAR_TAKE` (max prefetch on cellular when enabled) | 2 |
| Cellular toggle localStorage key | `blipp.prefetch.cellular.enabled` (`"true"` / `"false"`) |
| Network tier classifier | `src/lib/network-tier.ts` (`navigator.connection.type` → fallback `effectiveType`) |
| Prefetcher source | `src/services/prefetcher.ts` |
| Audio context (canplay top-up) | `src/contexts/audio-context.tsx` |

## Setup

1. Latest `main` deployed to staging (verify with `gh run list --limit 1` — most recent Deploy Staging must be `success`).
2. Sign in to https://staging.podblipp.com in a regular Chrome (Google OAuth blocks instrumented Chromes — don't try cookie transplant; the `__session` JWT is 4-min lived and not refreshable without the full Clerk client).
3. Hard refresh the feed page (Ctrl+Shift+R) and let it settle ~5 seconds before running anything.
4. DevTools → Network and Console tabs ready.

## Step 1: `/audio-url` route is deployed

```js
fetch('/api/briefings/__nope__/audio-url', { credentials: 'include' }).then(r => r.status);
```

**Pass:** `401`. (The 401 — not 500 — also verifies P1.)
**Fail:** `404` → route not deployed; `500` → P1 regression.

## Status snapshot (resumed 2026-04-25, staging at `a614d1b`)

| Check | Status | Notes |
|---|---|---|
| Step 1 | ✅ | Returned 401 |
| 1 | ✅ | Manifest + cache populated to 10 entries |
| 2 | ✅ | `srcType: 'blob'`, no `/audio-url` request |
| 3 | ✅ | 1 `/audio-url` call, plays via signed `audio?t=<token>` |
| 4 | ✅ | Prefetched plays offline; unprefetched fails |
| 5 | ✅ | After issue #7 fix (`a614d1b`): N=11 → M=15 with 7 background `audio?t=` fetches |
| 6 | ✅ | Toggle persists to `localStorage` correctly (null default = off; click flips `"true"`/`"false"`). Forced-cellular reload path skipped — `Object.defineProperty(navigator)` doesn't survive reload; cellular policy covered by `prefetcher.test.ts` |
| 7 | ⏭️ | Real-iPhone Capacitor — only the human can run |
| 8 | ⏭️ | Cross-user cache eviction — needs second user account |
| 9 | ✅ | Manual run skipped (UI min budget 250 MB ≫ ~75 MB usage). Eviction order covered by 7 new unit tests in `src/__tests__/storage-manager.test.ts` ("StorageManager eviction policy") |

## Check 1: Prefetched items appear in IndexedDB / Cache after feed load

```js
(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('blipp-storage'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const all = await new Promise((res, rej) => {
    const r = db.transaction('manifest', 'readonly').objectStore('manifest').getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const cache = await caches.open('blipp-storage');
  const keys = await cache.keys();
  return {
    manifestCount: all.length,
    manifestSample: all.slice(0, 3).map(e => ({ briefingId: e.briefingId, cachedAt: e.cachedAt, sizeBytes: e.sizeBytes })),
    cacheKeys: keys.length,
    cacheKeySample: keys.slice(0, 3).map(r => r.url),
  };
})();
```

**Pass:** `manifestCount > 0` and `cacheKeys > 0` (counts roughly equal). On wifi expect ~`WIFI_TAKE` (10) or `min(WIFI_TAKE, feedItemCount)`.
**Fail (both 0):** prefetcher didn't run; check `scheduleFromFeed` wiring in `storage-context.tsx`.

## Check 2: Tap a prefetched item → instant playback, no `/audio-url` call

1. Network panel: clear, filter `audio-url`.
2. Tap the **first** feed item (one in `manifestSample` from check 1).
3. Right after tap:

```js
(() => {
  const a = document.querySelector('audio');
  return { src: a?.src?.slice(0, 60), srcType: a?.src?.startsWith('blob:') ? 'blob' : 'http', readyState: a?.readyState, paused: a?.paused };
})();
```

**Pass:** `srcType: 'blob'`, no `/audio-url` row in Network panel, audio plays.
**Fail:** `srcType: 'http'` or `audio-url` request present → `getPlayableUrl` is falling through to network even though manifest has the entry.

## Check 3: Tap an unprefetched item → exactly 1 `/audio-url` call + signed-URL stream

1. Identify a feed item NOT in the manifest. Use:
```js
(async () => {
  const r = await fetch('/api/feed', { credentials: 'include' });
  const items = (await r.json())?.items ?? [];
  const ids = items.map(it => it.briefingId ?? it.id);
  const db = await new Promise((res, rej) => { const r = indexedDB.open('blipp-storage'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const r = db.transaction('manifest', 'readonly').objectStore('manifest').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const cached = new Set(all.map(e => e.briefingId));
  return { uncached: ids.filter(id => id && !cached.has(id)).slice(0, 5) };
})();
```

2. Network panel: clear, filter `audio` (broad). Tap an item from `uncached`.
3. Audio-element probe:

```js
(() => {
  const a = document.querySelector('audio');
  return { src: a?.src?.slice(0, 120), startsWithBlob: a?.src?.startsWith('blob:'), startsWithHttp: a?.src?.startsWith('http'), readyState: a?.readyState };
})();
```

4. Count Network panel requests to `/api/briefings/*/audio-url` and to `/api/briefings/*/audio?t=...`.

**Pass:** exactly 1 `audio-url` request, then audio src is `audio?t=<token>`, `readyState >= 2`. Verifies T3 endpoint + T4 token-or-Clerk auth.
**Fail:** zero `audio-url` (broken), multiple (caching missing).

## Check 4: Airplane mode — prefetched plays, unprefetched fails

1. DevTools → Network → throttle dropdown → **Offline**.
2. Tap a prefetched item from `manifestSample`. Run probe from check 2.
3. Tap an unprefetched item from check 3's list. Run probe.
4. Restore throttle to **No throttling**.

**Pass:** prefetched: `srcType: 'blob'`, plays. Unprefetched: `audio.error?.code` set (likely `MEDIA_ERR_NETWORK = 2`), audio doesn't play.

## Check 5: canplay top-up adds 1–2 next items during playback

⚠ **Known broken — issue #7.** The handler in `audio-context.tsx:444` reads `queueRef.current` (the explicit play queue), which is empty for the dominant tap-from-feed flow. Should use the feed snapshot. **Re-run after #7 fix** to confirm.

To exercise:

1. Pre-condition: feed has more items than `WIFI_TAKE` (10). Confirm with the script in check 3 — `uncached` should be non-empty.
2. Run check 1's script → record `manifestCount` as N.
3. Tap any prefetched item, let it play 5–10 s.
4. Run check 1's script again → record `manifestCount` as M.
5. From Network panel, count background `audio?t=...` fetches that fired during playback (excluding the original tap).

**Pass:** M ≥ N+1 with at least one background fetch.
**Vacuous pass:** if `feedItemCount ≤ WIFI_TAKE`, there's nothing to top up — re-run with a longer feed.

## Check 6: Cellular toggle (partial on desktop)

Desktop Chrome can't actually emulate `navigator.connection.type === 'cellular'` (the API is read-only). The unit tests in `src/__tests__/prefetcher.test.ts` cover the policy branch directly. This check verifies (a) UI toggle persists to localStorage, and (b) the policy applies when tier is forced.

1. Settings page → "Allow prefetch on cellular" toggle. Toggle off / on / off, after each:

```js
localStorage.getItem('blipp.prefetch.cellular.enabled');
```

**Pass:** flips `"true"` / `"false"` correctly.

2. Force cellular tier and reload:

```js
Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ type: 'cellular', effectiveType: '3g' }) });
```

3. Hard refresh, wait 5 s, run check 1's script. Compare `manifestCount` for toggle-on vs toggle-off across two reload cycles.

**Pass:** toggle off + cellular forced → `manifestCount` does not grow (or stays at whatever was already cached). Toggle on + cellular forced → grows by up to `CELLULAR_TAKE` (2).

True end-to-end cellular path is verified in check 7 (iPhone).

## Check 7: Real-iPhone Capacitor — Filesystem persistence across force-quit

**Human-only.** No browser equivalent. From the spec:

1. Build Capacitor app with current main. Sign in.
2. Let feed populate; verify manifest has prefetched items (Capacitor's IndexedDB or Filesystem-backed store).
3. Tap a prefetched item to confirm it plays from local store.
4. Force-quit the app (swipe up on iOS).
5. Re-launch in airplane mode. Confirm a prefetched item still plays.

**Pass:** prefetched audio plays after force-quit + airplane-mode relaunch.

## Check 8: Cross-user cache eviction on sign-out / sign-in-as

1. As user A, run check 1 — record `manifestCount` and at least one `briefingId`.
2. Sign out via the user menu.
3. Sign in as user B (a different account).
4. Run check 1 again.

**Pass:** manifest does not contain user A's `briefingId` entries. Cache keys reflect only user B's items.
**Fail:** cross-user leakage; verify T13's `clearCache` on signout fired.

## Check 9: Storage budget eviction (listened > 24h first, then unlistened oldest)

Requires two adjustments:
1. Set the budget low enough to force eviction. Look for a settings field or `localStorage` key controlling budget; failing that, manipulate via the StorageManager API exposed on the prefetcher.
2. Listen to a few items so they have `listenedAt` set, and let one's `listenedAt` be > 24h old (or fake by setting `listenedAt` directly in the manifest entry).

```js
// Inspect/edit manifest directly:
(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('blipp-storage'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('manifest', 'readwrite');
  const store = tx.objectStore('manifest');
  // Mutate listenedAt of a specific entry to simulate >24h listened:
  // const e = await new Promise(r => { const req = store.get('<briefingId>'); req.onsuccess = () => r(req.result); });
  // e.listenedAt = Date.now() - 25*60*60*1000;
  // store.put(e);
  const all = await new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result); });
  return all.map(e => ({ id: e.briefingId, listenedAt: e.listenedAt, cachedAt: e.cachedAt, sizeBytes: e.sizeBytes }));
})();
```

3. Trigger an eviction pass (load a new item that pushes total > budget) and re-inspect the manifest.

**Pass:** items evicted in order: listened > 24h first, then unlistened oldest-cached. Survivors include unlistened newly-cached items.

## Status close-out

After all 9 pass on staging + iPhone:
- Mark task #14 completed (only the human user — agents must not).
- Close issue #7 (or any other follow-ups filed during the run).
