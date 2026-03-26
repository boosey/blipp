# External Service Error Capture System Design

_Review date: 2026-03-26_

---

## 1. External Service Call Catalog

The following table maps every external service integration to its call site, error class, and current coverage status.

| Service | Provider(s) | Call Site(s) | Error Class | Coverage |
|---|---|---|---|---|
| **LLM (completion)** | Anthropic, Groq, Cloudflare AI | `worker/lib/llm-providers.ts` | `AiProviderError` | Captured via `writeAiError` in distillation + narrative queue handlers |
| **STT (speech-to-text)** | OpenAI Whisper, Deepgram, AssemblyAI, Google STT, Groq, Cloudflare AI | `worker/lib/stt-providers.ts`, `worker/lib/audio-probe.ts` | `AiProviderError` | Captured via `writeAiError` in transcription queue handler |
| **TTS (text-to-speech)** | OpenAI, Groq, Cloudflare AI | `worker/lib/tts-providers.ts` | `AiProviderError` | Captured via `writeAiError` in audio-generation queue handler |
| **RSS Feed Fetch** | Any podcast host | `worker/lib/rss-parser.ts`, `worker/lib/transcript-sources.ts`, `worker/queues/feed-refresh.ts` | `Error` (plain) | Logged via PipelineLogger; no DB capture |
| **Audio URL Fetch** | Any podcast CDN | `worker/lib/audio-probe.ts`, `worker/lib/stt-providers.ts` | `Error` (plain) | Logged via PipelineLogger; no DB capture |
| **Transcript URL Fetch** | RSS/Podcast Index | `worker/lib/transcript-sources.ts` | Swallowed silently | Silent failure (returns null) |
| **Podcast Index API** | podcastindex.org | `worker/lib/podcast-index.ts` | `Error` (plain) | Generic catch in `byItunesId` — errors silently return null |
| **Apple Podcasts / iTunes API** | Apple | `worker/lib/apple-podcasts.ts` | `Error` (plain) | Warnings via `console.warn`; no DB capture |
| **Clerk Auth** | Clerk | `worker/middleware/auth.ts`, `worker/routes/clerk-proxy.ts` | Clerk SDK error | Caught by global Hono error handler; sent to Sentry |
| **Neon DB via Prisma** | Neon / Hyperdrive | All queue handlers, all routes | Prisma errors | Caught by global Hono error handler (routes); queue handlers have per-message try/catch |
| **R2 Storage** | Cloudflare R2 | `worker/lib/work-products.ts`, `worker/queues/*`, health check | `Error` (plain) | Queue handler catches log to console; no DB capture |
| **Cloudflare Queues** | Cloudflare | All queue `send`/`sendBatch` calls | `Error` (plain) | `.catch()` at call site; logs to console |
| **Stripe** | Stripe | `worker/lib/stripe.ts`, webhook routes | `StripeError` | Caught by global Hono error handler; classified as 502 |
| **Web Push (VAPID)** | Browser push services | `worker/lib/push.ts` | `Error` (plain) | Logged to console; returns false on failure |
| **Sentry** | Sentry | `worker/lib/sentry.ts` | n/a | Fire-and-forget; no error capture on Sentry failures |
| **Embeddings (CF AI)** | Cloudflare AI | `worker/lib/embeddings.ts` | Swallowed | Silent failure — `catch {}` returns null |
| **STT Benchmark** | Multiple | `worker/lib/stt-benchmark-runner.ts` | Mixed | Ad-hoc; not production path |

---

## 2. What Already Exists

Blipp has a solid foundation that is partially deployed:

### 2a. AiProviderError + writeAiError (DEPLOYED — AI services only)

**`worker/lib/ai-errors.ts`** provides:
- `AiProviderError` — typed error class with `provider`, `model`, `httpStatus`, `rawResponse`, `requestDurationMs`, `rateLimitRemaining`, `rateLimitResetAt`
- `classifyAiError()` — maps HTTP status + message patterns to 10 error categories (`rate_limit`, `timeout`, `auth`, `model_not_found`, `content_filter`, `invalid_request`, `server_error`, `network`, `quota_exceeded`, `unknown`) and severity (`transient` | `permanent`)
- `writeAiError()` — writes to the `AiServiceError` Prisma table (fire-and-forget, sanitizes API keys in raw response)
- `sanitizeResponse()` — strips API key/token patterns from stored bodies

**`prisma/schema.prisma` → `AiServiceError` model** captures:
- Identity: service, provider, model, operation
- Context: correlationId, jobId, stepId, episodeId
- Classification: category, severity, httpStatus
- Detail: errorMessage (2KB cap), rawResponse (2KB cap, sanitized)
- Timing: requestDurationMs, timestamp
- Retry: retryCount, maxRetries, willRetry, resolved

**Admin API** (`worker/routes/admin/ai-errors.ts`):
- Paginated list with filters: service, provider, category, severity, resolved, since, search
- Aggregate summary: byService, byProvider, byCategory, bySeverity, error rate (1h/24h/7d), top 10 error messages

**Circuit breaker** (`worker/lib/circuit-breaker.ts`):
- In-memory per-provider state (CLOSED → OPEN → HALF_OPEN)
- Configurable failure threshold (default 5), cooldown (default 30s), window (default 60s)
- Wired in transcription, distillation, narrative, audio-generation queue handlers

**Coverage gap**: `writeAiError` is only called for `AiProviderError` instances in the 4 pipeline queue handlers. Non-AI service failures (RSS, R2, Queues, Stripe, push, embeddings) are not captured in the DB.

---

## 3. Gap Analysis

| Gap | Impact |
|---|---|
| RSS feed failures not captured | Feed refresh failures are invisible in the DB; only surfaced in Cloudflare log drain |
| Audio URL fetch failures not captured | STT fallback failures are not distinguishable from feed failures in aggregate |
| Transcript source silently returns null | Swallowed errors in `transcript-sources.ts` mean transcript lookups can fail with no trace |
| Podcast Index errors swallowed in `byItunesId` | Discovery failures have no observability |
| Apple Podcasts errors are `console.warn` only | Chart fetch failures have no alerting path |
| Embeddings `catch {}` silent | Recommendation quality degradation is invisible |
| R2 errors not captured in DB | Storage failures outside health check are untracked |
| Queue `send` errors caught at call site but not DB-persisted | Message loss risk with no history |
| `writeAiError` is fire-and-forget with `.catch(() => {})` | DB errors during error capture are silently dropped |
| retryCount/maxRetries always written as 0 | Retry context in `AiServiceError` is not populated from actual retry state |
| Circuit breaker is in-memory | State resets on every deploy/isolation; no cross-isolate coordination |
| Sentry only wired on HTTP error handler | Queue handler errors, cron errors not forwarded to Sentry |

---

## 4. Design: Extending the Error Capture System

### 4a. Unified ServiceError Class

The existing `AiProviderError` should be extended into a general `ExternalServiceError` that covers all external calls:

```typescript
// worker/lib/service-errors.ts

export type ServiceCategory =
  | "ai_llm" | "ai_stt" | "ai_tts" | "ai_embedding"
  | "rss_feed" | "audio_fetch" | "transcript_fetch"
  | "podcast_index" | "apple_podcasts"
  | "database" | "r2_storage" | "queue" | "push"
  | "stripe" | "clerk" | "sentry";

export type ErrorCategory =
  | "rate_limit" | "timeout" | "auth" | "not_found"
  | "content_filter" | "invalid_request" | "server_error"
  | "network" | "quota_exceeded" | "parse_error" | "unknown";

export type ErrorSeverity = "transient" | "permanent";

export class ExternalServiceError extends Error {
  readonly serviceCategory: ServiceCategory;
  readonly operation: string;
  readonly httpStatus?: number;
  readonly rawResponse?: string;
  readonly requestDurationMs: number;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  // AI-specific
  readonly provider?: string;
  readonly model?: string;
  readonly rateLimitRemaining?: number;
  readonly rateLimitResetAt?: Date;

  constructor(opts: {
    message: string;
    serviceCategory: ServiceCategory;
    operation: string;
    httpStatus?: number;
    rawResponse?: string;
    requestDurationMs: number;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    provider?: string;
    model?: string;
    rateLimitRemaining?: number;
    rateLimitResetAt?: Date;
  }) { ... }
}
```

`AiProviderError` can remain as a subclass or be replaced with `ExternalServiceError` with `serviceCategory` set.

### 4b. Extended Database Table

The existing `AiServiceError` table covers AI services well. Add a companion table (or extend it) for non-AI external services:

```prisma
model ExternalServiceError {
  id                String   @id @default(cuid())

  // Service identity
  serviceCategory   String   // "rss_feed", "audio_fetch", "r2_storage", etc.
  operation         String   // "fetch_feed", "probe_audio", "put_object", etc.
  endpoint          String?  // URL called (hostname only, no path params with IDs)

  // Classification
  category          String   // rate_limit, timeout, network, server_error, etc.
  severity          String   // "transient" | "permanent"
  httpStatus        Int?

  // Detail
  errorMessage      String   // capped 2KB
  rawResponse       String?  // capped 2KB, sanitized

  // Timing
  requestDurationMs Int
  timestamp         DateTime @default(now())

  // Pipeline context (optional)
  correlationId     String?
  jobId             String?
  episodeId         String?
  podcastId         String?

  // Retry context
  retryCount        Int      @default(0)
  willRetry         Boolean  @default(false)

  @@index([serviceCategory, timestamp])
  @@index([category, timestamp])
  @@index([correlationId])
  @@index([episodeId])
}
```

Alternatively, unify into a single `ServiceError` table with a broader `serviceCategory` field and deprecate `AiServiceError`. Given that `AiServiceError` is already deployed and queried by the admin dashboard, a new `ExternalServiceError` table with no overlap is lower risk.

### 4c. Error Classification Extension

Extend `classifyAiError()` into a general `classifyServiceError()`:

```typescript
// Additions needed for non-AI services
export function classifyServiceError(
  err: unknown,
  httpStatus?: number,
): { category: ErrorCategory; severity: ErrorSeverity } {
  // ... existing AI logic preserved
  // Add:
  if (message.includes("XML") || message.includes("JSON") || message.includes("parse")) {
    return { category: "parse_error", severity: "permanent" };
  }
  if (message.includes("no channel element") || message.includes("Invalid RSS")) {
    return { category: "parse_error", severity: "permanent" };
  }
  // ...
}
```

### 4d. Recovery Strategies by Category

| Category | Strategy | Implementation |
|---|---|---|
| `rate_limit` | Exponential backoff with jitter; respect `rateLimitResetAt` | `classifyAiError` already identifies; queue `msg.retry()` with delay not yet used |
| `timeout` | Retry up to N times; reduce payload size if possible | Circuit breaker records failure; retry via queue |
| `server_error` (5xx) | Retry with backoff; alert if sustained | Circuit breaker opens after 5 failures |
| `auth` | Do not retry; alert immediately | Circuit breaker permanent; admin alert needed |
| `quota_exceeded` | Do not retry; alert; fallback provider | Permanent severity; model chain fallback handles it for AI |
| `network` | Retry once; then fail | `transient` severity |
| `parse_error` | Do not retry; log and skip episode | `permanent` severity |
| `not_found` | Do not retry; log and mark episode unavailable | `permanent` severity |

### 4e. Admin Dashboard Integration

The existing admin AI errors dashboard (`/api/admin/ai-errors/*`) already covers the AI case well. Extend it:

1. Add `/api/admin/service-errors/*` endpoint mirroring the AI errors shape for `ExternalServiceError`
2. Add `resolved` bulk-mark endpoint for both tables (currently missing — errors can be read but not resolved via API)
3. Add alert thresholds: if error rate for a service exceeds N/hour, emit a structured log line at `level: "alert"` that monitoring can pick up

### 4f. AI-Analyzable Structured Format

All error records written to the DB conform to a format suitable for LLM triage:

```json
{
  "id": "clx...",
  "serviceCategory": "ai_stt",
  "provider": "openai",
  "model": "whisper-1",
  "operation": "transcribe",
  "category": "rate_limit",
  "severity": "transient",
  "httpStatus": 429,
  "errorMessage": "OpenAI Whisper API error 429: ...",
  "rawResponse": "...",
  "requestDurationMs": 1240,
  "timestamp": "2026-03-26T12:00:00Z",
  "retryCount": 1,
  "willRetry": true,
  "rateLimitRemaining": 0,
  "rateLimitResetAt": "2026-03-26T12:01:00Z",
  "correlationId": "...",
  "jobId": "...",
  "episodeId": "..."
}
```

An admin "triage" endpoint could fetch unresolved errors grouped by provider/category, format them as the above, and pass them to an LLM for root cause analysis. The existing summary endpoint already provides aggregate data suitable for this.

---

## 5. Priority Recommendations

**Immediate (high signal, low effort):**

1. **Stop swallowing errors in `embeddings.ts`** — change `catch {}` to `catch (err) { console.error(...) }` at minimum
2. **Stop swallowing errors in `transcript-sources.ts`** — `RssFeedSource.lookup` catches all errors and returns null silently; log at warn level
3. **Populate `retryCount`/`maxRetries` in `writeAiError` calls** — currently hardcoded to 0; the transcription handler tracks `sttErrors` array length which could be used as `retryCount`

**Medium term:**

4. **Add `ExternalServiceError` table + `writeExternalServiceError()`** mirroring the AI error pattern for RSS, audio fetch, R2, queue send failures
5. **Forward queue handler errors to Sentry** — currently `captureException` is only wired in the HTTP error handler; queue errors are console-only
6. **Make circuit breaker durable** — store state in KV or D1 so it survives deploys and is shared across isolates

**Longer term:**

7. **Alert thresholds** — emit structured `level: "alert"` logs when error rate exceeds threshold, consumable by Cloudflare log drain alerting
8. **Resolved bulk-mark API** — admin endpoint to mark a class of errors as resolved after a provider issue is fixed
9. **LLM triage endpoint** — pass unresolved error batch to Claude for root cause grouping
