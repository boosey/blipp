# Master Review & Refactoring Plan

**Date:** 2026-03-14
**Branch:** `refactor/code-review`
**Status:** Analysis complete. Implementation priorities defined.

---

## What Was Done

### Completed (this session)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0 | Update docs with latest architecture | Completed | All 6 docs files updated by docs-reviewer agent |
| 1 | Fix all typecheck errors | **Done** | 100+ errors → 0. Hono ContextVariableMap augmentation, AdminPlan type, userTier→userPlan, byTier→byPlan, test signature mismatches, lamejs-bundle.d.ts |
| 2 | Test coverage review | In progress | Analysis complete, exhaustive test additions planned below |
| 3 | AI error capture system design | **Done** | Full design at `2026-03-14-ai-error-capture-design.md` |
| 4 | Code brittleness review | **Done** | 12 items (B1-B12) at `2026-03-14-code-quality-analysis.md` |
| 5 | Coupling evaluation | **Done** | 8 items (C1-C8) at `2026-03-14-code-quality-analysis.md` |
| 6 | Abstraction opportunities | **Done** | 9 integration points ranked at `2026-03-14-code-quality-analysis.md` |
| 7 | Refactoring opportunities | **Done** | 10 items (R1-R10) at `2026-03-14-code-quality-analysis.md` |
| 8 | Code quality assessment | **Done** | Naming, complexity, type safety, error messages at `2026-03-14-code-quality-analysis.md` |
| 9 | Error handling & logging | **Done** | Comprehensive review at `2026-03-14-error-handling-review.md` |
| 10 | Security review | **Done** | 2 CRITICAL, 4 HIGH, 6+ MEDIUM at `2026-03-14-security-review.md` |
| 11 | UX improvement plan | **Done** | P0-P3 prioritized at `2026-03-14-ux-improvement-plan.md` |
| 12 | Master plan + generalized template | **This document** + `2026-03-14-generalized-review-template.md` |

### Pre-existing Test Failures (not introduced by this session)

35 tests fail on `main` — all pre-existing. Categories:
- `billing.test.ts` (4) — Stripe mock setup issues
- `podcasts-subscribe.test.ts` (3) — durationTier/pipeline dispatch mocking
- `briefings-ondemand.test.ts` (4) — pipeline dispatch mocking
- `scheduled.test.ts` (5) — config mock setup
- `admin/users.test.tsx` (1) — plan slug access
- `admin/configuration.test.tsx` (1) — API call shape
- Others — subscription/webhook related

---

## Implementation Roadmap

### Phase 1: Security Hardening (CRITICAL — Before Any Public Access)

**Estimated effort:** 1-2 days
**Why first:** These are exploitable vulnerabilities that must be closed before any production traffic.

| # | Item | Source | Files |
|---|------|--------|-------|
| 1.1 | Verify Clerk webhook signatures (Svix) | Security S1, Brittleness B6 | `worker/routes/webhooks/clerk.ts` |
| 1.2 | Configure CORS with explicit origin allowlist | Security S2 | `worker/index.ts` |
| 1.3 | Add user-scoping to clip audio route (IDOR fix) | Security S3 | `worker/routes/clips.ts` |
| 1.4 | Restrict admin PATCH to prevent self-escalation | Security S4 | `worker/routes/admin/users.ts` |
| 1.5 | Add Stripe webhook signature verification | Security S5 | `worker/routes/webhooks/stripe.ts` |

### Phase 2: Error Handling & Observability Foundation

**Estimated effort:** 2-3 days
**Why second:** Without observability, you can't diagnose issues in production.

| # | Item | Source | Files |
|---|------|--------|-------|
| 2.1 | Add global Hono `onError` handler with structured error responses | Error Review §3 | `worker/index.ts` |
| 2.2 | Add request correlation IDs (propagated through queues) | Error Review §1 | `worker/middleware/`, queue handlers |
| 2.3 | Implement `AIServiceError` class and DB table | AI Error Design §1-2 | `worker/lib/ai-errors.ts`, `prisma/schema.prisma` |
| 2.4 | Wrap AI provider calls with error capture | AI Error Design §4 | `worker/lib/llm-providers.ts`, `tts-providers.ts`, `stt-providers.ts` |
| 2.5 | Add HTTP request logging middleware | Error Review §1 | `worker/middleware/` |
| 2.6 | Fix silent catch blocks (6 identified) | Error Review §4 | Various |
| 2.7 | Add admin AI errors dashboard endpoint | AI Error Design §5 | `worker/routes/admin/` |

### Phase 3: Code Quality & Brittleness Fixes

**Estimated effort:** 3-4 days
**Why third:** Reduces the risk of runtime failures and makes the codebase maintainable.

| # | Item | Source | Files |
|---|------|--------|-------|
| 3.1 | Add Zod validation for LLM JSON output | Brittleness B1 | `worker/lib/distillation.ts` |
| 3.2 | Consolidate `DURATION_TIERS` into shared constant | Brittleness B3 | `worker/lib/constants.ts`, route files |
| 3.3 | Create shared queue message types | Coupling C2 | `worker/lib/queue-messages.ts` |
| 3.4 | Extract `resolveStageModel()` helper | Coupling C3, Refactoring R2 | `worker/lib/model-resolution.ts` |
| 3.5 | Extract pipeline stage handler boilerplate | Refactoring R1 | `worker/lib/stage-handler.ts` |
| 3.6 | Fix new-episode detection heuristic | Brittleness B2 | `worker/queues/feed-refresh.ts` |
| 3.7 | Validate RSS feed episode fields | Brittleness B8 | `worker/lib/rss-parser.ts` |
| 3.8 | Remove legacy `clip-cache.ts` dual-write | Refactoring R4 | `worker/lib/clip-cache.ts`, `worker/queues/audio-generation.ts` |
| 3.9 | Consolidate stage name maps | Brittleness B11, Refactoring R3 | `worker/lib/constants.ts` |
| 3.10 | Remove dead code (time-fitting, CLIP_GENERATION enum) | Refactoring R10 | Various |

> **Note:** `mp3-concat.ts` was previously flagged as dead code but is needed for briefing audio assembly (see Phase 5).

### Phase 4: Test Coverage Expansion

**Estimated effort:** 3-4 days
**Why fourth:** Locks in the improvements from phases 1-3 and catches future regressions.

| # | Item | Current State | Needed |
|---|------|--------------|--------|
| 4.1 | ~~Fix 35 pre-existing test failures~~ | **DONE** | All 34 failures fixed, 37 new tests added (568/568 pass) |
| 4.2 | Webhook handler tests | None | Clerk + Stripe webhook verification, event handling |
| 4.3 | Auth/authz edge cases | Minimal | Unauthenticated access, non-admin admin route access, expired tokens |
| 4.4 | Queue handler error paths | Partial | AI service failures, malformed messages, DB connection failures |
| 4.5 | Pipeline orchestrator tests | None | State machine transitions, concurrent jobs, failure cascades |
| 4.6 | Rate limiting / abuse tests | None (no rate limiting exists) | After rate limiting is added |
| 4.7 | Frontend component tests | 2 known failures | Fix discover.test.tsx, settings.test.tsx |
| 4.8 | API response contract tests | None | Verify response shapes match `src/types/admin.ts` |

### Phase 5: UX Launch Quality & Audio Polish

**Estimated effort:** 7-9 days
**Why fifth:** After the infrastructure is solid, the UX makes the product usable and the audio experience professional.

#### 5A: Briefing Audio Assembly (Phase 1 — No Wasm)

Transforms raw TTS clips into polished briefings with sonic branding. Zero new dependencies — uses existing `mp3-concat.ts`. See [`2026-03-14-wasm-audio-processing-design.md`](./2026-03-14-wasm-audio-processing-design.md) for full design.

| # | Item | Details |
|---|------|---------|
| 5A.1 | Upload jingle assets to R2 | Pre-mastered intro.mp3 + outro.mp3 at `assets/` prefix (24kHz mono, ~2-5s each, with built-in fades) |
| 5A.2 | Narrative prompt metadata intro | Update `generateNarrative()` prompt to include spoken podcast name, episode title, release date, original/briefing length |
| 5A.3 | Audio assembly module | `worker/lib/audio/assembly.ts` — wraps `concatMp3Buffers()` with graceful fallback to raw clip on error |
| 5A.4 | Stage 5 integration | Wire assembly into `briefing-assembly` queue handler: load clip + jingles from R2, concat, store assembled output |
| 5A.5 | Briefing audio endpoint | `GET /api/briefings/:id/audio` — serves assembled MP3 from R2 (separate from raw clip endpoint) |
| 5A.6 | Feature toggle | `BRIEFING_ASSEMBLY_ENABLED` config flag via PlatformConfig |
| 5A.7 | Frontend audio source update | Update player to use briefing audio endpoint instead of raw clip URL |
| 5A.8 | Assembly tests | Concat with/without jingles, fallback on error, valid MP3 output |

**Constraints:** No Wasm, no PCM decode, no crossfading. Jingles must be pre-mastered to match TTS levels. Hard cuts (acceptable with built-in jingle fades). Peak memory ~29MB for 15min clips.

#### 5B: Frontend UX Improvements

| # | Item | Priority | Source |
|---|------|----------|--------|
| 5B.1 | Persistent mini-player (audio context) | P0 | UX Plan P0-1 |
| 5B.2 | New user onboarding flow | P0 | UX Plan P0-2 |
| 5B.3 | Loading skeletons & empty states | P0 | UX Plan P0-3 |
| 5B.4 | Toast notification system | P0 | UX Plan P0-4 |
| 5B.5 | Landing page redesign | P1 | UX Plan P1-1 |
| 5B.6 | Enhanced discover/search with categories | P1 | UX Plan P1-2 |
| 5B.7 | Playback controls (skip, speed, queue) | P1 | UX Plan P1-3 |
| 5B.8 | PWA setup (offline, push notifications) | P2 | UX Plan P2-1 |
| 5B.9 | Listening history & stats | P2 | UX Plan P2-2 |

#### 5C: Audio Processing Phase 2 (Future — Wasm)

**Not for initial launch.** Only needed when Phase 1 hard cuts aren't sufficient.

| # | Item | Details |
|---|------|---------|
| 5C.1 | Spike: Wasm runtime compatibility | Test `wasm-media-encoders` + MP3 decoder in Workers runtime |
| 5C.2 | PCM processing module | Decode → normalize → crossfade → mix → encode pipeline |
| 5C.3 | Volume normalization | Consistent loudness across TTS providers/voices |
| 5C.4 | Crossfading | Smooth transitions between jingle and clip |
| 5C.5 | Ad audio insertion | Mix/overlay ad audio using existing `adAudioUrl`/`adAudioKey` schema fields |
| 5C.6 | Wrangler CPU limit | Set `limits.cpu_ms: 300000` for PCM processing |

### Phase 6: SaaS Operations Readiness

**Estimated effort:** 3-5 days
**Why last:** These are operational features needed before scaling, not before launch.

| # | Item | Category |
|---|------|----------|
| 6.1 | Rate limiting on API routes | Security/Operations |
| 6.2 | API key management for external integrations | Security |
| 6.3 | Audit logging (admin actions) | Governance |
| 6.4 | User data export / deletion (GDPR) | Compliance |
| 6.5 | Health check endpoints | Operations |
| 6.6 | Automated backup verification | Operations |
| 6.7 | Cost alerting thresholds | Operations |
| 6.8 | Feature flags system | Operations |
| 6.9 | Usage metering & limits enforcement | Billing |

---

## Key Architectural Decisions & Lessons Learned

### Decisions That Worked Well

1. **Provider abstraction pattern** — `LlmProvider`, `TtsProvider`, `SttProvider` interfaces allow multi-vendor support with clean swap-ability. This was the right call and should be maintained.

2. **Demand-driven pipeline** — The orchestrator + queue architecture allows independent scaling of each stage. Episodes are processed only when a user subscribes, avoiding wasted compute.

3. **Prisma middleware for per-request lifecycle** — Clean pattern that prevents connection leaks. Every route handler gets a fresh PrismaClient without manual management.

4. **PlatformConfig key-value store** — Enables runtime configuration changes without redeployment. The 60-second TTL cache is a good trade-off.

5. **Admin platform depth** — 12 admin route modules with comprehensive CRUD, pipeline control, analytics, and configuration. Strong foundation for operations.

### Decisions That Need Revision

1. **`prisma: any` everywhere** — The codebase loses all Prisma type safety through `as any` casts. This was expedient early but creates a class of runtime errors that should be caught at compile time.

2. **No shared types between frontend/backend** — Admin types are manually duplicated. This has already caused drift (userTier vs userPlan, byTier vs byPlan, missing AdminPlan). OpenAPI or shared type packages should be explored.

3. **Webhook signature verification deferred** — "Phase 0" shortcuts on Clerk and Stripe webhooks are now security vulnerabilities. These should have been implemented from the start.

4. **No correlation IDs** — Pipeline processing creates logs at each stage but there's no way to trace a single user request through the entire pipeline. This is the #1 observability gap.

5. **Frontend audio player as a page** — Building the player as a page instead of a persistent component was a shortcut that now requires a significant rearchitecture (audio context + mini-player).

### Lessons for Future Development

1. **Type contracts first** — Define shared types before implementing routes. The admin.ts type drift shows what happens when you don't.

2. **Auth hardening is not optional** — Webhook verification and CORS configuration should be in the "definition of done" for any auth integration.

3. **Observability from day one** — Correlation IDs and structured logging are much cheaper to add during initial development than to retrofit.

4. **Extract patterns at 2 duplicates, not 4** — Several patterns (model resolution, stage handler boilerplate, date utilities) were copy-pasted 3-4 times before being identified as duplication.

---

## Implementation Plans

Detailed task-level plans for each phase. Each is self-contained — an agent can implement from the plan alone.

| Plan | Tasks | Est. Effort |
|------|-------|-------------|
| [`plan-phase1-security.md`](./2026-03-14-plan-phase1-security.md) | 7 tasks: webhook verification, CORS, IDOR, privilege escalation, mass assignment, sort injection | 1-2 days |
| [`plan-phase2-observability.md`](./2026-03-14-plan-phase2-observability.md) | 7 tasks: global error handler, correlation IDs, AIServiceError model, provider wrapping, request logging, silent catch fixes, admin dashboard | 2-3 days |
| [`plan-phase3-quality.md`](./2026-03-14-plan-phase3-quality.md) | 10 tasks: Zod validation, duration tiers, queue message types, model resolution, stage handler extraction, RSS validation, clip-cache removal, dead code | 3-4 days |
| [`plan-phase5a-audio-assembly.md`](./2026-03-14-plan-phase5a-audio-assembly.md) | 8 tasks: jingle assets, narrative metadata, assembly module, Stage 5 integration, serving endpoint, feature toggle, frontend update, tests | 2-3 days |
| [`plan-phase5b-ux.md`](./2026-03-14-plan-phase5b-ux.md) | 9 tasks: mini-player, onboarding, skeletons, toasts, landing page, discover, playback controls, PWA, listening history | 8-9 days |
| [`plan-phase6-operations.md`](./2026-03-14-plan-phase6-operations.md) | 9 tasks: rate limiting, API keys, audit logging, GDPR, health checks, backups, cost alerts, feature flags, usage metering | 3-5 days |

## Analysis Documents

Source analysis that informed the plans above.

| Document | What It Covers |
|----------|----------------|
| [`code-quality-analysis.md`](./2026-03-14-code-quality-analysis.md) | Brittleness (12 items), coupling (8 items), abstraction ranking (9 integration points), refactoring opportunities (10 items), code quality assessment |
| [`security-review.md`](./2026-03-14-security-review.md) | 2 CRITICAL, 4 HIGH, 6+ MEDIUM security findings |
| [`error-handling-review.md`](./2026-03-14-error-handling-review.md) | Logging gaps, error catching analysis, silent failures, retry behavior |
| [`ai-error-capture-design.md`](./2026-03-14-ai-error-capture-design.md) | AIServiceError class, DB schema, classification, recovery strategies, admin dashboard |
| [`ux-improvement-plan.md`](./2026-03-14-ux-improvement-plan.md) | Current UX assessment, P0-P3 prioritized improvements |
| [`wasm-audio-processing-design.md`](./2026-03-14-wasm-audio-processing-design.md) | Briefing audio assembly: Phase 1 (MP3 concat, jingles, metadata intro) + Phase 2 (Wasm PCM processing) |
| [`saas-readiness-gaps.md`](./2026-03-14-saas-readiness-gaps.md) | Missing functionality for production SaaS launch |
