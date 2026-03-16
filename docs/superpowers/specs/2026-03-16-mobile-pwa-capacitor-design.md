# Mobile Responsive + PWA + Capacitor Design

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Incremental (A) — three shippable phases, each in its own worktree

## Context

Blipp's frontend is mobile-first but has specific layout issues (cramped feed cards, overflowing player sheet) and lacks the native-app feel needed for app store readiness. The goal is to fix responsive issues, layer on native polish, then wrap with Capacitor for iOS/Android distribution.

Key decision: **No Flutter.** The existing React SPA + PWA + Capacitor path minimizes rewrite effort while achieving app store presence. Flutter remains an option only if Capacitor hits a fundamental wall.

## Phase 1: Responsive Fixes

Each fix is independent and can be implemented in parallel.

### 1.1 Feed Card Redesign (Option C — Podcast-App Style)

**Current problem:** Single horizontal flex row crams unlistened dot + artwork + title/podcast/3 metadata pills + status badge on one line. Cramped on mobile.

**New layout:**
```
┌─────────────────────────────────────────────┐
│▎┌────────┐  Lex Fridman Podcast       Ready │
│▎│ artwork│  The Future of AI Dev Tools...   │
│▎└────────┘  3 min · from 2h 22m episode     │
└─────────────────────────────────────────────┘
  (▎ = blue left border if unlistened)
```

**Changes to `src/components/feed-item.tsx`:**
- **Swap text order:** Podcast name moves above episode title (currently reversed). Podcast name is context; episode title is the primary content.
- **Row 1:** Podcast name (12px, zinc-500) + status badge right-aligned
- **Row 2:** Episode title (14px, semibold, white, truncated)
- **Row 3:** Duration as natural text: `"{durationTier} min · from {epDuration} episode"`
- **Unlistened indicator:** 3px blue left border on the card (replaces floating dot column — remove the dot column entirely)
- **Artwork:** 48x48 (`w-12 h-12`), unchanged from current
- **Removed:** Source indicator ("Sub" / "On-demand") — unnecessary noise
- **Removed:** All imports and code related to the source/type metadata pills
- **Status badge:** Only shown for non-ready states (Creating, Error). Ready is the default — no badge needed.

### 1.2 Player Sheet Fix

**Current problem:** `h-[95vh]` with artwork using `flex-1` to fill space. No scroll. On short viewports (Chrome mobile with address bar + bottom nav), controls are unreachable.

**Changes to `src/components/player-sheet.tsx`:**
- Add `overflow-y-auto` to SheetContent
- Reduce artwork max width from 320px to 280px: `max-w-[280px]` and add `max-h-[35vh]` (scales down on short screens)
- Remove `flex-1` from artwork container — use fixed constraints instead
- Add `pb-[env(safe-area-inset-bottom)]` for iOS home indicator clearance
- Layout order unchanged: drag handle → artwork → info → seek bar → controls

### 1.3 Discover Card Simplification

**Current problem:** PodcastCard has subscribe button + tier picker dialog + upgrade modal. The whole card is a Link to podcast detail, but no visual affordance indicates episodes are browsable. Users think their only action is "Subscribe."

**Changes to `src/components/podcast-card.tsx`:**
- Remove subscribe button entirely
- Remove tier picker dialog
- Remove all subscribe-related dependencies: `useState`, `usePlan`, `useUpgradeModal`, `useApiFetch`, `Dialog`/`DialogContent`/etc., `Button`, `DURATION_TIERS`, `Lock`, `toast`
- Remove `isSubscribed`, `onToggle`, `feedUrl` props
- Remaining props: `id`, `title`, `author`, `description`, `imageUrl`
- Add `ChevronRight` icon (16px, zinc-600) right-aligned
- Component becomes a simple navigational card (~30 lines, down from ~190)

**New layout:**
```
┌──────────────────────────────────────────┐
│ ┌────────┐  Podcast Title                │
│ │ artwork│  Author Name                › │
│ └────────┘  Description text...          │
└──────────────────────────────────────────┘
```

Subscribe + favorite actions live exclusively on the podcast detail page (`src/pages/podcast-detail.tsx`), which already has both.

**Impact on Discover page (`src/pages/discover.tsx`):**
- Remove `subscribedIds` tracking and `refetchSubscriptions` — no longer needed
- Remove `isSubscribed` and `onToggle` props from PodcastCard usage
- Simplify component props

### 1.4 Library Tab Reorder

**Current:** Default tab is "subscriptions". Tab order: Subscriptions | Favorites | History.

**Change in `src/pages/library.tsx`:**
- Default state: `useState<"favorites" | "subscriptions" | "history">("favorites")`
- Tab order in UI: Favorites | Subscriptions | History (reorder the `<button>` elements in JSX to match)
- Rationale: new users likely have favorites before subscriptions (lower commitment), reduces friction

## Phase 2: Native Feel

All additive behavior — no layout restructuring. Builds on Phase 1 components.

### 2.1 CSS View Transitions

- Use native `document.startViewTransition()` API
- Custom `useViewTransitionNavigate()` hook that wraps React Router's `useNavigate` — calls `document.startViewTransition()` before navigation
- Track navigation direction (forward/back) to apply correct animation class
- Forward navigation: content slides in from right
- Back navigation: content slides in from left
- Keyframes defined in `src/index.css`
- Graceful fallback: if `document.startViewTransition` is undefined, navigate normally (instant swap)
- No framer-motion dependency

### 2.2 Pull-to-Refresh

- Custom `usePullToRefresh(onRefresh)` hook
- Tracks touchstart/touchmove/touchend on scroll container
- Visual indicator: spinner/arrow appears above content when pulled
- Applied to: Home (feed), Discover, Library
- Triggers existing refetch/reload functions
- Threshold: ~60px pull distance to trigger
- **Gesture conflict rule:** Pull-to-refresh is disabled when the player sheet is open (player sheet's vertical drag takes priority)

### 2.3 Two-Stage Swipe on Feed Cards

- **Short swipe left (~30% of card width):** Blue zone reveals "Listened" toggle action. Releases and snaps back.
- **Long swipe left (~60%+ of card width):** Red zone reveals "Remove" action. On release:
  - Item animates out (height collapses)
  - Toast with "Undo" button appears (5-second window)
  - API call fires after timeout unless undone
  - If undone, item animates back in
- **No right-swipe action** — right swipe applies no transform (card stays put)
- **Tap vs swipe disambiguation:** Horizontal touch movement >10px initiates swipe mode and suppresses the tap/click handler. Movement ≤10px is treated as a tap (plays briefing).
- Implementation: CSS transforms + touch event tracking, no gesture library
- Snap-back if threshold not met
- **Scope:** LTR layouts only for v1. RTL support deferred.

### 2.4 Haptic Press States

- `active:scale-[0.98]` + `transition-transform duration-75` on tappable elements
- Applied to: feed cards, discover cards, library grid items, bottom nav items, player controls
- Subtle but makes taps feel responsive

### 2.5 Skeleton Audit

- Existing skeletons: `FeedSkeleton`, `DiscoverSkeleton`, `LibrarySkeleton`
- Ensure all pages have skeletons: podcast detail (has one), settings, history
- Update skeletons to match new Phase 1 layouts (especially feed card shape)

### 2.6 Scroll Snap on Horizontal Lists

- Discover trending section: `scroll-snap-type: x mandatory` on container, `scroll-snap-align: start` on items
- Category pills: same treatment
- Gives native carousel feel without a library dependency

## Phase 3: PWA + Capacitor

### 3.1 PWA Enhancements

**Install prompt:**
- Custom "Add to Home Screen" banner on home page
- Uses `beforeinstallprompt` event
- Dismissible, shown once per session (localStorage flag)
- Hidden when running inside Capacitor native shell

**Offline briefing caching:**
- Extend existing service worker (`public/sw.js`)
- When a briefing is played, cache the audio blob in a dedicated `briefing-audio` cache
- Cache size limit: ~50 most recent (LRU eviction)
- Previously-listened briefings playable offline

**Offline indicator:**
- Subtle banner at top of screen when `navigator.onLine === false`
- "You're offline. Previously played briefings are still available."
- Auto-dismisses when connectivity returns

### 3.2 Capacitor Setup

**Core packages:**
- `@capacitor/core`
- `@capacitor/cli`
- Platform projects: `@capacitor/ios`, `@capacitor/android`

**Plugins:**
- `@capacitor/push-notifications` — native push (replaces web push in native shell)
- `@capacitor/haptics` — real haptic feedback (replaces CSS scale approximation in Phase 2)
- `@capacitor/status-bar` — control status bar style/color
- `@capacitor/splash-screen` — launch screen
- `capacitor-plugin-safe-area` — proper safe area insets

**Background audio:**
- Capacitor webview supports background audio with `UIBackgroundModes: ["audio"]` in iOS config
- Existing Media Session API integration (lock screen controls) works as-is in Capacitor webview

**Platform detection:**
- `useNativeApp()` hook: checks `Capacitor.isNativePlatform()`
- Used to toggle: web push vs native push, show/hide install prompt, enable real haptics

**Build pipeline:**
```bash
npm run build          # Vite production build
npx cap sync           # Copy web assets + sync native plugins
# Then open in Xcode / Android Studio for native build
```

### 3.3 Not In Scope

- App store submission (screenshots, metadata, review process)
- Deep linking / universal links
- In-app purchases (Stripe web checkout works in Capacitor webview)

## File Impact Summary

### Phase 1 (Modified)
- `src/components/feed-item.tsx` — redesigned layout
- `src/components/player-sheet.tsx` — scroll + constrained artwork
- `src/components/podcast-card.tsx` — simplified (subscribe removed, chevron added)
- `src/pages/discover.tsx` — remove subscription tracking
- `src/pages/library.tsx` — reorder tabs, change default

### Phase 2 (New + Modified)
- `src/hooks/use-view-transition.ts` — new, view transition wrapper
- `src/hooks/use-pull-to-refresh.ts` — new, pull-to-refresh logic
- `src/components/swipeable-feed-item.tsx` — new, wraps feed-item with swipe behavior
- `src/components/feed-item.tsx` — add haptic press states
- `src/components/podcast-card.tsx` — add haptic press states
- `src/pages/home.tsx` — integrate pull-to-refresh + swipeable cards
- `src/pages/discover.tsx` — integrate pull-to-refresh + scroll snap
- `src/pages/library.tsx` — integrate pull-to-refresh
- `src/components/skeletons/` — audit and update to match new layouts
- `src/index.css` — view transition keyframes, scroll-snap utilities

### Phase 3 (New + Modified)
- `capacitor.config.ts` — new, Capacitor configuration
- `ios/` — new, iOS project (generated)
- `android/` — new, Android project (generated)
- `src/hooks/use-native-app.ts` — new, platform detection
- `src/components/install-prompt.tsx` — new, PWA install banner
- `src/components/offline-indicator.tsx` — new, offline banner
- `public/sw.js` — modified, add briefing audio caching
- `src/pages/home.tsx` — integrate install prompt
- `src/pages/settings.tsx` — toggle between web/native push

## Worktree Strategy

Each phase gets its own worktree branched from `main`:
- Phase 1: `feat/mobile-responsive`
- Phase 2: `feat/native-feel`
- Phase 3: `feat/pwa-capacitor`

Phase 2 branches from the merged Phase 1. Phase 3 branches from merged Phase 2.
