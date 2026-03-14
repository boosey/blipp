# Error Handling & Logging Review

**Date**: 2026-03-14
**Scope**: All files in `worker/` (routes, queues, lib, middleware) and frontend `src/`

---

## Executive Summary

Blipp has a reasonable error handling foundation for an early-stage product. The pipeline logger (`worker/lib/logger.ts`) provides structured JSON logs, and the pipeline event system (`PipelineEvent` model + `writeEvent()`) creates a per-step audit trail. Queue handlers follow a consistent try/catch pattern with orchestrator notification on failure.

However, there are **significant gaps** that would cause pain at SaaS scale: no global error handler, no request correlation IDs, silent catch blocks, inconsistent error response shapes, no differentiation between transient and permanent failures, and no way to observe AI service errors in aggregate.

---

## 1. Structured Logging Assessment

### What exists

- **Pipeline logger** (`worker/lib/logger.ts`): JSON-structured logs emitted via `console.log`/`console.error` with fields `{ level, stage, action, ts, ...data }`. Supports `info`, `debug`, `error` levels with configurable threshold via `PlatformConfig("pipeline.logLevel")`.
- **Pipeline events** (`worker/lib/pipeline-events.ts`): Fire-and-forget writes to `PipelineEvent` table, tied to a `PipelineStep`. Provides per-step audit trail with `DEBUG`, `INFO`, `WARN`, `ERROR` levels.
- Logger includes a `timer()` utility for measuring durations.

### What's missing

| Gap | Impact | Severity |
|-----|--------|----------|
| **No request correlation ID** | Cannot trace a user request through feed-refresh -> orchestrator -> transcription -> distillation -> narrative -> audio -> assembly. Each queue handler creates its own logger in isolation. | **Critical** |
| **No HTTP request logging** | No middleware that logs incoming API requests (method, path, status, duration). Hono has no `onError` handler registered. | **High** |
| **No log levels for HTTP routes** | Routes use no logging at all. Errors throw as Prisma exceptions and surface as unhandled 500s with no structured log. | **High** |
| **`console.error` in non-logger code** | `pipeline-events.ts:19`, `stt-providers.ts:134` use raw `console.error` instead of the structured logger. | **Medium** |
| **Logger not available in routes** | `createPipelineLogger` requires `prisma` and a `stage` name. Routes have no equivalent. There's no generic `createRequestLogger`. | **Medium** |
| **No log export/aggregation target** | Logs go to `console.log` (captured by Cloudflare's `wrangler tail` / Logpush). No explicit integration with a logging service. | **Low** (acceptable for current scale) |

---

## 2. Error Catching & Context

### Queue handlers (Good)

All 6 queue handlers (`feed-refresh`, `transcription`, `distillation`, `narrative-generation`, `audio-generation`, `briefing-assembly`) follow a consistent pattern:

```
for (const msg of batch.messages) {
  try {
    // ... processing ...
    msg.ack();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Mark PipelineStep FAILED (with .catch(() => {}))
    // Mark domain record FAILED (distillation/clip)
    // Log via structured logger
    // Notify orchestrator of failure
    msg.ack();  // <-- always ack, never retry at CF queue level
  }
}
```

**Positive**: Error messages are persisted to `PipelineStep.errorMessage`, `PipelineJob.errorMessage`, `Distillation.errorMessage`, and `Clip.errorMessage`. The orchestrator is always notified so assembly can proceed.

**Negative**: See section 4 (silent failures) and section 5 (retry behavior).

### HTTP routes (Poor)

Routes have **no try/catch** around Prisma calls or business logic. They rely entirely on Hono's default error handler (which returns a generic 500). Examples:

- `worker/routes/podcasts.ts` - `findUniqueOrThrow` on lines 55, 308, 344 throws Prisma `NotFoundError` but there's no handler to convert it to a 404 JSON response. It will bubble as an unformatted 500.
- `worker/routes/billing.ts` - Stripe SDK calls (`stripe.checkout.sessions.create`, `stripe.billingPortal.sessions.create`) can throw Stripe errors. No catch, no user-friendly error message.
- `worker/routes/me.ts` - `getCurrentUser` can throw `"No default plan configured"` — surfaces as raw 500.
- `worker/routes/briefings.ts:55` - `findUniqueOrThrow` throws on invalid episodeId with an opaque Prisma error, not a 404.

### Middleware (Adequate)

- `requireAuth` and `requireAdmin` correctly return 401/403 JSON responses.
- `prismaMiddleware` correctly uses try/finally for cleanup.

---

## 3. Error Response Consistency

### Current state: Inconsistent

Routes return errors in at least 3 different shapes:

1. `{ error: "message" }` with appropriate status code — most routes
2. Prisma `NotFoundError` thrown by `findUniqueOrThrow` — unhandled, becomes opaque 500
3. Hono default error response (text/plain `Internal Server Error`) — any unhandled throw

### Recommendation

Add a global Hono `onError` handler that:
- Catches `PrismaClientKnownRequestError` (P2025 = not found) and returns `{ error: "Not found" }` with 404
- Catches all other errors and returns `{ error: "Internal server error", requestId: "..." }` with 500
- Logs the error with structured context

---

## 4. Silent Failures

These are errors that are caught but provide no useful signal:

| Location | Code | Issue |
|----------|------|-------|
| `worker/lib/config.ts:34` | `catch { return fallback; }` | Config read failure is invisible. If DB connection fails, all config silently falls back to defaults. Could cause unexpected behavior (e.g., stage that should be disabled runs anyway). |
| `worker/queues/transcription.ts:283-293` | `.updateMany({...}).catch(() => {})` | Step update failure silently swallowed. If the DB write fails, the step is stuck IN_PROGRESS forever. |
| `worker/queues/transcription.ts:301-307` | `.upsert({...}).catch(() => {})` | Distillation upsert failure swallowed. |
| `worker/queues/transcription.ts:317-318` | `.send({...}).catch(() => {})` | **Orchestrator notification failure swallowed**. If this fails, the job is stuck — orchestrator never learns the job failed. |
| `worker/queues/distillation.ts:225-236` | `.update({...}).catch(() => {})` | Same pattern — step update failure swallowed. |
| `worker/queues/distillation.ts:239-245` | `.upsert({...}).catch(() => {})` | Same pattern. |
| `worker/queues/distillation.ts:253-258` | `.send({...}).catch(() => {})` | Same pattern — orchestrator send failure swallowed. |
| `worker/queues/audio-generation.ts:213-223` | Multiple `.catch(() => {})` | Step update, clip upsert, event write — all swallowed. |
| `worker/queues/audio-generation.ts:256-262` | `.send({...}).catch(() => {})` | Orchestrator notification failure swallowed. |
| `worker/queues/narrative-generation.ts:221-231` | `.updateMany({...}).catch(() => {})` | Step update failure swallowed. |
| `worker/queues/narrative-generation.ts:237-242` | `.send({...}).catch(() => {})` | Orchestrator notification failure swallowed. |
| `worker/queues/briefing-assembly.ts:149-164` | Multiple `.catch(() => {})` | FeedItem and request update failures swallowed during assembly error path. |
| `worker/queues/orchestrator.ts:72-78` | `.update({...}).catch(() => null)` | Request status update failure on catch path. |
| `worker/lib/pipeline-events.ts:18-20` | `catch (err) { console.error(...) }` | Acceptable — event writes are intentionally fire-and-forget. But raw `console.error` instead of structured log. |
| `worker/lib/transcript-source.ts:26-28` | `catch { return null; }` | PI lookup failure swallowed with no logging. Podcast Index outages would be completely invisible. |
| `worker/routes/admin/pipeline.ts:58` | `catch { return c.json({...}) }` | Prisma error swallowed, returns empty data. No log, no indication to admin that DB is failing. |
| `worker/routes/admin/podcasts.ts:157-158` | `catch { }` | Pipeline job fetch failure swallowed silently. |
| `worker/routes/admin/config.ts:17-19` | `catch { return c.json({...}) }` | Config table missing swallowed with empty response. |

### Critical concern: Orchestrator notification failures

The `.catch(() => {})` on orchestrator queue sends (present in all 4 processing stages) means that if the orchestrator queue is temporarily unavailable, jobs will be:
1. Acked at the source queue (never retried)
2. Never reported to the orchestrator
3. Stuck in an intermediate state forever

---

## 5. Retry Behavior & Transient vs Permanent Failures

### Current behavior

| Stage | On error | Retry? |
|-------|----------|--------|
| Feed refresh | Log, continue to next podcast, ack all at end | No retry — individual podcast failures don't block others |
| Transcription | Mark step FAILED, notify orchestrator, **ack** | **No retry** — acked immediately |
| Distillation | Mark step FAILED, notify orchestrator, **ack** | **No retry** — acked immediately |
| Narrative gen | Mark step FAILED, notify orchestrator, **ack** | **No retry** — acked immediately |
| Audio gen | Mark step FAILED, notify orchestrator, **ack** | **No retry** — acked immediately |
| Briefing assembly | Mark request FAILED, **retry()** | **Yes** — only stage that uses CF queue retry |
| Orchestrator | Mark request FAILED, **retry()** on DB error; **ack** on logical error | Partial — retries on unexpected errors, acks on known states |

### Issues

1. **No transient vs permanent error differentiation**: A rate limit (429), timeout, or network glitch gets the same treatment as a permanent API key error or invalid data. All are immediately acked and marked FAILED. The only recovery path is manual retry via admin UI.

2. **Cloudflare Whisper retry (partial)**: `stt-providers.ts:381-393` has a single retry with 2s delay for CF 1031/504 errors. This is the only place in the entire codebase with automatic retry logic. It's hardcoded, not configurable, and only covers one provider.

3. **No backoff strategy**: The manual retry via admin (`POST /pipeline/jobs/:id/retry`) resets status to PENDING and re-dispatches. No exponential backoff, no retry count tracking (PipelineStep has `retryCount` field but it's never incremented).

4. **PipelineStep.retryCount is always 0**: The schema has `retryCount Int @default(0)` but no code ever increments it.

5. **Admin retry dispatches lack jobId**: `POST /trigger/stage/:stage` sends messages without `jobId`, meaning the queue handler creates a new job instead of resuming the failed one. This applies to the legacy admin trigger paths (not the per-job retry which works correctly).

---

## 6. Monitoring Gaps

### What would go unnoticed

1. **AI provider degradation**: If Anthropic starts returning errors 30% of the time, there's no alerting. You'd only see it by manually checking the admin pipeline page.

2. **Cost anomalies**: If a model suddenly costs 10x more per call (pricing change, unusually long transcripts), no alert. Cost data is recorded per-step but never aggregated or monitored.

3. **Queue depth / latency**: No metrics on how long messages sit in queues before processing. Cloudflare provides some queue analytics but there's no application-level tracking.

4. **Feed refresh failures**: If RSS feeds start returning errors, `podcast_error` is logged but there's no aggregation of feed health. The `feedHealth` / `feedError` fields on `Podcast` are set by admin PATCH, not automatically by the refresh handler.

5. **Stripe webhook failures**: If Stripe webhooks fail, the only signal is Stripe's own retry mechanism. No logging in the catch blocks beyond what Hono's default 500 provides.

6. **Clerk webhook failures**: `user.created` webhook could fail (e.g., duplicate clerkId race condition). No error handling beyond what Prisma throws.

7. **R2 storage failures**: `putWorkProduct`, `putClip` have no try/catch — R2 errors bubble up and are caught by the outer queue handler catch block, but without specific "R2 failure" context.

---

## 7. Frontend Error Handling

### `src/lib/use-fetch.ts` pattern

The `useFetch` hook likely handles API errors generically. Frontend errors are not within the scope of backend error handling, but the inconsistent API error shapes (see section 3) mean the frontend can't reliably display error messages.

### Missing: Error boundary for API failures

The backend returns no `requestId` or `traceId` that users could report. When something goes wrong, the user sees a generic error with no way to correlate it to backend logs.

---

## 8. Security-Adjacent Error Concerns

1. **Stack traces in error messages**: `logger.ts:51` includes `err.stack` in log output. While this stays in console logs (not user-facing), it could leak to Cloudflare Logpush destinations.

2. **Prisma errors leaked to clients**: `findUniqueOrThrow` errors include table names and field information. Without a global error handler, these surface verbatim in 500 responses.

3. **Webhook signature verification**: Clerk webhooks have **no signature verification** (`clerk.ts:20` comment says "For Phase 0, we trust the payload structure"). This is a security gap, not just an error handling one.

---

## 9. Prioritized Recommendations

### P0 — Must fix before SaaS launch

1. **Global Hono `onError` handler** — Catch unhandled errors, return consistent `{ error, requestId }` JSON, log with context. Prevents Prisma internals from leaking to clients.

2. **Request correlation IDs** — Generate a UUID per incoming request, propagate through queue messages, include in all logs. Essential for debugging production issues.

3. **Replace `msg.ack()` with `msg.retry()` for transient errors** in queue handlers (rate limits, timeouts, network errors). Keep `msg.ack()` only for permanent failures (invalid data, missing config). Use the queue's dead-letter queue for messages that exhaust retries.

4. **Log orchestrator send failures** — At minimum, `console.error` when `.catch(() => {})` fires on orchestrator queue sends. These are the most dangerous silent failures in the system.

### P1 — Important for operations

5. **Increment `PipelineStep.retryCount`** when a step is retried. Currently always 0.

6. **Add HTTP request logging middleware** — Log `{ method, path, status, durationMs, userId, requestId }` for all API requests.

7. **Automatic feed health tracking** — When feed-refresh catches a podcast error, update `podcast.feedHealth` and `podcast.feedError` automatically.

8. **Structured error context in AI calls** — When an LLM/STT/TTS call fails, capture and log: provider name, model ID, HTTP status, response body snippet, request duration, retry count.

### P2 — Nice to have

9. **Error rate dashboard** — Aggregate `PipelineStep` failures by stage, model, and time window. Surface in admin dashboard.

10. **Dead-letter queue handling** — CF Queues support DLQ. Configure and surface DLQ depth in admin.

11. **Alert thresholds** — Email/webhook when error rate exceeds threshold for a stage.

---

## 10. Files Analyzed

### Worker (backend)
- `worker/index.ts` — Entry point, no error handler
- `worker/middleware/auth.ts` — Clean 401 responses
- `worker/middleware/admin.ts` — Clean 401/403 responses
- `worker/middleware/prisma.ts` — Proper cleanup via try/finally
- `worker/lib/logger.ts` — Structured JSON pipeline logger
- `worker/lib/pipeline-events.ts` — Fire-and-forget event writes
- `worker/lib/config.ts` — Silent catch on config reads
- `worker/lib/db.ts` — No error handling (appropriate)
- `worker/lib/queue-helpers.ts` — Stage check helper
- `worker/lib/admin-helpers.ts` — getCurrentUser with auto-create
- `worker/lib/distillation.ts` — JSON.parse of LLM output (no error handling for malformed JSON)
- `worker/lib/tts.ts` — Delegates to provider, no local error handling
- `worker/lib/whisper-chunked.ts` — No per-chunk error handling
- `worker/lib/transcript-source.ts` — Silent catch on PI lookup
- `worker/lib/transcript.ts` — Proper error throw on fetch failure
- `worker/lib/ai-models.ts` — Thin config read
- `worker/lib/ai-usage.ts` — Pure calculations, no errors
- `worker/lib/work-products.ts` — No error handling (R2 errors bubble)
- `worker/lib/stripe.ts` — Factory, no error handling
- `worker/lib/plan-limits.ts` — Clean limit checks
- `worker/lib/local-queue.ts` — Dev-only shim
- `worker/lib/llm-providers.ts` — Anthropic: no explicit error handling; Groq: checks resp.ok; CF: no error handling
- `worker/lib/stt-providers.ts` — All providers check resp.ok; CF has single retry for 1031/504
- `worker/lib/tts-providers.ts` — OpenAI/Groq: check resp.ok; CF: no error handling
- `worker/queues/index.ts` — Dispatcher + scheduled handler
- `worker/queues/orchestrator.ts` — Good error propagation
- `worker/queues/feed-refresh.ts` — Per-podcast try/catch, silent ack-all
- `worker/queues/transcription.ts` — Multiple silent `.catch(() => {})`
- `worker/queues/distillation.ts` — Multiple silent `.catch(() => {})`
- `worker/queues/narrative-generation.ts` — Multiple silent `.catch(() => {})`
- `worker/queues/audio-generation.ts` — Multiple silent `.catch(() => {})`
- `worker/queues/briefing-assembly.ts` — Only stage using `msg.retry()`
- `worker/routes/index.ts` — Route tree
- `worker/routes/me.ts` — No error handling
- `worker/routes/podcasts.ts` — findUniqueOrThrow without catch
- `worker/routes/briefings.ts` — findUniqueOrThrow without catch
- `worker/routes/feed.ts` — Adequate null checks
- `worker/routes/clips.ts` — Adequate R2 404 check
- `worker/routes/billing.ts` — Stripe calls without catch
- `worker/routes/webhooks/clerk.ts` — No signature verification, no error handling
- `worker/routes/webhooks/stripe.ts` — Has signature verification, no error handling on business logic
- `worker/routes/admin/*` — Mixed: some routes have catch blocks returning empty data, most don't

### Prisma Schema
- Error-related fields reviewed: `errorMessage` on `PipelineJob`, `PipelineStep`, `Distillation`, `Clip`, `FeedItem`, `BriefingRequest`, `SttExperiment`, `SttBenchmarkResult`
- `PipelineStep.retryCount` exists but is never incremented
- `PipelineEvent` model provides step-level audit trail
