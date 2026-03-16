# Phase 1: Mobile Responsive Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cramped feed cards, overflowing player sheet, confusing discover cards, and library tab ordering to create a solid mobile baseline.

**Architecture:** Pure frontend changes to 5 existing files + 2 test files. No new files, no backend changes, no new dependencies. Chunk 1 (Tasks 1-2) and Chunk 2 (Tasks 3-4) can run in parallel. Task 5 runs after both chunks complete.

**Tech Stack:** React 19, Tailwind v4, lucide-react, shadcn/ui Sheet component

**Spec:** `docs/superpowers/specs/2026-03-16-mobile-pwa-capacitor-design.md` — Phase 1

**Worktree:** Branch `feat/mobile-responsive` from `main`

---

## Chunk 1: Feed Card + Player Sheet

### Task 1: Redesign Feed Card Layout

**Files:**
- Modify: `src/components/feed-item.tsx` (full rewrite — 101 lines → ~85 lines)

**Context:** The current `FeedItemCard` crams everything on one horizontal row: unlistened dot column + artwork + episode title + podcast title + 3 metadata pills + status badge. The new layout (Option C) swaps text order (podcast name above episode title), uses natural duration text instead of pills, shows status badge only for non-ready states, and uses a blue left border for unlistened instead of a dot.

**Current file:** `src/components/feed-item.tsx` — imports `FeedItem` type and `useAudio`. Has `statusLabel()` and `statusColor()` helpers. The component wraps the card in a `<button>` when playable.

- [ ] **Step 1: Rewrite feed-item.tsx**

Replace the entire component body. Keep the same exports, props, and `useAudio` integration.

```tsx
import type { FeedItem } from "../types/feed";
import { useAudio } from "../contexts/audio-context";

function statusLabel(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating";
    case "FAILED":
      return "Error";
    default:
      return null;
  }
}

function statusColor(status: FeedItem["status"]) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "bg-yellow-500/20 text-yellow-400";
    case "FAILED":
      return "bg-red-500/20 text-red-400";
    default:
      return "";
  }
}

function formatEpDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m episode`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m episode` : `${h}h episode`;
}

export function FeedItemCard({
  item,
  onPlay,
}: {
  item: FeedItem;
  onPlay?: (id: string) => void;
}) {
  const audio = useAudio();
  const isPlayable = item.status === "READY" && item.briefing?.clip;
  const label = statusLabel(item.status);
  const epDuration = formatEpDuration(item.episode.durationSeconds);

  const card = (
    <div
      className={`relative flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-hidden${
        !item.listened && item.status === "READY"
          ? " border-l-[3px] border-l-blue-500"
          : ""
      }`}
    >
      {/* Podcast artwork */}
      {item.podcast.imageUrl ? (
        <img
          src={item.podcast.imageUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-zinc-800 flex-shrink-0" />
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500 truncate">{item.podcast.title}</p>
          {label && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(item.status)}`}
            >
              {label}
            </span>
          )}
        </div>
        <p className="font-medium text-sm truncate mt-0.5">
          {item.episode.title}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {item.durationTier} min
          {epDuration && (
            <>
              <span className="text-zinc-600 mx-1">·</span>
              <span className="text-zinc-600">from {epDuration}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );

  if (isPlayable) {
    return (
      <button
        className="w-full text-left"
        onClick={() => {
          audio.play(item);
          onPlay?.(item.id);
        }}
      >
        {card}
      </button>
    );
  }

  return card;
}
```

- [ ] **Step 2: Verify the dev server renders correctly**

Run: `npm run dev`

Open `http://localhost:8787/home` in the browser. Verify:
- Podcast name appears above episode title
- Duration reads as natural text (e.g., "3 min · from 2h 22m episode")
- Unlistened items have a blue left border
- Ready items show no status badge
- Processing/pending items show "Creating" badge in yellow
- No "Sub" / "On-demand" pills

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No new errors related to feed-item.tsx

- [ ] **Step 4: Commit**

```bash
git add src/components/feed-item.tsx
git commit -m "feat: redesign feed card to podcast-app style layout"
```

---

### Task 2: Fix Player Sheet Overflow

**Files:**
- Modify: `src/components/player-sheet.tsx:53-90` (SheetContent className + artwork container)

**Context:** The player sheet is `h-[95vh]` with artwork in a `flex-1` container using `max-w-[320px]`. On short viewports (Chrome mobile with address bar), controls are pushed below the fold with no scroll. Fix: add `overflow-y-auto`, constrain artwork with `max-h-[35vh]` and reduce to `max-w-[280px]`, remove `flex-1`, add safe area padding.

- [ ] **Step 1: Update SheetContent className**

In `src/components/player-sheet.tsx`, change the SheetContent className (line 57):

Old:
```
className="h-[95vh] rounded-t-2xl bg-zinc-950 border-zinc-800 flex flex-col items-center px-6 pt-3 pb-8"
```

New:
```
className="h-[95vh] rounded-t-2xl bg-zinc-950 border-zinc-800 flex flex-col items-center px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto"
```

- [ ] **Step 2: Update artwork container**

Change the artwork container (line 73):

Old:
```tsx
<div className="flex-1 flex items-center justify-center w-full max-w-sm">
```

New:
```tsx
<div className="flex items-center justify-center w-full max-w-sm">
```

- [ ] **Step 3: Update artwork max widths**

Change all three artwork elements inside the container from `max-w-[320px]` to `max-w-[280px]` and add `max-h-[35vh]` to the img and placeholder elements.

Line 75 (ad artwork):
```tsx
<div className="w-full max-w-[280px] aspect-square max-h-[35vh] rounded-2xl bg-zinc-900 flex flex-col items-center justify-center gap-3 border border-[#F97316]/20">
```

Line 85 (podcast image):
```tsx
<img
  src={currentItem.podcast.imageUrl}
  alt=""
  className="w-full max-w-[280px] aspect-square max-h-[35vh] rounded-2xl object-cover shadow-lg"
/>
```

Line 88 (placeholder):
```tsx
<div className="w-full max-w-[280px] aspect-square max-h-[35vh] rounded-2xl bg-zinc-800" />
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`

Open on mobile viewport (Chrome DevTools, toggle device toolbar, select iPhone SE or similar short device). Play a briefing and open the full player sheet. Verify:
- All controls (seek bar, play/pause, skip) are visible without scrolling on tall phones
- On short viewports, the sheet scrolls to reveal controls
- Artwork scales down proportionally
- No content is clipped

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/components/player-sheet.tsx
git commit -m "fix: player sheet scrollable with constrained artwork for short viewports"
```

---

## Chunk 2: Discover Card + Library Tabs

### Task 3: Simplify PodcastCard (Remove Subscribe, Add Chevron)

**Files:**
- Modify: `src/components/podcast-card.tsx` (full rewrite — 192 lines → ~45 lines)
- Modify: `src/__tests__/podcast-card.test.tsx` (full rewrite — tests for simplified component)
- Modify: `src/pages/discover.tsx:44-47,269-284,348-361` (remove subscription tracking, simplify PodcastCard props)
- Modify: `src/__tests__/discover.test.tsx` (remove dead mocks for usePlan and subscriptions)

**Context:** PodcastCard currently manages subscribe/unsubscribe, tier picker dialog, upgrade modal, and plan limits — all 192 lines. The spec moves all subscribe/favorite actions to the podcast detail page (which already has them). PodcastCard becomes a simple navigational card with a chevron.

- [ ] **Step 1: Rewrite podcast-card.tsx**

Replace the entire file:

```tsx
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
}: PodcastCardProps) {
  return (
    <Link to={`/discover/${id}`}>
      <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-14 h-14 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-zinc-400">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-zinc-400 truncate">{author}</p>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
            {description}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 self-center flex-shrink-0" />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Update discover.tsx — remove subscription tracking**

In `src/pages/discover.tsx`:

Remove lines 44-47 (subscription data fetching):
```tsx
// DELETE these lines:
const { data: subsData, refetch: refetchSubscriptions } = useFetch<{
  subscriptions: { podcastId: string }[];
}>("/podcasts/subscriptions");
const subscribedIds = new Set(subsData?.subscriptions.map((s) => s.podcastId) ?? []);
```

Also remove the `useFetch` import since it's no longer needed (catalog uses its own `useFetch` still — check: `catalogData` still uses `useFetch` on line 49, so keep the import).

- [ ] **Step 3: Update discover.tsx — simplify PodcastCard usage in search results**

Lines 271-283, change each PodcastCard usage to remove `feedUrl`, `isSubscribed`, `onToggle`:

```tsx
<PodcastCard
  key={podcast.id}
  id={podcast.id}
  title={podcast.title}
  author={podcast.author || ""}
  description={podcast.description || ""}
  imageUrl={podcast.imageUrl || ""}
/>
```

- [ ] **Step 4: Update discover.tsx — simplify PodcastCard usage in browse results**

Lines 350-360, same change:

```tsx
<PodcastCard
  key={podcast.id}
  id={podcast.id}
  title={podcast.title}
  author={podcast.author || ""}
  description={podcast.description || ""}
  imageUrl={podcast.imageUrl || ""}
/>
```

- [ ] **Step 5: Rewrite podcast-card.test.tsx**

Replace the entire test file to match the simplified component:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PodcastCard } from "../components/podcast-card";

const defaultProps = {
  id: "p1",
  title: "Tech Today",
  author: "Jane Doe",
  description: "Daily tech news and analysis.",
  imageUrl: "https://example.com/image.jpg",
};

describe("PodcastCard", () => {
  it("renders title, author, and description", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText("Tech Today")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Daily tech news and analysis.")).toBeInTheDocument();
  });

  it("links to podcast detail page", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/discover/p1");
  });

  it("renders chevron icon", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} />
      </MemoryRouter>
    );
    // ChevronRight renders as an SVG inside the link
    const link = screen.getByRole("link");
    const svg = link.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows initial letter when no imageUrl", () => {
    render(
      <MemoryRouter>
        <PodcastCard {...defaultProps} imageUrl="" />
      </MemoryRouter>
    );
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Clean up discover.test.tsx**

In `src/__tests__/discover.test.tsx`:

Remove the `usePlan` mock (lines 8-18) — PodcastCard no longer uses `usePlan()`:
```tsx
// DELETE this entire block:
vi.mock("../contexts/plan-context", () => ({
  usePlan: () => ({
    plan: { name: "Free", slug: "free" },
    briefings: { used: 0, limit: null, remaining: null },
    subscriptions: { used: 0, limit: 10, remaining: 10 },
    maxDurationMinutes: 15,
    loading: false,
    refetch: vi.fn(),
  }),
}));
```

Remove the `/podcasts/subscriptions` handler from `mockFetch` in `beforeEach` (lines 64-67) and in each test's `mockFetch.mockImplementation`. The handler at lines 65-67:
```tsx
// DELETE these lines from each mockFetch.mockImplementation:
if (url.includes("/podcasts/subscriptions")) {
  return Promise.resolve(mockJsonResponse({ subscriptions: [] }));
}
```

This appears in 3 places: the `beforeEach` (line 64-67), the "renders trending" test (line 93-95), and the "debounced search" test (line 116-118). Remove all three.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/__tests__/podcast-card.test.tsx src/__tests__/discover.test.tsx`
Expected: All tests pass (4 podcast-card + 4 discover)

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: No errors. The removed props (`isSubscribed`, `onToggle`, `feedUrl`) are no longer passed from discover.tsx, and the simplified interface matches.

- [ ] **Step 9: Verify in browser**

Run: `npm run dev`

Open `/discover`. Verify:
- Each podcast card shows title, author, description, and a chevron `›` on the right
- No subscribe button on the card
- Clicking the card navigates to `/discover/:podcastId` (the detail page)
- Detail page still has subscribe + favorite buttons

- [ ] **Step 10: Commit**

```bash
git add src/components/podcast-card.tsx src/__tests__/podcast-card.test.tsx src/pages/discover.tsx src/__tests__/discover.test.tsx
git commit -m "feat: simplify PodcastCard to navigational card with chevron"
```

---

### Task 4: Reorder Library Tabs (Favorites First)

**Files:**
- Modify: `src/pages/library.tsx:152,158-177,179-185` (default tab + tab button order + tab content render order)

**Context:** Library currently defaults to "subscriptions" tab with order: Subscriptions | Favorites | History. Change to default "favorites" with order: Favorites | Subscriptions | History.

- [ ] **Step 1: Change default tab**

In `src/pages/library.tsx` line 152, change:

Old:
```tsx
const [tab, setTab] = useState<"subscriptions" | "favorites" | "history">("subscriptions");
```

New:
```tsx
const [tab, setTab] = useState<"favorites" | "subscriptions" | "history">("favorites");
```

- [ ] **Step 2: Reorder tab buttons in JSX**

Swap the Favorites and Subscriptions button elements (lines 159-176). New order:

```tsx
<div className="flex gap-4 mb-4 border-b border-zinc-800">
  <button
    onClick={() => setTab("favorites")}
    className={`pb-2 text-sm font-medium ${tab === "favorites" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
  >
    Favorites
  </button>
  <button
    onClick={() => setTab("subscriptions")}
    className={`pb-2 text-sm font-medium ${tab === "subscriptions" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
  >
    Subscriptions
  </button>
  <button
    onClick={() => setTab("history")}
    className={`pb-2 text-sm font-medium ${tab === "history" ? "text-white border-b-2 border-white" : "text-zinc-500"}`}
  >
    History
  </button>
</div>
```

- [ ] **Step 3: Reorder tab content rendering**

Swap the render order to match (lines 179-185):

```tsx
{tab === "favorites" && <FavoritesGrid />}
{tab === "subscriptions" && <SubscriptionsGrid />}
{tab === "history" && (
  <Suspense fallback={<LibrarySkeleton />}>
    <History />
  </Suspense>
)}
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`

Open `/library`. Verify:
- "Favorites" tab is selected by default (white text, underline)
- Tab order left-to-right: Favorites | Subscriptions | History
- Each tab shows the correct content when clicked

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/library.tsx
git commit -m "feat: reorder library tabs with Favorites first"
```

---

### Task 5: Final Verification

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

Open dev server, test these flows on a mobile viewport:
1. Home → feed cards display correctly with new layout
2. Tap a ready briefing → plays audio, mini player appears
3. Tap mini player → full player sheet opens, scrollable, artwork not oversized
4. Navigate to Discover → cards show chevron, no subscribe button
5. Tap a podcast card → navigates to detail page with subscribe + favorite
6. Navigate to Library → Favorites tab is default

- [ ] **Step 5: Commit any fixes from smoke testing**

If any issues found during smoke test, fix and commit with descriptive message.
