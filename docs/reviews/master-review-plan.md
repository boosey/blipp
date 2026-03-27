# Master Review Plan — Blipp

**Date:** 2026-03-26
**Baseline:** Typecheck clean, build passing, 113 test files / 1117 tests all green.

---

## Executive Summary

Blipp has a solid technical foundation: structured logging, Sentry, audit logs, feature flags, multi-provider AI with fallback chains, admin dashboard, and a working billing integration. The codebase is well-organized and mostly well-typed.

The review uncovered **no critical security vulnerabilities** but found **5 HIGH security issues** (all fixable quickly), **2 live bugs** (Apple Sign-In 501, async STT providers with no poll loop), **billing enforcement completely missing** (plan limits defined but never checked), and **suspended user access not blocked**. These are the items that must be addressed before any public launch.

---

## Phase 1 — Security (Do First)

Priority: Block exploitable issues before any production traffic increase.

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 1.1 | Hono + fast-xml-parser HIGH CVEs | Security H4, H5 | 5 min | `npm audit fix` — no breaking changes | DONE |
| 1.2 | Native auth leaks raw `err.message` | Security H1 | 10 min | Replace with generic message; log full error | DONE |
| 1.3 | Clerk FAPI proxy reflects arbitrary Origin | Security H2 | 30 min | Apply origin allowlist to both proxy handlers | SKIP — low risk, would break iOS Capacitor auth |
| 1.4 | SSRF on unvalidated external URLs | Security H3 | 1 hr | Add URL validation helper (scheme + host check) before all external fetches | DONE |
| 1.5 | Shared briefing endpoint allows enumeration | Security M5 | 1 hr | Add `shareToken` or `isPublic` flag to Briefing model | SKIP — auth flow |
| 1.6 | `CLERK_SECRET_KEY` as dual-purpose admin bypass | Security M1 | 30 min | Create separate `INTERNAL_API_TOKEN` env var | SKIP — auth flow |
| 1.7 | Add HSTS header | Security M7 | 5 min | One line in security-headers middleware | DONE |
| 1.8 | User suspension doesn't block API access | SaaS 2.2 | 30 min | Add status check in auth middleware | SKIP — auth flow |
| 1.9 | Rate limit KV must be required, not optional | Security M4, SaaS 9.1 | 30 min | Error on startup if `RATE_LIMIT_KV` missing; remove in-memory fallback | DONE |

**Estimated total: ~5 hours**

---

## Phase 2 — Observability (Measure Before You Improve)

Priority: Instrument the system so quality/reliability improvements in later phases are measurable.

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 2.1 | Queue handler errors not forwarded to Sentry | Error Review §6 | 1 hr | ~~Add captureException~~ Sentry removed; structured JSON logs captured by CF Observability | DONE |
| 2.2 | Cron job failures silently absorbed | Error Review §8, SaaS 4.5 | 1 hr | ~~Add Sentry capture~~ Added structured error logging for cron allSettled rejections | DONE |
| 2.3 | Silent failures: embeddings, transcript-sources, podcast-index | Error Review §3 | 1 hr | Replace `catch {}` with structured warn logs in all three | DONE |
| 2.4 | Sentry missing requestId/correlationId | Error Review §9 | 30 min | Add as Sentry tags, not just extra | SKIP — Sentry removed; requestId already in structured logs |
| 2.5 | Unstructured logging in Apple Podcasts, catalog-refresh | Error Review §1 | 1 hr | Convert template-literal console calls to JSON-structured format | DONE |
| 2.6 | Budget status and efficiency score are hardcoded | SaaS 5.5, 5.6, Code Quality | 30 min | Remove placeholders; return null or omit field until real implementation | DONE |
| 2.7 | `AiServiceError.retryCount` always written as 0 | Error Capture §5 | 30 min | Pass actual retry count from handler state | DONE |

**Estimated total: ~6 hours**

---

## Phase 3 — Quality & Correctness (Fix What's Broken)

Priority: Fix live bugs and code quality issues that cause runtime failures.

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 3.1 | Apple Sign-In returns 501 in production | Code Quality Step 4 | 4 hr | Implement Apple JWT verification or remove the endpoint with a clear error | SKIP — auth flow |
| 3.2 | Async STT providers (AssemblyAI, Google) have no poll loop | Code Quality Step 4 | 3 hr | Implement polling or remove providers from the model registry | DONE — removed providers; DB rows need manual deletion via admin UI |
| 3.3 | Queue handlers `msg.ack()` on transient errors | Error Review §5 | 2 hr | Check `classifyAiError` severity; `msg.retry()` for transient, `msg.ack()` for permanent | DONE |
| 3.4 | `classifyHttpError` "not found" string match | Error Review §10 | 30 min | Replace with explicit error type/subclass check | DONE |
| 3.5 | Cloudflare STT branches on `providerModelId.includes("deepgram")` | Code Quality Step 4 | 1 hr | Split into two separate provider implementations | DONE — `cloudflare` (Whisper) + `cloudflare-deepgram`; DB rows using `cloudflare` with deepgram models need provider updated to `cloudflare-deepgram` |
| 3.6 | Hardcoded `"en"` language in AssemblyAI + Google STT | Code Quality Step 4 | 1 hr | Thread podcast language from RSS through to STT providers | N/A — providers removed in 3.2 |
| 3.7 | Extract magic bitrate constants (5 sites) | Code Quality Step 7 | 30 min | Create named constants in `constants.ts` | DONE |
| 3.8 | Extract error-path DB logging boilerplate (5 queue files) | Code Quality Step 7 | 30 min | Create `logDbError()` helper in `logger.ts` | DONE |
| 3.9 | `resolveModelChain` sequential DB calls | Code Quality Step 7 | 30 min | Batch with `Promise.all` | DONE |
| 3.10 | `prisma: any` / `log: any` throughout queue handlers | Code Quality Step 8 | 2 hr | Replace with generated PrismaClient type and PipelineLogger interface | DONE |
| 3.11 | Orchestrator `Record<string, any>` message construction | Code Quality Step 5 | 30 min | Use typed queue message interfaces | DONE |

**Estimated total: ~16 hours**

---

## Phase 4 — Billing Enforcement (Revenue Protection)

Priority: Plan limits are defined but never enforced — free users have unlimited access.

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 4.1 | Add usage metering | SaaS 7.2 | 4 hr | Track briefingsThisWeek, onDemandThisWeek per user (counter table or aggregation) | SKIP |
| 4.2 | Enforce `maxPodcastSubscriptions` | SaaS 7.1 | 1 hr | Check count before subscribe; return 403 with upgrade CTA | SKIP |
| 4.3 | Enforce `briefingsPerWeek` | SaaS 7.1 | 1 hr | Check meter before briefing creation | SKIP |
| 4.4 | Enforce `onDemandRequestsPerWeek` | SaaS 7.1 | 1 hr | Check meter before on-demand request | SKIP |
| 4.5 | Enforce `maxDurationMinutes` | SaaS 7.1 | 30 min | Validate requested duration tier against plan | SKIP |
| 4.6 | Enforce `concurrentPipelineJobs` | SaaS 9.5 | 1 hr | Check active job count before creating new ones | SKIP |

**Estimated total: ~9 hours**

---

## Phase 5 — Tests (Lock In Quality)

Priority: Cover the riskiest untested paths identified during review.

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 5.1 | Orchestrator has no tests | Code Quality Step 8 | 4 hr | Test stage routing, CAS logic, concurrent messages, briefing assembly trigger | DONE — 11 new tests added |
| 5.2 | STT chunked-upload + Deepgram branching untested | Code Quality Step 8 | 2 hr | Unit tests for CloudflareProvider with both model paths | DONE — 17 tests (Whisper + Deepgram + registry) |
| 5.3 | Billing enforcement integration tests | Phase 4 | 2 hr | Test limit checks return 403 with correct plan context | SKIP — Phase 4 skipped |
| 5.4 | Auth middleware suspension check tests | Phase 1.8 | 1 hr | Test suspended/banned user gets 403 | SKIP — 1.8 skipped |
| 5.5 | Shared briefing authorization tests | Phase 1.5 | 1 hr | Test enumeration is blocked without share token | SKIP — 1.5 skipped |
| 5.6 | SSRF URL validation tests | Phase 1.4 | 30 min | Test private IPs, metadata endpoints, non-http schemes rejected | DONE — 32 tests |

**Estimated total: ~11 hours**

---

## Phase 6 — UX (Make It Usable)

Priority: Fix launch-blocking UX issues.

### P0 (Must-fix before public launch)

| # | Finding | Source | Effort | Action | Status |
|---|---------|--------|--------|--------|--------|
| 6.1 | Empty feed — no path forward for new users | UX P0-1 | Low | Add contextual explanation + inline popular podcasts | DONE |
| 6.2 | Swipe gestures have no affordance | UX P0-2 | Low | Add first-session swipe hint animation | DONE |
| 6.3 | Subscription limit gate navigates away | UX P0-3 | Low | Show UpgradeModal instead of navigating to /settings | DONE |
| 6.4 | No Clerk load failure fallback | UX P0-4 | Medium | Add error boundary around SignIn with retry/contact support | SKIP |
| 6.5 | Onboarding → empty feed confusion | UX P0-5 | Low | Add "briefings creating" status explanation on completion screen | DONE |

### P1 (Fix before or shortly after launch)

| # | Finding | Effort | Status |
|---|---------|--------|--------|
| 6.6 | Accessibility: keyboard swipe alternatives, aria-labels, SeekBar aria-valuetext | Medium | DONE |
| 6.7 | Request-a-podcast form needs name search, not RSS URL | Low | DONE |
| 6.8 | "Blipp" button needs tooltip/subtitle for new users | Low | DONE |
| 6.9 | Filter pills: add counts, add empty-state CTAs | Low | DONE |
| 6.10 | "Creating" badge: add ETA context | Low | DONE |
| 6.11 | Landing page: add Pricing link | Trivial | DONE |
| 6.12 | CookieConsent: scope to unauthenticated routes only | Low | DONE |

**Estimated total: ~12 hours**

---

## Phase 7 — Operations & Reliability (Scale Readiness)

Priority: Address after the above phases are complete.

| # | Finding | Source | Effort |
|---|---------|--------|--------|
| 7.1 | Analytics queries load all rows into memory | SaaS 3.2, 3.3 | Medium — rewrite as `GROUP BY` SQL |
| 7.2 | Dead letter queue handling | SaaS 4.4 | Medium — configure CF DLQ + alert |
| 7.3 | Circuit breaker state is per-isolate | Code Quality, Error Capture | Medium — move to KV |
| 7.4 | GDPR data export + deletion request flow | SaaS 1.2 | High |
| 7.5 | Audit log coverage gaps | SaaS 1.1 | Low — add `writeAuditLog` to missing admin actions |
| 7.6 | ExternalServiceError table for non-AI services | Error Capture §4 | Medium |
| 7.7 | Incident runbooks | SaaS 6.4 | Low — document existing implicit procedures |
| 7.8 | Config key registry + validation | Code Quality Step 5 | Medium |
| 7.9 | Shared types between frontend/backend | Code Quality Step 5 | High — zod schemas or shared package |
| 7.10 | `worker/lib/` directory structure | Code Quality Step 8 | Low — create stt/, tts/, transcript/ subdirs |

---

## Cross-Cutting Architectural Decisions

### Decisions Made (Correct)
1. **Per-request PrismaClient** — correct for Cloudflare Workers; no connection pooling issues.
2. **Queue retry via Cloudflare Queues** — correct pattern; but transient error handling needs fix (Phase 3.3).
3. **Multi-provider AI with model chain fallback** — well-abstracted; STT needs polish (Phase 3.2, 3.5).
4. **Clip sharing across users** — correct cost optimization; document the privacy boundary clearly.

### Decisions to Revisit
1. **`prisma: any` everywhere** — started as convenience, now a maintenance burden. Fix in Phase 3.10.
2. **In-memory circuit breaker** — defeats the purpose on serverless. Move to KV (Phase 7.3).
3. **Config keys as raw strings** — creates silent failures. Add a registry (Phase 7.8).

---

## Document Index

| Document | Path |
|----------|------|
| SaaS Readiness Gaps | `docs/reviews/saas-readiness-gaps.md` |
| Security Review | `docs/reviews/security-review.md` |
| Error Handling Review | `docs/reviews/error-handling-review.md` |
| Error Capture Design | `docs/reviews/error-capture-design.md` |
| Code Quality Analysis | `docs/reviews/code-quality-analysis.md` |
| UX Improvement Plan | `docs/reviews/ux-improvement-plan.md` |
| **This Master Plan** | `docs/reviews/master-review-plan.md` |
