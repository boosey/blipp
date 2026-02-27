# Phase 0 Execution Prompt

> Paste this into a fresh Claude Code session from the `blipp` repo root.

---

## The Prompt

```
Implement the Blipp Phase 0 plan at docs/plans/2026-02-26-phase0-impl-plan.md

Before you start, read these docs for full context:
- docs/plans/2026-02-26-phase0-design.md (architecture & data model)
- docs/plans/2026-02-26-phase0-impl-plan.md (task-by-task implementation)
- docs/plans/2026-02-26-business-analysis.md (cost model, for context only)
- docs/plans/2026-02-26-technical-research.md (TTS/LLM/RSS research)

## Execution Strategy

Use a git worktree for this work (use the new-worktree skill or EnterWorktree). Branch name: `feat/phase0-mvp`.

Use **Agent Teams** to parallelize implementation. Here's the team structure:

### Phase A: Foundation (sequential, do this yourself as team lead)
1. **Task 1** — Project scaffolding (Vite + React + Hono + Cloudflare)
2. **Task 2** — Prisma schema + db.ts
3. Create `worker/types.ts` with the shared `Env` type

These MUST complete before spawning teammates — they establish shared contracts (Prisma types, Env bindings, project structure) that all agents depend on.

### Phase B: Parallel work (spawn 3 teammates)

**backend-agent** — Backend API & integrations:
- Task 3: Clerk auth middleware + webhooks
- Task 4: Stripe payments (checkout, portal, webhooks)
- Task 5: Podcast Index API client + tests
- Task 6: RSS parser + transcript fetcher + tests
- Task 11: Podcast API routes
- Task 12: Briefing API routes
- Wire all routes into worker/index.ts

**engine-agent** — Core distillation & audio pipeline:
- Task 7: Distillation engine (Claude two-pass) + tests
- Task 8: TTS service (OpenAI) + tests
- Task 9: MP3 concatenation + tests
- Task 10: Clip caching + time-fitting algorithm + tests
- Task 13: All 4 queue consumers (feed-refresh, distillation, clip-generation, briefing-assembly)
- Wire queue handler + scheduled handler into worker/index.ts export

**frontend-agent** — React UI:
- Task 14: Layout, routing, Clerk provider
- Task 15: Dashboard + briefing player
- Task 16: Podcast discovery + subscription
- Task 17: Settings + billing page

### Phase C: Integration (yourself as team lead)
- Task 18: Final wiring — merge all routes/queues into worker/index.ts, verify wrangler.jsonc has all bindings
- Run type check: `npx tsc --noEmit`
- Run tests: `npx vitest run`
- Fix any integration issues between the 3 agents' work
- Commit with a clean history

## Key Technical Constraints

These are critical — share them with every teammate:

1. **Cloudflare Workers runtime** — no Node.js `crypto` module (use Web Crypto API), no `fs` (use R2), no `rss-parser` (use `fast-xml-parser`), no `ffmpeg`
2. **Prisma on Workers** — must create PrismaClient per-request via `createPrismaClient(c.env.HYPERDRIVE)`, never global. Uses `@prisma/adapter-pg` + `pg` with `nodejs_compat` flag
3. **Clerk on Hono** — use `@hono/clerk-auth` middleware, `getAuth(c)` for auth checks
4. **Stripe on Workers** — use `constructEventAsync` (not sync), `Stripe.createFetchHttpClient()`, raw `arrayBuffer()` for webhook body
5. **MP3 concat** — raw Uint8Array frame concat with ID3v2 header stripping, no npm package
6. **All TTS segments from OpenAI share the same format/bitrate** — simple concat works cleanly

## Commit Strategy

Each task gets its own commit. Use conventional commit messages: `feat: add <what>`. Don't bundle unrelated work. Commit after each task completes, not at the end.
```
