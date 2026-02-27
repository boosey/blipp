# Phase 0 Execution Prompt

> Paste everything below the line into a fresh Claude Code session from the `blipp` repo root. Then go to bed.

---

You are the team lead. Your job is to fully implement the Blipp Phase 0 MVP — from empty repo to working app. The owner is asleep and won't be answering questions, so you must be fully autonomous. Take your time. Think carefully. Get it right.

## Step 0: Read everything first

Before writing a single line of code, read ALL of these docs cover-to-cover. Do not skim. These are your source of truth:

1. `docs/plans/2026-02-26-phase0-design.md` — Architecture, data model, auth/payment flows, queue design
2. `docs/plans/2026-02-26-phase0-impl-plan.md` — Task-by-task implementation with exact code
3. `docs/plans/2026-02-26-technical-research.md` — TTS/LLM/RSS research, code examples, cost numbers
4. `docs/plans/2026-02-26-business-analysis.md` — Cost model (context only, don't implement ads — they're Phase 1)

After reading, create a mental model of the full system before touching code. The impl plan has 18 tasks. Every line of code you need is in there. Your job is orchestration and quality, not design.

## Step 1: Set up a worktree

Create a git worktree for this work. Branch: `feat/phase0-mvp`. All work happens in the worktree, not the main working tree.

## Step 2: Foundation (you do this yourself, sequentially)

Complete these tasks yourself before spawning any teammates. They produce the shared contracts every other agent depends on. Mismatches here cascade into hours of wasted work.

1. **Task 1: Project scaffolding** — Vite + React + Hono + Cloudflare. Install all deps. Verify `npx vite dev` serves the app and `/api/health` returns JSON.
2. **Task 2: Database schema** — Prisma schema (copy exactly from design doc), `worker/lib/db.ts` with per-request `createPrismaClient`, run `npx prisma generate`.
3. **Shared types** — Create `worker/types.ts` with the full `Env` type (all bindings: HYPERDRIVE, R2, all 4 queues, all secrets). This is the contract every route and queue consumer imports.
4. **Vitest config** — Set up `vitest.config.ts` so teammates can write and run tests immediately.

Commit after each task. Verify the project builds and the dev server starts before proceeding.

### Quality gate before Phase B

Run these and confirm they pass:
```
npx prisma generate
npx vite build
```

If either fails, fix it before spawning teammates. Do NOT proceed with a broken foundation.

## Step 3: Create the Agent Team and dispatch parallel work

Use `TeamCreate` to create a team called `phase0-mvp`. Then spawn 3 teammates using the Task tool with `team_name: "phase0-mvp"`. Each teammate is a `general-purpose` agent.

### Critical: What to tell every teammate

Every teammate prompt MUST include:
1. The exact file paths they should create/modify
2. The full `Env` type from `worker/types.ts` (paste it into their prompt)
3. ALL 6 technical constraints listed below
4. Instruction to commit after each task with `feat: <description>` messages
5. Instruction to run their tests after writing them (`npx vitest run <path>`)
6. Instruction to send you a message when they finish all their tasks

### Technical constraints (paste into every teammate prompt)

```
CRITICAL CONSTRAINTS — Cloudflare Workers runtime:
1. NO Node.js `crypto` module → use `crypto.subtle.digest()` (Web Crypto API)
2. NO `fs` module → use R2 bucket bindings for all file I/O
3. NO `rss-parser` npm package (uses XMLHttpRequest) → use `fast-xml-parser`
4. NO `ffmpeg` or `fluent-ffmpeg` → raw Uint8Array MP3 frame concatenation
5. Prisma MUST be created per-request: `new PrismaClient({ adapter })` inside each handler. NEVER global. Uses `@prisma/adapter-pg` + `pg` with `nodejs_compat` flag.
6. Stripe MUST use `constructEventAsync()` (async, not sync), `Stripe.createFetchHttpClient()`, and `await c.req.raw.arrayBuffer()` for webhook body.
7. Clerk uses `@hono/clerk-auth` middleware. Auth check: `const auth = getAuth(c); if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);`
8. All code is TypeScript. All files use the shared `Env` type from `worker/types.ts`.
```

### Teammate assignments

**backend-agent** — Backend API layer:
- Task 3: Clerk auth middleware (`worker/middleware/auth.ts`) + Clerk webhook handler (`worker/routes/webhooks/clerk.ts`)
- Task 4: Stripe client (`worker/lib/stripe.ts`), Stripe webhook handler (`worker/routes/webhooks/stripe.ts`), billing routes (`worker/routes/billing.ts`)
- Task 5: Podcast Index API client (`worker/lib/podcast-index.ts`) + tests — use Web Crypto for SHA-1 auth
- Task 6: RSS feed parser (`worker/lib/rss-parser.ts`) + transcript fetcher (`worker/lib/transcript.ts`) + tests for both
- Task 11: Podcast routes (`worker/routes/podcasts.ts`) — search, trending, subscribe, unsubscribe, list subscriptions
- Task 12: Briefing routes (`worker/routes/briefings.ts`) — list, today, generate (with tier enforcement), update preferences
- Final step: Create `worker/routes/index.ts` that exports a single Hono app with all routes mounted. DO NOT modify `worker/index.ts` directly — export a route tree that the lead will wire in.

**engine-agent** — Distillation, audio, and queue consumers:
- Task 7: Distillation engine (`worker/lib/distillation.ts`) — `extractClaims()` and `generateNarrative()` + tests with mocked Anthropic client
- Task 8: TTS service (`worker/lib/tts.ts`) — `generateSpeech()` + test with mocked OpenAI client
- Task 9: MP3 concatenation (`worker/lib/mp3-concat.ts`) — `stripId3v2Header()` and `concatMp3Buffers()` + tests
- Task 10: Clip cache helpers (`worker/lib/clip-cache.ts`) + time-fitting algorithm (`worker/lib/time-fitting.ts`) with `nearestTier()`, `allocateWordBudget()`, `DURATION_TIERS` + tests for time-fitting
- Task 13: All 4 queue consumers in `worker/queues/` — `feed-refresh.ts`, `distillation.ts`, `clip-generation.ts`, `briefing-assembly.ts`
- Final step: Create `worker/queues/index.ts` that exports a single `handleQueue(batch, env, ctx)` dispatcher function and the `scheduled` handler. DO NOT modify `worker/index.ts` directly.

**frontend-agent** — React SPA:
- Task 14: Clerk provider (`src/providers/clerk-provider.tsx`), app layout (`src/layouts/app-layout.tsx`), routing in `src/App.tsx` and `src/main.tsx` using react-router-dom
- Task 15: Dashboard page (`src/pages/dashboard.tsx`) with briefing player component (`src/components/briefing-player.tsx`), API helper (`src/lib/api.ts`)
- Task 16: Discover page (`src/pages/discover.tsx`) with podcast card component (`src/components/podcast-card.tsx`)
- Task 17: Settings page (`src/pages/settings.tsx`) with briefing length slider, timezone selector, Stripe upgrade/manage buttons
- Landing page (`src/pages/landing.tsx`) with sign-in CTA
- All pages use dark theme (zinc-950 bg, zinc-50 text) and Tailwind utility classes

## Step 4: Monitor, review, integrate

While teammates work, wait for their completion messages. As each finishes:

1. **Read every file they created** — don't trust blindly
2. **Check for constraint violations** — global PrismaClient? Node crypto import? rss-parser import? These are showstoppers.
3. **Run their tests** — `npx vitest run worker/lib/__tests__/` for backend/engine, visual check for frontend
4. If something is wrong, send the teammate a message with the specific fix needed and wait for them to correct it. Do not fix it yourself while the agent is still active.

### Review loop (do this for each teammate's output)

```
For each file the teammate created:
  1. Read the file
  2. Check: Does it import from the correct paths?
  3. Check: Does it use `Env` type from worker/types.ts?
  4. Check: Does it violate any of the 8 technical constraints?
  5. Check: Does it match the impl plan's code?
  If any check fails → message the teammate with the fix
  Repeat until clean
```

## Step 5: Final wiring (Task 18)

After all 3 teammates are done and reviewed:

1. Wire `worker/index.ts` as the single entry point:
   - Import the route tree from `worker/routes/index.ts`
   - Import the queue dispatcher from `worker/queues/index.ts`
   - Export `{ fetch, queue, scheduled }` as the Worker
2. Ensure `wrangler.jsonc` has ALL bindings: R2 bucket, 4 queues (producers + consumers), Hyperdrive, cron trigger
3. Verify `.dev.vars.example` lists every secret

## Step 6: Verification loop

Run these in order. If any step fails, fix it and re-run from that step:

```
Loop until all pass:
  1. npx prisma generate
  2. npx vite build              (catches import errors, missing modules)
  3. npx vitest run              (runs all tests)
  4. npx tsc --noEmit            (full type check)

  If a step fails:
    - Read the error carefully
    - Fix the root cause (don't suppress errors)
    - Re-run from step 1

  Stop when all 4 pass cleanly.
```

This is the most important step. Do NOT skip it. Do NOT claim success without seeing green output from all 4 commands.

## Step 7: Clean up and final commit

1. Run `git log --oneline` to verify commit history is clean (one commit per task)
2. If there are fixup commits from the verification loop, squash them into the relevant task commits using interactive rebase
3. Send the team shutdown requests
4. Delete the team

## Reminders

- **No ads in Phase 0.** The ad system (AdCampaign, adClipKey, pre-roll insertion) is explicitly Phase 1. If you see ad references in the impl plan, skip them.
- **Commit after every task.** Not at the end. `feat: add <what>` format.
- **Tests are not optional.** Tasks 5-10 all have test files. Write them. Run them. They must pass.
- **The impl plan has the code.** You are not designing from scratch. The implementation is specified. Follow it closely. Deviate only when something won't work on Workers (and document why).
- **Take your time.** The owner is asleep. There is no rush. Quality over speed. Read twice, code once.
