# Blipp content surface plan

**Date**: 2026-04-27
**Owner**: Alex Boudreaux
**Context**: Preparing for AdSense submission, improving conversion funnel, and growing organic + AI-assistant discovery.

## Goals (in priority order)

1. **Drive signup conversion** for unauthenticated visitors via browseable catalog + audio sample.
2. **Earn AdSense approval** by ensuring the indexable surface (`/p/*`) has sufficient original content quality and quantity.
3. **Grow organic traffic** via SEO + AI-assistant visibility through structured content and editorial blog (Pulse).
4. **Set up later distribution levers** (publisher partnerships, paid newsletter) without painting into corners.

## Audiences served

- Signed-up users (existing experience, mostly unaffected).
- Browsing visitors (new `/browse` surface + redesigned landing).
- AdSense reviewers (Phase 1 hardens `/p/*` quality and adds verification meta).
- SEO bots (`/p/*` truncation policy, JSON-LD, internal linking, sitemap).
- AI assistants / LLM crawlers (clean structured claims, JSON-LD, citation-friendly excerpts).
- Social link unfurlers (OG/Twitter card audit).

## Decisions locked

- **Narrative truncation**: ~150–200 words, ending naturally with `…` and a "Sign up to read or listen to the full Blipp" CTA.
- **Top-3 claims ranking**: blended score `0.7 × importance + 0.3 × novelty`. Importance weighted higher because readers want signal; novelty breaks ties and avoids repetitive claims. Recompute server-side, cache with the page response.
- **Audio sample interaction**: URL param `?sample=1` (or `#sample`) triggers autoplay-with-sound; absent param = click-to-play. Buttons labeled "Hear a sample" append the param. The button click itself satisfies browser autoplay-with-sound gesture requirements.
- **Brand**: Pulse is the blog name, lives at `/pulse` on `podblipp.com`. Same brand voice as Blipp (productivity tool, not editorial/journalism).
- **Landing page**: full redesign, three CTAs with clear hierarchy.
- **Bulk-seed tool**: skipped. Existing $1k+ seed surface is sufficient. Future curatorial seeds happen ad-hoc, not automated.

## Open / pending

- AdSense submission timing: after Phase 1+2 ship and have ~1 week to be crawled. Pulse not required for approval.
- Pulse runs as parallel/follow-on workstream. Not on the AdSense critical path.

---

## Phase 1 — `/p/*` quality + landing CTA fix (~1 week)

**Worktree**: new branch `feat-content-surface` (separate from `feat-google-ads-web`).

### 1.1 Truncate narrative + add claims

`worker/routes/public-pages.ts:53–80`:
- Trim `pageText` to ~150–200 words at a sentence boundary.
- Pull top 3 claims from `distillation.claimsJson` ranked by `0.7 × importance + 0.3 × novelty`. If scores aren't both present on a claim, fall back to position order for that claim.
- Pass `narrativeExcerpt`, `topClaims[]`, and a `signupCta` flag to `renderEpisodePage`.

`worker/lib/html-templates.ts`:
- New section in `renderEpisodePage` after narrative:
  - "Top takeaways" h2 + `<ol>` of top 3 claims.
  - "Sign up to read or listen to the full Blipp" CTA card with primary link to `/sign-up?next=/p/:show/:episode`.

### 1.2 Structured data (JSON-LD)

`renderEpisodePage`: emit one `<script type="application/ld+json">` per page combining:
- `PodcastEpisode` (referencing the original episode) with `partOfSeries` → `PodcastSeries`.
- `Article` (the Blipp narrative) with `mentions` referencing the PodcastEpisode, `author` = Blipp, `publisher` = Blipp, `datePublished` = first Blipp date.
- `BreadcrumbList` for `/p > category > show > episode`.

`renderShowPage`: `PodcastSeries` + `BreadcrumbList`.
`renderCategoryPage`: `CollectionPage` + `BreadcrumbList`.

### 1.3 OG / Twitter cards audit

For each of the three `render*` template functions:
- `og:title`, `og:description`, `og:type`, `og:url`, `og:image` (per-episode artwork ≥1200×628, fall back to show artwork, fall back to a Blipp-branded default).
- `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- `og:description` uses the truncated narrative excerpt, not RSS description.

### 1.4 Internal linking on episode pages

In `renderEpisodePage`:
- "More from this show" — last 5 episodes from same podcast with `publicPage: true`, linking to `/p/:show/:episode`.
- "Related in [category]" — 3 random recent shows in the same category, linking to `/p/:show`.
- "Featured in" — placeholder for Pulse links (renders empty until Phase 4 ships).

### 1.5 Landing page CTA fix

`src/pages/landing.tsx`:
- Tighten hero copy so primary CTA is above the fold on iPhone 16 (393×852 logical viewport).
- Add three CTAs: "Hear a sample" (primary), "Start Blipping" (secondary), "Browse the catalog" (tertiary text link).
- "Hear a sample" links to a sample-equipped page (e.g., a known-good `/p/:show/:episode?sample=1`) — picks a curated featured episode.
- Defer the broader redesign visuals to Phase 2.

### 1.6 AdSense static verification

`index.html`:
- Add `<meta name="google-adsense-account" content="ca-pub-...">` once the publisher ID is issued.
- This decouples site verification from the runtime `ADS_ENABLED` flag.

### Phase 1 acceptance

- `/p/:show/:episode` shows excerpt + 3 claims + signup CTA + JSON-LD verifiable in Google's Rich Results Test.
- Landing page passes the iPhone 16 above-the-fold check; all 3 CTAs visible.
- OG cards verified by pasting a `/p/*` URL into iMessage and X compose.
- Truncation/claims tests added.

---

## Phase 2 — Browse surface + audio sample + landing redesign (~2 weeks)

**Worktree**: continues `feat-content-surface`.

### 2.1 Browse routes

Frontend (`src/pages/browse/`):
- `/browse` — index: featured shows, top categories, recently Blipped rail, "Hear a sample" demo card.
- `/browse/category/:slug` — paginated list of shows in a category.
- `/browse/show/:slug` — show detail with episode list. When a public `/p/:show` exists, primary CTA is "Read the full Blipp →" linking there.

Public mode for Discover components:
- Add `mode: "public" | "authenticated"` prop to the relevant components in `src/pages/discover.tsx` and `src/pages/podcast-detail.tsx`.
- In public mode: hide "Popular with listeners like you," "Local interests," vote buttons, heart icons, subscribe, share, Blipp action. Replace each removable action with a "Sign up to ___" CTA where the action would have been (not invisible — converting).
- All `/browse/*` pages emit `<meta name="robots" content="noindex, follow">` and are excluded from `sitemap.xml`.

### 2.2 Public API

`worker/routes/public-catalog.ts`:
- `GET /api/public/categories` — list categories.
- `GET /api/public/categories/:slug/shows` — paginated.
- `GET /api/public/shows/:slug` — show + recent episodes.
- `GET /api/public/shows/:slug/episodes` — paginated.
- `GET /api/public/recommendations/featured` — non-personalized rows only (Editorial, Trending, Newest).
- All routes bypass `requireAuth`, scrub user-specific fields, rate-limited per IP via Cloudflare bot rules + a per-IP token bucket.

### 2.3 Audio sample player

New component `src/components/sample-player.tsx`:
- Takes `briefingId` and `autoplay: boolean` props.
- Plays existing Blipp audio for ~30s, applies a 2-second fade-out via Web Audio API gain node, then stops.
- Shows "Sign up to hear the full Blipp" CTA when sample ends.
- Uses URL param `?sample=1` (or `#sample`) on parent route to set `autoplay`.

Render the sample player on:
- `/browse/show/:slug` — sample from a representative Blipped episode of that show (if any).
- `/p/:show/:episode` for unauth visitors — sample from this episode's Blipp.
- `/browse` — one featured sample card.

### 2.4 Landing page redesign

`src/pages/landing.tsx`:
- Hero: tightened headline, sub-copy under hero, three CTAs.
  - **Primary**: "Hear a sample" → autoplay sample on a representative episode.
  - **Secondary**: "Start Blipping" → signup.
  - **Tertiary**: "Browse the catalog" → `/browse`.
- "Recently Blipped" live rail (4–6 cards) linking into `/p/:show/:episode`. Pulled from a public endpoint that returns the most recent N public episodes.
- Below the fold: existing how-it-works/value-props content.

### 2.5 Phase 2 acceptance

- `/browse/*` pages render correctly for unauthenticated users with all the right elements hidden/converted.
- Robots.txt + sitemap explicitly exclude `/browse/*`.
- Sample player works on iOS Safari, Chrome desktop, Chrome Android (autoplay-with-sound only when entered via "Hear a sample" CTA).
- Landing page lighthouse score doesn't regress.

---

## Phase 3 — Submit AdSense

After Phase 1+2 have been live ~1 week (lets Googlebot recrawl).

- Add publisher ID + `ads.txt` line.
- Configure Funding Choices CMP in the AdSense dashboard.
- Submit `podblipp.com`.
- Leave `ADS_ENABLED=false` until approval lands. Then flip in `wrangler.jsonc` lines 26 + 216.

---

## Phase 4 — Pulse blog (parallel or post-AdSense, ~2 weeks)

**Worktree**: separate, `feat-pulse-blog`.

### 4.1 Routes and rendering

- `/pulse` index — most recent posts, paginated.
- `/pulse/:slug` — full post.
- SSR via Hono + `renderPulsePost` helper, modeled after `renderEpisodePage`.
- Indexable. Add to sitemap. JSON-LD `BlogPosting`.

### 4.2 Editorial pipeline

New table `PulsePost` (id, slug, title, body, status: DRAFT|REVIEW|PUBLISHED, source claims/episodes, generation_meta, scheduled_at, published_at).

Generation jobs:
- **Weekly cross-episode digest** — Sunday cron, scopes last 7 days of distillations, picks a topical angle (clusters claims by topic embedding), drafts post, queues for review.
- **Single-show digest** — manually triggered, scoped to a popular show, drafts "Top 5 takeaways from [show] this week."
- **Event-driven digest** — manually triggered with a topic + date range, drafts cross-episode analysis.

All angles produce DRAFT posts; nothing publishes without admin approval.

### 4.3 Admin review queue

`/admin/pulse` — list of DRAFTs and REVIEWs; admin can edit body, set scheduled_at, and publish. Not auto-publish.

### 4.4 Linking

- Each Pulse post that cites a `/p/:show/:episode` adds the URL to a `featuredIn` list on that episode → `renderEpisodePage` renders "Featured in: [post]" section (the placeholder dropped in Phase 1.4 now activates).
- Each post links to all cited `/p/*` pages in body.

### 4.5 JSON-LD + OG/Twitter for posts

- `BlogPosting` with `author`/`publisher` = Blipp Pulse, `mentions` = cited PodcastEpisodes, `keywords` from topic tags.
- OG/Twitter cards with post hero image (auto-generated or manually set in admin).

### 4.6 Backlog

Seed Pulse with 4–6 posts before public launch so it doesn't read empty.

### Phase 4 acceptance

- Weekly digest runs end-to-end on staging.
- Admin can review, edit, schedule, publish.
- Internal linking works in both directions (post → episode, episode → post).
- All posts pass Rich Results Test for `BlogPosting`.

---

## Phase 5+ — later, no rush

- **Claim-your-show flow** for podcaster outreach (cheap to build when needed).
- **Listeners-on-Blipp embeddable badge** for podcaster sites.
- **Newsletter productization** of Pulse (email + paid tier) once scale exists.
- **Curatorial seeding tool** — admin selects 5–10 trending episodes/week, manual trigger only. Not automated.

---

## Risks and mitigations

- **Sample player audio cost** — fade-out clipping uses existing R2 audio, no re-encode needed. Bandwidth is the only cost; one 30s sample ≈ 500KB at typical bitrates. Cap concurrent samples per IP.
- **Browse → never sign up** — every browse page surfaces "Sign up to ___" CTAs in place of removed actions, plus "Hear a sample" everywhere. Track conversion: `/browse` → signup vs landing → signup; if `/browse` underperforms, tighten CTAs.
- **AI content policy violation on Pulse** — mitigated by manual review queue, weekly cadence, cross-episode framing, byline = Blipp Pulse with clear "synthesized from these sources" attribution per post.
- **Truncation hurts SEO** — at 400–500 words of unique content per page (excerpt + claims + topic tags + structured data) we're well above thin-content thresholds. A/B test by submitting AdSense first, monitor organic traffic, expand if needed.
- **Bandwidth/scrape on `/api/public/*`** — Cloudflare bot rules + per-IP token bucket. Cache aggressively (Cloudflare edge cache, public, 1h+ TTLs since data is non-personalized).

---

## What this plan deliberately does not include

- Reopening `/discover` to public (use `/browse` instead — cleaner separation).
- Bulk auto-seed of catalog episodes (too expensive at 99% never-listened ratio).
- Server-side rendering of `/browse/*` (intentionally CSR + `noindex` — those pages don't need SEO).
- Publisher partnership outreach in Phases 1–4 (premature at current scale).
- Paid newsletter infrastructure (premature; design doesn't block it).
