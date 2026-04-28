# Phase 2-4 implementation handoff

**Branch**: `feat/content-surface-phase2-4` (off `main` at `cc5f02b`)
**Worktree**: `C:\Users\boose\projects\Blipp\code\blipp\.worktrees\feat-content-surface-phase2-4`
**Plan**: `docs/plans/2026-04-27-content-surface-plan.md`

## Status

All 11 planned tasks are committed. Tests + typecheck + Vite build are green:

- 175 test files, **1656 tests passing** (was 1537 on `main`).
- `tsc --noEmit` clean.
- `vite build` succeeds (no new chunk-size regressions; pre-existing 500 kB warnings are unchanged from `main`).

## Commits on the branch

```
d584732  feat(public): activate "Featured in" section on /p/* (Phase 4 / Task 10)
9c27072  feat(admin): Pulse review queue UI + editorial validators (Phase 4 / Task 9)
0cfb417  feat(pulse): embedding step + Sunday digest cron (Phase 4 / Task 8)
71ef587  chore(status): save progress for context-clear handoff
b23a475  feat(pulse): SSR routes for the Pulse blog (Phase 4)
5788827  feat(adsense): plumbing for staged AdSense rollout (Phase 3)
7dfaa21  feat(landing): inline sample player + Recently Blipped rail (Phase 2.4)
552abd1  feat(sample-player): tap-to-play sample on /p/* and /browse/show/* (Phase 2.3)
968d804  feat(browse): public /browse/* surface (Phase 2.1)
e16a3d3  feat(pulse): schema for Pulse blog (Phase 4)
6370e5a  feat(public-api): browse-surface JSON endpoints (Phase 2.2)
```

## What shipped (by phase)

### Phase 2 — Browse surface + sample player + landing
- **2.1 Browse routes** (`968d804`): `/browse`, `/browse/category/:slug`, `/browse/show/:slug`. New page components in `src/pages/browse/` — no `mode` prop threading into `discover.tsx`/`podcast-detail.tsx`. Per-page `noindex`. `robots.txt` disallows `/browse`.
- **2.2 Public API** (`6370e5a`): `/api/public/{categories, categories/:slug/shows, shows/:slug, shows/:slug/episodes, recommendations/featured, recently-blipped, sample/:show/:episode}`. Tiered Cache-Control. Per-IP token bucket; tighter (10/min) on `featured` + `recently-blipped`.
- **2.3 Sample player** (`552abd1`): React `SamplePlayer` for SPA + vanilla JS variant in `renderEpisodePage` SSR. Web Audio gain-node fade-out. Click-to-play only (iOS gesture rules — autoplay-with-sound across navigation does not work).
- **2.4 Landing redesign** (`7dfaa21`): docked inline mini-player (no navigation → preserves iOS gesture). Recently Blipped 4–6 card rail. "Browse the catalog" → `/browse`.

### Phase 3 — AdSense plumbing
- **Phase 3** (`5788827`): `worker/lib/ads.ts` (`adsScriptTag`, `adsTxtBody`, `adsAllowedForPath`). `/ads.txt` route. `ADS_ENABLED` + `ADS_ROUTES` + `ADSENSE_PUBLISHER_ID` env on staging + prod (currently off). AdSense `<script>` injected into SSR `<head>` only when allowed for the route. Operator handoff doc at `docs/handoff/PHASE_3_ADSENSE.md`.

### Phase 4 — Pulse blog
- **4 schema** (`e16a3d3`): `PulseEditor` (NOT_READY/READY/RETIRED), `PulsePost` (DRAFT/REVIEW/SCHEDULED/PUBLISHED/ARCHIVED + HUMAN/AI_ASSISTED), `EpisodePulsePost` join, `Distillation.claimsEmbedding`. Migration `20260428015106_add_pulse_blog`.
- **4 SSR** (`b23a475`): `/pulse`, `/pulse/:slug`, `/pulse/by/:editor`, `/pulse/topic/:slug`. Markdown renderer in `worker/lib/pulse/markdown.ts`. Templates in `worker/lib/pulse/templates.ts`. Routes in `worker/routes/pulse.ts`. Sitemap updated. Routes 500 on PUBLISHED w/ empty `sourcesMarkdown` or NOT_READY editor (the SSR enforces a subset of Phase 4.0 rules at request time, in addition to admin-side blockers).
- **Task 8 — embeddings + cron** (`0cfb417`): distillation worker computes a 768-dim Workers AI centroid embedding over claim texts and persists to `Distillation.claimsEmbedding` (non-fatal — episodes without an embedding don't participate in clustering that week). New `worker/queues/pulse-generate.ts`: clusters last 7 days of distillation embeddings (cosine ≥ 0.65, greedy), picks the largest cluster (≥3 members), drafts an `AI_ASSISTED` `PulsePost` via the `narrative` stage LLM chain, and links cited episodes. Hard editorial gate enforces Phase 4.0 Rule 6 (≥6 PUBLISHED, ≥4 of those HUMAN). `wrangler.jsonc` adds `0 14 * * 0` to staging + prod. `scheduled()` dispatches by `event.cron`. Seed registers the `pulse-generate` CronJob row.
- **Task 9 — admin Pulse UI** (`9c27072`): `worker/lib/pulse/validation.ts` runs the Phase 4.0 hardened rules and returns structured findings. `worker/routes/admin/pulse.ts` exposes list, get, patch (with body/quotes/citations), state transitions (review / schedule / publish / reject / archive), and editor CRUD. Publish/schedule transitions hard-fail when validation isn't ok. `src/pages/admin/pulse.tsx` + `src/pages/admin/pulse-detail.tsx` provide a list with status filter and a full editor form (markdown body, per-source quote tracker with cap warnings, ratio attestation checkbox, validation panel, six transition buttons). Sidebar gets a top-level **Pulse** entry.
- **Task 10 — bidirectional linking** (`d584732`): `renderEpisodePage` now takes `featuredInPosts`. The `/p/:show/:episode` route queries `EpisodePulsePost` filtered to PUBLISHED posts (capped at 3), and the template renders a "Featured in" section under related shows. Empty list → section omitted entirely.

## What needs human action before merge

1. **Real-device iOS sample player check** (Phase 2.7 acceptance gate). Plan section "Phase 2.7" calls this out explicitly: "iOS Safari (real device, not simulator) test of the landing inline sample player. Documented pass/fail in PR description." Code is shipped; this is a gate the user owns. If the inline mini-player breaks on real iOS Safari, the Phase 2.4 commit needs a fix-up before merging the branch.

2. **Pulse seed posts** (Phase 4.0 Rule 6). The cron is wired and self-gates. It will silently no-op until both:
   - ≥6 `PulsePost` with `status = PUBLISHED`, AND
   - ≥4 of those have `mode = HUMAN`.
   The user is the one writing those posts. The admin UI at `/admin/pulse` is ready for it. Do **not** seed or backfill these from any AI source — the entire premise of Rule 6 is that the editorial voice is established by real human writing first.

3. **PulseEditor row + bio** (Phase 4.0 Rule 1). The cron and admin UI both refuse to publish posts whose editor isn't `READY`. The user must:
   - Create at least one `PulseEditor` (admin UI: top-level Pulse → Editors).
   - Fill in bio (≥200 words for E-E-A-T) + at least one of twitterHandle / linkedinUrl / websiteUrl.
   - Flip status to `READY` via the admin UI.
   The schema starts editors as `NOT_READY` and the create endpoint forces that, even if the request payload claims otherwise.

4. **Pulse LLM model chain configuration** (Admin → AI Models). The cron uses the `narrative` AIStage model chain (since "narrative" already represents long-form generation). Confirm primary model is set in Admin > AI Models > Narrative Generation. If you want Pulse on a different model, split it later — Task 8 deliberately reused `narrative` to avoid an AIStage enum migration.

5. **CronJob registration on staging/prod**. The seed file (`prisma/seed.ts`) registers `pulse-generate` with `defaultIntervalMinutes: 360` (6h safety floor). On staging and prod, this row needs to exist for `runJob` to dispatch the Sunday cron. Either re-run the seed or manually upsert:
   ```sql
   INSERT INTO "CronJob" (id, "jobKey", label, description, enabled, "intervalMinutes", "defaultIntervalMinutes")
   VALUES (gen_random_uuid()::text, 'pulse-generate', 'Pulse Digest Generator',
           'Sunday weekly digest cron — clusters last 7 days of distillation embeddings and drafts an AI_ASSISTED PulsePost. Self-gates on Phase 4.0 Rule 6 (≥6 published, ≥4 human).',
           true, 360, 360);
   ```

6. **`/sign-up?next=` route** — the SSR templates already use this. Confirm Clerk's hosted sign-up handles the `?next=` redirect on staging before merging, since the new `/p/*` and Pulse pages emit signup CTAs that rely on it (no change from Phase 1; just re-verify).

7. **AdSense submission** (Phase 3 follow-up — out of branch scope). Phase 1+2+4 should be live ~1 week before submission so Googlebot has crawled the new `/p/*` quality treatment.

## Deliberately deferred (not in this branch)

- **TipTap rich text editor for Pulse**. The plan mentions "TipTap or similar — confirm during build". Built with a markdown textarea instead, since the SSR pipeline already renders markdown (`worker/lib/pulse/markdown.ts`). A richer editor adds zero capability for Task 9's actual goal (editorial gating + state transitions). Add later if the markdown UX bites.
- **R2 hero image upload UI**. The admin form takes a hero image URL as a text input. The user can upload to R2 via existing storage admin or paste an external URL. Direct upload-from-Pulse-form was scoped out.
- **Auto citation extraction from markdown links**. The quote-tracker is manual — admin enters `{ sourceId, words }` rows. Link-aware auto-extraction is a future polish task. Citations (which episodes are linked) are a separate field the admin pastes as a comma-separated list of episode IDs.
- **`scheduledAt` automatic publish job**. Posts can be scheduled (status SCHEDULED, scheduledAt set), but no cron flips SCHEDULED → PUBLISHED automatically. Admin clicks **Publish now** when ready. Adding a publisher cron is straightforward later (add a CronJob row + small handler that promotes SCHEDULED rows whose `scheduledAt <= now`).
- **Per-Pulse-stage AIStage**. Reused `narrative`. Split if Pulse needs different temperature/length/system prompt at the model-chain level.

## How to merge

Per `feedback_no_auto_ci_deploy` — the user pushes/deploys manually. There is no automated push/deploy from this session.

```bash
# From main
git fetch
git merge --no-ff feat/content-surface-phase2-4 -m "Merge feat/content-surface-phase2-4: Phases 2–4 of content surface"
# Push when you're ready
```

CI will apply migration `20260428015106_add_pulse_blog` to staging on push. The schema change is additive — new tables + one nullable Json column on Distillation — so the migration is safe to roll forward.

After merge:
1. Re-run `prisma seed` on staging + prod (or manually upsert the `pulse-generate` CronJob row, see "What needs human action" #5).
2. Walk through real-device iOS sample player check on staging (Phase 2.7 gate).
3. Create the first PulseEditor in `/admin/pulse/editors`. Fill bio + sameAs. Flip to READY.
4. Write the first 4–6 human-written Pulse posts via `/admin/pulse`. Publish them.
5. Once the 6/4 gate is met, the Sunday 14:00 UTC cron will start drafting `AI_ASSISTED` posts that show up in `/admin/pulse` filtered by `DRAFT`.

## Known limitations / acceptance gaps

- The Pulse cron uses greedy cosine clustering with a fixed threshold (0.65). If the staging corpus is tiny in the first weeks, clusters will rarely qualify (need ≥3 members). This is by design — better a quiet no-op than a forced bad post — but expect the cron to no-op for a while even after the 6/4 gate clears.
- The validator's word-count is approximate (markdown-stripping heuristic, not a Markdown AST). Off-by-a-few words from the Phase 4.0 800–1500 floor/ceiling is fine — both are soft warnings, not blockers.
- The 50-word per-source cap is enforced over the editor's own quote entries (sum of `quoteEntry.words` per `sourceId`). The admin UI doesn't auto-detect quotes from the body; the editor must enter each quoted span. Phase 4.0 Rule 3 is the editor's responsibility, not the system's.

## Test status (final)

- **All worker tests**: 1656 passing across 175 files (was 1537 on `main`; +119 new tests).
- **Frontend**: builds cleanly via `vite build`. No new chunk-size warnings.
- **Typecheck**: `tsc --noEmit` returns 0.

New test files added on this branch:

- `worker/lib/pulse/__tests__/markdown.test.ts` (Phase 4 SSR)
- `worker/lib/pulse/__tests__/templates.test.ts` (Phase 4 SSR)
- `worker/lib/pulse/__tests__/validation.test.ts` (Phase 4 / Task 9)
- `worker/lib/__tests__/ads.test.ts` (Phase 3)
- `worker/queues/__tests__/pulse-generate.test.ts` (Phase 4 / Task 8)
- `worker/routes/__tests__/public-catalog.test.ts` (Phase 2.2)
- `worker/routes/__tests__/pulse.test.ts` (Phase 4 SSR)
- `worker/routes/admin/__tests__/pulse.test.ts` (Phase 4 / Task 9)

Files extended with new cases:

- `worker/queues/__tests__/distillation.test.ts` (+3 embedding cases)
- `worker/queues/__tests__/scheduled.test.ts` (+3 Sunday-cron dispatch cases)
- `worker/lib/__tests__/html-templates.test.ts` (+3 Featured-in cases, 1 placeholder semantics updated)
- `worker/routes/__tests__/public-pages.test.ts` (+3 Featured-in route cases)
