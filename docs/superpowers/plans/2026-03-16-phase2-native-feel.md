# Phase 2: Native Feel — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer native-app interactions (view transitions, pull-to-refresh, swipe actions, haptic feedback, scroll snap) onto the Phase 1 mobile baseline to make the React SPA feel like a native podcast app.

**Architecture:** Pure frontend — 3 new hook/component files, modifications to 10 existing files. No backend changes, no new dependencies. Uses native browser APIs (`document.startViewTransition`, touch events, CSS scroll-snap) with graceful fallbacks. React 19's `flushSync` enables synchronous DOM updates inside view transitions.

**Tech Stack:** React 19 + `flushSync`, Tailwind v4, CSS View Transitions API, Touch Events API, CSS scroll-snap

**Spec:** `docs/superpowers/specs/2026-03-16-mobile-pwa-capacitor-design.md` — Phase 2

---

## File Structure

### New Files
- `src/hooks/use-view-transition.ts` — Wraps React Router `useNavigate` with CSS View Transitions API. Determines animation direction (forward/back) from bottom nav tab index. Graceful fallback when API unavailable.
- `src/hooks/use-pull-to-refresh.ts` — Touch event tracker for pull-to-refresh gesture. Attaches to a scrollable container ref. Returns pull state (distance, refreshing) + an indicator JSX element. Disabled when player sheet is open.
- `src/components/swipeable-feed-item.tsx` — Wraps `FeedItemCard` with horizontal swipe detection. Short swipe left reveals "Listened" toggle (blue). Long swipe left reveals "Remove" (red) with undo toast. Tap vs swipe disambiguation at 10px threshold.

### Modified Files
- `src/index.css` — Add view transition keyframes (`slide-forward-old`, `slide-forward-new`, `slide-back-old`, `slide-back-new`) and scroll-snap utility classes
- `src/components/bottom-nav.tsx` — Replace `<Link>` with view-transition-aware navigation + haptic press state
- `src/pages/home.tsx` — Integrate pull-to-refresh (using `fetchFeed` callback) + replace `FeedItemCard` with `SwipeableFeedItem`
- `src/pages/discover.tsx` — Integrate pull-to-refresh + scroll snap on trending section and category pills
- `src/pages/library.tsx` — Integrate pull-to-refresh on each tab + haptic press on grid items
- `src/components/feed-item.tsx` — Add haptic press state (`active:scale-[0.98]`)
- `src/components/podcast-card.tsx` — Add haptic press state
- `src/components/player-sheet.tsx` — Add haptic press state to control buttons
- `src/components/skeletons/feed-skeleton.tsx` — Update to match Phase 1 card layout (remove dot column)
- `src/components/skeletons/discover-skeleton.tsx` — Remove subscribe button skeleton, add chevron placeholder

---

## Chunk 1: CSS Foundation + View Transitions

### Task 1: Add View Transition Keyframes and Scroll-Snap Utilities to CSS

**Files:**
- Modify: `src/index.css` (append after existing content at line 148)

**Context:** Tailwind v4 requires `@keyframes` outside the `@theme` block. The view transitions need four animations: old content exits, new content enters, with separate directions for forward and back navigation. Scroll-snap is standard CSS — just needs utility rules for the discover page.

- [ ] **Step 1: Add view transition keyframes and scroll-snap to index.css**

Append this block to the end of `src/index.css`:

```css
/* View transition animations — forward = slide left, back = slide right */
@keyframes slide-forward-old {
  to { transform: translateX(-30%); opacity: 0; }
}
@keyframes slide-forward-new {
  from { transform: translateX(100%); }
}
@keyframes slide-back-old {
  to { transform: translateX(30%); opacity: 0; }
}
@keyframes slide-back-new {
  from { transform: translateX(-100%); }
}

/* Apply direction-based animations to view transition pseudo-elements */
[data-direction="forward"]::view-transition-old(page) {
  animation: slide-forward-old 0.25s ease-in both;
}
[data-direction="forward"]::view-transition-new(page) {
  animation: slide-forward-new 0.25s ease-out both;
}
[data-direction="back"]::view-transition-old(page) {
  animation: slide-back-old 0.25s ease-in both;
}
[data-direction="back"]::view-transition-new(page) {
  animation: slide-back-new 0.25s ease-out both;
}

/* Scroll-snap container + item utilities */
.snap-x-mandatory {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.snap-start {
  scroll-snap-align: start;
}

/* Hide scrollbar cross-browser (used on horizontal lists) */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors (CSS-only change)

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add view transition keyframes and scroll-snap CSS utilities"
```

---

### Task 2: Create View Transition Navigation Hook

**Files:**
- Create: `src/hooks/use-view-transition.ts`
- Modify: `src/components/bottom-nav.tsx`

**Context:** The bottom nav has 4 tabs in order: Home(0), Discover(1), Library(2), Settings(3). Navigation between them should animate — going to a higher-index tab slides content left (forward), lower-index slides right (back). The hook wraps `useNavigate` from React Router. Uses `flushSync` from `react-dom` to make the React state update synchronous inside `document.startViewTransition()`. Graceful fallback: if `document.startViewTransition` is undefined, navigate instantly.

The `<main>` element in `mobile-layout.tsx` (line 34) needs `view-transition-name: page` to scope the transition to the content area only (header and bottom nav stay put).

- [ ] **Step 1: Create use-view-transition.ts**

Create `src/hooks/use-view-transition.ts`:

```ts
import { useNavigate, useLocation } from "react-router-dom";
import { useCallback } from "react";
import { flushSync } from "react-dom";

const TAB_ORDER: Record<string, number> = {
  "/home": 0,
  "/discover": 1,
  "/library": 2,
  "/settings": 3,
};

function getTabIndex(path: string): number | null {
  for (const [prefix, index] of Object.entries(TAB_ORDER)) {
    if (path === prefix || path.startsWith(prefix + "/")) return index;
  }
  return null;
}

export function useViewTransitionNavigate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(
    (to: string, direction?: "forward" | "back") => {
      if (!document.startViewTransition) {
        navigate(to);
        return;
      }

      // Auto-detect direction from tab positions if not specified
      if (!direction) {
        const fromIdx = getTabIndex(pathname);
        const toIdx = getTabIndex(to);
        if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
          direction = toIdx > fromIdx ? "forward" : "back";
        } else {
          // Default to forward for non-tab navigation (e.g., into podcast detail)
          direction = "forward";
        }
      }

      document.documentElement.dataset.direction = direction;

      document.startViewTransition(() => {
        flushSync(() => {
          navigate(to);
        });
      });
    },
    [navigate, pathname]
  );
}
```

- [ ] **Step 2: Add view-transition-name to the main content area**

In `src/layouts/mobile-layout.tsx`, line 34, change the `<main>` element to add an inline style for the view transition name. The `style` prop scopes the transition to just the content area.

Old:
```tsx
      <main
        className={`flex-1 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? "pb-36" : "pb-20"}`}
      >
```

New:
```tsx
      <main
        className={`flex-1 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? "pb-36" : "pb-20"}`}
        style={{ viewTransitionName: "page" }}
      >
```

- [ ] **Step 3: Update bottom-nav.tsx to use view transition navigation**

Replace the entire `src/components/bottom-nav.tsx`:

```tsx
import { useLocation } from "react-router-dom";
import { Home, Search, Library, Settings } from "lucide-react";
import { useViewTransitionNavigate } from "../hooks/use-view-transition";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const navigateWithTransition = useViewTransitionNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <button
              key={to}
              onClick={() => navigateWithTransition(to)}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-xs transition-colors active:scale-[0.98] transition-transform duration-75 ${
                active ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
```

Note: This also adds the haptic press state (`active:scale-[0.98]`) to bottom nav buttons — combining Task 2 and part of Task 7.

- [ ] **Step 4: Add TypeScript declaration for View Transitions API**

The View Transitions API types may not be in the default TypeScript lib. If typecheck fails with `Property 'startViewTransition' does not exist on type 'Document'`, add a declaration. Create or modify `src/vite-env.d.ts` to include:

```ts
interface Document {
  startViewTransition?(callback: () => void | Promise<void>): ViewTransition;
}

interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}
```

Check if `src/vite-env.d.ts` already exists first — if so, append the interfaces. If not, create it with the Vite client reference plus the interfaces.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`

Open in browser. Tap between Home, Discover, Library, Settings tabs:
- Going right (e.g., Home → Discover) should slide content left
- Going left (e.g., Library → Home) should slide content right
- Header and bottom nav should stay fixed during transitions
- On browsers without View Transitions API, navigation should work normally (instant swap)

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-view-transition.ts src/components/bottom-nav.tsx src/layouts/mobile-layout.tsx src/vite-env.d.ts
git commit -m "feat: add CSS view transitions for tab navigation"
```

---

## Chunk 2: Pull-to-Refresh

### Task 3: Create Pull-to-Refresh Hook

**Files:**
- Create: `src/hooks/use-pull-to-refresh.ts`

**Context:** The hook tracks touch events on a scrollable container. When the container is scrolled to the top (scrollTop ≤ 0) and the user pulls down, it shows a visual indicator and fires a refresh callback when the threshold (60px) is met. Returns JSX for the indicator and a ref to attach to the container. Must be disabled when the player sheet is open (spec requirement — player sheet's vertical drag takes priority).

The scroll container is the `<main>` element in `mobile-layout.tsx`, but each page needs its own refresh callback. So the hook attaches to the page's root `<div>` and watches the parent scroll container.

- [ ] **Step 1: Create use-pull-to-refresh.ts**

Create `src/hooks/use-pull-to-refresh.ts`:

```tsx
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";

const THRESHOLD = 60;

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

interface PullToRefreshResult {
  indicator: ReactNode;
  bind: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: PullToRefreshOptions): PullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      // Only start pull tracking if the scroll container is at the top.
      // Walk up to find the scrollable parent (<main> element).
      const scrollParent = (e.currentTarget as HTMLElement).closest("main");
      if (scrollParent && scrollParent.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    },
    [disabled, refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing || startYRef.current === 0) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY > 10) {
        pullingRef.current = true;
        // Dampen the pull distance (50% ratio)
        setPullDistance(Math.min(deltaY * 0.5, THRESHOLD * 2));
      } else if (!pullingRef.current) {
        // User is scrolling down — reset
        startYRef.current = 0;
      }
    },
    [disabled, refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) {
      startYRef.current = 0;
      return;
    }
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD); // Hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    startYRef.current = 0;
    pullingRef.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setPullDistance(0);
      pullingRef.current = false;
    };
  }, []);

  const indicator: ReactNode =
    pullDistance > 0 || refreshing ? (
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: refreshing ? THRESHOLD : pullDistance }}
      >
        <div
          className={`w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full ${
            refreshing ? "animate-spin" : ""
          }`}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${(pullDistance / THRESHOLD) * 360}deg)`,
            opacity: Math.min(pullDistance / THRESHOLD, 1),
          }}
        />
      </div>
    ) : null;

  return {
    indicator,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-pull-to-refresh.ts
git commit -m "feat: add pull-to-refresh hook with touch gesture tracking"
```

---

### Task 4: Integrate Pull-to-Refresh into Pages

**Files:**
- Modify: `src/pages/home.tsx` (add pull-to-refresh using `fetchFeed`)
- Modify: `src/pages/discover.tsx` (add pull-to-refresh using catalog `refetch`)
- Modify: `src/pages/library.tsx` (add pull-to-refresh per tab)

**Context:** Each page wraps its content in a `<div>` with the pull-to-refresh `bind` handlers. The indicator renders above the page content. The `onRefresh` callback uses the page's existing data-fetching function. For discover.tsx the `useFetch` hook returns `refetch`. For library.tsx, sub-components have their own `useFetch` — we lift the refetch up via a callback pattern.

The `disabled` option should be true when the audio player is active (player sheet may be open). Use `useAudio().currentItem` — if a player sheet drag is in progress, the touch events will be captured by the sheet first, so the primary concern is pull-to-refresh not interfering when the mini-player is showing and user accidentally pulls down.

Actually, re-reading the spec: "Pull-to-refresh is disabled when the player sheet is open." The player sheet `open` state lives in `MiniPlayer` (local state), not in AudioContext. Since we can't easily access that state, a simpler approach: pull-to-refresh checks if the scroll container is at the top — the player sheet overlays everything, so touch events won't reach the page content when the sheet is open. This is handled inherently.

- [ ] **Step 1: Integrate pull-to-refresh into home.tsx**

In `src/pages/home.tsx`:

Add after the existing imports (line 8):
```tsx
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
```

Inside the `Home` component, after the `fetchFeed` definition (line 24), add:
```tsx
  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: fetchFeed,
  });
```

Wrap the return JSX. Change the final return (lines 69-78) from:
```tsx
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
      <div className="space-y-2">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} onPlay={handlePlay} />
        ))}
      </div>
    </div>
  );
```

To:
```tsx
  return (
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-4">Your Feed</h1>
      <div className="space-y-2">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} onPlay={handlePlay} />
        ))}
      </div>
    </div>
  );
```

- [ ] **Step 2: Integrate pull-to-refresh into discover.tsx**

In `src/pages/discover.tsx`:

Add import after line 9:
```tsx
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
```

The catalog data uses `useFetch` which returns `refetch`. Change line 44:
```tsx
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = useFetch<{
```

Inside the `Discover` component, after the `useFetch` call (after line 46), add:
```tsx
  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: async () => { await refetchCatalog(); },
  });
```

Wrap the outer div. Change line 149 from:
```tsx
    <div className="space-y-4">
```

To:
```tsx
    <div className="space-y-4" {...pullBind}>
      {pullIndicator}
```

- [ ] **Step 3: Integrate pull-to-refresh into library.tsx**

In `src/pages/library.tsx`:

This is trickier because the sub-components (`FavoritesGrid`, `SubscriptionsGrid`) each have their own `useFetch`. We need to expose a refetch callback from the currently active tab.

Add import after line 8:
```tsx
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";
```

Add a `refetchRef` pattern to `LibraryPage`. Change the `LibraryPage` component (starting line 151):

```tsx
export function LibraryPage() {
  const [tab, setTab] = useState<"favorites" | "subscriptions" | "history">("favorites");
  const refetchRef = useRef<(() => void) | null>(null);

  const { indicator: pullIndicator, bind: pullBind } = usePullToRefresh({
    onRefresh: async () => { refetchRef.current?.(); },
  });
```

Also add `useRef` to the import on line 1:
```tsx
import { useState, lazy, Suspense, useRef } from "react";
```

Update `SubscriptionsGrid` and `FavoritesGrid` to accept an `onRefetchRef` prop. Change their signatures:

For `SubscriptionsGrid` (line 31):
```tsx
function SubscriptionsGrid({ onRefetchRef }: { onRefetchRef?: React.MutableRefObject<(() => void) | null> }) {
  const { data, loading, refetch } = useFetch<{ subscriptions: SubscribedPodcast[] }>("/podcasts/subscriptions");
```

Add after the `useFetch` line:
```tsx
  useEffect(() => {
    if (onRefetchRef) onRefetchRef.current = refetch;
  }, [onRefetchRef, refetch]);
```

Add `useEffect` to the import on line 1 (it's not currently imported). The full import line becomes:
```tsx
import { useState, lazy, Suspense, useRef, useEffect } from "react";
```

For `FavoritesGrid` (line 85):
```tsx
function FavoritesGrid({ onRefetchRef }: { onRefetchRef?: React.MutableRefObject<(() => void) | null> }) {
  const apiFetch = useApiFetch();
  const { data, loading, refetch } = useFetch<{ data: FavoritePodcast[] }>("/podcasts/favorites");
```

Add after the `useFetch` line:
```tsx
  useEffect(() => {
    if (onRefetchRef) onRefetchRef.current = refetch;
  }, [onRefetchRef, refetch]);
```

Update the tab content rendering (line 179):
```tsx
      {tab === "favorites" && <FavoritesGrid onRefetchRef={refetchRef} />}
      {tab === "subscriptions" && <SubscriptionsGrid onRefetchRef={refetchRef} />}
```

Wrap the outer div:
```tsx
    <div {...pullBind}>
      {pullIndicator}
      <h1 className="text-xl font-bold mb-4">Library</h1>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`

On mobile viewport (or Chrome DevTools touch simulation):
1. Home page: scroll to top, pull down — spinner appears, feed reloads
2. Discover page: pull down — catalog refreshes
3. Library page: pull down on any tab — that tab's data reloads
4. Pulling less than threshold snaps back without triggering refresh

- [ ] **Step 6: Commit**

```bash
git add src/pages/home.tsx src/pages/discover.tsx src/pages/library.tsx
git commit -m "feat: integrate pull-to-refresh on Home, Discover, and Library pages"
```

---

## Chunk 3: Swipeable Feed Cards

### Task 5: Create SwipeableFeedItem Component

**Files:**
- Create: `src/components/swipeable-feed-item.tsx`

**Context:** This component wraps `FeedItemCard` with horizontal swipe detection. The swipe reveals action zones behind the card:
- **Short swipe left (~30% of card width):** Blue zone with "Listened" toggle. Releases and snaps back.
- **Long swipe left (~60%+ of card width):** Red zone with "Remove" action. Item animates out, toast with undo appears (5s), API call fires after timeout unless undone.
- **No right-swipe:** Card stays put on right swipe.
- **Tap vs swipe disambiguation:** Horizontal movement >10px enters swipe mode and suppresses tap. ≤10px treated as tap (plays briefing via existing `FeedItemCard` click handler).

The component needs callbacks for `onToggleListened` and `onRemove`, plus the feed item data.

- [ ] **Step 1: Create swipeable-feed-item.tsx**

Create `src/components/swipeable-feed-item.tsx`:

```tsx
import { useRef, useState, useCallback } from "react";
import { Check, CheckCheck, Trash2 } from "lucide-react";
import { FeedItemCard } from "./feed-item";
import type { FeedItem } from "../types/feed";

const SWIPE_THRESHOLD = 10; // px to distinguish swipe from tap
const LISTENED_THRESHOLD = 0.3; // 30% of card width
const REMOVE_THRESHOLD = 0.6; // 60% of card width

interface SwipeableFeedItemProps {
  item: FeedItem;
  onPlay?: (id: string) => void;
  onToggleListened: (id: string, listened: boolean) => void;
  onRemove: (id: string) => void;
}

export function SwipeableFeedItem({
  item,
  onPlay,
  onToggleListened,
  onRemove,
}: SwipeableFeedItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [removing, setRemoving] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    swipingRef.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    // If vertical movement is greater, let the scroll happen
    if (!swipingRef.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      startXRef.current = 0;
      return;
    }

    // Only swipe left (negative deltaX)
    if (deltaX > 0) {
      setOffset(0);
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      swipingRef.current = true;
      // Prevent vertical scroll while swiping
      e.preventDefault();
      setOffset(deltaX);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!swipingRef.current || !containerRef.current) {
      setOffset(0);
      startXRef.current = 0;
      return;
    }

    const cardWidth = containerRef.current.offsetWidth;
    const swipeRatio = Math.abs(offset) / cardWidth;

    if (swipeRatio >= REMOVE_THRESHOLD) {
      // Long swipe — remove
      setRemoving(true);
      onRemove(item.id);
    } else if (swipeRatio >= LISTENED_THRESHOLD) {
      // Short swipe — toggle listened
      onToggleListened(item.id, !item.listened);
    }

    setOffset(0);
    startXRef.current = 0;
    swipingRef.current = false;
  }, [offset, item.id, item.listened, onToggleListened, onRemove]);

  if (removing) {
    return (
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: 0, opacity: 0, marginBottom: 0 }}
      />
    );
  }

  const cardWidth = containerRef.current?.offsetWidth ?? 300;
  const swipeRatio = Math.abs(offset) / cardWidth;
  const isRemoveZone = swipeRatio >= REMOVE_THRESHOLD;
  const isListenedZone = swipeRatio >= LISTENED_THRESHOLD;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Action zones (behind card) */}
      {offset < 0 && (
        <div className="absolute inset-0 flex items-center justify-end">
          <div
            className={`h-full flex items-center justify-center px-6 transition-colors ${
              isRemoveZone
                ? "bg-red-500/30 text-red-400"
                : isListenedZone
                  ? "bg-blue-500/30 text-blue-400"
                  : "bg-zinc-800 text-zinc-500"
            }`}
            style={{ width: Math.abs(offset) }}
          >
            {isRemoveZone ? (
              <Trash2 className="w-5 h-5" />
            ) : isListenedZone ? (
              item.listened ? (
                <Check className="w-5 h-5" />
              ) : (
                <CheckCheck className="w-5 h-5" />
              )
            ) : null}
          </div>
        </div>
      )}

      {/* Card — transforms on swipe */}
      <div
        className="relative transition-transform duration-75"
        style={{
          transform: offset < 0 ? `translateX(${offset}px)` : undefined,
          // Suppress pointer events during swipe to prevent tap
          pointerEvents: offset !== 0 ? "none" : undefined,
        }}
      >
        <FeedItemCard item={item} onPlay={onPlay} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/swipeable-feed-item.tsx
git commit -m "feat: add SwipeableFeedItem with listened toggle and remove actions"
```

---

### Task 6: Integrate Swipeable Cards into Home Page

**Files:**
- Modify: `src/pages/home.tsx`

**Context:** Replace `FeedItemCard` with `SwipeableFeedItem` in the home page feed list. Wire up `onToggleListened` (PATCH `/feed/{id}/listened`) and `onRemove` (DELETE `/feed/{id}` + toast with undo). The undo pattern: on remove, immediately hide the item from state, show a toast with "Undo" button for 5 seconds. If not undone, fire the DELETE. If undone, restore the item.

- [ ] **Step 1: Update imports in home.tsx**

In `src/pages/home.tsx`:

Add import (after line 6):
```tsx
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
```

Keep the `FeedItemCard` import — it's still used by `SwipeableFeedItem` internally, but actually `SwipeableFeedItem` imports it directly. Check: `home.tsx` line 5 imports `FeedItemCard` — this is no longer used directly in home.tsx. Remove it:

Change line 5 from:
```tsx
import { FeedItemCard } from "../components/feed-item";
```
to:
```tsx
import { SwipeableFeedItem } from "../components/swipeable-feed-item";
```

- [ ] **Step 2: Add swipe action handlers**

After the `handlePlay` function (line 52), add:

```tsx
  function handleToggleListened(feedItemId: string, listened: boolean) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === feedItemId ? { ...i, listened } : i))
    );
    apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === feedItemId ? { ...i, listened: !listened } : i))
      );
      toast.error("Failed to update");
    });
  }

  function handleRemove(feedItemId: string) {
    const removedItem = items.find((i) => i.id === feedItemId);
    if (!removedItem) return;

    // Optimistic removal
    setItems((prev) => prev.filter((i) => i.id !== feedItemId));

    const timeoutId = setTimeout(() => {
      apiFetch(`/feed/${feedItemId}`, { method: "DELETE" }).catch(() => {
        // Restore on failure
        setItems((prev) => [...prev, removedItem].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
        toast.error("Failed to remove item");
      });
    }, 5000);

    toast("Item removed", {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timeoutId);
          setItems((prev) => [...prev, removedItem].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ));
        },
      },
      duration: 5000,
    });
  }
```

- [ ] **Step 3: Replace FeedItemCard with SwipeableFeedItem in the render**

Change the feed list rendering (inside the final return) from:
```tsx
          <FeedItemCard key={item.id} item={item} onPlay={handlePlay} />
```

To:
```tsx
          <SwipeableFeedItem
            key={item.id}
            item={item}
            onPlay={handlePlay}
            onToggleListened={handleToggleListened}
            onRemove={handleRemove}
          />
```

- [ ] **Step 4: Verify the DELETE endpoint exists**

Check that `DELETE /api/feed/:id` is a valid endpoint. If it doesn't exist, the remove action will fail gracefully (item restores, error toast). The remove functionality is additive — if the endpoint doesn't exist yet, the swipe gesture still works visually and the undo toast fires. The actual deletion can be wired later.

Run: `grep -r "delete.*feed" worker/routes/feed.ts` to check.

If the endpoint doesn't exist, that's OK — the optimistic removal + undo still provides a good UX. Just note it for later.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`

On mobile viewport with touch simulation:
1. Swipe a feed card left ~30% — blue zone appears with check icon, releases and snaps back, item toggles listened state
2. Swipe a feed card left ~60% — red zone appears with trash icon, item animates out, toast appears with "Undo"
3. Tap "Undo" on the toast — item reappears in its original position
4. Quick tap on a ready briefing — plays audio (tap not intercepted by swipe)
5. Vertical scroll works normally (swipe doesn't interfere)

- [ ] **Step 7: Commit**

```bash
git add src/pages/home.tsx
git commit -m "feat: integrate swipeable feed cards with listened toggle and remove actions"
```

---

## Chunk 4: Polish and Verification

### Task 7: Add Haptic Press States

**Files:**
- Modify: `src/components/feed-item.tsx` (add active:scale to the button wrapper)
- Modify: `src/components/podcast-card.tsx` (add active:scale to the Link wrapper)
- Modify: `src/pages/library.tsx` (add active:scale to grid item Links)
- Modify: `src/components/player-sheet.tsx` (add active:scale to control buttons)

**Context:** Add `active:scale-[0.98] transition-transform duration-75` to tappable elements. This creates a subtle press-in effect that makes taps feel responsive on mobile. Bottom nav already has this from Task 2. Applied to: feed cards, discover cards, library grid items, player controls.

- [ ] **Step 1: Add haptic press to feed-item.tsx**

In `src/components/feed-item.tsx`, the playable card is wrapped in a `<button>` (the `if (isPlayable)` block). Change the button className:

Old:
```tsx
        className="w-full text-left"
```

New:
```tsx
        className="w-full text-left active:scale-[0.98] transition-transform duration-75"
```

- [ ] **Step 2: Add haptic press to podcast-card.tsx**

In `src/components/podcast-card.tsx`, the card is wrapped in a `<Link>`. Change the Link's inner div className:

Old:
```tsx
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
```

New:
```tsx
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:scale-[0.98] transition-transform duration-75">
```

- [ ] **Step 3: Add haptic press to library grid items**

In `src/pages/library.tsx`, both `SubscriptionsGrid` and `FavoritesGrid` render `<Link>` elements for each podcast. Add press state to the Link className in both grids.

`SubscriptionsGrid` — change the `<Link>` element (around line 51):

Old:
```tsx
          className="flex flex-col items-center gap-2"
```

New:
```tsx
          className="flex flex-col items-center gap-2 active:scale-[0.98] transition-transform duration-75"
```

`FavoritesGrid` — change the `<Link>` element (around line 118):

Old:
```tsx
            className="flex flex-col items-center gap-2"
```

New:
```tsx
            className="flex flex-col items-center gap-2 active:scale-[0.98] transition-transform duration-75"
```

- [ ] **Step 4: Add haptic press to player control buttons**

In `src/components/player-sheet.tsx`, the content controls section has buttons for playback rate, skip back, play/pause, skip forward, and playback rate. Add press state to each interactive button.

For the main play/pause button (around line 172):

Old:
```tsx
                className="w-16 h-16 flex items-center justify-center bg-white text-zinc-950 rounded-full"
```

New:
```tsx
                className="w-16 h-16 flex items-center justify-center bg-white text-zinc-950 rounded-full active:scale-[0.95] transition-transform duration-75"
```

For skip back (around line 162):

Old:
```tsx
                className="relative p-2 text-zinc-300"
```

New:
```tsx
                className="relative p-2 text-zinc-300 active:scale-[0.90] transition-transform duration-75"
```

For skip forward (same pattern as skip back — find the other skip button and apply the same change).

For the playback rate button (around line 152):

Old:
```tsx
                className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full min-w-[3rem]"
```

New:
```tsx
                className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full min-w-[3rem] active:scale-[0.95] transition-transform duration-75"
```

Note: Use `scale-[0.95]` for the large play/pause button and rate button, `scale-[0.90]` for the skip buttons — larger elements need subtler scaling, smaller elements need more visible feedback.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/feed-item.tsx src/components/podcast-card.tsx src/pages/library.tsx src/components/player-sheet.tsx
git commit -m "feat: add haptic press states to feed cards, podcast cards, library grid, and player controls"
```

---

### Task 8: Add Scroll Snap to Horizontal Lists

**Files:**
- Modify: `src/pages/discover.tsx` (add scroll-snap classes to trending section and category pills)

**Context:** The discover page has two horizontal scroll lists: category pills (line 283) and trending podcasts (line 303). Both already use `overflow-x-auto` and `scrollbar-hide`. Adding `snap-x-mandatory` to containers and `snap-start` to items gives native carousel feel. The CSS utility classes were defined in Task 1 (`src/index.css`).

- [ ] **Step 1: Add scroll-snap to category pills**

In `src/pages/discover.tsx`, line 283, change the category pills container:

Old:
```tsx
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide mt-4">
```

New:
```tsx
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide mt-4 snap-x-mandatory">
```

Add `snap-start` to each pill button. Line 288:

Old:
```tsx
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
```

New:
```tsx
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors snap-start ${
```

- [ ] **Step 2: Add scroll-snap to trending section**

Line 303, change the trending container:

Old:
```tsx
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
```

New:
```tsx
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x-mandatory">
```

Add `snap-start` to each trending item. Line 308:

Old:
```tsx
                    className="flex-shrink-0 w-28"
```

New:
```tsx
                    className="flex-shrink-0 w-28 snap-start"
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`

On Discover page, swipe the trending carousel and category pills:
- Items should snap to alignment points
- Scrolling feels crisp with momentum and snap

- [ ] **Step 4: Commit**

```bash
git add src/pages/discover.tsx
git commit -m "feat: add scroll snap to discover trending carousel and category pills"
```

---

### Task 9: Update Skeletons to Match Phase 1 Layouts

**Files:**
- Modify: `src/components/skeletons/feed-skeleton.tsx` (remove dot column, match new card layout)
- Modify: `src/components/skeletons/discover-skeleton.tsx` (remove subscribe button, add chevron placeholder)

**Context:** The Phase 1 redesign changed the feed card layout (removed dot column, added blue left border) and the discover card (removed subscribe button, added chevron). The skeleton placeholders should match these new shapes so loading → loaded isn't jarring.

Note on skeleton audit: Settings page (`src/pages/settings.tsx`) already uses inline `<Skeleton>` components for its loading state. History page (`src/pages/history.tsx`) also uses inline `<Skeleton>` components. `LibrarySkeleton` (`src/components/skeletons/library-skeleton.tsx`) is correct as-is — it already matches the grid layout. No changes needed for those three.

- [ ] **Step 1: Update feed-skeleton.tsx**

Replace the content of `src/components/skeletons/feed-skeleton.tsx`:

```tsx
import { Skeleton } from "../ui/skeleton";

export function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
        >
          <Skeleton className="w-12 h-12 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

Changes from old skeleton:
- Removed the `w-2 h-2 rounded-full` dot column
- Removed the `h-5 w-14 rounded-full` status badge on the right
- Text lines now match podcast name (h-3 w-1/3), episode title (h-4 w-3/4), duration (h-3 w-1/2)

- [ ] **Step 2: Update discover-skeleton.tsx**

Replace the content of `src/components/skeletons/discover-skeleton.tsx`:

```tsx
import { Skeleton } from "../ui/skeleton";

export function DiscoverSkeleton() {
  return (
    <div className="space-y-2 mt-4">
      <Skeleton className="h-6 w-32" />
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
        >
          <Skeleton className="w-14 h-14 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="w-4 h-4 rounded self-center" />
        </div>
      ))}
    </div>
  );
}
```

Changes from old skeleton:
- Replaced `h-8 w-20 rounded` (subscribe button) with `w-4 h-4 rounded` (chevron icon)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/skeletons/feed-skeleton.tsx src/components/skeletons/discover-skeleton.tsx
git commit -m "fix: update feed and discover skeletons to match Phase 1 card layouts"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 2: Run all frontend tests**

Run: `npx vitest run src/`
Expected: All tests pass

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (no regressions in worker tests)

- [ ] **Step 4: Visual smoke test**

Open dev server on mobile viewport, test these flows:
1. Tap between Home / Discover / Library / Settings — view transitions animate
2. Home: pull down at top — spinner appears, feed reloads
3. Home: swipe feed card left ~30% — blue zone, listened toggles
4. Home: swipe feed card left ~60% — red zone, item removes, undo toast appears
5. Home: tap undo — item restores
6. Home: tap a ready briefing — plays audio (swipe doesn't interfere)
7. Discover: pull down — catalog refreshes
8. Discover: swipe trending carousel — snaps to items
9. Discover: swipe category pills — snaps to pills
10. Library: pull down — current tab data refreshes
11. Tap any podcast card — press-in animation visible
12. Tap any feed card play — press-in animation visible
13. On browser without View Transitions API — navigation still works (instant swap)

- [ ] **Step 5: Commit any fixes from smoke testing**

If any issues found during smoke test, fix and commit with descriptive message.
