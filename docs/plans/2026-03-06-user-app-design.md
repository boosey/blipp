# Blipp User App — Design Document

## Overview

Mobile-first user application for Blipp, built as a PWA within the existing codebase. Users discover podcasts, subscribe for automatic briefings or request one-off episode briefings, and listen to generated audio clips.

## Tech Stack

Same codebase, same SPA. No new framework dependencies.

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | React 19 + Vite 7 + Tailwind v4 + shadcn/ui | Existing |
| Routing | React Router v7 | Existing |
| Auth | Clerk | Existing |
| API Client | Fetch + Clerk Bearer token | Existing |
| PWA | Vite PWA plugin (vite-plugin-pwa) | New |
| Native (future) | Capacitor | Deferred |

## Core Concepts

| Concept | Model | Behavior |
|---------|-------|----------|
| Subscription | `Subscription` table | Auto-generate briefing for every new episode |
| One-off request | `BriefingRequest` | User picks a specific episode, gets a single briefing |
| Favorite | = Subscription | Favoriting a podcast is subscribing to it |

Subscriptions are the recurring mechanism. No separate scheduling UI needed — the system watches for new episodes on subscribed podcasts and auto-generates briefings via the existing pipeline.

## Navigation

Bottom tab bar with 4 tabs:

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/` | Recent briefings, active requests with status |
| Discover | `/discover` | Search podcasts, trending, browse |
| Library | `/library` | Subscribed podcasts, manage subscriptions |
| Settings | `/settings` | Account, plan/billing, preferences |

## Pages

### Home (`/`)

Request list showing all user briefing requests. Each item displays:
- Podcast artwork thumbnail
- Episode title
- Status badge: **Creating** / **Complete** / **Error**

Tap a completed request to navigate to the briefing player.

### Discover (`/discover`)

- Search bar (queries Podcast Index API)
- Trending podcasts grid
- Tap a podcast to view detail

### Podcast Detail (`/discover/:podcastId`)

- Podcast artwork, title, description
- Subscribe/Unsubscribe button
- Episode list (scrollable)
- Tap an episode to see detail with "Create Briefing" action

### Library (`/library`)

- Grid of subscribed podcasts (artwork + title)
- Tap to view podcast detail (same page as discover detail)
- Unsubscribe option

### Settings (`/settings`)

- Account info (from Clerk)
- Current plan
- Manage billing (Stripe portal link)
- Preferences (future: briefing duration, voice)

### Briefing Player (`/briefing/:requestId`)

- Episode info (artwork, title, podcast name)
- Simple audio player: play/pause, scrub bar, playback speed
- Inline `<audio>` element — no persistent player in v1

## Layout Architecture

```
MobileLayout
  Header (minimal: logo + user avatar)
  <Outlet /> (page content, scrollable)
  [AudioPlayer slot] (reserved, not built in v1)
  BottomNav (4 tabs: Home, Discover, Library, Settings)
```

The `AudioPlayer` slot is reserved in the layout structure. When the persistent player is added later, it slots in between content and bottom nav without restructuring.

The existing `AppLayout` and `AdminLayout` remain for their respective sections. `MobileLayout` is a new layout for user-facing routes.

## API Surface

### Existing Endpoints (no changes needed)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/podcasts/search` | Search via Podcast Index |
| GET | `/api/podcasts/trending` | Trending podcasts |
| POST | `/api/podcasts/subscribe` | Subscribe to a podcast |
| POST | `/api/podcasts/unsubscribe` | Unsubscribe |
| GET | `/api/podcasts/subscriptions` | List subscriptions |
| GET | `/api/briefings` | List user briefings |
| POST | `/api/briefings/generate` | Request a briefing |
| POST | `/api/billing/checkout` | Stripe checkout |
| POST | `/api/billing/portal` | Stripe billing portal |

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/podcasts/:id` | Podcast detail (metadata + info) |
| GET | `/api/podcasts/:id/episodes` | Episode list for a podcast |
| GET | `/api/requests` | User's briefing requests with status |
| GET | `/api/requests/:id` | Single request detail with briefing link |

### API Notes

- Podcast detail and episodes may be served from Podcast Index (proxied) or from the local DB if the podcast has been ingested
- The existing `POST /api/briefings/generate` needs to support a mode where the user specifies a single episode ID for a one-off request
- `GET /api/requests` returns status (PENDING/PROCESSING/COMPLETED/FAILED) mapped to user-friendly labels (Creating/Complete/Error)

## Audio Playback

### V1: Simple Inline Player

- HTML `<audio>` element on the briefing player page
- Controls: play/pause, seek bar, playback speed (1x, 1.25x, 1.5x, 2x)
- Audio source: R2 URL from the briefing record

### Future: Persistent Player

- Mini-player bar above bottom nav, visible during navigation
- Full-screen player view on tap
- Queue support, autoplay next briefing
- Background audio (requires Capacitor for true native support)
- Media Session API for lock screen controls (PWA)

## PWA Configuration

- **Service worker**: Cache app shell (HTML, JS, CSS, fonts)
- **Manifest**: App name, icons, theme color, `display: standalone`
- **No offline audio caching in v1** — requires online connection to stream briefings

## File Structure (new files)

```
src/
  layouts/
    mobile-layout.tsx          # MobileLayout with bottom nav
  components/
    bottom-nav.tsx             # Tab bar component
    audio-player.tsx           # Simple inline audio player
    podcast-card.tsx           # Podcast artwork + title card
    request-item.tsx           # Request list item with status badge
    status-badge.tsx           # Creating/Complete/Error badge
  pages/
    home.tsx                   # Request list (Home tab)
    discover.tsx               # Search + trending (exists, needs mobile redesign)
    podcast-detail.tsx         # Podcast info + episodes
    library.tsx                # Subscribed podcasts
    settings.tsx               # Account + billing (exists, needs mobile redesign)
    briefing-player.tsx        # Audio playback page
  lib/
    api.ts                     # Extended with new endpoints (existing file)
worker/
  routes/
    podcasts.ts                # Extended with :id and :id/episodes (existing file)
    requests.ts                # New: user-facing request endpoints
```

## Deferred Features (not in v1)

- Push notifications (web + native)
- Persistent audio player with queue
- Background audio playback
- Multi-podcast/multi-episode briefings
- Offline support / audio caching
- App Store builds (Capacitor)
- Episode bookmarking

## Migration Path to Native

1. Build and ship PWA (v1)
2. Add Capacitor to the project (`npx cap init`)
3. Configure iOS + Android projects
4. Add native plugins: push notifications, background audio
5. Build and submit to App Store / Play Store
6. PWA continues to serve as the web version
