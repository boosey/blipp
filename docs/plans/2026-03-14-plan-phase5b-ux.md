# Phase 5B: Frontend UX Improvements — Implementation Plan

**Date:** 2026-03-14
**Branch:** `feat/ux-improvements` (from `main`)
**Depends on:** Phases 1-4 complete; Phase 5A (audio assembly) is independent and can run in parallel
**Estimated effort:** 7-9 days

---

## Current State Summary

The frontend is a functional but skeletal React 19 SPA. Key structural facts:

- **Layout:** `MobileLayout` renders a header, `<Outlet />`, and `BottomNav`. No persistent state survives across route changes.
- **Audio:** `BriefingPlayer` at `/play/:feedItemId` owns its own `<audio>` element and all playback state. Navigating away kills audio.
- **Data fetching:** Mixed patterns — `home.tsx` and `settings.tsx` use manual `useState`/`useEffect`/`useCallback`; `discover.tsx` and `library.tsx` use the `useFetch<T>()` hook. No toast feedback on any API call.
- **Loading states:** Every page renders `<p className="text-zinc-400">Loading...</p>`. No skeletons.
- **Empty states:** Plain text ("No briefings yet.") with no icons, no illustrations, no CTAs.
- **Landing page:** Title, tagline, two buttons. No product explanation.
- **Components:** 5 user-facing components (`bottom-nav`, `feed-item`, `podcast-card`, `status-badge`, `admin-guard`) plus 24 shadcn/ui primitives. `Skeleton` primitive exists but is unused.
- **Icons:** `lucide-react` is installed (used in `bottom-nav.tsx`). Player uses text characters for play/pause.
- **No contexts/providers beyond Clerk:** No audio context, no toast context, no onboarding state.

---

## Dependency Installation

Before any task begins:

```bash
npm install sonner --legacy-peer-deps
```

`sonner` (~4KB) is the only new runtime dependency. All other functionality uses existing libraries (lucide-react, radix/shadcn, React context).

Do NOT install `framer-motion` for this phase. CSS transitions and the existing `tw-animate-css` are sufficient for P0/P1. Animation upgrades can be deferred to P2.

---

## Task 1: Persistent Mini-Player with AudioContext (P0)

**Priority:** P0 — Launch blocker
**Effort:** 2 days
**Why first:** This is the most architecturally significant change. It restructures how audio state lives in the app. Tasks 7 (playback controls) and 9 (listening history) depend on it.

### Problem

`BriefingPlayer` at `/play/:feedItemId` creates and owns an `<audio>` element. All playback state (`isPlaying`, `currentTime`, `duration`, `playbackRate`) is local component state. Navigating to any other page destroys the component and stops audio. This is the single biggest usability failure for an audio product.

### New Files

#### `src/contexts/audio-context.tsx`

Central audio state management via React Context.

```
AudioProvider
  state:
    currentItem: FeedItem | null        // Currently loaded feed item
    isPlaying: boolean
    currentTime: number
    duration: number
    playbackRate: number                 // 1 | 1.25 | 1.5 | 2
    isLoading: boolean                   // True while audio is buffering
    error: string | null

  actions:
    play(item: FeedItem): void           // Load + play a feed item
    pause(): void
    resume(): void
    seek(time: number): void
    setRate(rate: number): void
    stop(): void                         // Unload audio, hide mini-player

  internal:
    audioRef: React.RefObject<HTMLAudioElement>
    Renders a hidden <audio> element with event handlers
```

**Implementation details:**

- The `<audio>` element renders inside the provider (hidden, not visible). It lives for the lifetime of the provider (which wraps the entire MobileLayout), so it persists across route changes.
- `play(item)` sets `currentItem`, updates `audioRef.current.src` to `item.briefing.clip.audioUrl`, and calls `audioRef.current.play()`. Also fires a PATCH to `/feed/${item.id}/listened` (fire-and-forget).
- `onTimeUpdate` callback updates `currentTime` via state.
- `onLoadedMetadata` callback sets `duration`.
- `onEnded` callback sets `isPlaying = false` but does NOT clear `currentItem` (mini-player stays visible showing "played" state).
- `onError` callback sets `error` to a user-friendly message.
- Export `useAudio()` hook that calls `useContext(AudioContext)` and throws if used outside provider.

**Media Session API integration** (for lock-screen controls):

```typescript
// Inside play() action:
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.episode.title,
    artist: item.podcast.title,
    artwork: item.podcast.imageUrl
      ? [{ src: item.podcast.imageUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [],
  });
  navigator.mediaSession.setActionHandler('play', resume);
  navigator.mediaSession.setActionHandler('pause', pause);
  navigator.mediaSession.setActionHandler('seekbackward', () => seek(Math.max(0, currentTime - 15)));
  navigator.mediaSession.setActionHandler('seekforward', () => seek(Math.min(duration, currentTime + 30)));
}
```

#### `src/components/mini-player.tsx`

A 56px bar that appears above the `BottomNav` whenever `currentItem` is not null.

```
Props: none (consumes AudioContext)

Layout (56px height, full width):
  ┌─────────────────────────────────────────────┐
  │ [2px progress bar across full width]         │
  │ [40px artwork] [Title / Podcast] [Play/Pause]│
  └─────────────────────────────────────────────┘

Structure:
  <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+49px)] left-0 right-0 ...">
    {/* Progress line — thin 2px bar at top */}
    <div className="absolute top-0 left-0 h-0.5 bg-white transition-all"
         style={{ width: `${(currentTime / duration) * 100}%` }} />

    <div className="flex items-center gap-3 px-4 h-14 bg-zinc-900 border-t border-zinc-800">
      {/* Artwork */}
      <img src={currentItem.podcast.imageUrl} className="w-10 h-10 rounded" />

      {/* Text — clickable, expands to PlayerSheet */}
      <button onClick={expandPlayer} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">{currentItem.episode.title}</p>
        <p className="text-xs text-zinc-500 truncate">{currentItem.podcast.title}</p>
      </button>

      {/* Play/Pause icon button */}
      <button onClick={isPlaying ? pause : resume}>
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
      </button>
    </div>
  </div>
```

**Interaction:**
- Tapping the artwork/text area opens the full `PlayerSheet`.
- Tapping play/pause toggles playback without opening the sheet.
- Swipe-down on the sheet (from PlayerSheet) collapses back to mini-player.
- The mini-player slides up when `currentItem` transitions from null to non-null (CSS transition: `translate-y-full` to `translate-y-0`).
- When `currentItem` is null (nothing loaded / stop called), the mini-player is not rendered.

#### `src/components/player-sheet.tsx`

Full-screen expanded player view. Uses the existing shadcn `Sheet` component (from `src/components/ui/sheet.tsx`) configured with `side="bottom"`.

```
Props:
  open: boolean
  onOpenChange: (open: boolean) => void

Layout (full-screen sheet):
  ┌──────────────────────────┐
  │ [Drag handle bar]        │
  │                          │
  │    [Large artwork]       │
  │    320px max, rounded-2xl│
  │                          │
  │ Episode Title            │
  │ Podcast Name             │
  │ "5m briefing"            │
  │                          │
  │ ──── seek bar ────       │
  │ 1:23          3:42       │
  │                          │
  │  [0.75x]  [<<15] [▶] [30>>]  │
  │                          │
  └──────────────────────────┘

Uses SheetContent with side="bottom" and custom height class "h-[95vh]".
```

**State:** Managed by parent (`MobileLayout` or `MiniPlayer`). The sheet reads all audio state from `useAudio()`.

**Controls in sheet** (detailed in Task 7):
- Skip back 15s button (lucide `SkipBack`)
- Large circular play/pause button (lucide `Play`/`Pause`)
- Skip forward 30s button (lucide `SkipForward`)
- Playback rate cycle button
- Custom styled seek bar (replace native `<input type="range">` with a styled div-based scrubber)

### Existing Files to Modify

#### `src/layouts/mobile-layout.tsx`

Wrap the entire layout in `<AudioProvider>`. Add `<MiniPlayer />` between `<main>` and `<BottomNav>`. Adjust `main` padding-bottom to account for mini-player height when audio is active.

```tsx
import { AudioProvider, useAudio } from "../contexts/audio-context";
import { MiniPlayer } from "../components/mini-player";

function MobileLayoutInner() {
  const { currentItem } = useAudio();
  const hasMiniPlayer = currentItem !== null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-lg font-bold">Blipp</span>
        <UserButton />
      </header>
      <main className={`flex-1 overflow-y-auto px-4 py-4 ${hasMiniPlayer ? 'pb-36' : 'pb-20'}`}>
        <Outlet />
      </main>
      {hasMiniPlayer && <MiniPlayer />}
      <BottomNav />
    </div>
  );
}

export function MobileLayout() {
  return (
    <AudioProvider>
      <MobileLayoutInner />
    </AudioProvider>
  );
}
```

Note: `MobileLayoutInner` is needed because `useAudio()` must be called inside `AudioProvider`. The existing `MobileLayout` becomes the provider wrapper.

#### `src/components/feed-item.tsx`

Change the play action from navigating to `/play/:id` to calling `useAudio().play(item)`.

- Remove the `<Link to={/play/${item.id}}>` wrapper.
- Make the entire card a `<button>` that calls `audio.play(item)` when the item is playable.
- Keep the `onPlay` callback for the listened PATCH (or let AudioContext handle it).
- For non-ready items, the card remains non-interactive (no button wrapper).

#### `src/pages/briefing-player.tsx`

Convert from standalone player to a thin redirect/wrapper:

- If accessed directly via URL (`/play/:feedItemId`), fetch the feed item, call `audio.play(item)`, and redirect to `/home`. This handles deep links and browser back-button scenarios.
- All actual player UI now lives in `PlayerSheet`.

#### `src/components/bottom-nav.tsx`

Adjust positioning. Currently `fixed bottom-0`. When mini-player is visible, the bottom nav needs to stay at the bottom (it already is), but the mini-player sits above it. No direct change needed since mini-player uses `bottom-[calc(env(safe-area-inset-bottom)+49px)]` to position above the nav. However, verify the z-index stacking: mini-player should be `z-40`, bottom-nav should be `z-50` (or both `z-40` with mini-player rendered first in DOM).

### Acceptance Criteria

- [ ] Audio continues playing when navigating between Home, Discover, Library, and Settings tabs.
- [ ] Mini-player appears when a feed item is tapped and the item has a ready briefing.
- [ ] Mini-player shows podcast artwork, episode title, podcast name, and play/pause button.
- [ ] Progress bar on mini-player updates in real-time during playback.
- [ ] Tapping mini-player text/artwork opens the full PlayerSheet.
- [ ] PlayerSheet shows full artwork, title, seek bar, and controls.
- [ ] Play/pause from mini-player works without opening the sheet.
- [ ] Lock-screen media controls work (Media Session API).
- [ ] When audio ends, mini-player stays visible showing the completed item.
- [ ] Calling `stop()` hides the mini-player.
- [ ] Deep link to `/play/:feedItemId` loads the audio and redirects to `/home`.

---

## Task 2: New User Onboarding Flow (P0)

**Priority:** P0 — Launch blocker
**Effort:** 1 day
**Why:** New users land on an empty feed with zero guidance. They must discover the Discover tab on their own, figure out what "subscribing" means, and understand duration tiers — all without help.

### New Files

#### `src/pages/onboarding.tsx`

Multi-step onboarding wizard.

```
State:
  step: 1 | 2 | 3 | 4
  selectedPodcasts: Set<string>         // podcast IDs selected in step 2
  durationPreference: 'quick' | 'standard' | 'deep'   // step 3

Step 1 — Welcome:
  "Your podcasts, distilled."
  "Blipp turns hour-long podcast episodes into short audio briefings
   you can listen to in minutes."
  [Get Started] button -> step 2

Step 2 — Pick Podcasts:
  "Choose podcasts you follow"
  Category filter pills (horizontal scroll): All | News | Tech | Business | ...
  Grid of podcast cards (3 columns) from catalog endpoint
  Each card: artwork + title + checkbox overlay
  Minimum 3 selections required (counter: "3 of 3 minimum selected")
  [Continue] button (disabled until 3+ selected) -> step 3

Step 3 — Choose Duration:
  "How long should your briefings be?"
  Three large radio cards (stacked vertically):
    Quick (1-3 min): "Headlines and key points"
    Standard (5-7 min): "Full story summaries"
    Deep (10-15 min): "Detailed analysis"
  [Continue] button -> step 4

Step 4 — Done:
  Animated checkmark icon
  "You're all set!"
  "We're creating your first briefings now. They'll appear in your feed shortly."
  [Go to Feed] button -> navigate('/home')
```

**On step 4 (before showing confirmation):**
- Subscribe to all selected podcasts via `POST /api/podcasts/subscribe` for each, using the mapped duration tier from step 3:
  - `quick` -> `durationTier: 3`
  - `standard` -> `durationTier: 5`
  - `deep` -> `durationTier: 10`
- Fire all subscribe calls in parallel with `Promise.allSettled`.
- Set `localStorage.setItem('blipp:onboarding-complete', 'true')`.
- If some subscriptions fail, still proceed but show a toast (Task 4) noting how many succeeded.

#### `src/hooks/use-onboarding.ts`

```
Returns:
  needsOnboarding: boolean
  isChecking: boolean

Logic:
  1. Check localStorage for 'blipp:onboarding-complete'. If present, return false immediately.
  2. Fetch /api/podcasts/subscriptions. If the user has 1+ subscriptions, set the localStorage flag and return false.
  3. Otherwise return true.
```

### Existing Files to Modify

#### `src/App.tsx`

Add the onboarding route inside the `MobileLayout` route group:

```tsx
<Route path="/onboarding" element={<Onboarding />} />
```

#### `src/layouts/mobile-layout.tsx`

Add onboarding redirect logic. Inside `MobileLayoutInner`, use the `useOnboarding` hook. If `needsOnboarding` is true and the current path is not `/onboarding`, redirect:

```tsx
const { needsOnboarding, isChecking } = useOnboarding();
const location = useLocation();

if (!isChecking && needsOnboarding && location.pathname !== '/onboarding') {
  return <Navigate to="/onboarding" replace />;
}
```

The onboarding page itself should hide `BottomNav` and `MiniPlayer`. Detect via `location.pathname === '/onboarding'` and conditionally render.

### Backend Consideration

No backend changes required. The onboarding page uses the existing catalog endpoint (`GET /api/podcasts/catalog`) for step 2 and the existing subscribe endpoint (`POST /api/podcasts/subscribe`) for step 4.

The catalog endpoint currently returns all podcasts without category filtering. If category data is available in the Podcast model (check `prisma/schema.prisma` for a `category` or `genre` field), use it. If not, implement client-side category mapping based on podcast titles/descriptions, or omit categories from onboarding step 2 and just show a popular/trending grid.

### Acceptance Criteria

- [ ] New user (no subscriptions, no localStorage flag) is redirected to `/onboarding` on first visit to any authenticated route.
- [ ] Step 2 shows podcast grid from the catalog with selectable cards.
- [ ] Cannot proceed past step 2 without selecting at least 3 podcasts.
- [ ] Step 3 duration selection maps to concrete duration tier values.
- [ ] Step 4 subscribes to all selected podcasts in parallel.
- [ ] After completion, user lands on `/home` and is never redirected to onboarding again.
- [ ] Existing users (with subscriptions) never see onboarding.
- [ ] Onboarding page hides the bottom nav and mini-player.

---

## Task 3: Loading Skeletons & Empty States (P0)

**Priority:** P0 — Launch blocker
**Effort:** 0.75 day
**Why:** "Loading..." text makes the app feel broken on every page load. Empty states with no CTAs leave users stranded.

### New Files

#### `src/components/skeletons/feed-skeleton.tsx`

Mimics the layout of 5 `FeedItemCard` components.

```
For each of 5 items:
  <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
    <Skeleton className="w-2 h-2 rounded-full" />           {/* unlistened dot */}
    <Skeleton className="w-12 h-12 rounded flex-shrink-0" /> {/* artwork */}
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/4" />                     {/* title */}
      <Skeleton className="h-3 w-1/2" />                     {/* podcast name */}
      <div className="flex gap-2">
        <Skeleton className="h-4 w-8 rounded" />             {/* tier badge */}
        <Skeleton className="h-4 w-12 rounded" />            {/* source badge */}
      </div>
    </div>
    <Skeleton className="h-5 w-14 rounded-full" />           {/* status badge */}
  </div>
```

#### `src/components/skeletons/discover-skeleton.tsx`

```
<Skeleton className="h-10 w-full rounded-lg" />              {/* search bar */}
<div className="space-y-2 mt-4">
  <Skeleton className="h-6 w-32" />                           {/* section title */}
  {Array(6).fill(null).map(() => (
    <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <Skeleton className="w-14 h-14 rounded flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="h-8 w-20 rounded self-center" />
    </div>
  ))}
</div>
```

#### `src/components/skeletons/library-skeleton.tsx`

```
<Skeleton className="h-6 w-24 mb-4" />                       {/* title */}
<div className="grid grid-cols-3 gap-3">
  {Array(9).fill(null).map(() => (
    <div className="flex flex-col items-center gap-2">
      <Skeleton className="w-full aspect-square rounded-lg" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  ))}
</div>
```

#### `src/components/skeletons/player-skeleton.tsx`

```
<div className="flex flex-col items-center gap-6 px-4 pt-8">
  <Skeleton className="w-48 h-48 rounded-2xl" />             {/* artwork */}
  <div className="text-center space-y-2 w-full">
    <Skeleton className="h-5 w-48 mx-auto" />                {/* title */}
    <Skeleton className="h-4 w-32 mx-auto" />                {/* podcast */}
    <Skeleton className="h-3 w-20 mx-auto" />                {/* duration */}
  </div>
  <Skeleton className="h-1 w-full max-w-sm rounded" />       {/* seek bar */}
  <div className="flex items-center gap-6">
    <Skeleton className="w-8 h-6 rounded" />                 {/* rate */}
    <Skeleton className="w-14 h-14 rounded-full" />          {/* play button */}
    <Skeleton className="w-8 h-6 rounded" />                 {/* spacer */}
  </div>
</div>
```

#### `src/components/empty-state.tsx`

Reusable empty state component.

```
Props:
  icon: LucideIcon                // e.g., Headphones, Search, BookOpen
  title: string
  description: string
  action?: {
    label: string
    to: string                    // react-router Link destination
  }

Layout:
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
      <Icon className="w-8 h-8 text-zinc-500" />
    </div>
    <h2 className="text-lg font-semibold text-zinc-300">{title}</h2>
    <p className="text-sm text-zinc-500 text-center max-w-xs">{description}</p>
    {action && (
      <Link to={action.to}
        className="mt-2 px-6 py-2.5 bg-white text-zinc-950 text-sm font-medium rounded-lg">
        {action.label}
      </Link>
    )}
  </div>
```

### Existing Files to Modify

#### `src/pages/home.tsx`

- Replace `<p className="text-zinc-400">Loading...</p>` with `<FeedSkeleton />`.
- Replace the empty state block with:
  ```tsx
  <EmptyState
    icon={Headphones}
    title="No briefings yet"
    description="Subscribe to your favorite podcasts and we'll create bite-sized briefings for you."
    action={{ label: "Discover Podcasts", to: "/discover" }}
  />
  ```

#### `src/pages/discover.tsx`

- Replace the `"Loading..."` text at the bottom of the list with `<DiscoverSkeleton />` (shown when `catalogData` is null and no error).
- Replace the "No results found." empty state with:
  ```tsx
  <EmptyState
    icon={Search}
    title="No podcasts found"
    description="Try a different search term or browse our catalog."
  />
  ```

#### `src/pages/library.tsx`

- Replace `<p className="text-zinc-400">Loading...</p>` with `<LibrarySkeleton />`.
- Replace the empty state with:
  ```tsx
  <EmptyState
    icon={Library}
    title="Your library is empty"
    description="Find podcasts you love and subscribe for automatic briefings."
    action={{ label: "Browse Podcasts", to: "/discover" }}
  />
  ```

#### `src/pages/briefing-player.tsx`

- Replace loading text with `<PlayerSkeleton />` (if the player page is retained as a deep-link handler).

#### `src/pages/settings.tsx`

- Replace `{plan?.name ?? "Loading..."}` with a `<Skeleton className="h-5 w-24 inline-block" />` when plan is null.

#### `src/pages/podcast-detail.tsx`

- Replace loading text with a skeleton that matches the podcast header + episode list layout.

### Acceptance Criteria

- [ ] Every page that fetches data shows a skeleton matching its loaded layout during loading.
- [ ] Zero layout shift between skeleton and loaded content.
- [ ] All empty states show an icon, title, description, and (where applicable) a CTA button that navigates to a useful destination.
- [ ] No "Loading..." plain text remains anywhere in the user-facing app.

---

## Task 4: Toast Notification System (P0)

**Priority:** P0 — Launch blocker
**Effort:** 0.5 day
**Why:** Every API call either silently succeeds or silently fails. Users get zero feedback on their actions.

### New Files

#### `src/components/toaster.tsx`

Thin wrapper around sonner's `Toaster` component, pre-configured for the app theme.

```tsx
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        className: "bg-zinc-900 text-zinc-50 border-zinc-800",
        duration: 3000,
      }}
      richColors
    />
  );
}
```

### Existing Files to Modify

#### `src/main.tsx`

Add the Toaster component:

```tsx
import { Toaster } from "./components/toaster";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppClerkProvider>
        <App />
        <Toaster />
      </AppClerkProvider>
    </BrowserRouter>
  </StrictMode>
);
```

#### `src/pages/home.tsx`

```diff
- } catch {
-   // Silently handle
- }
+ } catch (e) {
+   toast.error(e instanceof Error ? e.message : "Failed to load feed");
+ }
```

Also for the `handlePlay` listened PATCH:

```diff
- apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {});
+ apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {
+   // Non-critical — don't toast for background operations
+ });
```

#### `src/pages/settings.tsx`

Replace all three `catch(() => {})` blocks:

- Line 28 (load user): `catch(() => toast.error("Failed to load account info"))`
- Line 35 (load plans): `catch(() => toast.error("Failed to load plans"))`
- Line 48 (upgrade checkout): `catch(() => { toast.error("Failed to start checkout"); setActionLoading(null); })`
- Line 62 (manage portal): `catch(() => { toast.error("Failed to open billing portal"); setActionLoading(null); })`

#### `src/pages/briefing-player.tsx`

```diff
- .catch(() => navigate("/home"))
+ .catch((e) => {
+   toast.error(e instanceof Error ? e.message : "Failed to load briefing");
+   navigate("/home");
+ })
```

And for the listened PATCH:

```diff
- apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {});
+ apiFetch(`/feed/${feedItemId}/listened`, { method: "PATCH" }).catch(() => {});
  // Keep silent — non-critical background operation
```

#### `src/pages/podcast-detail.tsx`

Add success toasts for subscribe/unsubscribe/briefing actions:

```diff
  // After successful subscribe:
+ toast.success(`Subscribed to ${podcast.title}`);

  // After successful unsubscribe:
+ toast.success(`Unsubscribed from ${podcast.title}`);

  // After successful briefing request:
+ toast("Briefing requested — we'll notify you when it's ready", { duration: 4000 });
```

Add error handling for the catch blocks (currently empty):

```diff
- } catch {
-   // Handle error
- }
+ } catch (e) {
+   toast.error(e instanceof Error ? e.message : "Failed to load podcast");
+ }
```

#### `src/components/podcast-card.tsx`

Add success/error toasts for subscribe and unsubscribe:

```diff
  // After successful subscribe:
+ toast.success(`Subscribed to ${title}`);

  // After successful unsubscribe:
+ toast.success(`Unsubscribed from ${title}`);
```

Wrap the catch paths:

```diff
  } finally {
    setLoading(false);
  }
+ // Add .catch() to show error:
```

Note: The current code uses try/finally without catch. Add catch blocks that call `toast.error()`.

#### `src/pages/pricing.tsx`

```diff
- .catch(() => {})
+ .catch(() => toast.error("Failed to load pricing plans"))
```

```diff
- } catch {
-   setCheckoutLoading(null);
- }
+ } catch (e) {
+   toast.error(e instanceof Error ? e.message : "Failed to start checkout");
+   setCheckoutLoading(null);
+ }
```

### Toast Usage Guidelines

Every toast call should follow this pattern:

| Action | Toast Type | Example Message |
|--------|-----------|-----------------|
| Subscribe | `toast.success()` | "Subscribed to The Daily" |
| Unsubscribe | `toast.success()` | "Unsubscribed from The Daily" |
| Briefing requested | `toast()` (info) | "Briefing requested. Usually ready in 2-5 minutes." |
| API error | `toast.error()` | "Could not subscribe. Please try again." |
| Checkout redirect | `toast()` (info) | "Redirecting to checkout..." |
| Background failures | No toast | Listened PATCH, analytics pings — non-critical |

### Acceptance Criteria

- [ ] `sonner` is installed and `<Toaster />` renders in `main.tsx`.
- [ ] Subscribe action shows a success toast with the podcast name.
- [ ] Unsubscribe action shows a success toast.
- [ ] Briefing request shows an info toast.
- [ ] All API errors show an error toast with the error message.
- [ ] Toasts appear at the top-center of the screen with dark theme styling.
- [ ] Toasts auto-dismiss after 3 seconds (errors after 4 seconds).
- [ ] Non-critical background operations (listened PATCH) remain silent.

---

## Task 5: Landing Page Redesign (P1)

**Priority:** P1 — Launch quality
**Effort:** 1 day
**Why:** The landing page is the first thing potential users see. Currently it's a title and two buttons with zero product explanation, no social proof, and no value proposition.

### Existing File to Modify

#### `src/pages/landing.tsx`

Complete rewrite of the page content. Keep the same file, same export name.

**Sections (top to bottom):**

**1. Hero Section**

```
Layout:
  <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center
                       bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
    <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
      Your podcasts,<br />distilled to fit your time.
    </h1>
    <p className="mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl">
      Blipp turns hour-long podcast episodes into short audio briefings
      you can listen to in minutes. AI-powered, on your schedule.
    </p>
    <div className="flex gap-4 mt-8">
      <SignedOut>
        <SignInButton><button className="primary-cta">Start Free</button></SignInButton>
      </SignedOut>
      <SignedIn>
        <Link to="/home" className="primary-cta">Go to Feed</Link>
      </SignedIn>
      <Link to="/pricing" className="secondary-cta">See Pricing</Link>
    </div>
  </section>
```

**2. How It Works**

Three-step horizontal layout (stacked on mobile):

```
  1. Subscribe          2. We Distill           3. You Listen
  [Podcast icon]       [Sparkles icon]          [Headphones icon]
  Pick your favorite   AI summarizes each       Listen to bite-sized
  podcasts from our    new episode into a       briefings in 1-15
  catalog.             short audio briefing.    minutes.
```

Each step: icon in a rounded circle (48px, `bg-zinc-800`), title (`text-lg font-semibold`), description (`text-sm text-zinc-400`).

**3. Features Grid**

2x2 grid of feature cards:

| Feature | Icon | Description |
|---------|------|-------------|
| AI-powered summaries | `Sparkles` | Advanced AI distills key points from each episode |
| Choose your length | `Clock` | From 1-minute headlines to 15-minute deep dives |
| Auto-delivered daily | `CalendarCheck` | New briefings appear in your feed automatically |
| Works with any podcast | `Podcast` | Subscribe to any podcast in our catalog of thousands |

Each card: `bg-zinc-900 border border-zinc-800 rounded-xl p-6`. Icon + title + description.

**4. Pricing Preview**

Reuse the existing pricing plan cards inline. Import the `buildFeatures` function and the plan-fetching logic, or render a simplified version with a "View all plans" link.

Alternatively, show three simplified cards (Free / Pro / Power) with just the price and top 3 features each. Link to `/pricing` for full details.

**5. Footer**

```
  <footer className="border-t border-zinc-800 py-8 px-6 text-center text-sm text-zinc-500">
    <div className="flex justify-center gap-6">
      <Link to="/pricing">Pricing</Link>
      <a href="#">Privacy</a>
      <a href="#">Terms</a>
    </div>
    <p className="mt-4">&copy; 2026 Blipp</p>
  </footer>
```

### Bug Fix

The current landing page links signed-in users to `/dashboard` (line 22):

```tsx
<Link to="/dashboard" ...>Go to Dashboard</Link>
```

This should be `/home`. A redirect exists (`/dashboard` -> `/home`) but the extra hop is unnecessary.

### Acceptance Criteria

- [ ] Landing page has 5 sections: Hero, How It Works, Features, Pricing Preview, Footer.
- [ ] Hero section has a clear headline, subheadline explaining the product, and CTA buttons.
- [ ] How It Works section shows the 3-step flow with icons.
- [ ] Features grid shows 4 feature cards with icons and descriptions.
- [ ] Pricing preview shows plan cards or links to `/pricing`.
- [ ] Footer has navigation links and copyright.
- [ ] Signed-in CTA links to `/home` (not `/dashboard`).
- [ ] Page uses the existing dark theme (zinc-950 background) with subtle gradient on hero.
- [ ] Responsive: stacks vertically on mobile, uses grid on desktop.

---

## Task 6: Enhanced Discover/Search with Categories (P1)

**Priority:** P1 — Launch quality
**Effort:** 1 day
**Why:** The current Discover page is a search bar and a flat list. There's no browsing, no categories, and no trending section. Users must know exactly what they're looking for.

### Existing File to Modify

#### `src/pages/discover.tsx`

Significant restructure of the page layout.

**New layout:**

```
  [Search bar — full width, debounced 300ms, lucide Search icon]

  {If search is active:}
    [Search results list]

  {If search is not active:}
    [Category pills — horizontal scroll]
    [Trending section — horizontal scroll of cards]
    [Browse All — vertical list with pagination]
```

**Search improvements:**

- Replace the separate Search button with an inline search icon inside the input (lucide `Search`).
- Add debounced search (300ms) using a `useEffect` with `setTimeout`/`clearTimeout`. Fire the search API call automatically as the user types (no Enter or button press required).
- Show a clear button (lucide `X`) inside the input when there's text.
- Show `DiscoverSkeleton` while searching.

**Category pills:**

```
const CATEGORIES = [
  "All", "News", "Technology", "Business", "Comedy",
  "Science", "Sports", "Culture", "Health", "Education", "True Crime"
] as const;

<div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
  {CATEGORIES.map(cat => (
    <button
      key={cat}
      onClick={() => setSelectedCategory(cat)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        selectedCategory === cat
          ? "bg-white text-zinc-950"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
      }`}
    >
      {cat}
    </button>
  ))}
</div>
```

Categories filter the catalog client-side. If the backend Podcast model has category/genre data, use it. Otherwise, this is a placeholder for future backend support — the "All" filter shows everything and the other filters can be disabled or hidden until backend data exists.

**Trending section:**

```
<section>
  <h2 className="text-lg font-semibold mb-3">Trending Now</h2>
  <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
    {trendingPodcasts.slice(0, 10).map(podcast => (
      <Link to={`/discover/${podcast.id}`} className="flex-shrink-0 w-28">
        <img src={podcast.imageUrl} className="w-28 h-28 rounded-lg object-cover" />
        <p className="text-xs font-medium mt-1.5 truncate">{podcast.title}</p>
      </Link>
    ))}
  </div>
</section>
```

Trending is derived from the catalog data (e.g., first 10 podcasts sorted by episode count or subscriber count). If the backend provides a `trendScore` or similar field, use it.

**Podcast card improvements** (modify `src/components/podcast-card.tsx`):

- When `imageUrl` is empty or fails to load, show a colored circle with the first letter of the podcast title instead of a blank gray box:
  ```tsx
  <div className="w-14 h-14 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
    <span className="text-xl font-bold text-zinc-400">
      {title.charAt(0).toUpperCase()}
    </span>
  </div>
  ```

### Acceptance Criteria

- [ ] Search is debounced (300ms) and fires automatically as user types.
- [ ] No separate Search button — search icon is inline in the input.
- [ ] Clear button (X) appears inside input when there's text.
- [ ] Category pills render in a horizontal scrollable row.
- [ ] Selecting a category filters the displayed podcast list.
- [ ] Trending section shows a horizontal-scrollable row of podcast artwork cards.
- [ ] Podcasts without artwork show a letter avatar instead of a blank gray box.
- [ ] Skeleton loader shows while catalog data is loading.
- [ ] Empty search results show the `EmptyState` component.

---

## Task 7: Playback Controls — Skip, Speed, Seek (P1)

**Priority:** P1 — Launch quality
**Effort:** 0.75 day
**Depends on:** Task 1 (AudioContext + PlayerSheet)
**Why:** The player uses text characters ("||" and a triangle) for controls, has no skip buttons, and uses a native `<input type="range">` for seeking. These are standard features of every podcast app.

### File to Modify

#### `src/components/player-sheet.tsx` (created in Task 1)

The PlayerSheet contains all the full-player controls. This task adds the final polish.

**Control Row Layout:**

```
  [Speed]  [Skip -15s]  [Play/Pause]  [Skip +30s]  [Sleep Timer]

  Speed button:
    <button onClick={cycleRate}>
      <span className="text-xs font-medium bg-zinc-800 px-2.5 py-1 rounded-full">
        {playbackRate}x
      </span>
    </button>
    Rate cycles: 1 -> 1.25 -> 1.5 -> 2 -> 0.75 -> 1

  Skip back 15s:
    <button onClick={() => seek(Math.max(0, currentTime - 15))}>
      <SkipBack className="w-6 h-6" />
      <span className="text-[10px] absolute">15</span>
    </button>

  Play/Pause (large, 64px):
    <button onClick={isPlaying ? pause : resume}
      className="w-16 h-16 flex items-center justify-center bg-white text-zinc-950 rounded-full">
      {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
    </button>
    Note: Play icon needs a slight `ml-0.5` offset because play triangles are visually left-heavy.

  Skip forward 30s:
    <button onClick={() => seek(Math.min(duration, currentTime + 30))}>
      <SkipForward className="w-6 h-6" />
      <span className="text-[10px] absolute">30</span>
    </button>
```

**Custom Seek Bar:**

Replace the native `<input type="range">` with a styled div-based scrubber:

```tsx
function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  function handleInteraction(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  }

  // Touch + mouse event handlers for drag seeking

  return (
    <div className="w-full max-w-sm">
      <div
        ref={trackRef}
        className="relative w-full h-6 flex items-center cursor-pointer"
        onMouseDown={...}
        onTouchStart={...}
      >
        {/* Track background */}
        <div className="absolute w-full h-0.5 bg-zinc-700 rounded-full" />
        {/* Played progress */}
        <div className="absolute h-0.5 bg-white rounded-full" style={{ width: `${progress}%` }} />
        {/* Thumb */}
        <div
          className={`absolute w-3 h-3 bg-white rounded-full -translate-x-1/2 transition-opacity ${
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
```

**Playback Rate Cycle:**

```typescript
const RATES = [1, 1.25, 1.5, 2, 0.75];
function cycleRate() {
  const current = playbackRate;
  const idx = RATES.indexOf(current);
  const next = RATES[(idx + 1) % RATES.length];
  setRate(next);
}
```

**Queue/Auto-play:** Deferred to P2/P3. For now, when a briefing ends, the player stays showing the completed state. No auto-advance to next item.

### Acceptance Criteria

- [ ] Play/Pause uses lucide `Play` and `Pause` icons (not text characters).
- [ ] Skip back 15 seconds button is visible and functional.
- [ ] Skip forward 30 seconds button is visible and functional.
- [ ] Playback rate cycles through 1x, 1.25x, 1.5x, 2x, 0.75x.
- [ ] Seek bar is a custom styled component with a thin track and thumb that appears on hover/touch.
- [ ] Seek bar supports both tap-to-seek and drag-to-seek on touch and mouse.
- [ ] Time labels show current position and total duration in `m:ss` format.
- [ ] Large artwork (up to 320px wide) with rounded corners and subtle shadow.

---

## Task 8: PWA Setup (P2)

**Priority:** P2 — Delight
**Effort:** 0.75 day
**Why:** A podcast app should feel native. PWA gives us add-to-homescreen, standalone window, and the foundation for offline and push notifications later.

### New Files

#### `public/manifest.json`

```json
{
  "name": "Blipp",
  "short_name": "Blipp",
  "description": "Your podcasts, distilled to fit your time.",
  "start_url": "/home",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "categories": ["entertainment", "news"]
}
```

#### `public/sw.js`

Minimal service worker for PWA qualification. **No offline caching in this phase** — that is P3 work.

```javascript
// Minimal service worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through — no caching yet
  // Offline caching will be added in a future phase
});
```

### Existing Files to Modify

#### `index.html`

Add manifest link and apple-specific meta tags:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

#### `src/main.tsx`

Register the service worker:

```typescript
// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — non-critical
    });
  });
}
```

### Push Notifications (Stub Only)

This task does NOT implement push notifications. It creates the PWA foundation that push notifications require. Push notification implementation involves:

1. Backend: Web Push subscription storage (new DB table), push sending via `web-push` library
2. Frontend: Push permission prompt, subscription management in Settings

This is deferred to a separate task in Phase 6 or post-launch.

### Acceptance Criteria

- [ ] `manifest.json` is served at `/manifest.json` with correct content.
- [ ] Service worker registers successfully on page load.
- [ ] Chrome DevTools > Application > Manifest shows valid PWA manifest.
- [ ] "Add to Home Screen" / "Install App" prompt is available in Chrome/Safari.
- [ ] App opens in standalone mode when launched from home screen.
- [ ] Theme color matches app background (#09090b).
- [ ] No offline caching is implemented (deferred to P3).

---

## Task 9: Listening History & Stats (P2)

**Priority:** P2 — Delight
**Effort:** 1 day
**Why:** Users want to know what they've listened to and feel a sense of progress. This adds a lightweight history view and summary stats.

### New Files

#### `src/pages/history.tsx`

Full listening history page.

```
Data source: GET /api/feed?listened=true&limit=100 (or a new endpoint if needed)

Layout:
  <h1>Listening History</h1>

  {/* Stats summary card */}
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
    <div className="grid grid-cols-3 gap-4 text-center">
      <div>
        <p className="text-2xl font-bold">{totalListened}</p>
        <p className="text-xs text-zinc-500">Briefings</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{totalMinutes}m</p>
        <p className="text-xs text-zinc-500">Listened</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{savedMinutes}m</p>
        <p className="text-xs text-zinc-500">Time Saved</p>
      </div>
    </div>
  </div>

  {/* History list grouped by date */}
  {dateGroups.map(group => (
    <div>
      <h2 className="text-sm font-semibold text-zinc-500 mb-2">{group.label}</h2>
      {/* "Today", "Yesterday", "This Week", "March 10", etc. */}
      {group.items.map(item => (
        <HistoryItem item={item} />
      ))}
    </div>
  ))}
```

**HistoryItem component** (inline in history.tsx or extracted):

```
<div className="flex items-center gap-3 py-2">
  <img src={item.podcast.imageUrl} className="w-10 h-10 rounded" />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate">{item.episode.title}</p>
    <p className="text-xs text-zinc-500">{item.podcast.title} &middot; {item.durationTier}m</p>
  </div>
  <button onClick={() => audio.play(item)} className="p-2">
    <Play className="w-4 h-4 text-zinc-400" />
  </button>
</div>
```

**Date grouping helper:**

```typescript
function groupByDate(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups = new Map<string, FeedItem[]>();

  for (const item of items) {
    const date = new Date(item.listenedAt!);
    let label: string;
    if (isSameDay(date, today)) label = "Today";
    else if (isSameDay(date, yesterday)) label = "Yesterday";
    else if (date > weekAgo) label = "This Week";
    else label = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}
```

**Stats calculation:**

```typescript
const totalListened = items.length;
const totalMinutes = items.reduce((sum, item) => {
  const seconds = item.briefing?.clip?.actualSeconds ?? item.durationTier * 60;
  return sum + seconds;
}, 0) / 60;
const savedMinutes = items.reduce((sum, item) => {
  const epSeconds = item.episode.durationSeconds ?? 0;
  const briefSeconds = item.briefing?.clip?.actualSeconds ?? item.durationTier * 60;
  return sum + Math.max(0, epSeconds - briefSeconds);
}, 0) / 60;
```

### Backend Consideration

The existing feed endpoint (`GET /api/feed`) may need to support a `listened=true` query parameter to filter for listened items only. Check the existing feed route implementation. If it doesn't support this filter, it needs to be added:

```typescript
// In worker/routes/feed.ts
const listenedFilter = c.req.query("listened");
if (listenedFilter === "true") {
  where.listened = true;
}
```

If a new endpoint is cleaner, create `GET /api/feed/history` that returns listened feed items sorted by `listenedAt DESC`.

### Existing Files to Modify

#### `src/App.tsx`

Add the history route:

```tsx
<Route path="/history" element={<History />} />
```

#### `src/components/bottom-nav.tsx`

The history page needs to be accessible. Two options:

**Option A (preferred):** Add a "History" link as a sub-navigation within the Library page (tab row inside Library: "Subscriptions" | "History").

**Option B:** Replace the Library tab with a 5th tab. This is not recommended as it clutters the nav.

**Option C:** Add a history icon button in the Home page header.

Go with **Option A**. Modify `src/pages/library.tsx` to add a tab bar at the top:

```tsx
const [tab, setTab] = useState<'subscriptions' | 'history'>('subscriptions');

return (
  <div>
    <div className="flex gap-4 mb-4">
      <button onClick={() => setTab('subscriptions')}
        className={tab === 'subscriptions' ? 'font-bold border-b-2 border-white' : 'text-zinc-500'}>
        Subscriptions
      </button>
      <button onClick={() => setTab('history')}
        className={tab === 'history' ? 'font-bold border-b-2 border-white' : 'text-zinc-500'}>
        History
      </button>
    </div>
    {tab === 'subscriptions' ? <SubscriptionsList /> : <HistoryList />}
  </div>
);
```

Or, keep the history as a separate page at `/history` and add a link in the Library page header: "View History ->".

### Acceptance Criteria

- [ ] Listening history shows all listened feed items grouped by date.
- [ ] Stats card shows total briefings listened, total minutes listened, and time saved.
- [ ] Each history item shows artwork, episode title, podcast name, and a replay button.
- [ ] Replay button plays the briefing via AudioContext (mini-player appears).
- [ ] History is accessible from the Library page or a clear navigation path.
- [ ] Date groups show "Today", "Yesterday", "This Week", and specific dates for older items.
- [ ] Empty history shows an EmptyState with appropriate messaging.

---

## File Summary

### New Files (13)

| File | Task | Purpose |
|------|------|---------|
| `src/contexts/audio-context.tsx` | 1 | Audio playback state management + hidden `<audio>` element |
| `src/components/mini-player.tsx` | 1 | Persistent 56px bottom bar for playback controls |
| `src/components/player-sheet.tsx` | 1, 7 | Full-screen expanded player (bottom Sheet) |
| `src/pages/onboarding.tsx` | 2 | 4-step first-time user onboarding wizard |
| `src/hooks/use-onboarding.ts` | 2 | Hook to check if user needs onboarding |
| `src/components/skeletons/feed-skeleton.tsx` | 3 | Feed page loading skeleton |
| `src/components/skeletons/discover-skeleton.tsx` | 3 | Discover page loading skeleton |
| `src/components/skeletons/library-skeleton.tsx` | 3 | Library page loading skeleton |
| `src/components/skeletons/player-skeleton.tsx` | 3 | Player loading skeleton |
| `src/components/empty-state.tsx` | 3 | Reusable empty state with icon + CTA |
| `src/components/toaster.tsx` | 4 | Sonner toast container with dark theme config |
| `public/manifest.json` | 8 | PWA manifest for installability |
| `public/sw.js` | 8 | Minimal service worker (no caching) |

### New Pages (2)

| File | Task | Route |
|------|------|-------|
| `src/pages/onboarding.tsx` | 2 | `/onboarding` |
| `src/pages/history.tsx` | 9 | `/history` |

### Existing Files to Modify (14)

| File | Tasks | Changes |
|------|-------|---------|
| `src/layouts/mobile-layout.tsx` | 1, 2 | Wrap in AudioProvider, add MiniPlayer, add onboarding redirect |
| `src/components/feed-item.tsx` | 1 | Replace Link navigation with AudioContext play() call |
| `src/components/bottom-nav.tsx` | 1 | Verify z-index stacking with mini-player |
| `src/pages/briefing-player.tsx` | 1, 4 | Convert to deep-link handler that redirects to /home after loading audio |
| `src/pages/home.tsx` | 3, 4 | Add FeedSkeleton, EmptyState, error toasts |
| `src/pages/discover.tsx` | 3, 6 | Add DiscoverSkeleton, debounced search, category pills, trending section |
| `src/pages/library.tsx` | 3, 9 | Add LibrarySkeleton, EmptyState, history tab |
| `src/pages/settings.tsx` | 3, 4 | Add skeleton for plan loading, error toasts |
| `src/pages/podcast-detail.tsx` | 3, 4 | Add skeleton, success/error toasts |
| `src/pages/landing.tsx` | 5 | Complete redesign with hero, how-it-works, features, pricing preview, footer |
| `src/pages/pricing.tsx` | 4 | Error toasts for API failures |
| `src/components/podcast-card.tsx` | 4, 6 | Toast notifications, letter avatar fallback for missing artwork |
| `src/main.tsx` | 4, 8 | Add Toaster component, register service worker |
| `src/App.tsx` | 2, 9 | Add /onboarding and /history routes |
| `index.html` | 8 | Add manifest link and apple-mobile-web-app meta tags |

---

## Implementation Order

Tasks must be executed in this order due to dependencies:

```
Task 4: Toast system (0.5d)        ← Used by everything after
   │
   ├── Task 1: AudioContext + Mini-player (2d) ← Foundation for Tasks 7, 9
   │      │
   │      └── Task 7: Playback controls (0.75d)
   │
   ├── Task 3: Skeletons + Empty states (0.75d) ← No deps except toast
   │
   ├── Task 2: Onboarding flow (1d) ← Uses toast for errors
   │
   ├── Task 5: Landing page (1d)    ← Independent of other tasks
   │
   ├── Task 6: Discover polish (1d) ← Independent of other tasks
   │
   └── After Task 1:
          ├── Task 9: Listening history (1d)  ← Uses AudioContext
          └── Task 8: PWA setup (0.75d)       ← Independent but low priority
```

**Recommended execution plan:**

| Day | Tasks | Notes |
|-----|-------|-------|
| 1 | Task 4 (toast) + Task 3 (skeletons) | Quick wins, used everywhere |
| 2-3 | Task 1 (AudioContext + mini-player) | Most complex, architectural |
| 4 | Task 7 (playback controls) + Task 2 (onboarding) | Task 7 depends on Task 1 |
| 5 | Task 5 (landing page) + Task 6 (discover) | Independent, can parallelize |
| 6 | Task 8 (PWA) + Task 9 (history) | P2 items, lower priority |

**Total estimated effort: 8-9 days** (accounting for integration testing between tasks).

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AudioContext re-renders cause performance issues | High | Memoize context value. Split state into separate contexts if needed (playback state vs. actions). |
| Mini-player z-index conflicts with Sheet/Dialog overlays | Medium | Test with podcast-card's subscribe dialog, player sheet, and any other modals. |
| Onboarding catalog load is slow (Neon cold start) | Medium | Show skeleton immediately. Consider pre-fetching catalog on landing page. |
| Service worker interferes with Vite dev server HMR | Medium | Only register SW in production builds (`import.meta.env.PROD`). |
| Category filtering requires backend support | Low | Start with client-side filtering. Categories can be "All" only until backend adds genre data. |
| `sonner` CSS conflicts with Tailwind v4 dark theme | Low | Use `toastOptions.className` to override styles explicitly. Test in dark mode. |
| Font loading is broken (Google Fonts URL in @font-face src) | Low | Out of scope for this plan, but should be fixed separately. The `@font-face` in `index.css` line 143 uses a CSS URL as a font source, which doesn't work. Replace with a `<link>` import in `index.html` or download the `.woff2` files. |
