# Phase 3: PWA Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA install prompt, offline briefing audio caching, and offline connectivity indicator to make Blipp usable as an installed web app with offline playback of previously-listened briefings.

**Architecture:** Three independent features layered onto the existing service worker and React app. The install prompt uses the `beforeinstallprompt` browser event. Offline audio caching extends `public/sw.js` with a dedicated `briefing-audio` cache that intercepts briefing audio responses. The offline indicator listens to `navigator.onLine` events and renders a banner in the app layout. No backend changes. Capacitor native shell is deferred to a separate plan.

**Tech Stack:** Service Worker API, `beforeinstallprompt` event, Cache API, `navigator.onLine`, React 19, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-03-16-mobile-pwa-capacitor-design.md` — Phase 3.1

---

## File Structure

### New Files
- `src/components/install-prompt.tsx` — Custom "Add to Home Screen" banner. Captures `beforeinstallprompt` event, shows a dismissible banner on the home page, stores dismissal in localStorage (once per session). Hidden when already installed (display-mode: standalone).
- `src/components/offline-indicator.tsx` — Subtle banner at top of screen when offline. Listens to `online`/`offline` window events. Auto-dismisses when connectivity returns.

### Modified Files
- `public/sw.js` — Add `briefing-audio` cache: intercept GET requests to `/api/briefings/*/audio`, cache successful responses, LRU eviction at 50 entries.
- `src/layouts/mobile-layout.tsx` — Integrate `OfflineIndicator` at top of layout (above header).
- `src/pages/home.tsx` — Integrate `InstallPrompt` below the page title.

---

## Chunk 1: Offline Briefing Audio Caching

### Task 1: Extend Service Worker with Briefing Audio Cache

**Files:**
- Modify: `public/sw.js`

**Context:** The existing service worker at `public/sw.js` has a `blipp-v1` cache for shell assets and API feed responses. Briefing audio is served from `GET /api/briefings/:id/audio`. When a user plays a briefing, the SW should cache the audio response in a separate `briefing-audio` cache so it's available offline. LRU eviction at 50 entries keeps storage bounded.

The SW is a plain JS file (no build step, no imports). It runs in the service worker scope with `self`, `caches`, `fetch`, etc.

- [ ] **Step 1: Add briefing audio cache constants**

At the top of `public/sw.js`, after the existing `CACHE_NAME` and `SHELL_ASSETS` constants (line 2), add:

```js
const AUDIO_CACHE_NAME = 'briefing-audio-v1';
const MAX_AUDIO_CACHE_SIZE = 50;
```

- [ ] **Step 2: Add LRU eviction helper**

After the constants block (after `SHELL_ASSETS` array, around line 9), add:

```js
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Delete oldest entries (first in list = oldest)
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}
```

- [ ] **Step 3: Add briefing audio cache cleanup to activate handler**

In the `activate` event listener (line 21), add `AUDIO_CACHE_NAME` to the preserved caches. Change:

```js
keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
```

To:

```js
keys.filter(key => key !== CACHE_NAME && key !== AUDIO_CACHE_NAME).map(key => caches.delete(key))
```

- [ ] **Step 4: Add briefing audio interception in fetch handler**

In the `fetch` event listener, inside the API request block (after line 38 `if (url.pathname.startsWith('/api/'))`), add a specific handler for briefing audio URLs BEFORE the existing generic API handler. Insert right after the `/api/` check:

```js
    // Briefing audio: cache-first (for offline playback)
    if (url.pathname.match(/^\/api\/briefings\/[^/]+\/audio$/)) {
      event.respondWith(
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(AUDIO_CACHE_NAME).then(cache => {
                cache.put(event.request, clone);
                trimCache(AUDIO_CACHE_NAME, MAX_AUDIO_CACHE_SIZE);
              });
            }
            return response;
          });
        })
      );
      return;
    }
```

This uses cache-first strategy: if the audio is cached (previously played), serve from cache immediately. Otherwise fetch from network and cache the response.

- [ ] **Step 5: Verify service worker syntax**

Run: `node -c public/sw.js`
Expected: No syntax errors

- [ ] **Step 6: Commit**

```bash
git add public/sw.js
git commit -m "feat: cache briefing audio in service worker for offline playback"
```

---

## Chunk 2: Offline Indicator

### Task 2: Create Offline Indicator Component

**Files:**
- Create: `src/components/offline-indicator.tsx`

**Context:** A subtle banner that appears at the top of the screen when the device goes offline. Uses `navigator.onLine` for initial state and `online`/`offline` window events for changes. Auto-dismisses when connectivity returns.

- [ ] **Step 1: Create offline-indicator.tsx**

Create `src/components/offline-indicator.tsx`:

```tsx
import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-zinc-800 text-zinc-300 text-xs px-4 py-2 flex items-center gap-2">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span>You're offline. Previously played briefings are still available.</span>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into mobile-layout.tsx**

In `src/layouts/mobile-layout.tsx`, add the import after the existing imports:

```tsx
import { OfflineIndicator } from "../components/offline-indicator";
```

Inside `MobileLayoutInner`, add the indicator above the header. Change line 26:

Old:
```tsx
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
```

New:
```tsx
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      <OfflineIndicator />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/offline-indicator.tsx src/layouts/mobile-layout.tsx
git commit -m "feat: add offline connectivity indicator banner"
```

---

## Chunk 3: PWA Install Prompt

### Task 3: Create Install Prompt Component

**Files:**
- Create: `src/components/install-prompt.tsx`
- Modify: `src/pages/home.tsx`

**Context:** The `beforeinstallprompt` event fires when the browser determines the site meets PWA installability criteria (manifest, service worker, HTTPS). We capture this event and show a custom banner on the home page. The banner is dismissible and only shown once per session (localStorage). It's hidden when already running as an installed PWA (`window.matchMedia('(display-mode: standalone)')`) or inside a Capacitor native shell (future-proofing).

- [ ] **Step 1: Create install-prompt.tsx**

Create `src/components/install-prompt.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "blipp-install-prompt-dismissed";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setShow(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  }

  async function install() {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    deferredPromptRef.current = null;
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
        <Download className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Install Blipp</p>
        <p className="text-xs text-zinc-500">Add to your home screen for quick access</p>
      </div>
      <button
        onClick={install}
        className="px-3 py-1.5 bg-white text-zinc-950 text-xs font-medium rounded-lg flex-shrink-0"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-zinc-500 hover:text-zinc-300 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add BeforeInstallPromptEvent type declaration**

The `BeforeInstallPromptEvent` type is not in standard TypeScript libs. Append to `src/vite-env.d.ts`:

```ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
```

- [ ] **Step 3: Integrate into home.tsx**

In `src/pages/home.tsx`, add import after the existing imports:

```tsx
import { InstallPrompt } from "../components/install-prompt";
```

In the final return block (the one with the feed list), add the `InstallPrompt` after the title. Change:

```tsx
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
```

To:

```tsx
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
      <InstallPrompt />
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Run frontend tests**

Run: `npx vitest run src/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/install-prompt.tsx src/vite-env.d.ts src/pages/home.tsx
git commit -m "feat: add PWA install prompt banner on home page"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 2: Run all frontend tests**

Run: `npx vitest run src/`
Expected: All tests pass

- [ ] **Step 3: Verify service worker syntax**

Run: `node -c public/sw.js`
Expected: No syntax errors

- [ ] **Step 4: Visual smoke test**

Open dev server. Test:
1. Go offline (Chrome DevTools → Network → Offline):
   - Offline banner appears at top with wifi-off icon and message
   - Previously played briefing audio still plays (if cached by SW)
2. Go back online:
   - Offline banner auto-dismisses
3. Install prompt (harder to test in dev — requires HTTPS):
   - On supported browsers, "Install Blipp" banner appears on home page
   - Clicking "Install" triggers native install dialog
   - Clicking X dismisses, doesn't reappear this session
   - Already-installed PWA (standalone mode) never shows the banner

- [ ] **Step 5: Commit any fixes from smoke testing**

If any issues found during smoke test, fix and commit with descriptive message.
