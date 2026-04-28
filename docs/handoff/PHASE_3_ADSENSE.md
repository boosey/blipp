# Phase 3 — AdSense submission handoff

The code-side plumbing is in place. Everything that requires a Google account, a real publisher ID, or external account configuration is left for you to do. The steps below are what's left.

## What the code already does

- `/ads.txt` is served by the worker. It returns a placeholder line until `ADSENSE_PUBLISHER_ID` is configured. Once set, returns the standard AdSense authorization line: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`. Cached 1h.
- `<meta name="google-adsense-account" content="ca-pub-XXXXXXXX" />` already lives in `index.html` (was added in Phase 1.6). Edit that placeholder to the real publisher ID before submission.
- The AdSense `<script async src="...adsbygoogle.js?client=ca-pub-...">` is injected into the SSR `<head>` for `/p/*`, `/p/category/*`, and `/pulse/*` pages **only when** all of these are true:
  - `ADS_ENABLED=true`
  - The path matches a prefix in `ADS_ROUTES`
  - `ADSENSE_PUBLISHER_ID` is set (no `ca-` prefix)

  Implementation lives in `worker/lib/ads.ts`. Tested by `worker/lib/__tests__/ads.test.ts`.

- Defaults in `wrangler.jsonc` ship `ADS_ENABLED=false` for both staging and production. Nothing loads until you flip it.

## Submission steps (you do these)

### Before submitting

1. **Verify domain ownership in Google Search Console**. Add `podblipp.com` and complete DNS or HTML-tag verification. AdSense reviewers look at indexed content, not just live pages, so this comes first.
2. **Submit `https://podblipp.com/sitemap.xml`** in Search Console and wait for at least one crawl of `/p/*` content. The dynamic sitemap is already wired up (see `worker/routes/sitemap.ts`).
3. **Confirm there are ≥50 quality `/p/*` pages** with the Phase 1 treatment (truncated narrative, top-3 claims, JSON-LD, signup CTA, OG cards). Spot-check a few by pasting URLs into [Google's Rich Results Test](https://search.google.com/test/rich-results).

### Get the publisher ID

1. Sign in at <https://adsense.google.com/start/>.
2. Add `podblipp.com` as a site.
3. Google issues a publisher ID like `pub-1234567890123456`.
4. Configure **Funding Choices** (Privacy & messaging → Privacy messaging → European regulations). Required for EEA/UK consent. The script loads independently of `ADS_ENABLED`, so this is OK to set up before approval.
5. Submit the site for review.

### Install the publisher ID (once issued)

Replace placeholders in three places:

1. `index.html` — line 28: `content="ca-pub-XXXXXXXX"` → `content="ca-pub-1234567890123456"`.
2. `wrangler.jsonc` staging vars (around line 28): `"ADSENSE_PUBLISHER_ID": "pub-1234567890123456"`.
3. `wrangler.jsonc` production vars (around line 217): same value.

Then redeploy. `ADS_ENABLED` stays `"false"` — `ads.txt` and the `<meta>` verification tag are enough for review.

### After approval

Do **not** flip `ADS_ENABLED=true` site-wide on day one. Stage the rollout:

1. **Week 1** — set `ADS_ENABLED=true` and `ADS_ROUTES="/p"`. Deploy. Watch:
   - Pageviews in the Worker analytics dashboard
   - AdSense earnings + invalid-traffic warnings
   - Organic traffic (Search Console)

2. **Week 2** — once `/pulse/*` has shipped (Phase 4) and has real content, extend: `ADS_ROUTES="/p,/pulse"`. Deploy. Same monitoring.

3. **Week 3+** — if conversion on landing isn't tanking and the value prop still reads cleanly, extend to landing: `ADS_ROUTES="/p,/pulse,/"`. The `/` prefix is handled specially by the helper so it does NOT match `/api/*`, `/admin/*`, or `/__clerk/*` — only public marketing pages.

### Kill switch

Set `ADS_ENABLED="false"` in `wrangler.jsonc` and redeploy. All ad scripts disappear immediately on next page render. Existing pages cached at the edge will continue serving ads until their `s-maxage` window expires (`/p/*` is 1h with stale-while-revalidate of 1h).

For a faster purge, also run `wrangler purge` on the affected routes — but typically the env flip + 1h cache window is acceptable.

## Files touched in Phase 3

- `worker/lib/ads.ts` — new helper (gating logic + script tag generator).
- `worker/lib/__tests__/ads.test.ts` — 11 tests covering all gating combinations.
- `worker/types.ts` — added `ADS_ENABLED`, `ADS_ROUTES`, `ADSENSE_PUBLISHER_ID` to `Env`.
- `worker/index.ts` — `/ads.txt` route.
- `worker/lib/html-templates.ts` — threaded `adsScript` through `layout`, `EpisodePageData`, `ShowPageData`, `CategoryPageData`.
- `worker/routes/public-pages.ts` — calls `adsScriptTag(c.env, c.req.path)` for each render.
- `wrangler.jsonc` — added vars for both staging and production.

## What this handoff explicitly does NOT do

- Submit your site to AdSense.
- Submit the sitemap to Search Console.
- Configure Funding Choices CMP.
- Pick a real publisher ID.
- Add the AdSense Auto Ads markup (we only inject the loader script — placement is up to AdSense Auto Ads or future ad-unit components).
- Flip `ADS_ENABLED` to `true`.

These all require your Google account access and product judgment.
