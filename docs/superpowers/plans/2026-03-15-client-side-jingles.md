# Client-Side Jingle Playback Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play intro/outro jingle sounds on the client via audio element sequencing with Cache API caching, and remove the server-side MP3 assembly code.

**Architecture:** Jingles are static MP3s served from R2 via a public route. The client caches them via the Cache API and plays them as separate audio segments sequenced around the briefing content. The existing `AdState` type gains two new states (`intro-jingle`, `outro-jingle`) that drive the sequencing in `audio-context.tsx`.

**Tech Stack:** React 19, Hono, Cloudflare Workers R2, Cache API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-client-side-jingles-design.md`

---

## Chunk 1: Server-Side Changes

### Task 1: Asset Route — Serve Jingle Files from R2

**Files:**
- Create: `worker/routes/assets.ts`
- Create: `worker/routes/__tests__/assets.test.ts`
- Modify: `worker/routes/index.ts:19` (add import + mount)

- [ ] **Step 1: Write the asset route test**

Create `worker/routes/__tests__/assets.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv } from "../../../tests/helpers/mocks";

const { assetsRoutes } = await import("../assets");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("Assets Routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.route("/assets", assetsRoutes);
  });

  it("returns MP3 with correct headers when jingle exists in R2", async () => {
    const audioData = new Uint8Array([0xff, 0xfb, 0x90]).buffer;
    (env.R2 as any).get.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(audioData),
    });

    const res = await app.request("/assets/jingles/intro.mp3", {}, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect((env.R2 as any).get).toHaveBeenCalledWith("assets/jingles/intro.mp3");
  });

  it("returns 404 when jingle does not exist in R2", async () => {
    (env.R2 as any).get.mockResolvedValueOnce(null);

    const res = await app.request("/assets/jingles/outro.mp3", {}, env, mockExCtx);

    expect(res.status).toBe(404);
  });

  it("rejects paths outside jingles directory", async () => {
    const res = await app.request("/assets/../../secrets.json", {}, env, mockExCtx);

    expect(res.status).toBe(404);
    expect((env.R2 as any).get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/routes/__tests__/assets.test.ts`
Expected: FAIL — module `../assets` not found

- [ ] **Step 3: Write the asset route**

Create `worker/routes/assets.ts`:

```typescript
import { Hono } from "hono";
import type { Env } from "../types";

const ALLOWED_ASSETS = new Set([
  "jingles/intro.mp3",
  "jingles/outro.mp3",
]);

const assetsRoutes = new Hono<{ Bindings: Env }>();

assetsRoutes.get("/:path{.+}", async (c) => {
  const path = c.req.param("path");

  if (!ALLOWED_ASSETS.has(path)) {
    return c.json({ error: "Not found" }, 404);
  }

  const obj = await c.env.R2.get(`assets/${path}`);
  if (!obj) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await obj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export { assetsRoutes };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/routes/__tests__/assets.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Mount the route**

Edit `worker/routes/index.ts`. Add import and mount:

```typescript
import { assetsRoutes } from "./assets";
```

Add after line 31 (`routes.route("/admin", adminRoutes);`):

```typescript
routes.route("/assets", assetsRoutes);
```

- [ ] **Step 6: Commit**

```bash
git add worker/routes/assets.ts worker/routes/__tests__/assets.test.ts worker/routes/index.ts
git commit -m "feat: add public asset route for jingle MP3s from R2"
```

---

### Task 2: Remove Server-Side Assembly Code

**Files:**
- Delete: `worker/lib/audio/assembly.ts`
- Delete: `worker/lib/audio/types.ts`
- Delete: `worker/lib/audio/constants.ts`
- Delete: `worker/lib/audio/__tests__/assembly.test.ts`
- Delete: `worker/lib/mp3-concat.ts`
- Delete: `worker/lib/__tests__/mp3-concat.test.ts`
- Delete: `worker/routes/__tests__/briefings-audio.test.ts`
- Modify: `worker/queues/briefing-assembly.ts:1-8,66-156` (remove assembly imports + block)
- Modify: `worker/queues/__tests__/briefing-assembly.test.ts:22-49,107,395-500` (remove assembly mocks + tests)
- Modify: `worker/routes/briefings.ts:127-174` (simplify audio endpoint)
- Modify: `worker/lib/work-products.ts:8-13,16-28` (remove BRIEFING_AUDIO case)
- Modify: `worker/lib/user-data.ts:123-134` (remove dead R2 cleanup)
- Modify: `src/pages/admin/podcast-settings.tsx:25` (remove config entry)
- Modify: `prisma/seed.ts:70-79` (remove seed entry)

- [ ] **Step 1: Delete assembly module files**

```bash
rm worker/lib/audio/assembly.ts worker/lib/audio/types.ts worker/lib/audio/constants.ts
rm worker/lib/audio/__tests__/assembly.test.ts
rm worker/lib/mp3-concat.ts worker/lib/__tests__/mp3-concat.test.ts
rm worker/routes/__tests__/briefings-audio.test.ts
```

Remove empty directories if left behind:
```bash
rmdir worker/lib/audio/__tests__ worker/lib/audio 2>/dev/null; true
```

- [ ] **Step 2: Simplify briefing-assembly.ts — remove assembly block**

In `worker/queues/briefing-assembly.ts`:

Remove the `assembleBriefingAudio` import (line 1) and `getConfig` import (line 2):
```typescript
// REMOVE: import { assembleBriefingAudio } from "../lib/audio/assembly";
// REMOVE: import { getConfig } from "../lib/config";
```

Also remove the `wpKey, getWorkProduct, putWorkProduct` import (line 8) — replace with just what's still needed. Check: `wpKey` is used only in the assembly block for `AUDIO_CLIP` lookup. After removing assembly, none of `wpKey`, `getWorkProduct`, `putWorkProduct` are used. Remove the entire import line.

Remove the assembly block inside the `for (const fi of feedItems)` loop (lines 95-155). The loop body should only contain the `briefing.upsert` and `feedItem.update` calls. After edit, the loop body for each feedItem is:

```typescript
for (const fi of feedItems) {
  // Upsert Briefing (per-user wrapper around shared Clip)
  const briefing = await prisma.briefing.upsert({
    where: {
      userId_clipId: {
        userId: fi.userId,
        clipId: job.clipId!,
      },
    },
    create: {
      userId: fi.userId,
      clipId: job.clipId!,
    },
    update: {},
  });

  await prisma.feedItem.update({
    where: { id: fi.id },
    data: {
      status: "READY",
      briefingId: briefing.id,
    },
  });
}
```

- [ ] **Step 3: Update briefing-assembly test — remove assembly mocks and tests**

In `worker/queues/__tests__/briefing-assembly.test.ts`:

Keep the `getConfig` mock (lines 22-24) and the `(getConfig as any).mockResolvedValue(true)` default in `beforeEach` (line 107) — these are needed by `checkStageEnabled` for the stage gate tests.

Remove the `assembleBriefingAudio` mock (lines 26-33):
```typescript
// REMOVE this entire vi.mock block:
// vi.mock("../../lib/audio/assembly", () => ({ ... }));
```

Update the `work-products` mock (lines 35-45) — remove the `BRIEFING_AUDIO` case, `getWorkProduct`, and `putWorkProduct`:
```typescript
vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn((params: any) => {
    if (params.type === "AUDIO_CLIP")
      return `wp/clip/${params.episodeId}/${params.durationTier}/${params.voice ?? "default"}.mp3`;
    return `wp/unknown`;
  }),
}));
```

Remove the `assembleBriefingAudio` and work product imports (lines 48-49):
```typescript
// REMOVE: import { assembleBriefingAudio } from "../../lib/audio/assembly";
// REMOVE: import { getWorkProduct, putWorkProduct } from "../../lib/work-products";
```

Keep the `getConfig` import (line 47) — still used in stage gate tests.

Delete the entire "audio assembly" describe block (lines 395-500).

- [ ] **Step 4: Simplify briefings.ts audio endpoint**

In `worker/routes/briefings.ts`, replace the `GET /:id/audio` handler (lines 127-174) with a simpler version that always serves the raw clip:

```typescript
briefings.get("/:id/audio", async (c) => {
  const briefingId = c.req.param("id");
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const briefing = await prisma.briefing.findFirst({
    where: { id: briefingId, userId: user.id },
    include: {
      clip: { select: { audioKey: true } },
    },
  });

  if (!briefing) {
    return c.json({ error: "Briefing not found" }, 404);
  }

  if (!briefing.clip?.audioKey) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const clipObj = await c.env.R2.get(briefing.clip.audioKey);
  if (!clipObj) {
    return c.json({ error: "Audio not found" }, 404);
  }

  const body = await clipObj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
```

- [ ] **Step 5: Remove BRIEFING_AUDIO from work-products.ts**

In `worker/lib/work-products.ts`, remove the `BRIEFING_AUDIO` union member from `WpKeyParams` (line 13) and its case in `wpKey` (lines 26-27):

After edit:
```typescript
export type WpKeyParams =
  | { type: "TRANSCRIPT"; episodeId: string }
  | { type: "CLAIMS"; episodeId: string }
  | { type: "NARRATIVE"; episodeId: string; durationTier: number }
  | { type: "AUDIO_CLIP"; episodeId: string; durationTier: number; voice?: string };
```

```typescript
export function wpKey(params: WpKeyParams): string {
  switch (params.type) {
    case "TRANSCRIPT":
      return `wp/transcript/${params.episodeId}.txt`;
    case "CLAIMS":
      return `wp/claims/${params.episodeId}.json`;
    case "NARRATIVE":
      return `wp/narrative/${params.episodeId}/${params.durationTier}.txt`;
    case "AUDIO_CLIP":
      return `wp/clip/${params.episodeId}/${params.durationTier}/${params.voice ?? "default"}.mp3`;
  }
}
```

- [ ] **Step 6: Remove dead R2 cleanup from user-data.ts**

In `worker/lib/user-data.ts`, remove lines 123-134 (the briefing audio R2 deletion loop):

```typescript
// REMOVE this block:
// // 2. Delete R2 briefing audio (keyed by briefingId, not userId)
// let r2Deleted = 0;
// if (user?.briefings?.length) {
//   for (const b of user.briefings) {
//     ...
//   }
// }
```

Also update the user query (lines 113-121) to remove the `briefings` select since it's no longer needed:

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    stripeCustomerId: true,
  },
});
```

Initialize `r2Deleted` to 0 (keep the return shape):
```typescript
const r2Deleted = 0;
```

- [ ] **Step 7: Remove config entry from admin UI and seed**

In `src/pages/admin/podcast-settings.tsx`, remove line 25:
```typescript
// REMOVE: { key: "BRIEFING_ASSEMBLY_AUDIO_ENABLED", label: "Audio Assembly", ... },
```

In `prisma/seed.ts`, remove lines 70-79:
```typescript
// REMOVE: await prisma.platformConfig.upsert({
//   where: { key: "BRIEFING_ASSEMBLY_AUDIO_ENABLED" },
//   ...
// });
```

- [ ] **Step 8: Run all tests to verify nothing broke**

Run: `npx vitest run worker/ --reporter=verbose`
Expected: All tests pass. The deleted test files won't run. The modified tests should still pass.

Also run: `npx vitest run src/ --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove server-side audio assembly in favor of client-side jingles"
```

---

## Chunk 2: Client-Side Changes

### Task 3: Jingle Cache Module

**Files:**
- Create: `src/lib/jingle-cache.ts`
- Create: `src/__tests__/jingle-cache.test.ts`

- [ ] **Step 1: Write the jingle cache test**

Create `src/__tests__/jingle-cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock Cache API
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
};
const mockCaches = {
  open: vi.fn().mockResolvedValue(mockCache),
};
vi.stubGlobal("caches", mockCaches);

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/fake-blob");
vi.stubGlobal("URL", { ...URL, createObjectURL: mockCreateObjectURL });

// Must import after mocks
let getJingleUrl: typeof import("../lib/jingle-cache").getJingleUrl;

describe("jingle-cache", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockCache.match.mockResolvedValue(undefined);
    mockCache.put.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(new Response(new ArrayBuffer(100), { status: 200 }));

    // Re-import to reset module-level state
    vi.resetModules();
    const mod = await import("../lib/jingle-cache");
    getJingleUrl = mod.getJingleUrl;
  });

  it("fetches and caches jingle on cache miss", async () => {
    mockCache.match.mockResolvedValue(undefined);

    const url = await getJingleUrl("intro");

    expect(mockFetch).toHaveBeenCalledWith("/api/assets/jingles/intro.mp3");
    expect(mockCache.put).toHaveBeenCalled();
    expect(url).toBe("blob:http://localhost/fake-blob");
  });

  it("returns blob URL from cache hit without fetching", async () => {
    mockCache.match.mockResolvedValue(
      new Response(new ArrayBuffer(100), { status: 200 })
    );

    const url = await getJingleUrl("outro");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(url).toBe("blob:http://localhost/fake-blob");
  });

  it("returns null when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    const url = await getJingleUrl("intro");

    expect(url).toBeNull();
  });

  it("returns null when fetch returns non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));

    const url = await getJingleUrl("intro");

    expect(url).toBeNull();
  });

  it("returns null when Cache API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    vi.resetModules();
    const mod = await import("../lib/jingle-cache");

    const url = await mod.getJingleUrl("intro");

    expect(url).toBeNull();
    // Restore
    vi.stubGlobal("caches", mockCaches);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/jingle-cache.test.ts`
Expected: FAIL — module `../lib/jingle-cache` not found

- [ ] **Step 3: Write the jingle cache module**

Create `src/lib/jingle-cache.ts`:

```typescript
const JINGLE_URLS = {
  intro: "/api/assets/jingles/intro.mp3",
  outro: "/api/assets/jingles/outro.mp3",
} as const;

const CACHE_NAME = "blipp-jingles";

/** Module-level blob URL cache — survives across calls without re-reading Cache API. */
const blobUrls = new Map<string, string>();

/** Tracks in-flight fetches to avoid duplicate requests. */
const pending = new Map<string, Promise<string | null>>();

/**
 * Returns a blob URL for the given jingle type, or null if unavailable.
 *
 * On first call, eagerly primes both jingles in parallel.
 * Returns null (non-blocking) if the jingle hasn't been fetched yet
 * or is unavailable (404, network error, Cache API missing).
 */
export async function getJingleUrl(
  type: "intro" | "outro"
): Promise<string | null> {
  // Return cached blob URL immediately
  const cached = blobUrls.get(type);
  if (cached) return cached;

  // Check for in-flight request
  const inflight = pending.get(type);
  if (inflight) return inflight;

  // Prime both jingles in parallel on first access
  if (pending.size === 0) {
    for (const t of ["intro", "outro"] as const) {
      pending.set(t, loadJingle(t));
    }
  } else if (!pending.has(type)) {
    pending.set(type, loadJingle(type));
  }

  return pending.get(type)!;
}

async function loadJingle(type: "intro" | "outro"): Promise<string | null> {
  try {
    const url = JINGLE_URLS[type];

    // Try Cache API first
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.set(type, blobUrl);
        return blobUrl;
      }

      // Cache miss — fetch from network
      const response = await fetch(url);
      if (!response.ok) return null;

      // Clone before consuming — one for cache, one for blob URL
      await cache.put(url, response.clone());
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.set(type, blobUrl);
      return blobUrl;
    }

    // No Cache API — fetch directly (no caching)
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.set(type, blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/jingle-cache.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/jingle-cache.ts src/__tests__/jingle-cache.test.ts
git commit -m "feat: add jingle cache module with Cache API + blob URL management"
```

---

### Task 4: Audio Context — Jingle Playback Sequencing

**Files:**
- Modify: `src/types/ads.ts:15` (add jingle states to AdState)
- Modify: `src/contexts/audio-context.tsx` (jingle sequencing, handler guards, Media Session)

- [ ] **Step 1: Add jingle states to AdState**

In `src/types/ads.ts`, replace the `AdState` type (line 15):

```typescript
export type AdState = "none" | "loading-ad-config" | "preroll" | "intro-jingle" | "content" | "outro-jingle" | "postroll";
```

- [ ] **Step 2: Update audio-context.tsx — add imports and refs**

At the top of `src/contexts/audio-context.tsx`, add import:

```typescript
import { getJingleUrl } from "../lib/jingle-cache";
```

No new refs needed — the `handleTimeUpdate` and `handleLoadedMetadata` handlers are gated during jingle states, so `currentTime` and `duration` state naturally freeze.

- [ ] **Step 3: Update startContentPlayback — play intro jingle first**

Replace `startContentPlayback` (lines 69-113). The new version checks for an intro jingle URL. If available, it plays the jingle first with rate forced to 1x. If not, it proceeds to content directly (current behavior). The actual content start is extracted into a new `beginContent` function:

```typescript
// Start actual content playback (shared by intro-jingle->ended and direct start)
const beginContent = useCallback(
  (item: FeedItem) => {
    const audio = audioRef.current;
    if (!audio || !item.briefing) return;

    setAdState("content");
    setCurrentItem(item);
    setError(null);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    audio.src = `/api/briefings/${item.briefing.id}/audio`;
    audio.playbackRate = playbackRate;
    audio.play().catch(() => {
      setIsLoading(false);
      setError("Failed to play audio");
    });

    // Fire-and-forget listened PATCH
    if (!item.listened) {
      apiFetch(`/feed/${item.id}/listened`, { method: "PATCH" }).catch(
        () => {}
      );
    }

    // Media Session API
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.episode.title,
        artist: item.podcast.title,
        artwork: item.podcast.imageUrl
          ? [
              {
                src: item.podcast.imageUrl,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    }
  },
  [apiFetch, playbackRate]
);

const startContentPlayback = useCallback(
  async (item: FeedItem) => {
    const audio = audioRef.current;
    if (!audio || !item.briefing) return;

    // Set up item context immediately
    setCurrentItem(item);
    setError(null);

    // Check for intro jingle
    const introUrl = await getJingleUrl("intro");
    if (introUrl) {
      setAdState("intro-jingle");
      setIsPlaying(true);
      setIsLoading(false);
      setCurrentTime(0);
      setDuration(0);

      audio.playbackRate = 1;
      audio.src = introUrl;
      audio.play().catch(() => {
        // Jingle failed — skip to content
        beginContent(item);
      });
      return;
    }

    // No jingle — start content directly
    beginContent(item);
  },
  [beginContent]
);
```

- [ ] **Step 4: Update handleEnded — sequence jingle→content→jingle→postroll**

Replace `handleEnded` (lines 258-273):

```typescript
const handleEnded = useCallback(async () => {
  const audio = audioRef.current;

  // Intro jingle finished → start content
  if (adState === "intro-jingle") {
    const item = pendingItemRef.current ?? currentItem;
    if (item) {
      beginContent(item);
    }
    return;
  }

  // Content finished → check for outro jingle
  if (adState === "content") {
    const outroUrl = await getJingleUrl("outro");
    if (outroUrl && audio) {
      setAdState("outro-jingle");
      audio.playbackRate = 1;
      audio.src = outroUrl;
      audio.play().catch(() => {
        // Outro failed — fall through to postroll/end
        handlePostrollOrEnd();
      });
      return;
    }

    // No outro — fall through to postroll/end
    handlePostrollOrEnd();
    return;
  }

  // Outro jingle finished → check for postroll
  if (adState === "outro-jingle") {
    handlePostrollOrEnd();
    return;
  }
}, [adState, beginContent, currentItem, handlePostrollOrEnd]);
```

Add the `handlePostrollOrEnd` helper (extracted from the old handleEnded):

```typescript
const handlePostrollOrEnd = useCallback(() => {
  const config = adConfigRef.current;
  if (
    config?.adsEnabled &&
    config.postroll.enabled &&
    config.postroll.vastTagUrl
  ) {
    setAdState("postroll");
    setIsPlaying(true);
    adFlowRef.current = "postroll";
    ima.requestAds(config.postroll.vastTagUrl);
    return;
  }
  setAdState("none");
  setIsPlaying(false);
}, [ima]);
```

- [ ] **Step 5: Update handleError — skip forward during jingles**

Replace `handleError` (lines 294-298):

```typescript
const handleError = useCallback(() => {
  // During jingles, skip to next segment instead of halting
  if (adState === "intro-jingle") {
    const item = pendingItemRef.current ?? currentItem;
    if (item) {
      beginContent(item);
    }
    return;
  }
  if (adState === "outro-jingle") {
    handlePostrollOrEnd();
    return;
  }

  setIsPlaying(false);
  setIsLoading(false);
  setError("Failed to load audio");
}, [adState, beginContent, currentItem, handlePostrollOrEnd]);
```

- [ ] **Step 6: Gate handleTimeUpdate and handleLoadedMetadata during jingles**

Replace `handleTimeUpdate` (lines 276-280):

```typescript
const handleTimeUpdate = useCallback(() => {
  if (adState === "intro-jingle" || adState === "outro-jingle") return;
  if (audioRef.current) {
    setCurrentTime(audioRef.current.currentTime);
  }
}, [adState]);
```

Replace `handleLoadedMetadata` (lines 282-286):

```typescript
const handleLoadedMetadata = useCallback(() => {
  if (adState === "intro-jingle" || adState === "outro-jingle") return;
  if (audioRef.current) {
    setDuration(audioRef.current.duration);
    setIsLoading(false);
  }
}, [adState]);
```

- [ ] **Step 7: Guard setRate during jingles**

Replace `setRate` (lines 183-188):

```typescript
const setRate = useCallback((rate: number) => {
  setPlaybackRate(rate);
  // Don't apply to audio element during jingles — they play at 1x
  if (audioRef.current && adState !== "intro-jingle" && adState !== "outro-jingle") {
    audioRef.current.playbackRate = rate;
  }
}, [adState]);
```

- [ ] **Step 8: Update Media Session isInAd guard**

In the Media Session `useEffect` (line 312), update the `isInAd` check:

```typescript
const isInAd = adState === "preroll" || adState === "postroll"
  || adState === "intro-jingle" || adState === "outro-jingle";
```

- [ ] **Step 9: Run all frontend tests**

Run: `npx vitest run src/ --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 10: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All 85 test files pass, 0 failures.

- [ ] **Step 11: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 12: Commit**

```bash
git add src/types/ads.ts src/contexts/audio-context.tsx
git commit -m "feat: client-side jingle playback with intro/outro sequencing"
```

---

## Chunk 3: Documentation & Cleanup

### Task 5: Update Documentation

**Files:**
- Modify: `docs/pipeline.md`
- Modify: `docs/architecture.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Update pipeline.md**

Remove the `wp/briefing/{userId}/{date}.mp3` row from the work product table. Update the Stage 5 description to note it is data-only (links Clips to Briefings, marks FeedItems READY) and that jingle playback is handled client-side.

- [ ] **Step 2: Update architecture.md**

Remove "Partial assembly is supported" reference. Add a note that intro/outro jingles are played client-side via audio element sequencing with Cache API caching.

- [ ] **Step 3: Update data-model.md**

Add a note that `BRIEFING_AUDIO` in the `WorkProductType` enum is deprecated/unused (kept to avoid schema migration).

- [ ] **Step 4: Commit**

```bash
git add docs/pipeline.md docs/architecture.md docs/data-model.md
git commit -m "docs: update pipeline, architecture, and data model for client-side jingles"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Start dev server and manually test**

Run: `npm run dev`

Verify:
1. `/api/assets/jingles/intro.mp3` returns 404 (no files uploaded yet — expected)
2. `/api/health` still returns 200
3. App loads without console errors
4. Playing a briefing works (no jingles play since none uploaded — same as current behavior)

---

## Task Dependency Graph

```
Task 1 (Asset route)          Task 2 (Remove assembly)
       \                            /
        \                          /
         Task 3 (Jingle cache)    /
              \                  /
               Task 4 (Audio context) ← depends on Task 3
                      \
                       Task 5 (Docs)
                        \
                         Task 6 (Verify)
```

Tasks 1, 2, and 3 are independent and can run in parallel.
Task 4 depends on Task 3 (imports `getJingleUrl`).
Tasks 5 and 6 run after all code tasks complete.
