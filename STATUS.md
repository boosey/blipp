# Phase 2-4 implementation status

**Branch**: `feat/content-surface-phase2-4`
**Worktree path**: `C:\Users\boose\projects\Blipp\code\blipp\.worktrees\feat-content-surface-phase2-4`
**Plan source of truth**: `docs/plans/2026-04-27-content-surface-plan.md` (on `main`, also visible from this worktree)

## Done (committed on this branch, off `main`)

| # | Phase | Commit | Notes |
|---|---|---|---|
| 1 | 2.2 Public API endpoints | `6370e5a` | `/api/public/{categories,categories/:slug/shows,shows/:slug,shows/:slug/episodes,recommendations/featured,recently-blipped,sample/:show/:episode}`. Tiered Cache-Control. Tighter rate limit (10/min) on featured + recently-blipped. Tests in `worker/routes/__tests__/public-catalog.test.ts`. |
| 6 | 4 schema | `e16a3d3` | `PulseEditor` (NOT_READY/READY/RETIRED), `PulsePost` (DRAFT→…→ARCHIVED), `EpisodePulsePost` join, `Distillation.claimsEmbedding`. Migration `prisma/migrations/20260428015106_add_pulse_blog/`. |
| 2 | 2.1 Browse routes | `968d804` | `/browse`, `/browse/category/:slug`, `/browse/show/:slug`. Forked from discover/podcast-detail (no `mode` props). Per-page noindex via `useDocumentMeta`. robots.txt disallows `/browse`. |
| 3 | 2.3 Sample player | `552abd1` | React `SamplePlayer` for SPA + vanilla JS variant in `renderEpisodePage` SSR. Web Audio gain-node fade-out. Always click-to-play (iOS gesture rules). |
| 4 | 2.4 Landing redesign | `7dfaa21` | Docked inline mini-player (no navigation → preserves iOS gesture). Recently Blipped rail. "Browse the catalog" → `/browse`. |
| 5 | 3 AdSense plumbing | `5788827` | `worker/lib/ads.ts` (`adsScriptTag`, `adsTxtBody`, `adsAllowedForPath`). `/ads.txt` route. `ADS_ENABLED` + `ADS_ROUTES` + `ADSENSE_PUBLISHER_ID` env. AdSense `<script>` injected into SSR `<head>` via `layout` adsScript param. Handoff doc `docs/handoff/PHASE_3_ADSENSE.md`. |
| 7 | 4 Pulse SSR | `b23a475` | `/pulse`, `/pulse/:slug`, `/pulse/by/:editor`, `/pulse/topic/:slug`. Markdown renderer in `worker/lib/pulse/markdown.ts`. Templates in `worker/lib/pulse/templates.ts`. Routes in `worker/routes/pulse.ts`. Sitemap updated. Routes 500 on PUBLISHED w/ empty `sourcesMarkdown` or NOT_READY editor. |

Plan refinement that landed on `main` (commit `ffde88c`): final phase-locked decisions appended to `docs/plans/2026-04-27-content-surface-plan.md`.

## In progress

- **Task 8: Embedding generation + Sunday digest cron**. Just started — no code written yet. Spec:
  - Add Workers AI embedding step in `worker/queues/distillation.ts` (after claims extraction, before completion). Persist 768-dim vector to `Distillation.claimsEmbedding`.
  - Add Sunday cron entry to `wrangler.jsonc`: `"0 14 * * 0"` (alongside the existing `*/5 * * * *`). Update both staging and prod.
  - Cron handler dispatches by `controller.cron` string. New handler `worker/queues/pulse-generate.ts`:
    - Cluster claims from last 7 days of completed distillations (cosine over embeddings, in TS).
    - Pick a topical angle from largest cluster.
    - LLM-draft a post via existing `lib/llm-providers.ts` (provider-agnostic).
    - Insert `PulsePost` with `status: DRAFT`, `mode: AI_ASSISTED`, populated `generationMeta`, link cited episodes via `EpisodePulsePost`.
  - **Hard gate**: cron no-ops if `count(PulsePost where status=PUBLISHED) < 6 OR count(PulsePost where status=PUBLISHED AND mode=HUMAN) < 4`. Per Phase 4.0 Rule 6 (first 4-6 posts must be human-written before any AI digest fires).
  - Tests: gate behavior, cluster picks, generationMeta payload shape.

## Pending

- **Task 9: Admin UI for Pulse review**. `/admin/pulse` list (filter by status), `/admin/pulse/:id` editor (rich text body, citation manager, scheduledAt picker, hero image upload, quoted-words counter enforcing 3:1 ratio + 50-word per-source cap, `wordCount` floor 800 ceiling 1500 warning). Buttons: save/review/approve/publish/reject(reason)/archive.
- **Task 10: Bidirectional linking** ("Featured in" placeholder activation in `renderEpisodePage`). Query `EpisodePulsePost` join, render up to 3 most recent linked PUBLISHED posts. The `<section data-pulse-featured-in></section>` placeholder is already in the template.
- **Task 11: Final verification + handoff doc**. Run typecheck + full test suite. Write `HANDOFF.md` at branch root summarizing all changes, what's blocked on user action, and merge instructions.

## Critical context for next session

- **No push to remote, no deploy, no merge to main.** User memory `feedback_no_auto_ci_deploy` — user pushes/deploys manually.
- **Phase 4 hardened rules (Phase 4.0)** are non-negotiable. Schema enforces some (PulseEditor FK, status enums); routes enforce others (sourcesMarkdown required at publish, NOT_READY editor blocks publish); the remaining word-count / 3:1 ratio / 50-word-per-source caps live in the admin UI (task 9). Cron gate (task 8) enforces "first 4-6 posts human-written before AI fires".
- **Don't write fake editor bios or fake Pulse posts**. PulseEditor row creation is admin work; first 4-6 posts must be human-written by the user.
- **Convention check before changing patterns**: route handlers use `c.get("prisma") as any` because Prisma middleware sets it; admin routes use `requireAdmin` middleware (already global on `/api/*` parent — don't double-wrap); queue handlers manage their own Prisma lifecycle.
- **iOS sample player verification on real device** is a hard merge gate per the plan. Code is shipped; user verifies before merge.

## Test status (last run before context save)

All new test files green:
- `worker/routes/__tests__/public-catalog.test.ts` — 14 tests
- `worker/lib/__tests__/html-templates.test.ts` — 16 tests (includes new sample-player block tests)
- `worker/lib/__tests__/ads.test.ts` — 11 tests
- `worker/lib/pulse/__tests__/markdown.test.ts` — 16 tests
- `worker/lib/pulse/__tests__/templates.test.ts` — 13 tests
- `worker/routes/__tests__/pulse.test.ts` — 11 tests

Typecheck clean across whole repo. Vite build succeeds.

Full suite was 1537 tests passing pre-changes. Have not re-run full suite since adding new tests, but new tests + typecheck + build all green.

## File-state notes

- `node_modules` is a real npm install in this worktree (junction-link to main was abandoned because main's `.bin` was empty).
- `src/generated/prisma/index.ts` barrel is regenerated; commit-ignored.
- `neon-config.env` was copied from main into the worktree to enable `db:migrate:new`.
- `.env` and `.dev.vars` were copied from main.
