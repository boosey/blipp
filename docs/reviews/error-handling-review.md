# Error Handling & Logging Review

_Review date: 2026-03-26_

---

## Summary Verdict

Blipp has a strong HTTP-layer error handling foundation and a well-designed AI error capture system. The weak points are in the queue layer: no Sentry integration for queue failures, silent swallowing in several library functions, uneven retry behavior across queue handlers, and no correlation ID propagation into the scheduled (cron) execution path.

---

## 1. Structured Logging vs. console.log Usage

**What works well:**

- `worker/lib/logger.ts` defines `createPipelineLogger` which emits JSON-structured lines on every call with `level`, `stage`, `action`, `requestId`, `jobId`, `correlationId`, and `ts` fields. All 4 AI pipeline queue handlers use this.
- The HTTP request logger (`worker/middleware/request-logger.ts`) emits one JSON line per request covering `method`, `path`, `status`, `durationMs`, `requestId`, `userId`, and `userAgent`. Level is set to `error` for 5xx, `warn` for 4xx, `info` otherwise.
- Queue dispatch logging in `worker/queues/index.ts` uses `JSON.stringify` with structured fields.
- All `console.error` calls in production paths use `JSON.stringify({...})` rather than interpolated strings.

**Problems:**

| Location | Issue |
|---|---|
| `worker/lib/apple-podcasts.ts` | Uses template-literal `console.log(` \`[ApplePodcasts] GET ${url}\`` )` and `console.warn(...)` with raw objects — not JSON-structured |
| `worker/queues/catalog-refresh.ts` | Template-literal `console.log` and `console.error` with tagged prefix strings, not structured JSON |
| `worker/lib/catalog-sources.ts` | `console.warn` with raw error objects |
| `worker/lib/content-prefetch.ts` | Template-literal `console.log` throughout |
| `worker/lib/podcast-index.ts` | `console.log` progress logging uses template literals |
| `worker/lib/circuit-breaker.ts` | `console.error(JSON.stringify(...))` — correctly structured, but uses `console.error` for informational "circuit opened" state which is appropriate |

The unstructured logs in Apple Podcasts and catalog-refresh are the worst offenders. They make these logs unsearchable in a log drain and cannot be filtered by level, action, or context fields.

**Recommendation:** Enforce JSON-structured logging everywhere. A simple lint rule (`no-restricted-syntax` on template-literal console calls) would catch regressions.

---

## 2. Request Traceability

**What works well:**

- `requestIdMiddleware` (`worker/middleware/request-id.ts`) runs first on all `/api/*` routes, generating and propagating a UUID `requestId`.
- The request logger includes `requestId` on every HTTP log line.
- The global error handler includes `requestId` in the error response body (returned to the client as `{ error, requestId }`).
- Pipeline queue handlers thread `correlationId` through every log call and DB write. `correlationId` links: HTTP request → queue message → PipelineStep → AiServiceError.
- `createPipelineLogger` accepts `requestId`, `jobId`, and `correlationId` and includes all in every log line.

**Problems:**

| Gap | Impact |
|---|---|
| Scheduled (cron) handler has no `correlationId` or `requestId` | Cron job executions are not traceable across log lines |
| Catalog refresh queue handler uses template-literal logs | No `correlationId` in catalog refresh log lines |
| `correlationId` is generated per-message in queue handlers with `msg.body.correlationId ?? crypto.randomUUID()` | If a message is retried, a new UUID may be generated if the message body doesn't carry one, breaking the trace chain |
| No trace ID forwarded to Sentry | Sentry exceptions captured by the HTTP error handler include `method` and `path` but not `requestId` or `correlationId` |

**Recommendation:**
- Add `correlationId` generation to the cron runner and pass it into all job executions.
- Ensure Sentry `captureException` includes `requestId` and `correlationId` in `extra`.
- Audit all queue message types to confirm `correlationId` is always set on the sending side.

---

## 3. Silent Failures (Swallowed Errors)

These are caught errors that produce no observable output or record:

| Location | Pattern | Impact |
|---|---|---|
| `worker/lib/embeddings.ts:62` | `catch { return null; }` | Embedding failures are completely invisible; recommendation score degradation has no observability |
| `worker/lib/transcript-sources.ts:24` | `catch { return null; }` | RSS transcript fetch failures are silent; no warning logged |
| `worker/lib/podcast-index.ts:182` | `catch { return null; }` in `byItunesId` | Podcast Index lookup failures are swallowed per-call; only partially surfaced in batch summary |
| `worker/lib/push.ts:62` | Catches all errors, returns `false`, logs to console | Acceptable for push (non-critical path), but the `pushSubscription.delete().catch(() => {})` on the cleanup is also silent |
| `worker/lib/model-resolution.ts` | Various | Not read; may have silent catches |
| `worker/queues/catalog-refresh.ts:340` | `console.warn(...)` for per-podcast upsert failures | Warn-level log but no counter or structured context |
| `worker/middleware/request-logger.ts:17` | `try { auth = getAuth(c); } catch {}` | Acceptable — auth failure here just means userId won't be logged, not a real error |

**Recommendation:** All `catch {}` blocks that return a sentinel value (null, false, []) must at minimum emit a structured warn log. Embedding and transcript source failures should also update a counter (e.g., a Cloudflare Analytics Engine metric or a `PlatformConfig` counter key) so degraded quality is observable.

---

## 4. Error Response Consistency

**What works well:**

- `worker/lib/errors.ts` defines a single `classifyHttpError()` that maps all known error types (Prisma P2025/P2002/P2003, ValidationError, StripeError) to `{ status, message, code, details }`.
- The global Hono error handler (`worker/index.ts:35`) uses `classifyHttpError` consistently and always returns `{ error, requestId, code?, details? }` — the `ApiErrorResponse` shape.
- ValidationError returns 400 with `details` array (field-level errors for forms).
- 404 handler returns `{ error: "Not found", code: "ROUTE_NOT_FOUND" }` — consistent shape.

**Problems:**

| Location | Issue |
|---|---|
| `worker/lib/errors.ts:47` | The `if (msg.toLowerCase().includes("not found"))` string match is fragile — any error message containing "not found" returns 404, including internal errors that should be 500 |
| Some admin routes return `c.json({ error: "..." }, 404)` directly without a `code` field | Minor inconsistency; the `code` field is missing on direct route-level 404s |
| Queue handler errors are not HTTP responses — no standardized shape | Queue failure messages written to `distillation.errorMessage` / `pipelineJob.errorMessage` are free-form strings; no error code taxonomy |

**Recommendation:**
- Replace the string-match `not found` check in `classifyHttpError` with an explicit error type/subclass check.
- Add `code` to all direct `c.json({ error: ... }, 404/400)` calls in admin routes.
- Consider defining an `ErrorCode` enum and attaching it to the `errorMessage` stored in DB job/distillation records.

---

## 5. Transient vs. Permanent Failure Differentiation

**What works well:**

- `classifyAiError()` in `ai-errors.ts` correctly distinguishes transient (rate_limit, timeout, server_error, network) from permanent (auth, model_not_found, content_filter, quota_exceeded, invalid_request) errors.
- The `severity` field is stored on `AiServiceError` and queryable.
- The circuit breaker only records `recordFailure` for errors that reach the outer catch (not URL-direct attempt retries); once the circuit opens, calls fail fast without burning through model chain fallbacks.

**Problems:**

| Gap | Impact |
|---|---|
| Permanent errors from the AI layer still flow through the full model chain | If Anthropic returns 401 (auth), the handler tries secondary and tertiary providers, which is correct. But if the error is `quota_exceeded` on the primary account, trying secondary (same account type) wastes calls before failing |
| Queue handler `msg.ack()` on all non-AiProviderError failures | Generic errors (e.g., Prisma query failure, episode not found) result in `msg.ack()` with job marked FAILED — there is no distinction between "this episode is permanently broken" and "DB had a transient hiccup" |
| Briefing assembly and orchestrator use `msg.retry()` for outer catch | This is correct — outer failures should retry. But transcription/distillation/narrative/audio-generation use `msg.ack()` unconditionally after the inner catch — they do not retry |
| No dead-letter queue handling | After max retries, messages are silently dropped (CF DLQ if configured) but nothing marks the job as needing manual intervention |

**Recommendation:**
- In inner per-message catch blocks, check `classifyAiError` severity before deciding `ack` vs `retry`.
- For `permanent` severity failures, `msg.ack()` and mark job FAILED (current behavior is correct).
- For `transient` severity failures, use `msg.retry()` rather than `msg.ack()` to allow CF queue retry delivery.

---

## 6. Monitoring Gaps

| Gap | Severity |
|---|---|
| Queue handler exceptions not forwarded to Sentry | High — queue errors are console-only; no alerting |
| No alert on circuit breaker opening | High — circuit open state logged to console but not surfaced to on-call |
| No alert on `auth` / `quota_exceeded` category AI errors | High — these are permanent failures requiring manual action |
| Cron job failures are `Promise.allSettled` — individual job failures are swallowed at the `scheduled` level | Medium — `runJob` presumably handles per-job errors, but `allSettled` means a catastrophic job failure is invisible |
| No metric emission (Cloudflare Analytics Engine) | Medium — no time-series data for error rate, latency, or queue depth |
| `AiServiceError.resolved` field is never set to `true` | Low — records accumulate as unresolved indefinitely; the admin summary counts are not actionable |

---

## 7. Retry Behavior

### HTTP Layer
No retry logic — HTTP requests return error immediately. Correct for user-facing API calls.

### Queue Layer
| Handler | Inner Error Behavior | Outer Error Behavior |
|---|---|---|
| `transcription` | `msg.ack()` (no retry) | `ctx.waitUntil(prisma.$disconnect())` but no rethrow — CF won't retry |
| `distillation` | `msg.ack()` (no retry) | Same |
| `narrative-generation` | `msg.ack()` (no retry) | Same |
| `audio-generation` | `msg.ack()` (no retry) | Same |
| `briefing-assembly` | `msg.retry()` on outer catch | Correct |
| `orchestrator` | `msg.retry()` on outer catch | Correct |
| `feed-refresh` | Not inspected in detail | — |

The 4 AI pipeline handlers all `ack` on error, bypassing the CF queue retry system. This was likely intentional (job status is tracked in DB) but it means a transient DB failure during a queue message will permanently lose that pipeline job.

### External Service Layer
- STT: Model chain fallback (primary → secondary → tertiary) is an application-level retry strategy — good.
- LLM: Model chain fallback exists (`resolveModelChain`).
- Apple Podcasts: `fetchWithRetry` with 3 retries, exponential backoff — good.
- Podcast Index: No retry on individual `byItunesId` calls; batch lookup has no retry.
- RSS feed fetch: No retry at fetch level (single `fetch()` call).
- Audio URL fetch in `probeAudio`: No retry on HEAD or range request failures.
- Cloudflare AI STT: One retry on `1031`/`504`/`timeout` errors with a 2-second hardcoded delay.

---

## 8. Global Error Handler Presence

**HTTP layer:** `app.onError()` is registered in `worker/index.ts:35`. It:
- Calls `captureException` (Sentry)
- Logs with structured JSON at `level: "error"`
- Returns standardized `ApiErrorResponse` with `requestId`
- Uses `classifyHttpError` to prevent internal details leaking to clients

This is well-implemented.

**Queue layer:** `worker/queues/index.ts` wraps the queue dispatch switch in a try/catch at line 55. It logs and rethrows, which causes CF to retry the entire batch. However, individual queue handler functions (the `handleFeedRefresh`, `handleTranscription`, etc.) do not have a top-level catch-and-rethrow — they have inner per-message try/catch and `msg.ack()`. Errors that escape the inner try (outer exceptions like creating the logger, checking stage enabled) would propagate to the dispatch wrapper, rethrowing and retrying the whole batch.

**Scheduled (cron) handler:** `Promise.allSettled` at `worker/queues/index.ts:154` means individual cron job failures are absorbed. There is no global cron error handler or Sentry capture.

---

## 9. Correlation / Request ID Propagation

| Path | Status |
|---|---|
| HTTP request → route handler | `requestId` propagated via Hono context |
| HTTP request → queue message | `requestId` embedded in queue message body for pipeline jobs |
| Queue message → PipelineStep | `correlationId` propagated |
| Queue message → AiServiceError | `correlationId`, `jobId`, `stepId`, `episodeId` propagated |
| Queue message → orchestrator notify | `correlationId` propagated |
| Cron job → child operations | No correlation ID |
| Catalog refresh → child DB writes | No correlation ID |
| HTTP error → Sentry | `method`, `path` only — `requestId` not included |
| Queue error → Sentry | Not forwarded |

**Recommendation:** Pass `requestId` as Sentry tag, not just `extra`. This enables Sentry → log drain correlation when investigating issues.

---

## 10. Specific Bugs / Issues

1. **`classifyHttpError` "not found" string match (line 47)** — any internal error whose message happens to contain "not found" (e.g., `Error: Record not found in cache`) will return HTTP 404 instead of 500. This is a latent bug.

2. **`writeAiError` called without `await` and with `.catch(() => {})` (e.g., `transcription.ts:461`)** — if the Prisma connection closes before the fire-and-forget promise resolves, the error is silently lost. Given that `prisma.$disconnect()` is called via `ctx.waitUntil`, the connection should remain open long enough, but this is a timing assumption that is not guaranteed.

3. **`msg.ack()` after all pipeline AI handler errors regardless of transience** — a rate limit hit at 3am on the primary STT provider will ack the message, mark the job FAILED, and the user gets no briefing. The user would need to manually re-trigger. A `msg.retry()` on `transient` errors would let CF's queue retry the message automatically.

4. **Cloudflare AI STT retry uses `setTimeout` with 2000ms** — `setTimeout` in a Cloudflare Worker only runs if the worker isolate stays alive. In a queue handler, this is fine because the batch holds the execution context. But it is a hardcoded delay without jitter and does not respect any `rateLimitResetAt` header.

5. **`AiServiceError.retryCount` and `maxRetries` are always written as 0** in all `writeAiError` call sites. The transcription handler tracks `sttErrors.length` before each attempt, which represents the number of previous failures — this should be passed as `retryCount`.
