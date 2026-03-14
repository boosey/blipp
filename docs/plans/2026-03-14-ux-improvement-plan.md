# Blipp UX Improvement Plan

## Current State Assessment

### What Exists Today

Blipp has a functional but skeletal mobile-first SPA with 6 user-facing pages:

| Page | Route | Current State |
|------|-------|---------------|
| Landing | `/` | Title + tagline + 2 CTAs. No product explanation, no social proof, no visuals. |
| Pricing | `/pricing` | Dynamic 3-column plan cards with Stripe checkout. Functional but generic. |
| Home (Feed) | `/home` | Flat list of feed items with status badges. Polling for updates. No grouping, no filtering. |
| Discover | `/discover` | Search bar + catalog list. No categories, no trending, no personalization. |
| Podcast Detail | `/discover/:id` | Podcast header + episode list with "Brief" buttons. Functional. |
| Library | `/library` | 3-column grid of subscribed podcast artwork. Minimal. |
| Settings | `/settings` | Current plan display + upgrade/manage buttons. No preferences, no profile. |
| Briefing Player | `/play/:id` | Artwork + title + audio controls (play/pause, seek, speed). Inline `<audio>`. |

### User Journey Today

1. User lands on `/` -- sees "Blipp" and a tagline. No idea what the product does unless they already know.
2. Signs in via Clerk -- lands on `/home` which is empty. No onboarding.
3. Must navigate to Discover tab, search for a podcast, tap it, choose a duration tier, subscribe.
4. Wait for pipeline to process. Feed item shows "Creating" with no progress indication.
5. When ready, tap to play. Player is a separate full page -- navigating away stops playback.
6. No way to know when new briefings arrive without manually checking.

### Core UX Problems

1. **Zero onboarding** -- New users face an empty feed with no guidance on what to do next.
2. **No persistent audio player** -- Navigating away from `/play/:id` kills playback. This is the #1 usability gap for an audio product.
3. **Silent errors** -- API errors are silently swallowed (`catch(() => {})`). Users get no feedback when actions fail.
4. **No loading skeletons** -- Every page shows a plain "Loading..." text string. Feels unfinished.
5. **Landing page is barren** -- No product explanation, screenshots, testimonials, or value proposition.
6. **No empty state CTAs** -- Empty states say "No briefings yet" but don't guide users to act.
7. **Duration tier UX is confusing** -- Users must pick 1/2/3/5/7/10/15 minute tiers with no explanation of what they get.
8. **No feedback on actions** -- Subscribe, unsubscribe, create briefing -- no toast/confirmation.
9. **Text-only play/pause button** -- The player uses `||` and `▶` characters instead of proper icons.
10. **No skip forward/back** -- Audio player has no 15s/30s skip controls, which are standard for podcast apps.

---

## Priority Tiers

### P0: Launch Blockers

These must be fixed before any public launch. Without them, users will bounce or be unable to use the product.

---

#### P0-1: Persistent Mini-Player

**Problem**: Navigating away from the player page stops audio. Users cannot browse while listening.

**Solution**: Add a `MiniPlayer` bar that sits above the `BottomNav` in `MobileLayout`, visible whenever audio is playing or paused.

**Components**:
- `src/contexts/audio-context.tsx` -- React context holding `AudioState` (current item, playing, progress, audioRef)
- `src/components/mini-player.tsx` -- 56px bar: artwork thumbnail (40px), title (truncated), play/pause icon button, progress bar (thin line along top)
- `src/components/player-sheet.tsx` -- Full-screen sheet (bottom sheet or page) that expands from mini-player tap

**Layout change** in `mobile-layout.tsx`:
```
<AudioProvider>
  <header />
  <main (pb increased to accommodate mini-player + bottom nav) />
  <MiniPlayer />  <!-- new -->
  <BottomNav />
</AudioProvider>
```

**Behavior**:
- Tap play on any feed item -> audio starts, mini-player appears, user stays on current page
- Tap mini-player -> expand to full player view (sheet or route)
- Mini-player shows: podcast art (32x32), episode title (truncated), play/pause button, thin progress line
- Audio continues across page navigations
- When audio ends, mini-player stays showing "played" state until dismissed

**Interaction pattern**: This is how every major podcast app works (Spotify, Apple Podcasts, Overcast). Not having it makes Blipp feel like a prototype.

---

#### P0-2: Onboarding Flow

**Problem**: New users see an empty feed and have no idea what to do.

**Solution**: First-time user experience that guides users to subscribe to 3+ podcasts before showing the feed.

**Components**:
- `src/pages/onboarding.tsx` -- Multi-step onboarding page
- `src/hooks/use-onboarding.ts` -- Hook that checks if user has completed onboarding (localStorage flag + API check for subscriptions)

**Steps**:
1. **Welcome** -- "Your podcasts, distilled." Brief 2-sentence explanation of what Blipp does. Single CTA: "Get Started"
2. **Pick Podcasts** -- Curated grid of popular podcasts (from catalog) with quick-subscribe checkboxes. Categories: News, Tech, Business, Culture, Sports, Science. Minimum 3 selections required. Each card shows title + artwork + one-tap subscribe.
3. **Choose Duration** -- "How long should your briefings be?" Simple picker with descriptions:
   - Quick catch-up (1-3 min): "Headlines and key points"
   - Standard (5-7 min): "Full story summaries"
   - Deep dive (10-15 min): "Detailed analysis"
4. **Done** -- "You're all set. We'll notify you when your first briefings are ready." Redirect to `/home`.

**Route**: `/onboarding` -- MobileLayout redirects here if user has no subscriptions and hasn't dismissed onboarding.

---

#### P0-3: Loading Skeletons

**Problem**: Every page shows "Loading..." plain text. Feels like a broken page.

**Solution**: Replace all loading states with shimmer skeleton components matching the content layout.

**Components**:
- `src/components/skeletons/feed-skeleton.tsx` -- 5 feed item shaped placeholders (artwork square + 2 text lines + badge)
- `src/components/skeletons/discover-skeleton.tsx` -- Search bar skeleton + 8 podcast card shapes
- `src/components/skeletons/library-skeleton.tsx` -- 3x3 grid of square placeholders
- `src/components/skeletons/player-skeleton.tsx` -- Large artwork square + text lines + controls

Use the existing `src/components/ui/skeleton.tsx` (shadcn skeleton component) as the building block.

**Pattern**: Each skeleton should match the exact layout of the loaded content so there is zero layout shift.

---

#### P0-4: Error Handling & User Feedback

**Problem**: Actions silently fail. No toasts, no error messages, no confirmations.

**Solution**: Add a toast notification system and replace all silent catches.

**Components**:
- Install `sonner` (lightweight toast library that works with shadcn)
- `src/components/toaster.tsx` -- Toaster component mounted in `main.tsx`
- Update all API calls to show:
  - Success: "Subscribed to [podcast]", "Briefing requested", "Unsubscribed"
  - Error: "Could not subscribe. Please try again." with the actual error detail
  - Info: "Briefing is being created. We'll notify you when it's ready."

**Specific fixes**:
- `home.tsx` line 15: `catch {}` -> show error toast
- `podcast-detail.tsx` line 54: `catch {}` -> show error toast
- `settings.tsx` lines 29, 37, 49: all `catch(() => {})` -> show error toast
- `briefing-player.tsx` line 31: `catch(() => navigate("/home"))` -> show error + navigate

---

#### P0-5: Landing Page Redesign

**Problem**: Landing page is a title, tagline, and 2 buttons. No explanation of the product.

**Solution**: Full landing page with clear value proposition.

**Sections** (top to bottom):
1. **Hero**: Large headline "Your podcasts, distilled to fit your time." + subhead explaining what Blipp does (2 sentences max). Phone mockup showing the app. CTA: "Start Free" / "See Pricing"
2. **How It Works**: 3-step visual: Subscribe -> We distill -> You listen. Icon + short description for each.
3. **Features**: 2x2 grid: "AI-powered summaries", "Choose your length", "Auto-delivered daily", "Works with any podcast"
4. **Pricing Preview**: Inline 3-plan cards (reuse Pricing component or simplified version)
5. **Footer**: Links to pricing, sign in, basic legal

**Design notes**: Dark theme (zinc-950 bg), use gradients sparingly for visual interest. No stock photos.

---

### P1: Launch Quality

These are strongly expected by users of a podcast/audio product. Missing them makes the product feel incomplete but not unusable.

---

#### P1-1: Proper Audio Player Controls

**Problem**: Player uses text characters (`||`, `▶`) for controls, no skip buttons, no progress visualization.

**Solution**: Full player redesign with proper controls.

**Controls** (center row):
- Skip back 15s (icon button, `SkipBack` from lucide)
- Play/Pause (large circular button with proper icon, not text)
- Skip forward 30s (icon button, `SkipForward` from lucide)

**Secondary controls** (below):
- Playback speed button (cycles 1x -> 1.25x -> 1.5x -> 2x -> 0.75x) -- keep existing but style better
- Sleep timer (set auto-stop in 15/30/45/60 min)

**Progress bar**: Replace the native range input with a custom styled scrubber:
- Track: thin line (2px) with played portion in white, unplayed in zinc-700
- Thumb: small circle (12px) that appears on touch/hover
- Buffered range: subtle lighter shade showing buffered audio
- Time labels below: current / total

**Artwork**: Increase to fill most of the viewport width (max 320px), with rounded corners (xl) and subtle shadow.

---

#### P1-2: Feed Improvements

**Problem**: Feed is a flat chronological list with no organization, filtering, or unlistened count.

**Solution**: Structured feed with clear information hierarchy.

**Changes**:
- **Header bar**: "Your Feed" title + unlistened count badge ("3 new") + filter button
- **Filters** (horizontal pill row): All | New | Subscription | On-demand | Creating
- **Grouping**: Group by date: "Today", "Yesterday", "This Week", "Earlier"
- **Pull-to-refresh**: Standard mobile pull-to-refresh gesture (or refresh button)
- **Listened state**: Listened items get reduced opacity (0.6) and no blue dot
- **Creating state**: Show animated pulse on the status badge, add "usually ready in 2-5 min" hint on first creating item

**Feed item card improvements**:
- Add relative timestamp ("2h ago", "Yesterday")
- Tap anywhere on card to play (if ready) -- entire card is touch target
- Swipe left to mark as listened (or long-press menu)
- Show actual briefing duration once ready (e.g., "3:42" instead of just "3m")

---

#### P1-3: Discover Page Polish

**Problem**: Discover is a search bar and a flat list. No browsing, no categories, no trending.

**Solution**: Rich discovery experience.

**Layout**:
- **Search bar**: Full-width with search icon, "Search podcasts..." placeholder. Instant search (debounced 300ms) instead of requiring button click or Enter.
- **Categories row**: Horizontal scroll of category pills (News, Tech, Business, Comedy, Science, Sports, Culture, Health, Education, True Crime). Tapping filters the catalog.
- **Trending section**: "Trending Now" header + horizontal scroll of podcast cards (larger artwork, 100x100)
- **Browse section**: "All Podcasts" list (same as current but with pagination/infinite scroll)

**Podcast card improvements**:
- Add episode count badge on artwork
- Add subscriber count if available ("1.2k listeners")
- Improve empty image handling -- show podcast initial letter in a colored circle instead of blank gray box

---

#### P1-4: Subscription Management

**Problem**: Users can subscribe but cannot easily manage duration tiers or see subscription status.

**Solution**: Enhanced library page with management features.

**Library page redesign**:
- **Header**: "Your Library" + subscription count
- **View toggle**: Grid view (current) / List view (with more detail)
- **List view items**: Podcast art + title + author + current duration tier + last briefing date + manage button
- **Manage actions** (sheet/bottom-sheet per podcast):
  - Change duration tier
  - Pause subscription (stop auto-briefings without unsubscribing)
  - Unsubscribe (with confirmation dialog)
  - View recent briefings for this podcast

---

#### P1-5: Settings Page Enhancement

**Problem**: Settings only shows plan info. No user preferences, no app settings.

**Solution**: Full settings page with sections.

**Sections**:
- **Account**: Name, email (from Clerk). Link to Clerk profile management.
- **Plan & Billing**: Current plan name + usage stats (briefings this week: 3/10). Upgrade button. Manage subscription (Stripe portal).
- **Preferences**:
  - Default briefing duration (used when subscribing to new podcasts)
  - Audio quality (Standard / High -- for future use)
  - Auto-play next briefing (on/off)
- **Notifications** (future-ready):
  - New briefing ready (on/off)
  - Weekly digest (on/off)
- **About**: App version, privacy policy link, terms link, support/feedback link
- **Sign Out**: Red button at bottom

---

#### P1-6: Empty States with Actions

**Problem**: Empty states are generic text with no visual and no clear CTA.

**Solution**: Illustrated empty states that guide users to act.

**Home (empty feed)**:
- Icon: Headphones or radio waves
- Title: "No briefings yet"
- Body: "Subscribe to your favorite podcasts and we'll create bite-sized briefings for you."
- CTA button: "Discover Podcasts" -> navigates to `/discover`

**Library (no subscriptions)**:
- Icon: Books/library shelf
- Title: "Your library is empty"
- Body: "Find podcasts you love and subscribe for automatic briefings."
- CTA button: "Browse Podcasts" -> navigates to `/discover`

**Discover (no search results)**:
- Icon: Search with X
- Title: "No podcasts found"
- Body: "Try a different search term or browse our catalog."

**Discover (catalog loading/empty)**:
- Show skeleton, not "Loading..." text

---

### P2: Delight

These are differentiators that create emotional engagement and make users want to come back.

---

#### P2-1: Listening History & Stats

**Components**:
- `src/pages/history.tsx` -- Full listening history with date groups
- Stats card on Home page (or in Settings):
  - "You've listened to X briefings this week"
  - "Y minutes of podcast content distilled into Z minutes"
  - Streak counter ("3 days in a row!")

**Navigation**: Add as a sub-section in Library or as a new tab item (replace Library icon? or 5th tab)

---

#### P2-2: Micro-interactions & Animations

**Specific animations to add**:
- **Page transitions**: Fade-in on route change (simple CSS transition, not heavy library)
- **Feed item appear**: Stagger-fade when items load (each card fades in 50ms apart)
- **Subscribe button**: Satisfying press animation (scale down 0.95 -> spring back)
- **Unlistened dot**: Gentle pulse animation on new items
- **Mini-player slide-up**: Smooth slide from bottom when audio starts
- **Status badge**: "Creating" badge gets a subtle shimmer/pulse animation
- **Skeleton shimmer**: Already built into shadcn skeleton, just needs to be used
- **Pull-to-refresh**: Spinner animation at top of feed

**Library**: Use `framer-motion` `AnimatePresence` for smooth add/remove of subscription cards.

---

#### P2-3: Smart Feed Ordering

Instead of pure chronological, order the feed intelligently:
1. Unlistened + Ready items first (newest first within this group)
2. Currently Creating items (with progress indicator)
3. Listened items (with reduced visual weight)

Add a "Catch Up" button that plays all unlistened briefings in sequence (auto-advance).

---

#### P2-4: Briefing Preview Text

Before playing, show a 2-3 sentence text preview of the briefing content (from the distillation stage's work product). This helps users decide if they want to listen.

**Where**: On the feed item card (expandable) and on the player page above the controls.

---

#### P2-5: Theme & Visual Polish

**Current issues**:
- User app uses `zinc-*` Tailwind colors directly (hardcoded)
- Admin uses a completely different color system (`#0A1628` navy theme)
- No brand color beyond white-on-dark

**Improvements**:
- Define a brand accent color (currently missing -- suggest a vibrant blue or teal to match audio/podcast energy)
- Use the accent for: active bottom nav tab, play button, subscribe button, progress bars, unlistened dot
- Add subtle gradient backgrounds to hero sections (dark gradient, not flat zinc-950)
- Improve typography: use `Inter` font consistently (it's imported but may not be loading correctly -- the `@font-face` src is a Google Fonts CSS URL, not a font file)
- Add a subtle top safe-area background color for notched phones

---

#### P2-6: Share Briefing

Add a share button on the player page that:
- Copies a link to the briefing (public or requiring sign-in)
- Uses Web Share API on mobile for native share sheet
- Shows "Shared!" toast on success

---

### P3: Future / Post-Launch

These are valuable but can wait until after initial launch.

---

#### P3-1: Push Notifications

- Notify when a briefing is ready ("Your briefing for [podcast] is ready to listen")
- Use Web Push API for PWA
- Add notification preferences in Settings
- Future: native push via Capacitor

#### P3-2: Offline Playback

- Cache briefing audio in service worker when played
- Show cached briefings with a download icon
- Allow pre-downloading briefings over Wi-Fi

#### P3-3: Background Audio & Media Session

- Media Session API for lock screen controls (play/pause, skip, artwork)
- Background audio playback (already works in PWA standalone mode, but needs Media Session for controls)

#### P3-4: Queued Playback

- "Play All" button on feed to queue all unlistened briefings
- Auto-advance to next briefing when current ends
- Queue management (reorder, remove)
- "Up Next" indicator on mini-player

#### P3-5: Podcast Recommendations

- "Because you listen to [podcast X]" recommendations
- "Popular with Blipp listeners" section on Discover
- Trending-based suggestions

#### P3-6: Listening Streaks & Gamification

- Daily listening streak counter
- Weekly summary notification
- Badges/achievements (listened to 10 briefings, tried 5 different podcasts, etc.)

#### P3-7: Social Features

- Share listening activity to social media
- "Blipp Wrapped" annual summary
- Public profile (optional)

#### P3-8: Accessibility Audit

Full accessibility pass:
- **Screen reader**: Add `aria-label` to all icon-only buttons (partially done on play button)
- **Keyboard navigation**: Ensure all interactive elements are focusable and operable via keyboard
- **Color contrast**: Verify all `text-zinc-500` on `bg-zinc-950` meets WCAG AA (currently 4.48:1 -- passes AA for large text but fails for small text)
- **Focus management**: Visible focus rings on all interactive elements
- **Reduced motion**: Respect `prefers-reduced-motion` for all animations
- **Touch targets**: Ensure all tap targets are minimum 44x44px (some current buttons are smaller)

#### P3-9: Tablet / Desktop Layout

- Responsive breakpoints for larger screens
- 2-column layout on tablet (sidebar + content)
- Full desktop layout with sidebar navigation (replace bottom nav)

---

## Implementation Notes

### Component Architecture

The persistent mini-player (P0-1) requires a React context for audio state. This is the most architecturally significant change and should be done first, as other features (feed item play buttons, queued playback) depend on it.

```
AudioProvider (in MobileLayout)
  ├── provides: play(feedItem), pause(), resume(), seek(), setRate()
  ├── state: currentItem, isPlaying, currentTime, duration, playbackRate
  └── renders: hidden <audio> element
```

### Dependencies to Add

| Package | Purpose | Size |
|---------|---------|------|
| `sonner` | Toast notifications | ~4KB |
| `framer-motion` | Page transitions, list animations | ~32KB (tree-shakeable) |

### Files to Create (P0 + P1)

```
src/
  contexts/
    audio-context.tsx           # Audio playback state management
  components/
    mini-player.tsx             # Persistent bottom mini-player bar
    player-sheet.tsx            # Expanded player view
    toaster.tsx                 # Sonner toast container
    empty-state.tsx             # Reusable empty state component
    skeletons/
      feed-skeleton.tsx         # Feed page skeleton
      discover-skeleton.tsx     # Discover page skeleton
      library-skeleton.tsx      # Library page skeleton
      player-skeleton.tsx       # Player page skeleton
  pages/
    onboarding.tsx              # First-time user onboarding
  hooks/
    use-onboarding.ts           # Onboarding state check
```

### Files to Modify (P0 + P1)

| File | Changes |
|------|---------|
| `src/layouts/mobile-layout.tsx` | Add AudioProvider wrapper, MiniPlayer slot, adjust padding |
| `src/pages/home.tsx` | Add skeletons, feed filters, date grouping, use audio context for play |
| `src/pages/discover.tsx` | Add skeletons, categories, debounced search, trending section |
| `src/pages/library.tsx` | Add list view toggle, management sheet, skeletons |
| `src/pages/settings.tsx` | Add preferences section, about section, sign-out |
| `src/pages/landing.tsx` | Full redesign with hero, how-it-works, features |
| `src/pages/briefing-player.tsx` | Use audio context, proper icons, skip controls, improved scrubber |
| `src/components/feed-item.tsx` | Add timestamp, swipe gesture, play via audio context |
| `src/components/podcast-card.tsx` | Fallback initials, episode count, visual improvements |
| `src/components/bottom-nav.tsx` | Adjust position for mini-player, add unlistened badge on Home tab |
| `src/main.tsx` | Add Toaster component |
| `src/App.tsx` | Add onboarding route, redirect logic |
| `src/index.css` | Fix Inter font import, add brand accent color variable |

### Suggested Implementation Order

1. **Audio context + mini-player** (P0-1) -- architectural foundation
2. **Toast system** (P0-4) -- used by everything after
3. **Loading skeletons** (P0-3) -- quick visual upgrade
4. **Onboarding flow** (P0-2) -- critical for new users
5. **Landing page** (P0-5) -- critical for conversion
6. **Player controls** (P1-1) -- builds on audio context
7. **Feed improvements** (P1-2) -- core daily experience
8. **Empty states** (P1-6) -- quick polish
9. **Discover polish** (P1-3) -- helps discovery
10. **Settings enhancement** (P1-5) -- user expectations
11. **Library management** (P1-4) -- subscription management
12. **Animations** (P2-2) -- delight layer
13. **History & stats** (P2-1) -- engagement
14. **Visual polish** (P2-5) -- brand refinement

### Known Technical Debt Affecting UX

1. **Font loading broken**: `index.css` line 143 uses a Google Fonts CSS URL in `@font-face src`, which does not work -- should use the actual `.woff2` file URLs or import via `<link>` tag.
2. **Landing page links to `/dashboard`** (line 23): Should link to `/home`. The redirect exists but adds unnecessary navigation.
3. **Inconsistent data fetching**: `home.tsx` and `settings.tsx` use manual `useState/useEffect/useCallback` instead of `useFetch<T>()` hook. Should be standardized.
4. **No error boundaries**: A React error in any page crashes the entire app. Add `<ErrorBoundary>` at the layout level.
5. **PWA icons exist but are not verified**: `icon-192.png` and `icon-512.png` exist in `/public` but there's no apple-touch-icon or favicon configured.
6. **No `<meta>` viewport for mobile**: Need to verify `index.html` has proper viewport meta tag.
7. **Hardcoded admin notification badge**: `admin-layout.tsx` line 158-160 shows a hardcoded "3" notification badge that is not connected to any data source.
