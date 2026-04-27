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

---

## Phase 2 — final pre-implementation decisions

### 2.1 Browse components — fork, do NOT add `mode` props

`discover.tsx` is 672 lines, `podcast-detail.tsx` is 845 lines. Threading a `mode: "public" | "authenticated"` prop through both would explode conditional logic and risk auth-mode regressions to the existing user experience. Reject the original plan's `mode` prop approach.

**Decision**:
- Extract leaf primitives (`PodcastCard`, `EpisodeCard`, `ScrollableRow`) — most already live in `src/components/`.
- Build `/browse/*` with NEW page components in `src/pages/browse/` that compose those primitives. No conditional auth branches.
- Authenticated users land on `/discover` as today; unauthenticated users land on `/browse`. The router decides; the components don't care.
- Acceptance: zero new conditionals in `discover.tsx` or `podcast-detail.tsx`. If you find yourself adding one, stop and refactor the primitive instead.

### 2.2 Public API — concrete cache TTLs and rate limits

Use `caches.default` (Cloudflare Cache API) inside the worker, keyed by full URL.

| Endpoint | TTL | Rationale |
|---|---|---|
| `/api/public/categories` | 24h | Categories rarely change |
| `/api/public/categories/:slug/shows` | 1h | Subscriber counts shift slowly |
| `/api/public/shows/:slug` | 1h | Episode list freshness |
| `/api/public/shows/:slug/episodes` | 1h | Same |
| `/api/public/recommendations/featured` | 15m | Editorial-driven |
| `/api/public/recently-blipped` | 5m | Landing rail must feel live |

Rate limiting:
- Per-IP token bucket via Durable Object (or KV-backed counter): 60 req/min, burst 30.
- `/api/public/recommendations/featured` and `/api/public/recently-blipped` get tighter buckets (10 req/min) to discourage scraping the editorial layer.
- Cloudflare bot rules at zone level on top of that.

### 2.3 Sample player — iOS Safari gesture reality check ⚠️

**The original plan is wrong about autoplay-with-sound across navigation.** iOS Safari only honors a user gesture for media in the same synchronous frame on the same page. A "Hear a sample" click that navigates to a different route and *then* tries to autoplay-with-sound will be blocked on iOS.

**Revised approach (split by surface)**:
- **Landing**: "Hear a sample" opens an inline docked mini-player on the landing page itself — no navigation. The original click satisfies the gesture. After the sample ends, the player CTA becomes "Sign up to hear more". This is the most important conversion path; do not break it on iOS.
- **`/p/:show/:episode` for unauth visitors**: arriving from search has no gesture context. Show a prominent "▶ Tap to play sample" button. No autoplay attempt. Drop `?sample=1` autoplay-on-arrival logic; keep only the URL fragment to scroll to the player.
- **`/browse/show/:slug`**: same as `/p/*` — click-to-play.

`?sample=1` URL param is retired in Phase 2 (defined in Phase 1 decisions but rendered moot once the inline mini-player exists on landing). Keep `#sample` as a scroll-to-player anchor only.

### 2.4 Sample audio segment

Briefing has no segment-timing fields today. Don't block Phase 2 on adding one.

**Decision**: Phase 2 plays the **first 30s of the Blipp audio**, fade-out via Web Audio gain node. Brand intro cruft is tolerable for v1.

If sample CTR underperforms, add `Briefing.sampleStartSeconds` (Int, default 0) populated by the distillation worker from a future "highlight timestamp" pass. Defer that until data justifies it.

### 2.5 Landing redesign — scope cut

"Landing redesign" in the original plan is ambiguous. Lock the scope:
- **In Phase 2**: hero rewrite + 3 CTAs + inline sample mini-player + "Recently Blipped" 4–6 card rail + below-fold copy tightening.
- **NOT in Phase 2**: full visual reskin, illustration system, motion design, dark-mode polish. Those move to Phase 5+.

### 2.6 Indexability + sitemap

- `/browse/*`: `<meta name="robots" content="noindex, follow">`. Excluded from `sitemap.xml`. Confirmed.
- `/p/*`: indexable, in sitemap. Already in place.
- The catalog itself is not the SEO play — the synthesized Blipp narratives are. Don't second-guess this.

### 2.7 Phase 2 acceptance — additions

- iOS Safari (real device, not simulator) test of the landing inline sample player. Documented pass/fail in PR description.
- `/api/public/*` returns identical bytes for two requests within the cache window (verifies cache layer is wired).
- Per-IP rate limiter returns 429 after burst exhausted, recovers within 60s.

---

## Phase 3 — final pre-implementation decisions

### 3.1 ads.txt content

At the site root: `google.com, pub-XXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` (replace pub ID once issued). Served by the worker as a static text response, NOT from `public/` — keeps it editable per env.

### 3.2 Funding Choices CMP

EEA/UK consent is non-negotiable for AdSense. Configure Funding Choices in the AdSense dashboard before submission. The CMP script loads regardless of `ADS_ENABLED` (it's required even when ads are off, to gate future ad loads). This is OK — Funding Choices is lightweight when no ads are present.

### 3.3 Search Console first

Verify `podblipp.com` in Google Search Console **before** AdSense submission. Submit `sitemap.xml`. Wait for at least one successful crawl of `/p/*` content before submitting AdSense. AdSense reviewers look at indexed content, not just live pages.

### 3.4 Staged ad rollout post-approval

Do NOT flip `ADS_ENABLED=true` globally on day 1 of approval.

1. **Week 1**: enable ads only on `/p/*` (the indexable surface). Monitor pageviews, AdSense earnings, organic traffic.
2. **Week 2**: extend to `/pulse/*` (when Phase 4 ships).
3. **Week 3+**: extend to landing if landing-page ads don't tank conversion.

Implement as a per-route check, not a single boolean. New env: `ADS_ROUTES` = comma-separated allowlist (`/p,/pulse`). The existing `ADS_ENABLED` becomes the kill switch.

---

## Phase 4 — final pre-implementation decisions

### 4.0 Adversarial framing — Pulse is the riskiest part of this plan ⚠️

Google's Helpful Content system and 2024+ spam policies treat "AI-synthesized derivative content" harshly. "Synthesizing other people's podcasts" is exactly the pattern that gets sites algorithmically demoted or, in extremes, manually deindexed. The original plan's mitigation ("manual review queue, cross-episode framing, byline = Blipp Pulse") is **insufficient** because:

1. "Blipp Pulse" as a byline is faceless and fails E-E-A-T (no Experience, Expertise, Authoritativeness, Trustworthiness signals).
2. Manual review doesn't change Google's algorithmic classification of the *content itself* if the content reads as machine-generated summary.
3. AdSense terms (separately from search rank) prohibit "auto-generated content with little or no value." Pulse can run afoul even if it doesn't get deindexed.

**Hardened mitigations (all required, not optional)**:
- Real human editor byline. Add `PulseEditor` table (id, name, slug, bio, avatar, twitterHandle, linkedinUrl). Each post FK to PulseEditor. Public `/pulse/by/:editor` page lists their work. Seed with one real editor (Alex) at minimum.
- Per-post **original analysis ratio**: ≥ 200 words of original commentary per 100 words of source quotation (3:1). Hard rule, enforced manually in review.
- Per-post **fair-use cap**: ≤ 50 words quoted from any single source episode. No transcript reproduction.
- Word count target: 800–1500 words. Anything shorter reads as filler.
- Each post ships with explicit "Sources" footer linking to source episodes + show RSS.
- The first 4–6 seed posts are **fully human-written** (no AI draft), to establish voice and editorial authority before any AI-assisted post goes live.

If we cannot commit to all six, **kill Phase 4 and revisit**. The downside risk (AdSense termination, site-wide deindex) outweighs the upside.

### 4.1 Routes

- `/pulse` — index, paginated, most recent first.
- `/pulse/:slug` — full post.
- `/pulse/by/:editor` — editor archive page (E-E-A-T signal).
- `/pulse/topic/:slug` — topic tag archive.
- All SSR via Hono + `renderPulsePost` modeled on `renderEpisodePage`. Indexable. JSON-LD `BlogPosting`.

### 4.2 Editorial pipeline — schema

```
PulseEditor (id, slug, name, bio, avatarUrl, twitterHandle, linkedinUrl, createdAt)
PulsePost (id, slug, title, subtitle, body, status, editorId FK,
           heroImageUrl, topicTags String[], wordCount,
           sourceClaimIds String[], generationMeta Json,
           scheduledAt, publishedAt, createdAt, updatedAt,
           editorReviewedAt, editorRejectedReason,
           seoTitle, seoDescription)
BriefingPulsePost (briefingId, pulsePostId, displayOrder) -- join table for bidirectional linking
```

`status` enum: `DRAFT` → `REVIEW` → `SCHEDULED` → `PUBLISHED` → `ARCHIVED`.

### 4.3 Topic clustering — reuse existing embeddings

`PodcastSeed.embedding` already stores 768-dim Workers AI embeddings. For Phase 4:
- Add `Distillation.claimsEmbedding` Json? — generated alongside `claimsJson` via the same Workers AI model. Cluster by cosine similarity at digest time.
- This costs one extra embedding call per distillation. Cheap.
- Avoid pgvector. Cosine over a few hundred vectors per digest is trivial in TypeScript.

### 4.4 Digest cron

Adding a second cron entry to `wrangler.jsonc` is cleanest:
```
"crons": ["*/5 * * * *", "0 14 * * 0"]  // existing + Sunday 2pm UTC
```
The scheduled handler dispatches by `controller.cron` string. New handler in `worker/queues/pulse-generate.ts`. Generation produces a DRAFT only; nothing publishes without admin click.

### 4.5 Admin review queue

`/admin/pulse`:
- List view: filter by status, sort by `createdAt` desc.
- `/admin/pulse/:id`: rich text editor (TipTap or similar — confirm during build), citation manager (linked Briefings), `scheduledAt` picker, hero image upload to R2.
- Buttons: "Save draft", "Send to review", "Approve & schedule", "Publish now", "Reject (regenerate)", "Archive".
- "Reject" stores `editorRejectedReason` for tuning prompts later.

### 4.6 Bidirectional linking

The Phase 1.4 "Featured in" placeholder activates here. Query:
- `renderEpisodePage`: `prisma.briefingPulsePost.findMany({ where: { briefingId }, include: { pulsePost: true } })` → render up to 3 most recent.
- Cap at 3 per episode page to keep the section tight.

### 4.7 JSON-LD additions

`BlogPosting` per post with:
- `author` → `Person` referencing the PulseEditor (with `sameAs` for twitter/linkedin).
- `publisher` → `Organization` Blipp.
- `mentions[]` → each cited `PodcastEpisode`.
- `articleSection` → primary topic tag.
- `wordCount`.
- `keywords` → all topic tags joined.

### 4.8 Soft launch sequencing

- **Pulse does NOT appear in the main app nav until** ≥ 10 published posts AND ≥ 100 daily organic visits to `/pulse/*`.
- Footer link from day 1.
- `/p/*` "Featured in" section auto-appears once linked posts exist.
- Pulse in `sitemap.xml` from day 1.
- No social/email campaign until 4–6 seed posts are live.

### 4.9 Phase 4 acceptance — additions

- ≥ 4 fully human-written seed posts published before any AI-assisted post.
- All posts pass Rich Results Test for `BlogPosting`.
- Editor profile page renders with sameAs links resolving to real social profiles.
- Manual spot-check: pick one AI-assisted post and verify the 3:1 analysis-to-quotation ratio holds.

---

## Cross-phase risks the user must explicitly accept before starting

1. **AdSense rejection on first submission**. /p/* alone is ~1k pages of synthesized content; reviewer might still flag as derivative. Mitigation: have ≥ 50 published `/p/*` pages with full Phase 1 quality treatment before submitting. Acceptance: if rejected, address feedback and resubmit — do not pivot away from the strategy.
2. **Pulse deindex / AdSense termination**. Real possibility if hardened mitigations from 4.0 are not all met. Acceptance: kill Phase 4 if we cannot meet all six requirements.
3. **Browse traffic that never converts**. `/browse/*` could become a content sink that drains crawl budget and converts at <0.5%. Mitigation: ship Phase 2 with conversion tracking from day 1 — `/browse` → signup vs landing → signup. Pull `/browse` from the public funnel (404 it for unauth) within 30 days if it underperforms landing by >2x.
4. **Sample player iOS regressions** post-launch. Real-device testing in 2.7 is the gate; no merge to main without it.
