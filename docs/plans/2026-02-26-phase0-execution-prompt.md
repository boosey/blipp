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

## Code Quality Standards

These apply to ALL code written by you and every teammate. Include these standards in every teammate prompt.

### Comments

Every file must have both:

1. **JSDoc on all exports** — Every exported function, type, interface, class, and constant gets a JSDoc comment. Include `@param`, `@returns`, and `@throws` where applicable. Example:
   ```typescript
   /**
    * Searches the Podcast Index API for podcasts matching a keyword.
    * @param term - Search keyword
    * @param options.max - Maximum number of results (default: 20)
    * @returns Search results with matching podcast feeds
    * @throws {Error} If the API returns a non-OK status
    */
   export async function searchByTerm(term: string, options?: { max?: number }): Promise<SearchResult>
   ```

2. **Strategic inline comments** — Add comments where the logic isn't self-evident. Focus on:
   - Workers-specific gotchas (`// Workers: must use Web Crypto, not Node crypto`)
   - Non-trivial algorithms (`// Syncsafe integer: each byte uses only 7 bits`)
   - Why decisions (`// Per-request client required — global causes hangs after first request on Workers`)
   - External API quirks (`// Podcast Index uses SHA-1 hash of key+secret+timestamp`)
   - Do NOT comment obvious code like `const x = 1; // set x to 1`

### Tests

**Every module gets tests.** No exceptions. The coverage target is:

1. **Library modules** (`worker/lib/*`) — Unit tests with mocked dependencies. Test happy paths, error cases, and edge cases. Minimum 3 tests per exported function.

2. **API routes** (`worker/routes/*`) — Unit tests that mock Prisma and external services. Test:
   - Unauthenticated requests return 401
   - Valid requests return correct data shape
   - Error/edge cases (missing params, tier limits, not found)
   - Webhook signature validation (Stripe, Clerk)

3. **Queue consumers** (`worker/queues/*`) — Unit tests with mocked Prisma, Anthropic, OpenAI, R2. Test:
   - Happy path: message processed, acked
   - Failure path: error recorded, message retried
   - Idempotency: already-completed work is skipped

4. **Frontend components** (`src/components/*`, `src/pages/*`) — Use `vitest` + `@testing-library/react`. Test:
   - Components render without crashing
   - Key interactions work (play button toggles, search triggers fetch, subscribe button calls API)
   - Conditional rendering (loading states, empty states, error states)

5. **Integration tests** (`tests/integration/`) — Use `@cloudflare/vitest-pool-workers` (miniflare) to test real Worker request flows:
   - `GET /api/health` returns 200
   - Protected routes return 401 without auth
   - Podcast search returns results (mocked Podcast Index)
   - Briefing generation queues a message (mocked queue)
   - Stripe webhook with valid signature updates user tier

### Test file locations

```
worker/lib/__tests__/podcast-index.test.ts
worker/lib/__tests__/rss-parser.test.ts
worker/lib/__tests__/transcript.test.ts
worker/lib/__tests__/distillation.test.ts
worker/lib/__tests__/tts.test.ts
worker/lib/__tests__/mp3-concat.test.ts
worker/lib/__tests__/time-fitting.test.ts
worker/routes/__tests__/podcasts.test.ts
worker/routes/__tests__/briefings.test.ts
worker/routes/__tests__/billing.test.ts
worker/routes/__tests__/webhooks.test.ts
worker/queues/__tests__/feed-refresh.test.ts
worker/queues/__tests__/distillation.test.ts
worker/queues/__tests__/clip-generation.test.ts
worker/queues/__tests__/briefing-assembly.test.ts
src/__tests__/briefing-player.test.tsx
src/__tests__/podcast-card.test.tsx
src/__tests__/dashboard.test.tsx
src/__tests__/discover.test.tsx
src/__tests__/settings.test.tsx
tests/integration/api.test.ts
```

## Step 1: Set up a worktree

Create a git worktree for this work. Branch: `feat/phase0-mvp`. All work happens in the worktree, not the main working tree.

## Step 2: Foundation (you do this yourself, sequentially)

Complete these tasks yourself before spawning any teammates. They produce the shared contracts every other agent depends on. Mismatches here cascade into hours of wasted work.

1. **Task 1: Project scaffolding** — Vite + React + Hono + Cloudflare. Install all deps including test deps:
   ```
   npm install -D vitest @cloudflare/vitest-pool-workers @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
   ```
   Verify `npx vite dev` serves the app and `/api/health` returns JSON.

2. **Task 2: Database schema** — Prisma schema (copy exactly from design doc), `worker/lib/db.ts` with per-request `createPrismaClient` (with JSDoc), run `npx prisma generate`.

3. **Shared types** — Create `worker/types.ts` with the full `Env` type (all bindings: HYPERDRIVE, R2, all 4 queues, all secrets). JSDoc on the type.

4. **Vitest configs** — Set up two vitest configs:
   - `vitest.config.ts` — Standard config for unit tests (jsdom environment for frontend tests)
   - `vitest.integration.config.ts` — Uses `@cloudflare/vitest-pool-workers` for integration tests

5. **Test helpers** — Create `tests/helpers/mocks.ts` with reusable mock factories:
   - `createMockPrisma()` — Returns a mocked PrismaClient with all models stubbed
   - `createMockEnv()` — Returns a mock `Env` object with stubbed R2, Queues, secrets
   - `createMockContext()` — Returns a minimal Hono context mock for route tests

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
1. The exact file paths they should create/modify (source files AND test files)
2. The full `Env` type from `worker/types.ts` (paste it into their prompt)
3. ALL technical constraints listed below
4. The full "Code Quality Standards" section above (comments + tests)
5. The test helpers available in `tests/helpers/mocks.ts` (paste the file contents)
6. Instruction to commit after each task with `feat: <description>` messages
7. Instruction to run their tests after writing them (`npx vitest run <path>`)
8. Instruction to send you a message when they finish all their tasks

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
9. NO ads in Phase 0. Skip any ad-related code (AdCampaign, adClipKey, pre-roll insertion).
```

### Teammate assignments

**backend-agent** — Backend API layer + route tests:
- Task 3: Clerk auth middleware (`worker/middleware/auth.ts`) + Clerk webhook handler (`worker/routes/webhooks/clerk.ts`)
- Task 4: Stripe client (`worker/lib/stripe.ts`), Stripe webhook handler (`worker/routes/webhooks/stripe.ts`), billing routes (`worker/routes/billing.ts`)
- Task 5: Podcast Index API client (`worker/lib/podcast-index.ts`) + tests — use Web Crypto for SHA-1 auth
- Task 6: RSS feed parser (`worker/lib/rss-parser.ts`) + transcript fetcher (`worker/lib/transcript.ts`) + tests for both
- Task 11: Podcast routes (`worker/routes/podcasts.ts`) — search, trending, subscribe, unsubscribe, list subscriptions
- Task 12: Briefing routes (`worker/routes/briefings.ts`) — list, today, generate (with tier enforcement), update preferences
- Tests for all routes: `worker/routes/__tests__/podcasts.test.ts`, `worker/routes/__tests__/briefings.test.ts`, `worker/routes/__tests__/billing.test.ts`, `worker/routes/__tests__/webhooks.test.ts`
- Final step: Create `worker/routes/index.ts` that exports a single Hono app with all routes mounted. DO NOT modify `worker/index.ts` directly — export a route tree that the lead will wire in.

**engine-agent** — Distillation, audio, queue consumers + tests:
- Task 7: Distillation engine (`worker/lib/distillation.ts`) — `extractClaims()` and `generateNarrative()` + tests with mocked Anthropic client
- Task 8: TTS service (`worker/lib/tts.ts`) — `generateSpeech()` + test with mocked OpenAI client
- Task 9: MP3 concatenation (`worker/lib/mp3-concat.ts`) — `stripId3v2Header()` and `concatMp3Buffers()` + tests
- Task 10: Clip cache helpers (`worker/lib/clip-cache.ts`) + time-fitting algorithm (`worker/lib/time-fitting.ts`) with `nearestTier()`, `allocateWordBudget()`, `DURATION_TIERS` + tests for time-fitting
- Task 13: All 4 queue consumers in `worker/queues/` — `feed-refresh.ts`, `distillation.ts`, `clip-generation.ts`, `briefing-assembly.ts`
- Tests for all queue consumers: `worker/queues/__tests__/feed-refresh.test.ts`, `worker/queues/__tests__/distillation.test.ts`, `worker/queues/__tests__/clip-generation.test.ts`, `worker/queues/__tests__/briefing-assembly.test.ts`
- Final step: Create `worker/queues/index.ts` that exports a single `handleQueue(batch, env, ctx)` dispatcher function and the `scheduled` handler. DO NOT modify `worker/index.ts` directly.

**frontend-agent** — React SPA + component tests:
- Task 14: Clerk provider (`src/providers/clerk-provider.tsx`), app layout (`src/layouts/app-layout.tsx`), routing in `src/App.tsx` and `src/main.tsx` using react-router-dom
- Task 15: Dashboard page (`src/pages/dashboard.tsx`) with briefing player component (`src/components/briefing-player.tsx`), API helper (`src/lib/api.ts`)
- Task 16: Discover page (`src/pages/discover.tsx`) with podcast card component (`src/components/podcast-card.tsx`)
- Task 17: Settings page (`src/pages/settings.tsx`) with briefing length slider, timezone selector, Stripe upgrade/manage buttons
- Landing page (`src/pages/landing.tsx`) with sign-in CTA
- Tests: `src/__tests__/briefing-player.test.tsx`, `src/__tests__/podcast-card.test.tsx`, `src/__tests__/dashboard.test.tsx`, `src/__tests__/discover.test.tsx`, `src/__tests__/settings.test.tsx`
- Use `@testing-library/react` + `vitest` with jsdom. Mock `fetch` for API calls. Mock `@clerk/react` hooks (`useUser`, `useAuth`).
- All pages use dark theme (zinc-950 bg, zinc-50 text) and Tailwind utility classes

## Step 4: Monitor, review, integrate

While teammates work, wait for their completion messages. As each finishes:

1. **Read every file they created** — don't trust blindly
2. **Check for constraint violations** — global PrismaClient? Node crypto import? rss-parser import? These are showstoppers.
3. **Check comment quality** — Every export has JSDoc? Strategic comments on non-obvious logic?
4. **Run their tests** — `npx vitest run worker/lib/__tests__/ worker/routes/__tests__/ worker/queues/__tests__/` for backend/engine, `npx vitest run src/__tests__/` for frontend
5. If something is wrong, send the teammate a message with the specific fix needed and wait for them to correct it. Do not fix it yourself while the agent is still active.

### Review loop (do this for each teammate's output)

```
For each file the teammate created:
  1. Read the file
  2. Check: Does it import from the correct paths?
  3. Check: Does it use `Env` type from worker/types.ts?
  4. Check: Does it violate any of the 9 technical constraints?
  5. Check: Does every export have a JSDoc comment?
  6. Check: Are there strategic comments on non-obvious logic?
  7. Check: Does the test file exist and cover happy path, error cases, edge cases?
  8. Check: Does it match the impl plan's code?
  If any check fails → message the teammate with the fix
  Repeat until clean
```

## Step 5: Final wiring (Task 18)

After all 3 teammates are done and reviewed:

1. Wire `worker/index.ts` as the single entry point:
   - Import the route tree from `worker/routes/index.ts`
   - Import the queue dispatcher from `worker/queues/index.ts`
   - Export `{ fetch, queue, scheduled }` as the Worker
   - JSDoc on the default export explaining the Worker entry point
2. Ensure `wrangler.jsonc` has ALL bindings: R2 bucket, 4 queues (producers + consumers), Hyperdrive, cron trigger
3. Verify `.dev.vars.example` lists every secret

## Step 6: Integration tests

Write integration tests in `tests/integration/api.test.ts` using `@cloudflare/vitest-pool-workers`:

- `GET /api/health` returns `{ status: "ok" }`
- Protected routes without auth return 401
- `GET /api/podcasts/search?q=test` calls Podcast Index and returns results (mock the external fetch)
- `POST /api/briefings/generate` creates a briefing record and enqueues a message (mock queue)
- Stripe webhook with valid signature updates user tier (mock Prisma + Clerk)

Run: `npx vitest run --config vitest.integration.config.ts`

## Step 7: Verification loop

Run these in order. If any step fails, fix it and re-run from that step:

```
Loop until all pass:
  1. npx prisma generate
  2. npx vite build                                              (catches import errors, missing modules)
  3. npx vitest run                                              (all unit tests)
  4. npx vitest run --config vitest.integration.config.ts        (integration tests)
  5. npx tsc --noEmit                                            (full type check)

  If a step fails:
    - Read the error carefully
    - Fix the root cause (don't suppress errors)
    - Re-run from step 1

  Stop when all 5 pass cleanly.
```

This is the most important step. Do NOT skip it. Do NOT claim success without seeing green output from all 5 commands.

## Step 8: Clean up and final commit

1. Run `git log --oneline` to verify commit history is clean (one commit per task)
2. If there are fixup commits from the verification loop, squash them into the relevant task commits using interactive rebase
3. Send the team shutdown requests
4. Delete the team

## Reminders

- **No ads in Phase 0.** The ad system (AdCampaign, adClipKey, pre-roll insertion) is explicitly Phase 1. If you see ad references in the impl plan, skip them.
- **Commit after every task.** Not at the end. `feat: add <what>` format.
- **Every module gets tests.** Libraries, routes, queue consumers, and frontend components. No exceptions. Write the test, run it, verify it passes.
- **Every export gets JSDoc.** Every non-obvious line gets a strategic comment. No exceptions.
- **The impl plan has the code.** You are not designing from scratch. The implementation is specified. Follow it closely. Deviate only when something won't work on Workers (and document why with a comment).
- **Take your time.** The owner is asleep. There is no rush. Quality over speed. Read twice, code once.
