# Blipp — Remaining Work

**Date:** 2026-03-19 (verified against codebase)
**Scope:** All plan files (docs/plans/ + docs/superpowers/plans/) audited against implementation.

---

## Completed Work (summary)

Everything below is fully implemented and merged to `main`. No remaining work.

| Area | What's Done |
|------|-------------|
| **Audio Assembly** | Briefing assembly queue, jingle serving + caching, client-side sequencing (preroll → jingle → briefing → jingle → postroll), narrative metadata intro. Wasm audio deliberately descoped. |
| **Frontend UX (P0-P2)** | Mini-player, player sheet (skip/speed/seek/artwork/swipe-dismiss), onboarding, skeletons, toasts, landing page, error handling, empty states, listening history + stats, push notification infrastructure. |
| **Feed** | Date grouping (Today/Yesterday/This Week), filter pills (All/New/Subscriptions/On Demand/Creating), unlistened count badge, M:SS duration format, smart sort (unlistened-first), Play Next button, briefing preview text, stagger-fade animation. Share button (Web Share API + clipboard + cross-user links via `GET /feed/shared/:id`). Swipeable items (right = listened, left = remove). |
| **Settings** | Account card with avatar, usage meters, default duration preference, data export, delete account with confirmation, about section with version, sign out. Theme switching (light/dark/system). Push notification toggle. |
| **Subscription Management** | Subscribe/unsubscribe/change tier on podcast detail page with `TierPicker`. Library grid opens podcast detail. |
| **Mobile Responsive (Phase 1)** | Feed card redesign (podcast name above episode title, blue left border unlistened, sweep glow for creating), player sheet scroll/compact/constrained artwork, discover card fixes, library tab ordering (Favorites default). |
| **Native Feel (Phase 2)** | CSS View Transitions API via `useViewTransition()` hook + direction-based keyframes, pull-to-refresh on Home/Discover/Library, swipeable feed items, view-transition-aware bottom nav, haptic press states (`active:scale-[0.98]`), CSS scroll-snap on carousels. |
| **PWA (Phase 3)** | Install prompt (`beforeinstallprompt` + dismissible banner), offline audio caching (service worker `briefing-audio` cache, LRU 50 entries), offline indicator banner, Capacitor iOS scaffolding + TestFlight guide. |
| **Apple Catalog Source** | Full implementation (Apple client, catalog-refresh queue, Category model, PodcastCategory join, content-prefetch queue, DLQ, admin catalog page, dynamic category pills). Currently using Podcast Index; Apple source switchable via `catalog.source` PlatformConfig. |
| **Claims Benchmark** | Schema (ClaimsExperiment + ClaimsBenchmarkResult), two-phase runner (extraction → LLM-as-judge), judge module with Zod validation + scoring, admin page with experiment setup + comparison grid + drill-down, 500+ lines of tests. |
| **Prompt Management** | Defaults module (`worker/lib/prompt-defaults.ts`), runtime-configurable prompts via PlatformConfig, `notable_quote` on Claim schema, admin page with textarea editor + reset-to-default, podcast-voice narrative style. |
| **Recommendations (Phase 1)** | PodcastProfile/UserRecommendationProfile/RecommendationCache models, cosine similarity scoring, cold start fallback, public + admin API, "For You" on Discover, cron job, realtime recompute on subscribe/unsubscribe/favorite/listened. |
| **AI Cost: Prompt Caching** | `cache_control: { type: "ephemeral" }` on system messages in `worker/lib/llm-providers.ts`. |
| **Theme & Polish** | Blue brand accent (`oklch(0.45 0.15 250)` / `oklch(0.65 0.15 250)`), Inter font via Google Fonts `<link>`, episode votes (PodcastVote + EpisodeVote models). |
| **SaaS Infrastructure** | Audit logging, rate limiting, feature flags, deep health check, CI/CD, request IDs, structured logging, webhook verification, 22+ DB indexes, CORS, CSP headers, circuit breakers, provider failover, user suspend/ban, GDPR export + deletion, usage tracking, Stripe webhooks, revenue analytics, trial detection, data retention, Prisma migrations, multi-layer caching. |

---

## What's Left

### P1 — High-Impact, Do Soon

| # | Area | Item | Effort | Details |
|---|------|------|--------|---------|
| ~~1~~ | ~~**Security**~~ | ~~**Zod validation on API routes**~~ | ~~Medium~~ | **DONE** — Zod validation on all 15 public API routes via `validateBody()` helper. `ValidationError` class + `classifyHttpError` integration. Admin routes deferred. |
| 2 | Cost | Transcript truncation before distillation | Medium | Full transcripts sent to LLM. Truncate to ~8,000 words or two-pass with Haiku. 50-80% input token savings. |
| 3 | Cost | Configure Haiku for claim extraction | Low | Already possible via model configurator admin UI — just needs configuration. ~90% cost reduction on distillation stage. |
| ~~4~~ | ~~Infra~~ | ~~Sentry error tracking~~ | ~~Low~~ | **DONE** — `@sentry/cloudflare` installed, `withSentry()` wrapper on worker export, stubs replaced with real SDK calls. Activate with `wrangler secret put SENTRY_DSN`. |
| ~~5~~ | ~~Infra~~ | ~~Hyperdrive config ID~~ | ~~Low~~ | **DONE** — Already configured with real Hyperdrive IDs for staging + production. |

### P2 — Important but Not Blocking

| # | Area | Item | Effort | Details |
|---|------|------|--------|---------|
| ~~6~~ | ~~Recs~~ | ~~Home feed integration~~ | ~~Low~~ | **DONE** — "For You" horizontal scroll row on Home page using `/recommendations` API. |
| 7 | Recs | Topic fingerprinting (Phase 2) | Medium | LLM-based topic extraction from claims → Jaccard similarity → richer reason strings. ~$0.10/month. Includes "Similar Podcasts" on detail page. |
| 8 | Cost | Share narratives across duration tiers | Medium | Generate longest narrative once, trim for shorter tiers. Saves 1 Claude call per additional tier. |
| 9 | Cost | Batch API for free tier | Medium | Anthropic Batches API: 50% cheaper, up to 24h latency. |
| 10 | Cost | TTL-based staleness threshold | Low | Serve cached briefing if <24h old, skip regeneration. |
| 11 | Admin | Alert delivery | Medium | Cost alerts stored in PlatformConfig but no webhook/email/Slack delivery. Alerts only visible on dashboard. |
| 12 | Admin | Content moderation | Medium | No mechanism to flag, review, or block generated content. |
| ~~13~~ | ~~Compliance~~ | ~~Terms of Service / Privacy Policy~~ | ~~Low~~ | **DONE** — `/tos` and `/privacy` routes with content. Settings links updated from `href="#"` to React Router `Link`. |
| ~~14~~ | ~~Compliance~~ | ~~Consent tracking~~ | ~~Low~~ | **DONE** — Cookie consent banner with Accept/Decline, localStorage tracking, link to privacy policy. |
| ~~15~~ | ~~Compliance~~ | ~~R2 artifact cleanup on user delete~~ | ~~Low~~ | **DONE** — `deleteUserAccount()` now collects orphaned clip R2 keys before cascade delete, then removes them. Only deletes clips not referenced by other users. |
| ~~16~~ | ~~Perf~~ | ~~KV-based rate limiter~~ | ~~Medium~~ | **DONE** — Rate limiter uses `RATE_LIMIT_KV` when available (KV namespace binding + `expirationTtl`), falls back to in-memory. KV IDs need `wrangler kv namespace create`. |
| ~~17~~ | ~~Perf~~ | ~~R2 custom domain + CDN~~ | ~~Low~~ | **DONE** — Audio responses now use `Cache-Control: public, max-age=604800, immutable`, ETag from R2, `Accept-Ranges: bytes` with range request support. Custom domain is a manual CF dashboard step. |
| 18 | Perf | Neon paid plan | Manual | Free tier cold starts (5-10s) are a UX problem. |
| ~~19~~ | ~~Reliability~~ | ~~DLQ monitoring~~ | ~~Low~~ | **DONE** — Admin DLQ page at `/admin/dlq` with stuck jobs table, exhausted retries table, retry buttons, auto-refresh 30s. Sidebar entry in Pipeline group. |
| 20 | Billing | Trial enforcement | Low | Trial expiration detected by cron but only logs — no access restriction or notification. |
| 21 | Billing | Missing Stripe events | Low | Missing: `charge.refunded`, `charge.dispute.created`, `customer.subscription.paused`. |

### P3 — Post-Launch / Future

| # | Area | Item | Effort |
|---|------|------|--------|
| 22 | UX | Queued playback / auto-advance | Medium |
| 23 | UX | Listening streaks & gamification | Medium |
| 24 | UX | Social features / Blipp Wrapped | Medium |
| 25 | UX | Accessibility (focus rings, `prefers-reduced-motion`, contrast, 44x44px touch targets) | Medium |
| 26 | UX | React error boundaries at layout level | Low |
| 27 | Recs | Behavioral refinement (dismissals, collaborative filtering, embeddings) | High |
| 28 | Cost | Alternative TTS providers (ElevenLabs, Google Cloud TTS, CF Workers AI) | High |
| 29 | Infra | Infrastructure as Code (Terraform/Pulumi) | Medium |
| 30 | Infra | Metrics export (Prometheus/Datadog/CF Analytics Engine) | Medium |
| 31 | Infra | Log shipping (CF Logpush) | Low |
| 32 | Code | Reduce `prisma: any` casts (~50+ instances) | Low |

### Manual / One-Time Setup

| Item | Priority | Status |
|------|----------|--------|
| ~~Hyperdrive config ID in `wrangler.jsonc`~~ | ~~P1~~ | **DONE** — Real IDs configured |
| ~~Sentry DSN + `@sentry/cloudflare`~~ | ~~P1~~ | **DONE** — SDK installed, activate with `wrangler secret put SENTRY_DSN` |
| VAPID keys for push notifications | P2 | Unknown |
| Neon API credentials (backup verification) | P2 | Manual |
| Branded PWA icons (icon-192/512.png) | P2 | Placeholder |
| ~~KV namespace for rate limiting~~ | ~~P2~~ | **DONE** — KV namespaces created, real IDs in `wrangler.jsonc` |

---

## Reference Documents

| File | Purpose |
|------|---------|
| `docs/plans/2026-03-14-generalized-review-template.md` | Reusable 12-step review framework |
| `docs/plans/2026-03-06-ai-cost-reduction-strategies.md` | Cost optimization strategies (prompt caching DONE, rest extracted above) |

### Plan files that can be deleted (fully implemented)

| File |
|------|
| `docs/superpowers/plans/2026-03-16-phase1-mobile-responsive.md` |
| `docs/superpowers/plans/2026-03-16-phase2-native-feel.md` |
| `docs/superpowers/plans/2026-03-16-phase3-pwa-enhancements.md` |
| `docs/superpowers/plans/2026-03-16-apple-catalog-source.md` |
| `docs/superpowers/plans/2026-03-18-claims-benchmark.md` |
| `docs/superpowers/plans/2026-03-19-prompt-management.md` |
