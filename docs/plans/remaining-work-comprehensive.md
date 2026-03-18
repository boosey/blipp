# Blipp — Comprehensive Remaining Work

**Date:** 2026-03-18 (verified against codebase)
**Scope:** All remaining plan files consolidated with current implementation status.

---

## Status Legend

- **DONE** — Fully implemented and functional
- **PARTIAL** — Infrastructure exists but gaps remain
- **NOT STARTED** — No implementation exists

---

## 1. ~~Phase 5A: Audio Assembly~~ — DONE

**Source:** `2026-03-14-plan-phase5a-audio-assembly.md`, `2026-03-14-wasm-audio-processing-design.md`
**Status:** DONE — All planned items implemented or deliberately descoped.

### What's Implemented
- Briefing assembly queue handler creates Briefing records, marks FeedItems READY
- Jingle MP3s uploaded to R2 at `assets/jingles/intro.mp3` and `assets/jingles/outro.mp3`
- Jingle serving routes (`/api/assets/jingles/intro.mp3`, `/api/assets/jingles/outro.mp3`)
- Frontend jingle caching via Cache API (`src/lib/jingle-cache.ts`)
- Narrative metadata intro fully implemented: `buildMetadataIntro()` in `worker/lib/distillation.ts:138` injects podcast name, episode title, release date, original/briefing length into the LLM prompt. Queue handler loads episode+podcast metadata and passes it through.
- Audio context plays the full sequence client-side: preroll ad → intro jingle → briefing clip → outro jingle → postroll ad

### Architectural Decisions
- **Client-side sequencing, not server-side concatenation.** The audio player sequences segments (ads, jingles, briefing) at playback time rather than concatenating into a single MP3 server-side. This is simpler, avoids R2 storage bloat from per-user assembled files, and supports dynamic ad insertion.
- **No Wasm audio processing layer.** Server-side crossfading, volume normalization, and music bed mixing were deliberately descoped. Not needed — jingles are pre-mastered to match TTS levels, and hard cuts are acceptable with built-in fades.
- **No `BRIEFING_ASSEMBLY_ENABLED` config flag needed.** The assembly stage works as-is and the client handles sequencing. No reason for a server-side toggle.

### Source plans can be deleted
- `2026-03-14-plan-phase5a-audio-assembly.md` — fully implemented
- `2026-03-14-wasm-audio-processing-design.md` — deliberately descoped

---

## 2. Phase 5B: Frontend UX

**Source:** `2026-03-14-plan-phase5b-ux.md`, `2026-03-14-ux-improvement-plan.md`
**Status:** P0 DONE, significant P1/P2 items also done. Remaining items are mostly polish.

### What's Done (P0 — Launch Blockers) — ALL COMPLETE
- Mini-player with persistent audio across navigation
- Player sheet with full controls (skip 15s/30s, speed cycling, seek bar, artwork)
- Audio context with Media Session API (lock-screen controls)
- Onboarding flow (welcome, podcast selection, subscribe)
- Skeleton screens (feed, discover, library, player)
- Toast notifications via Sonner (success, error, info throughout app)
- Landing page redesign with hero, features, animations
- Error handling — toasts on API failures (replaced silent catches)

### What's Done (P1/P2/P3 — Originally Listed as Remaining)
- **Empty states with actions** — DONE. Reusable `EmptyState` component with icon + CTA. Used on Home (→ Discover), Library (→ Browse), Discover (no results).
- **Listening history & stats** — DONE. `history.tsx` with date grouping (Today/Yesterday/This Week), total briefings, minutes listened, minutes saved.
- **Swipe-to-mark-listened** — DONE. `swipeable-feed-item.tsx` with right-swipe (30% threshold) to toggle listened, left-swipe (80%) to remove.
- **Pull-to-refresh** — DONE. `usePullToRefresh()` hook used on Home, Library, Discover.
- **Push notifications infrastructure** — DONE. Web Push API integration in Settings, VAPID key endpoint, subscribe/unsubscribe endpoints. Toggle UI in settings.
- **Page transitions** — DONE. CSS keyframe animations (slide-forward/slide-back) in `index.css`.
- **Discover page** — MOSTLY DONE. Category pills, trending horizontal scroll, debounced search, initial-letter fallback, "For You" recs with reason strings, podcast request form.
- **Accessibility (partial)** — Player sheet has aria-labels on all controls, seek slider has `role="slider"` + aria-value attributes.

### What's Remaining

#### P1 — Launch Quality

| Item | Effort | Notes |
|------|--------|-------|
| **Feed improvements** | Medium | Date grouping exists in history.tsx but NOT in home feed. Missing: filter pills (All/New/Subscription/On-demand/Creating), unlistened count badge, relative timestamps on feed items. Feed item shows `durationTier + "min"` not actual `MM:SS` duration. |
| **Discover page (minor)** | Low | Episode count badge on artwork cards (data exists, not rendered). Subscriber count display (not in data model). |
| **Subscription management** | Medium | Library has no list/grid toggle, no management sheet per podcast (change tier, pause, unsubscribe from library). Podcast detail page allows subscribe/unsubscribe but not accessible from library. |
| **Settings page gaps** | Medium | Has plan info + push notification toggle. Missing: Account section (name/email from Clerk), Preferences (default duration, auto-play), About section (version, legal links), Sign Out button. |

#### P2 — Delight

| Item | Effort | Notes |
|------|--------|-------|
| **Smart feed ordering** | Low | Feed shows flat chronological list. No unlistened-first ordering, no "Catch Up" button for sequential playback. |
| **Briefing preview text** | Low | No text preview from distillation visible on feed items or player page. |
| **Theme & visual polish** | Medium | Brand accent color defined but set to neutral grays — no distinctive color. Inter font `@font-face` uses Google Fonts CSS URL incorrectly (should be `.woff2` URL or `<link>` import) — font likely not loading. |
| **Share briefing** | Low | No share button in player sheet. No Web Share API integration. |
| **Micro-interactions** | Low | CSS transitions on buttons present. Missing: stagger-fade on feed items, framer-motion not installed. |

#### P3 — Future / Post-Launch

| Item | Effort | Notes |
|------|--------|-------|
| Offline playback | High | No service worker caching of audio files |
| Queued playback | Medium | Single-item audio context. No "Play All", no auto-advance, no queue. |
| Listening streaks & gamification | Medium | History page has basic stats but no streaks, badges, or achievements |
| Social features | Medium | No sharing activity, no "Blipp Wrapped" |
| Accessibility completion | Medium | Missing: custom focus rings, `prefers-reduced-motion` support, color contrast fixes (zinc-500 on zinc-950 fails AA for small text), consistent 44x44px touch targets |
| Tablet/desktop layout | High | Mobile-only. No responsive breakpoints for larger screens. |

#### Technical Debt Affecting UX
- Inter font loading broken (`@font-face src` uses Google Fonts CSS URL, not `.woff2` file)
- No React error boundaries at layout level
- Feed item duration shows "X min" not actual "M:SS"

---

## 3. Recommendation Engine

**Source:** `2026-03-17-recommendation-engine.md`
**Status:** Phase 1 DONE (including cron), Phase 2 NOT STARTED

### What's Done (Phase 1 — Category-Based, Zero AI Cost)
- Schema: PodcastProfile, UserRecommendationProfile, RecommendationCache models
- Scoring: cosine similarity on category weights + popularity + freshness
- Cold start fallback to popular podcasts
- Public API: `GET /recommendations`, `GET /recommendations/similar/:podcastId`
- Admin API: stats, recompute trigger, user profiles, podcast profiles
- Frontend: "For You" section on Discover page with reason strings
- **Scheduled cron job** — `runRecommendationsJob()` calls `computePodcastProfiles()` in the cron pipeline

### What's Remaining

| Item | Effort | Priority | Notes |
|------|--------|----------|-------|
| **Profile recompute on user actions** | Low | P2 | Subscribe/unsubscribe/favorite events don't trigger `recomputeUserProfile()`. Cache stays stale until cron runs or 1-hour TTL expires. |
| **Home feed integration** | Low | P2 | Recommendations only on Discover, not Home |

### Phase 2 — Topic Fingerprinting (~$1/month AI cost) — NOT STARTED

| Item | Effort | Notes |
|------|--------|-------|
| Topic extraction via LLM | Medium | Load 3-5 recent claims per podcast, single Haiku call to extract 10-20 topic tags. ~$0.10/month cost. |
| Enhanced scoring with topic similarity | Low | Add Jaccard similarity on topic tags, shift weights |
| Richer reason strings | Low | "Covers AI and machine learning, like [Lex Fridman]" instead of generic matches |
| "Similar Podcasts" on podcast detail | Low | Horizontal scroll using existing `/recommendations/similar/:id` endpoint |
| Distillation hook for topic refresh | Low | After distillation, check if PodcastProfile.topicTags is stale (>7 days), run extraction inline |

### Phase 3 — Behavioral Refinement (FUTURE)
- Dismissal signals, feed interstitials, collaborative filtering, listen-through rate, embeddings, A/B testing

---

## 4. AI Cost Reduction

**Source:** `2026-03-06-ai-cost-reduction-strategies.md`
**Status:** NOT STARTED (model configurator enables cheaper models, but no active cost optimization code)

| Strategy | Estimated Savings | Effort | Priority | Notes |
|----------|------------------|--------|----------|-------|
| **Prompt caching** | 90% on cached prefix tokens | Low | P1 | Add `cache_control` on system message in `extractClaims()` and `generateNarrative()`. No `cache_control` found anywhere in codebase. |
| **Transcript truncation** | 50-80% on input tokens | Medium | P1 | Full transcripts sent to LLM. Truncate to ~8,000 words or two-pass with Haiku. |
| **Haiku for claim extraction** | ~90% on distillation | Low | P1 | Already possible via model configurator admin UI — just configure it |
| **Share narratives across duration tiers** | 1 less Claude call per additional tier | Medium | P2 | Generate longest narrative once, trim for shorter tiers |
| **Batch API for free tier** | 50% on free-tier costs | Medium | P2 | Anthropic Batches API: 50% cheaper, up to 24h latency |
| **Switch TTS provider** | Variable | High | P3 | Evaluate ElevenLabs, Google Cloud TTS, CF Workers AI |
| **TTL-based staleness threshold** | Avoids regen of recent content | Low | P2 | Serve cached briefing if <24h old |

**Combined impact of top 3:** 80-90% reduction in Claude API costs.

---

## 5. SaaS Readiness Gaps

**Source:** `2026-03-14-saas-readiness-gaps.md`
**Status:** MOST items now implemented. Key gaps: Zod validation, alert delivery, legal pages.

### Already Implemented (verified in codebase)
- **Audit logging** — AuditLog model + admin page with filtering/search
- **Rate limiting** — In-memory sliding window per user/IP, 429 responses, X-RateLimit headers
- **Feature flags** — Full system: user allowlist/denylist, date ranges, plan gating, percentage rollout, admin UI
- **Deep health check** — DB connectivity, R2 availability, queue bindings check
- **CI/CD** — GitHub Actions: `ci.yml` (PR checks), `deploy-staging.yml`, `deploy-production.yml`
- **Request ID middleware** — Correlation IDs propagated
- **Structured JSON logging** — Throughout pipeline
- **Webhook signature verification** — Clerk and Stripe
- **Database indexes** — 22 composite/single-column indexes including FeedItem(userId,status,createdAt), AiServiceError, AuditLog, PipelineJob, etc.
- **CORS origin restriction** — Allowlist-based with env override (`ALLOWED_ORIGINS`), not open to all origins
- **CSP headers** — Full Content-Security-Policy + X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy (`worker/middleware/security-headers.ts`)
- **Circuit breakers** — CLOSED/OPEN/HALF_OPEN per provider with configurable thresholds (`worker/lib/circuit-breaker.ts`)
- **Provider failover** — Primary/secondary/tertiary model resolution with circuit breaker integration (`worker/lib/model-resolution.ts`)
- **User suspend/ban** — `status` field on User model ("active"/"suspended"/"banned"), PATCH endpoint in admin
- **GDPR data export** — `GET /api/me/export` returns user data, subscriptions, feed items, briefing requests
- **GDPR account deletion** — `DELETE /api/me` with Stripe customer delete, Clerk user delete, cascading DB delete
- **User-visible usage tracking** — `GET /api/me/usage` returns period, briefings used/limit/remaining, subscriptions, maxDuration
- **Stripe webhooks** — Handles: `checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_failed` (3-attempt downgrade), `customer.subscription.deleted`
- **Revenue analytics** — Admin analytics page with usage trends, cost tracking
- **Trial expiration** — Cron job detects expired trials (14+ days on default plan, no Stripe sub). Currently logs only.
- **Data retention** — Cron job for aging old requests (30 days), episode aging (180 days, manual). Feature-gated.
- **Prisma migrations** — Migration directory exists with migration files
- **Caching** — PlatformConfig 60s TTL + HTTP response caching (catalog 300s, health 30s) + recommendation cache 1-hour TTL

### Remaining Gaps

#### Security (P1)

| Item | Effort | Notes |
|------|--------|-------|
| **Systematic Zod validation** | Medium | **Zero Zod imports in codebase.** All routes use manual `c.req.json<T>()` type-casting without runtime validation. Admin routes accept body directly into Prisma operations. This is the biggest security gap. |

#### Governance & Compliance (P2)

| Item | Effort | Notes |
|------|--------|-------|
| Terms of Service / Privacy Policy | Low | No legal pages or content. No `/legal`, `/tos`, `/privacy` routes. |
| Consent tracking | Low | No cookie consent, no marketing opt-in |
| R2 artifact cleanup on user delete | Low | `DELETE /api/me` cascades DB but R2 deletion appears commented out |

#### Administration (P2)

| Item | Effort | Notes |
|------|--------|-------|
| Alert delivery mechanism | Medium | Cost alerts are detected and stored in PlatformConfig, but no webhook/email/Slack delivery to admins. Alerts only visible when someone checks the dashboard. |
| Content moderation | Medium | No mechanism to flag, review, or block generated content. No moderation fields on Clip/Distillation/Briefing models. |

#### Performance (P2)

| Item | Effort | Notes |
|------|--------|-------|
| KV-based rate limiter | Medium | Current in-memory rate limiter resets per Worker isolate/redeploy. Need KV or Durable Objects for persistence at scale. |
| R2 custom domain + CDN | Low | CDN caching for audio delivery |
| Neon paid plan | Manual | Free tier cold starts (5-10s) are a UX problem |

#### Reliability (P2)

| Item | Effort | Notes |
|------|--------|-------|
| DLQ monitoring | Low | Dead-lettered messages have no visibility or replay mechanism in admin |

#### Billing (P2)

| Item | Effort | Notes |
|------|--------|-------|
| Trial enforcement | Low | Trial expiration detected by cron but no access restriction or notification — just logs |
| Missing Stripe events | Low | Missing: `charge.refunded`, `charge.dispute.created`, `customer.subscription.paused` |

---

## 6. Manual Setup / Infrastructure Items

**Source:** `remaining-items.md`
**Status:** Some items now done (Prisma migrations, CI/CD). Others still manual.

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| **Prisma migration baseline** | — | DONE | Migration directory exists with files |
| **CI/CD config** | — | DONE | 3 GitHub Actions workflows |
| **VAPID keys** | P2 | UNKNOWN | Push notification UI exists in settings. Keys may already be configured. |
| **Neon API credentials** | P2 | Manual | For backup verification |
| **Hyperdrive config ID** | P1 | Manual | Replace placeholder in `wrangler.jsonc` |
| **Branded PWA icons** | P2 | Manual | Replace placeholder `icon-192.png` and `icon-512.png` |
| **Sentry error tracking** | P1 | Manual | Install `@sentry/cloudflare`, replace stub, add `SENTRY_DSN` |
| **KV rate limiting namespace** | P2 | Manual | Create KV namespace, add binding, update middleware |
| **Metrics export** | P3 | NOT STARTED | Prometheus, Datadog, or CF Analytics Engine |
| **Log shipping** | P3 | NOT STARTED | CF Logpush to external aggregator |
| **Infrastructure as Code** | P3 | NOT STARTED | Terraform/Pulumi for R2, Queues, Hyperdrive, KV |
| **Reduce `prisma: any` casts** | P3 | NOT STARTED | ~50+ instances. Cosmetic. |

---

## 7. Reference Documents (No Remaining Work)

These files are reference material, not implementation plans:

| File | Purpose | Action |
|------|---------|--------|
| `2026-03-14-generalized-review-template.md` | Reusable 12-step review framework | Keep |
| `2026-03-06-ai-cost-reduction-strategies.md` | Cost optimization strategies | Keep (items extracted above) |
| `2026-03-14-saas-readiness-gaps.md` | Gap analysis | Can delete (superseded by this doc) |
| `2026-03-14-ux-improvement-plan.md` | UX analysis | Can delete (superseded by this doc) |
| `2026-03-14-wasm-audio-processing-design.md` | Wasm audio design | Can delete (deliberately descoped) |
| `2026-03-14-plan-phase5a-audio-assembly.md` | Audio assembly plan | Can delete (fully implemented) |
| `2026-03-14-plan-phase5b-ux.md` | UX implementation plan | Can delete (superseded by this doc) |
| `2026-03-17-recommendation-engine.md` | Recommendation engine plan | Can delete (Phase 1 fully implemented) |
| `remaining-items.md` | Manual setup items | Can delete (superseded by this doc) |

---

## Priority Summary

### P0 — Launch Blockers — ALL DONE
Mini-player, onboarding, skeletons, toasts, landing page, error handling, empty states.

### P1 — High-Impact, Do Soon

| Area | Item | Effort |
|------|------|--------|
| **Security** | **Systematic Zod validation on all routes** | Medium |
| Cost | Prompt caching for Claude calls | Low |
| Cost | Configure Haiku for claim extraction via admin UI | Low |
| Cost | Transcript truncation before distillation | Medium |
| Infra | Sentry error tracking | Low |
| Infra | Hyperdrive config ID in wrangler.jsonc | Low |
| UX | Feed date grouping + filter pills + unlistened badge | Medium |

### P2 — Important but Not Blocking

| Area | Item | Effort |
|------|------|--------|
| UX | Settings page (account, preferences, about, sign-out) | Medium |
| UX | Subscription management from Library | Medium |
| UX | Smart feed ordering + Catch Up button | Low |
| UX | Briefing preview text on feed items | Low |
| UX | Share briefing (Web Share API) | Low |
| UX | Fix Inter font loading | Low |
| Recs | Profile recompute on user actions | Low |
| Recs | Topic fingerprinting (Phase 2) | Medium |
| Cost | Batch API for free tier | Medium |
| Admin | Alert delivery (webhook/email/Slack) | Medium |
| Admin | Content moderation system | Medium |
| Compliance | Terms of Service / Privacy Policy pages | Low |
| Perf | KV-based rate limiter | Medium |
| Billing | Trial enforcement (restrict access, not just log) | Low |

### P3 — Post-Launch / Future

| Area | Item |
|------|------|
| UX | Offline playback, queued playback, listening streaks, gamification |
| UX | Accessibility completion (focus rings, reduced motion, contrast) |
| UX | Tablet/desktop layout |
| Recs | Behavioral refinement (dismissals, collaborative filtering, embeddings) |
| Cost | Alternative TTS providers |
| Infra | IaC (Terraform), metrics export, log shipping |
| Code | Reduce `prisma: any` casts |
