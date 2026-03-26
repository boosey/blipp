# UX/Frontend Review — Blipp

Reviewed: 2026-03-26
Reviewer: ux-reviewer agent
Scope: All files under `src/` (pages, components, layouts, lib, contexts, hooks)

---

## Summary

Blipp's frontend is structurally solid for a mobile-first audio app. The core interaction model — swipe to manage feed, tap to play, sheet for details — is appropriate. Skeleton screens are present for major loading states. The onboarding flow is minimal but functional.

The critical gaps are not in visual polish: they are in **discoverability**, **accessibility**, **subscription guidance**, and **error recovery**. A new user who lands with an empty feed has no visible path forward. Swipe gestures have no discoverable affordance. Keyboard and screen reader support is incomplete in several high-traffic components. These are the P0 and P1 issues.

---

## P0 — Launch Blockers

### P0-1: Empty feed gives no actionable path for new users who skipped onboarding

**File:** `src/pages/Home.tsx:191`

The empty feed EmptyState renders only when `filter === "all"`. If a user skips onboarding (or has no subscriptions yet), they see an icon, a title, and a link to Discover. This is correct, but:

- The CTA (`Discover Podcasts`) goes to `/discover` where subscribing requires two additional taps (select podcast → tap Subscribe → pick duration). This three-step commitment is invisible from the empty state.
- There is no inline explanation of what a "briefing" is at this point — the user may not understand why the feed is empty vs. unavailable.
- The `Suggested Next Blipp` curated row only renders if the user already has recommendation data (`curatedData?.rows?.[0]?.items`). For a brand-new user with no history, this section is silent and invisible.

**Fix:** Add a brief contextual explanation ("Subscribe to shows and we'll create short audio briefings automatically") directly in the empty state body. Consider a secondary CTA card listing 2-3 popular podcasts inline so the user doesn't have to navigate away to make progress.

---

### P0-2: Swipe gestures have no discoverable affordance

**File:** `src/components/swipeable-feed-item.tsx`

The left-swipe-to-delete and right-swipe-to-mark-listened interactions are the primary feed management model, but there is no hint that these gestures exist. The `SwipeableFeedItem` renders a plain card with no visual indicator (no hint text, no swipe-hint animation, no tooltip). Users who never discover swipe will not be able to manage their feed efficiently — they'll accumulate unlistened items with no obvious way to clear them.

A first-session swipe hint (e.g., a one-time animated arrow or micro-copy "Swipe to manage") visible only until the user first swipes would resolve this.

---

### P0-3: Subscribe flow UX is broken for plan-limit users

**File:** `src/pages/podcast-detail.tsx:370`

When `planUsage.subscriptions.remaining <= 0`, the Subscribe button renders as "Upgrade to Subscribe" and navigates to `/settings`. This is a reasonable gate, but:

- The user is in a bottom sheet (PodcastDetailSheet), which gets `close()` called before navigating to `/settings`. The transition is abrupt and context-destroying.
- No message explains *how many* subscriptions the current plan allows, so the user doesn't know if upgrading one plan tier will help or if they need a higher tier.
- The upgrade path dumps the user in Settings, scrolled to top. The upgrade plan section is deep in the Settings page — users may not find it.

**Fix:** Show the UpgradeModal (`showUpgrade(...)`) instead of navigating away. The modal already exists and shows plan cards. Replace the `closeSheet(); navigate("/settings")` pattern here.

---

### P0-4: No loading state or error state for sign-in flow on web (non-native)

**File:** `src/App.tsx:99`

For signed-out users hitting a protected route on web, the code renders:
```tsx
<div className="flex justify-center items-center min-h-screen">
  <SignIn fallbackRedirectUrl="/home" />
</div>
```

Clerk's `<SignIn>` renders its own UI, but if Clerk fails to load (network error, script blocked), the user sees a blank centered div with no error message. There is no fallback for Clerk load failure. The `src/shims/clerk-load-script.ts` exists but it's unclear if it handles the failure case in a user-visible way.

---

### P0-5: Onboarding completion triggers immediate navigation with no transition

**File:** `src/pages/onboarding.tsx:315`

Step 3 (completion screen) renders a "Go to Feed" button that calls `navigate("/home")`. This is a hard navigation. There is no indication that briefings may not be immediately available even after subscribing during onboarding. A new user who subscribes in step 2, taps "Go to Feed," and sees an empty feed will be confused — nothing visually explains the async pipeline (2-5 min to create briefings).

The completion screen copy says "Explore the catalog to subscribe and start getting briefings" which conflicts with having just selected favorites in step 2. The distinction between "favorites" (saved preferences) and "subscriptions" (what triggers auto-briefings) is never explained in the onboarding flow.

---

## P1 — Launch Quality

### P1-1: Accessibility gaps in interactive components

**Swipeable feed items** (`src/components/swipeable-feed-item.tsx`):
- The container div has `onTouchStart/Move/End` but no keyboard alternative for swipe actions. There is no way to mark-as-listened or delete via keyboard.

**FeedItemCard** (`src/components/feed-item.tsx:185`):
- Uses `role="button"` on a `div` with `tabIndex={0}` — acceptable, but the `aria-label` is not set. Screen readers announce "button" with no description of what playing will do.
- The `keyDown` handler only handles `Enter` and `Space` — it does not handle `Space` propagation correctly if a focusable child (thumb button) is inside.

**SeekBar** (`src/components/player-sheet.tsx:417`):
- Has correct `role="slider"` and `aria-value*` attributes but missing `aria-valuetext` (e.g., "1 minute 30 seconds" instead of the raw number). Screen readers announce a raw number that means nothing without unit context.

**PodcastDetailSheet close button** (`src/components/podcast-detail-sheet.tsx:70`):
- `opacity-0 hover:opacity-100 focus:opacity-100 sm:opacity-100` — the close button is invisible on mobile unless hovered or focused. On touch-only devices, there is no hover, and the drag handle is the only dismissal affordance. If the gesture fails (e.g., they started a scroll), there is no visible close button to fall back on.

---

### P1-2: Request-a-podcast flow requires RSS URL knowledge

**File:** `src/pages/discover.tsx:496`

The "Can't find a podcast? Request it" form asks for an RSS feed URL. Most users do not know their podcast's RSS URL. The form placeholder is `https://example.com/feed.xml` which is technically descriptive but not helpful for a non-technical user trying to add a podcast they know by name.

If the catalog is meant to be comprehensive, this dead-end is frustrating. At minimum, the form copy should explain where to find an RSS feed (e.g., "Usually found in the podcast's website or in your current podcast app").

---

### P1-3: Mini player close button is not visible in key scenarios

**File:** `src/components/mini-player.tsx`

The mini player has no close/dismiss button. To stop audio completely, a user must:
1. Tap the mini player to open the full PlayerSheet
2. Pause playback

There is no way to dismiss the mini player UI without pausing. This is a common pattern in major podcast apps but may be unexpected for users who want to stop and not have the persistent bar.

---

### P1-4: Filter pills have no visual badge/count except "New"

**File:** `src/pages/Home.tsx:218`

Only the "New" filter pill shows a count (`New (3)`). Other filters like "Subscriptions" and "On Demand" show no count. A user switching to "Subscriptions" to find content has no signal about whether there are items before tapping. If the filter returns empty, they get a plain "No items match this filter" message at the bottom — no empty state with CTA.

---

### P1-5: Creating items have no ETA or progress context

**File:** `src/components/feed-item.tsx:167`

Items with `PENDING` or `PROCESSING` status get the sweep-glow animation and a "Creating" badge. There is no time estimate, no step indicator, and no explanation of what "Creating" means. The toast on briefing request says "usually ready in 2-5 minutes" but that context is lost once the user navigates to the feed. A user seeing "Creating" with no context may think something is broken.

---

### P1-6: "Blipp" button affordance depends on product knowledge

**File:** `src/pages/podcast-detail.tsx:575`

The primary CTA on each episode is a small button labeled "Blipp." This label is meaningful only after users understand the product vocabulary. First-time visitors (e.g., shared links) will not know what "Blipp" means. A secondary label or tooltip ("Create a short audio summary") would help with conversion.

Additionally, the long-press-to-pick-duration interaction is discoverless. The toast hint ("Tip: long-press Blipp to pick a different duration") appears *after* the user has already tapped, not before.

---

### P1-7: Discover page fires multiple simultaneous data requests on mount

**File:** `src/pages/discover.tsx:87, 145`

On mount, the Discover page fires: curated rows, episode browse (page 1), and podcast browse (page 1) — three separate `fetchCatalogPage`/`fetchEpisodePage` calls triggered by `useEffect` on `fetchCatalogPage`/`fetchEpisodePage` dependency changes. If the category changes, all three reset and re-fire simultaneously. This is a perceived performance issue — on a slow connection, the page will appear heavily skeleton-loaded.

---

### P1-8: Landing page missing pricing link

**File:** `src/pages/landing.tsx`

The landing page has a footer with "About" and "Contact" links, but no "Pricing" link. Pricing is a key pre-signup decision factor. Users who want to evaluate plans must either sign up first or independently navigate to `/pricing`.

---

### P1-9: Cookie consent renders on every authenticated route

**File:** `src/App.tsx:69`

`<CookieConsent />` is rendered inside the root `<Routes>` wrapper, meaning it appears on every route including authenticated app routes. Cookie consent should typically only appear for unauthenticated visitors (i.e., on the landing page and public routes). Authenticated users who have accepted cookies may see this on re-renders if the consent state is not persisted beyond the session.

---

## P2 — Launch Quality / Delight

### P2-1: No queue management in the player

The "Play All" button on the home feed plays all unlistened items, but there is no visible queue. If a user wants to reorder playback or skip to a specific item, there is no interface for it. The PlayerSheet only shows the current item.

### P2-2: Onboarding has no progress indicator

**File:** `src/pages/onboarding.tsx:28`

The 3-step onboarding (Welcome → Pick favorites → Confirmation) has no step counter or progress bar. Users don't know how many steps remain. This is a small friction in an otherwise brief flow, but adding "Step 1 of 2" (skipping the confirmation) sets clearer expectations.

### P2-3: Podcast artwork placeholder is a plain muted div

Multiple components (`src/components/feed-item.tsx:99`, `src/pages/library.tsx:70`, etc.) fall back to a plain `div.bg-muted` when no image URL is present. The onboarding and library use a letter-based fallback which is better. The feed item and mini player do not — they show a blank square. A consistent letter-initial fallback across all contexts would improve visual coherence.

### P2-4: No haptic feedback on swipe actions (native)

For native Capacitor builds, swipe-to-delete and swipe-to-listened could trigger haptic feedback at the threshold point. This is a polish detail but aligns with native podcast app expectations.

### P2-5: Discover page tab switcher (Podcasts/Episodes) could persist tab selection

Navigating away and back to Discover resets the tab to "podcasts". If a user was browsing episodes, they lose their position. This is a minor state-persistence issue.

### P2-6: PlayerSheet artwork is small (120px max-w)

**File:** `src/components/player-sheet.tsx:184`

The full-screen player sheet shows artwork at `max-w-[120px]`. For a 85dvh sheet on a modern phone, this is notably small — most podcast players use the full available width. The small artwork makes the sheet feel like a half-implemented full-player rather than a proper now-playing screen.

---

## P3 — Post-launch

### P3-1: No empty state for "History" tab

**File:** `src/pages/history.tsx` (not deeply reviewed)
If a user has no history, the tab should show an empty state with a CTA to their feed rather than a blank page.

### P3-2: No "What is a Blipp?" contextual help

There is no in-app help or tooltip system. New users relying on context alone may not understand the distinction between subscribing (automatic briefings) vs. on-demand Blipps, or why some feed items show "Creating" for several minutes.

### P3-3: Settings page lacks section anchors

The Settings page is long (Account → Usage → Plans → Appearance → Notifications → Duration → Voice → Data & Privacy → About → Sign Out). On mobile, scrolling to find a specific section requires reading through everything. Section anchoring or a settings index would help.

### P3-4: No "Recently Played" or "Continue Listening" section on Home

The home feed is sorted by creation date. There is no resume-listening affordance for briefings that were paused mid-way. The mini player persists during the session, but after the app is closed, the user has no signal about where they left off.

### P3-5: No share sheet for podcasts, only briefings

The Share button exists on briefings (FeedItemCard, PlayerSheet) but there is no way to share a podcast from the PodcastDetailSheet. This is a growth vector that is missing.

---

## Accessibility Summary

| Area | Status | Issue |
|------|--------|-------|
| Keyboard navigation | Partial | Feed items have keyboard handler but swipe actions are keyboard-inaccessible |
| Screen reader | Partial | `role="button"` on feed items missing descriptive `aria-label`; SeekBar missing `aria-valuetext` |
| Color contrast | Acceptable | `text-muted-foreground` against card background passes at normal text size; `text-[10px]` small labels are borderline |
| Focus management | Partial | Close button on PodcastDetailSheet is invisible on mobile (opacity-0); no visible focus ring on custom buttons |
| Reduced motion | Not implemented | Feed item fade animations, creating-sweep glow, and landing page float/gradient animations are not paused for `prefers-reduced-motion` |

---

## Mobile Responsiveness Summary

The app uses a `max-w-3xl mx-auto` container with responsive grid breakpoints (3→4→5→6 cols for podcast grids). This is adequate. Two concerns:

1. The MobileLayout `pb-36` bottom padding for mini-player assumes a fixed height. On devices with large safe areas (iPhone 15 Pro Max), the combination of mini-player height + safe area may clip content.
2. The landing page uses viewport-relative absolute-positioned orbs that may create horizontal overflow on narrow viewports if transform values drift beyond the viewport edge.

---

## Performance Summary

- Admin pages are all lazy-loaded with `Suspense` — good.
- Core user pages (`Home`, `Discover`, `Library`, `Settings`) are eagerly imported — acceptable given they are the primary routes.
- `lamejs-bundle.js` is eagerly bundled in `src/lib/` — this is an MP3 encoder used for audio recording/processing. If it's not used on every page, it should be lazy-loaded. Its inclusion in the main bundle inflates it.
- Landing page inlines Google Fonts via a `<style>` tag inside the component render, which fires a cross-origin network request on every render of the landing component. This should be a `<link rel="preconnect">` in `index.html` instead.
- The Discover page starts two infinite-scroll observers on mount regardless of which tab is active, loading two data sets simultaneously when only one is visible.

---

## Priority Matrix

| ID | Finding | Priority | Effort |
|----|---------|----------|--------|
| P0-1 | Empty feed — no actionable path for new users | P0 | Low |
| P0-2 | Swipe gestures have no affordance | P0 | Low |
| P0-3 | Subscription limit → wrong upgrade path | P0 | Low |
| P0-4 | No fallback if Clerk fails to load | P0 | Medium |
| P0-5 | Onboarding completes before briefings exist | P0 | Low |
| P1-1 | Accessibility gaps (keyboard, aria) | P1 | Medium |
| P1-2 | RSS URL request form unusable for most users | P1 | Low |
| P1-3 | No way to dismiss mini player | P1 | Low |
| P1-4 | Empty filter states lack CTAs | P1 | Low |
| P1-5 | Creating items have no ETA | P1 | Low |
| P1-6 | "Blipp" button label is cryptic for new users | P1 | Low |
| P1-7 | Discover fires 3 simultaneous fetches on mount | P1 | Medium |
| P1-8 | Landing page missing Pricing link | P1 | Trivial |
| P1-9 | CookieConsent appears on all routes | P1 | Low |
| P2-1 | No queue management | P2 | High |
| P2-2 | Onboarding has no progress indicator | P2 | Trivial |
| P2-3 | Blank artwork fallback in feed/mini player | P2 | Trivial |
| P2-4 | No haptic feedback on swipe (native) | P2 | Low |
| P2-5 | Discover tab selection not persisted | P2 | Low |
| P2-6 | PlayerSheet artwork too small | P2 | Low |
| P3-1 | History empty state | P3 | Low |
| P3-2 | No in-app help / contextual onboarding hints | P3 | Medium |
| P3-3 | Settings has no section anchors | P3 | Low |
| P3-4 | No continue-listening affordance | P3 | Medium |
| P3-5 | No podcast-level share | P3 | Low |
