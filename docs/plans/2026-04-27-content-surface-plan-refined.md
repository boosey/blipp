# Implementation plan — Content surface, Phase 1

## Context

The strategic plan at `docs/plans/2026-04-27-content-surface-plan.md` lays out a multi-phase content/SEO/conversion roadmap. **Phase 1 is the AdSense-critical week**: harden `/p/*` quality (truncation + claims + JSON-LD + OG), add three-CTA hierarchy to the landing hero, and drop in an AdSense verification meta. Phases 2–4 (browse surface, sample player, Pulse blog) are explicitly out of scope for this PR — they each get their own worktree later.

I cross-checked the plan against the codebase. Two corrections worth flagging up front:

- **Reuse the existing scoring helper.** `worker/lib/distillation.ts:160` already implements `c.importance * 0.7 + c.novelty * 0.3` inside `selectClaimsForDuration`. Extract it as `scoreClaim(c)` so `public-pages.ts` and `selectClaimsForDuration` share a single source of truth.
- **`ADS_ENABLED` doesn't exist in `wrangler.jsonc` yet.** The plan cites lines 26 and 216, but those are `WORKER_SCRIPT_NAME` and a KV binding. Phase 1 only needs the static `<meta name="google-adsense-account">` in `index.html`; the runtime flag is a Phase 3 concern. Don't touch `wrangler.jsonc` in this PR.

Two implementation notes:

- The existing `pageText` cascade at `public-pages.ts:53–62` (clip narrative → concatenated claims → episode description) must run **before** truncation. Truncate the resolved `pageText`, not inside the cascade.
- `renderEpisodePage` already does `narrativeText.slice(0, 160)` for the meta description (`html-templates.ts:115`). That stays — it's the SEO description tag. The new ~150–200-word excerpt is a separate body concept.

## Shape of the change

```
                                  ┌──────────────────────────────────────────┐
                                  │  worker/lib/distillation.ts              │
                                  │   + export scoreClaim(c)                 │
                                  │     (extracted from selectClaimsForDur.) │
                                  └──────────────┬───────────────────────────┘
                                                 │ reused by
                                                 ▼
   ┌────────────────────────────────┐    ┌───────────────────────────────────┐
   │ worker/routes/public-pages.ts  │    │ worker/lib/html-templates.ts      │
   │ (episode handler, lines 30-83) │───▶│ renderEpisodePage(...)            │
   │  - resolve pageText (existing) │    │  + narrativeExcerpt section       │
   │  + truncate to ~150-200 words  │    │  + "Top takeaways" <ol>           │
   │  + pick top-3 claims via       │    │  + signup CTA card w/ ?next=...   │
   │    scoreClaim                  │    │  + JSON-LD: PodcastEpisode +      │
   │  + pass excerpt + claims +     │    │    Article + BreadcrumbList       │
   │    relatedShows + moreFromShow │    │  + OG/Twitter image fallback     │
   │    to renderEpisodePage        │    │  + "More from this show" cards    │
   └────────────────────────────────┘    │  + "Related in [category]" cards  │
                                         │  + "Featured in" placeholder      │
                                         └───────────────────────────────────┘

   ┌────────────────────────────────┐    ┌───────────────────────────────────┐
   │ worker/routes/public-pages.ts  │───▶│ worker/lib/html-templates.ts      │
   │ (show handler, lines 91-129)   │    │ renderShowPage  + JSON-LD         │
   │ (category handler, 132-180)    │    │ renderCategoryPage + JSON-LD      │
   └────────────────────────────────┘    └───────────────────────────────────┘

   ┌────────────────────────────────┐
   │ src/pages/landing.tsx          │   independent — no shared deps
   │  - tighten hero copy           │
   │  + 3 CTAs (sample / signup /   │
   │    browse-placeholder)         │
   │  + "Hear a sample" → curated   │
   │    /p/:show/:ep?sample=1       │
   └────────────────────────────────┘

   ┌────────────────────────────────┐
   │ index.html                     │   one-line addition
   │  + google-adsense-account meta │
   └────────────────────────────────┘
```

## Files to modify

### 1. `worker/lib/distillation.ts` — extract the scoring helper

Add an exported `scoreClaim` and use it inside `selectClaimsForDuration`:

```ts
export function scoreClaim(c: { importance: number; novelty: number }): number {
  return c.importance * 0.7 + c.novelty * 0.3;
}
```

Replace the inline `c.importance * 0.7 + c.novelty * 0.3` at line 160 with `scoreClaim(c)`. No behavior change; just makes the formula reusable.

### 2. `worker/routes/public-pages.ts` — episode handler

In the episode handler (lines 20–88):

1. After the existing `pageText` cascade resolves a non-empty string (current line 63), compute a `narrativeExcerpt` by trimming to ~150–200 words at the nearest sentence boundary, ending with `…`. Implementation: split into sentences (regex `/[^.!?]+[.!?]+/g`), accumulate while running word count stays ≤ 200, append `…`. If no sentence boundary fits within range, hard-cut at 200 words.
2. Compute `topClaims`: read `episode.distillation?.claimsJson`, validate each entry has `importance` and `novelty` (numbers 1–10), sort by `scoreClaim(c)` desc, take 3, project to `{ text: c.claim, topic?: c.topic }`. Fall back to position order for any claim missing scores. If `claimsJson` is absent (e.g., the cascade fell through to `episode.description`), pass `topClaims: []` and the template skips the section.
3. Fetch `moreFromShow`: up to 5 most recent siblings — `prisma.episode.findMany` with `podcastId`, `publicPage: true`, `slug: { not: episode.slug }`, `orderBy: { publishedAt: "desc" }`, `take: 5`, selecting `{ title, slug, publishedAt }`.
4. Fetch `relatedInCategory`: if `podcastCategory` resolved, find 3 other shows in the same category with at least one public episode. Reuse the pattern from the category handler (`prisma.podcastCategory.findMany` + filter by `_count.episodes` > 0), exclude current podcast, `take: 3`.
5. Add `signupNextPath = `/p/${podcast.slug}/${episode.slug}` and pass through.

Pass all five new fields to `renderEpisodePage` via the `EpisodePageData` interface.

### 3. `worker/lib/html-templates.ts` — episode template

Extend `EpisodePageData` (line 89) with:

```ts
narrativeExcerpt: string;   // truncated, used in body
topClaims: { text: string; topic?: string }[];
moreFromShow: { title: string; slug: string; publishedAt?: Date | null }[];
relatedInCategory: { title: string; slug: string; imageUrl?: string | null }[];
signupNextPath: string;
```

In `renderEpisodePage` (line 103):

- Replace the body's narrative paragraphs (line 156) with `narrativeExcerpt` paragraphs.
- After the narrative div, render a "Top takeaways" `<h2>` + `<ol>` of `topClaims` (skip if empty).
- Replace the existing CTA card (lines 157–160) with a "Sign up to read or listen to the full Blipp" card linking to `/sign-up?next=${encodeURIComponent(signupNextPath)}`.
- Below the CTA, render "More from this show" and "Related in [category]" sections using existing `.card-grid`/`.card` styles (lines 70–74). Skip empty sections.
- Render an empty `<section data-pulse-featured-in>` placeholder for Phase 4 — no DOM unless populated.

For JSON-LD (line 117), emit a single `<script type="application/ld+json">` containing an `@graph` array with three objects:

- `PodcastEpisode` (current shape, retained).
- `Article` with `headline`, `author: { "@type": "Organization", name: "Blipp" }`, `publisher` likewise, `datePublished` from `publishedAt`, `mainEntityOfPage` = canonical URL, `mentions` = the PodcastEpisode by `@id`. Give the PodcastEpisode an `@id` so `mentions` can reference it.
- `BreadcrumbList` mirroring the existing breadcrumb (Home → Show → Episode), with category injected if present.

For OG/Twitter:

- The `layout` helper already emits `og:*` and `twitter:*` (lines 39–47). Pass `description = narrativeExcerpt.slice(0, 160).replace(/\n/g, " ")` so OG description matches the new excerpt instead of raw `narrativeText`.
- Update the `ogImage` resolution: prefer episode-specific artwork if available (the schema doesn't currently store per-episode artwork, so fall back to `podcastImageUrl`, then to `${SITE_URL}/og-default.png` — already the existing fallback). Add an explicit `twitter:image` meta (currently missing — `twitter:card=summary_large_image` is set but there's no image tag). Add it inside `layout`.

### 4. `worker/lib/html-templates.ts` — show + category JSON-LD

`renderShowPage` (line 178): the existing `PodcastSeries` JSON-LD stays. Wrap it in an `@graph` with a `BreadcrumbList` (Home → Category? → Show).

`renderCategoryPage` (line 236): currently emits no JSON-LD. Add `CollectionPage` + `BreadcrumbList`.

### 5. `src/pages/landing.tsx` — three-CTA hero

In the hero block (lines 84–203):

- Tighten the body copy at lines 158–164 so the CTA fits above the fold on iPhone 16 (393×852 logical). Concretely: cut the body paragraph from ~50 words to ~25, drop the redundant "Hear something great? Tap through…" sentence (it's repeated in the value-prop section).
- Replace the single CTA at lines 167–194 with three buttons in a vertical stack on mobile / horizontal row on `sm:` and up:
  - **Primary**: "Hear a sample" → `navigate(\`/p/\${SAMPLE_SHOW_SLUG}/\${SAMPLE_EPISODE_SLUG}?sample=1\`)`. The actual `?sample=1` autoplay handler is Phase 2; for now the link just navigates to the sample-curated `/p/*` page (which will play the truncated narrative with the existing sign-up CTA).
  - **Secondary**: "Start Blipping" → existing `SignInButton` / `navigate("/home")` flow.
  - **Tertiary**: "Browse the catalog" → `/p` (the `<footer>` in `html-templates.ts:82` already links to `/p`; on the React side, route to the same path — a real `/browse` lands in Phase 2). Render as a text link, not a button.
- `SAMPLE_SHOW_SLUG` and `SAMPLE_EPISODE_SLUG` are constants at the top of the file. Pick a known-good public episode (verify with `prisma.episode.findFirst({ where: { publicPage: true } })` against staging — pick something with a long, polished narrative).

### 6. `index.html` — AdSense verification

Add `<meta name="google-adsense-account" content="ca-pub-XXXXXXXX">` inside `<head>`. The publisher ID is the unblocking input for this line — see open question below.

## Tests (net-new — no existing coverage)

There are currently zero tests for `worker/routes/public-pages.ts` or `worker/lib/html-templates.ts`. Use the patterns from `tests/helpers/mocks.ts` and existing route tests like `worker/routes/__tests__/podcasts.test.ts`.

- `worker/lib/__tests__/distillation.test.ts` (or extend if it exists): assert `scoreClaim({ importance: 8, novelty: 4 }) === 6.8`, and that `selectClaimsForDuration` output is unchanged for a fixed input.
- `worker/lib/__tests__/html-templates.test.ts`: snapshot or string-match `renderEpisodePage` output for: presence of `Top takeaways` `<ol>` with three `<li>`, signup CTA href contains `?next=/p/...`, JSON-LD parses and contains the three `@type`s, OG description matches passed excerpt, breadcrumb includes category when provided.
- `worker/routes/__tests__/public-pages.test.ts`: mock prisma to return episode with `claimsJson` of mixed scores, assert top-3 are returned in score order. Second case: episode with `description`-only fallback (no clips, no distillation), assert `topClaims` is empty and template still renders.
- Truncation unit test inside the templates file's helper export: 250-word input → ≤ 200 words, ends with `…`, ends at sentence boundary when one exists in range.

## Verification

1. `npm run typecheck && npm test` — all green.
2. Run dev server: `npm run dev`. Open `http://localhost:8787/p/<show>/<ep>` for a known public episode in your local DB. Confirm:
   - Body shows truncated excerpt ending in `…` (eyeball ≤ 200 words).
   - "Top takeaways" lists three claims.
   - Sign-up CTA links to `/sign-up?next=...`.
   - "More from this show" + "Related in …" cards render when data exists.
3. View source → copy the JSON-LD block → paste into <https://search.google.com/test/rich-results>. All three types should validate.
4. Open landing page in DevTools at iPhone 16 viewport (393×852). Hero + three CTAs + scroll indicator must be above the fold.
5. Paste a `/p/<show>/<ep>` URL into iMessage and X compose — OG card renders with image and the new excerpt as description.
6. Confirm `index.html` ships the AdSense meta after `npm run build` (`grep google-adsense dist/index.html`).
7. Sitemap unaffected — `curl localhost:8787/sitemap.xml` should still include the same URLs (no new browse paths in Phase 1).

## Open question (blocks step 6)

The AdSense publisher ID (`ca-pub-XXXXXXXX`). If not yet issued, ship steps 1–5 in this PR and add the meta in a follow-up one-liner.

## Out of scope (later phases)

- `/browse/*` routes, public catalog API, audio sample player, landing-page redesign visuals (Phase 2).
- `ads.txt`, Funding Choices CMP, `ADS_ENABLED` runtime flag in `wrangler.jsonc` (Phase 3).
- Pulse blog, `PulsePost` model, admin review queue, `featuredIn` activation of the placeholder dropped in step 3 (Phase 4).
