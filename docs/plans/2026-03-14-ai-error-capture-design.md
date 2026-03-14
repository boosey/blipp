# AI Service Error Capture & Recovery System Design

**Date**: 2026-03-14
**Prerequisite**: [Error Handling Review](./2026-03-14-error-handling-review.md)

---

## Problem Statement

Blipp calls 4 categories of AI services (STT, LLM distillation, LLM narrative, TTS) across 6 providers (OpenAI, Anthropic, Groq, Deepgram, AssemblyAI, Google, Cloudflare). When these calls fail, the current system:

1. Stores only `errorMessage` (a string) on `PipelineStep` and domain records
2. Does not capture: HTTP status, provider name, model ID, request duration, retry attempts, raw response body, rate limit headers
3. Cannot differentiate transient failures (rate limits, timeouts) from permanent ones (bad API key, invalid model)
4. Has no fallback to an alternate provider/model
5. Provides no aggregate view of error patterns

This design introduces a structured AI error capture system that enables observability, recovery, and eventually automated pattern analysis.

---

## Design Overview

### Architecture

```
AI Service Call (llm-providers, stt-providers, tts-providers)
       │
       ├── Success → normal flow
       │
       └── Failure → AIServiceError created
              │
              ├── Classify: transient vs permanent
              │      │
              │      ├── Transient → retry with backoff (or fallback model)
              │      └── Permanent → fail immediately
              │
              ├── Write to AiServiceError table (structured, queryable)
              │
              ├── Log via PipelineLogger (structured JSON to console)
              │
              └── Include correlationId for tracing
```

---

## 1. AIServiceError Class

### TypeScript Interface

```typescript
// worker/lib/ai-errors.ts

export type AiErrorCategory = "rate_limit" | "timeout" | "auth" | "model_not_found" | "content_filter"
  | "invalid_request" | "server_error" | "network" | "quota_exceeded" | "unknown";

export type AiErrorSeverity = "transient" | "permanent";

export interface AIServiceErrorData {
  // Identity
  service: "stt" | "distillation" | "narrative" | "tts";
  provider: string;         // "anthropic", "openai", "groq", "deepgram", etc.
  model: string;            // provider model ID used in the call
  operation: string;        // "transcribe", "complete", "synthesize"

  // Context
  correlationId: string;    // traces through the entire pipeline
  jobId?: string;           // PipelineJob ID
  stepId?: string;          // PipelineStep ID
  episodeId?: string;

  // Error details
  category: AiErrorCategory;
  severity: AiErrorSeverity;
  httpStatus?: number;
  errorMessage: string;
  rawResponse?: string;     // first 2KB of error response body
  stack?: string;           // JS stack trace

  // Timing
  requestDurationMs: number;
  timestamp: Date;

  // Retry state
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;

  // Rate limit info (if available)
  rateLimitRemaining?: number;
  rateLimitResetAt?: Date;
}
```

### Error Classification

```typescript
// worker/lib/ai-errors.ts

export function classifyError(
  err: unknown,
  httpStatus?: number,
  responseBody?: string
): { category: AiErrorCategory; severity: AiErrorSeverity } {
  const message = err instanceof Error ? err.message : String(err);
  const status = httpStatus ?? extractHttpStatus(message);

  // Rate limiting
  if (status === 429 || message.includes("rate_limit") || message.includes("too many requests")) {
    return { category: "rate_limit", severity: "transient" };
  }

  // Timeouts
  if (status === 504 || status === 408 || message.includes("timeout") || message.includes("1031")) {
    return { category: "timeout", severity: "transient" };
  }

  // Server errors (5xx)
  if (status && status >= 500 && status < 600) {
    return { category: "server_error", severity: "transient" };
  }

  // Network errors
  if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.includes("network")) {
    return { category: "network", severity: "transient" };
  }

  // Auth errors
  if (status === 401 || status === 403 || message.includes("api_key") || message.includes("unauthorized")) {
    return { category: "auth", severity: "permanent" };
  }

  // Model not found
  if (status === 404 || message.includes("model_not_found") || message.includes("does not exist")) {
    return { category: "model_not_found", severity: "permanent" };
  }

  // Content filter
  if (message.includes("content_policy") || message.includes("content_filter") || message.includes("safety")) {
    return { category: "content_filter", severity: "permanent" };
  }

  // Quota exceeded
  if (message.includes("quota") || message.includes("billing") || message.includes("insufficient_quota")) {
    return { category: "quota_exceeded", severity: "permanent" };
  }

  // Invalid request (bad parameters)
  if (status === 400 || message.includes("invalid_request")) {
    return { category: "invalid_request", severity: "permanent" };
  }

  return { category: "unknown", severity: "transient" }; // Default to transient for safety
}

function extractHttpStatus(message: string): number | undefined {
  // Match patterns like "API error 429:" or "HTTP 503"
  const match = message.match(/(?:error|HTTP)\s+(\d{3})/i);
  return match ? parseInt(match[1]) : undefined;
}
```

---

## 2. Error Logging Table (Prisma Schema Addition)

```prisma
// Add to prisma/schema.prisma

model AiServiceError {
  id                String          @id @default(cuid())

  // Identity
  service           AiStage                     // stt, distillation, narrative, tts
  provider          String                      // "anthropic", "openai", "groq", etc.
  model             String                      // model ID that was called
  operation         String                      // "transcribe", "complete", "synthesize"

  // Context
  correlationId     String                      // traces through the pipeline
  jobId             String?                     // PipelineJob reference
  stepId            String?                     // PipelineStep reference
  episodeId         String?

  // Error details
  category          String                      // AiErrorCategory value
  severity          String                      // "transient" | "permanent"
  httpStatus        Int?
  errorMessage      String
  rawResponse       String?                     // first 2KB of error body (sanitized)

  // Timing
  requestDurationMs Int
  timestamp         DateTime        @default(now())

  // Retry context
  retryCount        Int             @default(0)
  maxRetries        Int             @default(0)
  willRetry         Boolean         @default(false)
  resolved          Boolean         @default(false)  // true if a subsequent retry succeeded

  // Rate limit headers (when available)
  rateLimitRemaining Int?
  rateLimitResetAt   DateTime?

  createdAt         DateTime        @default(now())

  @@index([service, provider, createdAt])
  @@index([correlationId])
  @@index([category, createdAt])
  @@index([episodeId])
  @@index([resolved, createdAt])
}
```

### Why a separate table (not PipelineEvent)?

- **Queryable by service/provider/model**: `PipelineEvent` is step-scoped. We need cross-step, cross-job queries like "show me all Anthropic errors in the last hour."
- **Structured fields**: `PipelineEvent.data` is untyped JSON. A dedicated table with indexed columns enables fast aggregate queries.
- **Retention policy**: AI errors may have a different retention window than pipeline events.
- **Resolution tracking**: The `resolved` field tracks whether a retry succeeded, enabling accuracy/reliability metrics.

---

## 3. Structured Log Format with Correlation IDs

### Correlation ID propagation

A `correlationId` originates at the `BriefingRequest` creation point and flows through every queue message:

```typescript
// Enhanced queue message types

interface TranscriptionMessage {
  jobId: string;
  episodeId: string;
  correlationId: string;  // NEW: from BriefingRequest.id or generated UUID
  type?: "manual";
}

interface DistillationMessage {
  jobId: string;
  episodeId: string;
  correlationId: string;
  type?: "manual";
}

// Same for NarrativeGenerationMessage, AudioGenerationMessage, OrchestratorMessage
```

For manual triggers (admin pipeline), generate a fresh UUID as the correlation ID.

### Enhanced log format

```json
{
  "level": "error",
  "stage": "distillation",
  "action": "ai_service_error",
  "correlationId": "clx1abc...",
  "jobId": "clx2def...",
  "episodeId": "clx3ghi...",
  "ai": {
    "service": "distillation",
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "operation": "complete",
    "httpStatus": 429,
    "category": "rate_limit",
    "severity": "transient",
    "requestDurationMs": 1523,
    "retryCount": 1,
    "willRetry": true
  },
  "error": "Anthropic API rate limit exceeded",
  "ts": "2026-03-14T15:30:00.000Z"
}
```

### Logger enhancement

```typescript
// Extend PipelineLogger interface

export interface PipelineLogger {
  // ... existing methods ...

  aiError(errorData: AIServiceErrorData): void;
  withCorrelationId(correlationId: string): PipelineLogger;
}
```

---

## 4. Recovery Strategies

### 4.1 Retry with Exponential Backoff

```typescript
// worker/lib/ai-retry.ts

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
};

// Per-category overrides
const CATEGORY_RETRY_CONFIG: Partial<Record<AiErrorCategory, Partial<RetryConfig>>> = {
  rate_limit: { maxRetries: 5, baseDelayMs: 5000 },   // More retries, longer wait
  timeout: { maxRetries: 2, baseDelayMs: 3000 },       // Fewer retries, moderate wait
  server_error: { maxRetries: 3, baseDelayMs: 2000 },
  network: { maxRetries: 3, baseDelayMs: 1000 },
};

export function getRetryConfig(category: AiErrorCategory): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, ...CATEGORY_RETRY_CONFIG[category] };
}

export function calculateDelay(retryCount: number, config: RetryConfig): number {
  const exponential = Math.min(
    config.baseDelayMs * Math.pow(2, retryCount),
    config.maxDelayMs
  );
  const jitter = Math.random() * config.jitterMs;
  return exponential + jitter;
}
```

### 4.2 Fallback to Alternate Model/Provider

```typescript
// worker/lib/ai-fallback.ts

export interface FallbackChain {
  primary: { provider: string; model: string };
  fallbacks: { provider: string; model: string }[];
}

/**
 * Builds a fallback chain for a given AI stage.
 * The primary model is from PlatformConfig; fallbacks are other active providers for the same stage.
 */
export async function buildFallbackChain(
  prisma: any,
  stage: AiStage
): Promise<FallbackChain> {
  const primary = await getModelConfig(prisma, stage);
  if (!primary) throw new Error(`No AI model configured for ${stage}`);

  // Get all active providers for this stage (excluding the primary)
  const allProviders = await prisma.aiModelProvider.findMany({
    where: {
      isAvailable: true,
      model: { stage, isActive: true },
    },
    include: { model: { select: { modelId: true } } },
  });

  const fallbacks = allProviders
    .filter((p: any) => !(p.provider === primary.provider && p.model.modelId === primary.model))
    .map((p: any) => ({ provider: p.provider, model: p.model.modelId }));

  return { primary, fallbacks };
}
```

### 4.3 Circuit Breaker Pattern

```typescript
// worker/lib/ai-circuit-breaker.ts

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

const CIRCUIT_THRESHOLD = 5;        // failures before opening
const CIRCUIT_RESET_MS = 60_000;    // 1 minute before half-open

// In-memory circuit state (per-isolate — resets on deploy, acceptable for CF Workers)
const circuits = new Map<string, CircuitState>();

function circuitKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export function isCircuitOpen(provider: string, model: string): boolean {
  const key = circuitKey(provider, model);
  const state = circuits.get(key);
  if (!state) return false;

  if (state.state === "open") {
    // Check if enough time has passed to try again
    if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
      state.state = "half-open";
      return false; // Allow one attempt
    }
    return true; // Still open
  }

  return false;
}

export function recordSuccess(provider: string, model: string): void {
  circuits.delete(circuitKey(provider, model));
}

export function recordFailure(provider: string, model: string): void {
  const key = circuitKey(provider, model);
  const state = circuits.get(key) ?? { failures: 0, lastFailure: 0, state: "closed" as const };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_THRESHOLD) {
    state.state = "open";
  }
  circuits.set(key, state);
}
```

**Note**: In CF Workers, isolate memory is shared across requests but resets on deployment. This makes the circuit breaker "best effort" — it won't survive a deploy but will protect against cascading failures during an outage window. For durable circuit state, store in `PlatformConfig` with a TTL check.

### 4.4 Integration: `callWithRecovery` Wrapper

```typescript
// worker/lib/ai-call.ts

export async function callWithRecovery<T>(
  options: {
    stage: AiStage;
    operation: string;
    correlationId: string;
    jobId?: string;
    stepId?: string;
    episodeId?: string;
    prisma: any;
    log: PipelineLogger;
  },
  primaryCall: (provider: string, model: string) => Promise<T>,
  fallbackCall?: (provider: string, model: string) => Promise<T>
): Promise<T> {
  const chain = await buildFallbackChain(options.prisma, options.stage);
  const candidates = [chain.primary, ...chain.fallbacks];

  for (let i = 0; i < candidates.length; i++) {
    const { provider, model } = candidates[i];
    const isPrimary = i === 0;
    const callFn = isPrimary ? primaryCall : (fallbackCall ?? primaryCall);

    // Check circuit breaker
    if (isCircuitOpen(provider, model)) {
      options.log.info("circuit_open_skip", { provider, model });
      continue;
    }

    const retryConfig = getRetryConfig("unknown"); // Will be refined per-attempt

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        const result = await callFn(provider, model);
        recordSuccess(provider, model);

        // If this was a fallback, log it
        if (!isPrimary) {
          options.log.info("fallback_success", { provider, model, attempt });
        }

        return result;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const { category, severity } = classifyError(err);
        const errorConfig = getRetryConfig(category);
        const willRetry = severity === "transient" && attempt < errorConfig.maxRetries;

        // Record to AiServiceError table
        const errorData: AIServiceErrorData = {
          service: options.stage,
          provider,
          model,
          operation: options.operation,
          correlationId: options.correlationId,
          jobId: options.jobId,
          stepId: options.stepId,
          episodeId: options.episodeId,
          category,
          severity,
          httpStatus: extractHttpStatus(err instanceof Error ? err.message : String(err)),
          errorMessage: err instanceof Error ? err.message : String(err),
          requestDurationMs: durationMs,
          timestamp: new Date(),
          retryCount: attempt,
          maxRetries: errorConfig.maxRetries,
          willRetry,
        };

        // Write to DB (fire-and-forget)
        writeAiError(options.prisma, errorData).catch(() => {});

        // Log structured error
        options.log.aiError(errorData);

        recordFailure(provider, model);

        if (severity === "permanent") {
          // Don't retry this provider, try fallback
          break;
        }

        if (willRetry) {
          const delay = calculateDelay(attempt, errorConfig);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // Exhausted retries for this provider, try fallback
        break;
      }
    }
  }

  // All providers exhausted
  throw new Error(`All AI providers failed for ${options.stage}/${options.operation}`);
}
```

---

## 5. Admin Dashboard Integration

### New API Endpoints

```
GET /api/admin/ai-errors
  ?service=stt|distillation|narrative|tts
  &provider=anthropic|openai|groq|...
  &category=rate_limit|timeout|auth|...
  &severity=transient|permanent
  &since=2026-03-14T00:00:00Z
  &page=1&pageSize=20

GET /api/admin/ai-errors/summary
  ?since=2026-03-14T00:00:00Z
  → {
      totalErrors: number,
      byService: { stt: number, distillation: number, ... },
      byProvider: { anthropic: number, openai: number, ... },
      byCategory: { rate_limit: number, timeout: number, ... },
      bySeverity: { transient: number, permanent: number },
      errorRate: { last1h: number, last24h: number, last7d: number },
      topErrors: [{ errorMessage, count, lastSeen }],
    }

GET /api/admin/ai-errors/trends
  ?service=stt&granularity=hour&since=...
  → { points: [{ timestamp, count, byCategory }] }
```

### Admin UI Components

1. **Error summary cards** on the existing dashboard page — total errors last 24h, error rate trend sparkline, top failing provider
2. **Error list page** with filters by service/provider/category/severity — sortable, paginated, links to pipeline job detail
3. **Error detail view** — full error context including raw response snippet, retry history, whether it was resolved by a fallback

### Integration with existing admin pages

- **Pipeline job detail** (`/admin/pipeline/jobs/:id`): Add "AI Errors" tab showing all `AiServiceError` rows for that job's correlation ID
- **Pipeline stages** (`/admin/pipeline`): Add error count badge per stage
- **Dashboard** (`/admin/dashboard`): Add AI health summary widget

---

## 6. AI-Analyzable Error Format

The `AiServiceError` table is designed for LLM analysis. An admin endpoint can export errors in a format suitable for pattern analysis:

```
GET /api/admin/ai-errors/export
  ?since=2026-03-14T00:00:00Z
  &format=analysis
```

Returns:

```json
{
  "meta": {
    "exportedAt": "2026-03-14T16:00:00Z",
    "totalErrors": 47,
    "period": { "from": "2026-03-14T00:00:00Z", "to": "2026-03-14T16:00:00Z" }
  },
  "errors": [
    {
      "timestamp": "2026-03-14T15:30:00Z",
      "service": "distillation",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "operation": "complete",
      "category": "rate_limit",
      "severity": "transient",
      "httpStatus": 429,
      "errorMessage": "Rate limit exceeded",
      "requestDurationMs": 1523,
      "retryCount": 2,
      "resolved": true,
      "correlationId": "clx1abc..."
    }
  ],
  "patterns": {
    "repeatingErrors": [
      { "signature": "anthropic:rate_limit", "count": 12, "firstSeen": "...", "lastSeen": "..." }
    ],
    "correlatedFailures": [
      { "correlationId": "clx1abc...", "errorCount": 3, "services": ["stt", "distillation"] }
    ]
  }
}
```

An LLM can analyze this export and suggest:
- "Anthropic rate limits are hitting at 3pm daily — consider spreading pipeline runs or adding a Groq fallback for distillation"
- "Deepgram timeout errors correlate with episodes >60 minutes — consider chunking long audio"
- "OpenAI TTS auth errors started at 14:22 — API key may have been rotated or billing issue"

---

## 7. Example Error Capture Flow

### Scenario: Anthropic rate limit during distillation

```
1. Distillation queue handler receives message { jobId, episodeId, correlationId }

2. callWithRecovery({
     stage: "distillation",
     operation: "complete",
     correlationId,
     ...
   }, primaryCall, fallbackCall) is invoked

3. Primary call to Anthropic fails with HTTP 429:
   - classifyError returns { category: "rate_limit", severity: "transient" }
   - AiServiceError row written: { service: "distillation", provider: "anthropic", ... }
   - Structured log emitted with correlationId
   - Retry #1 after 5000ms + jitter

4. Retry #1 also fails with 429:
   - Another AiServiceError row written (retryCount: 1)
   - Retry #2 after 10000ms + jitter

5. Retry #2 also fails with 429:
   - AiServiceError row written (retryCount: 2, willRetry: false)
   - Circuit breaker records failure for anthropic:claude-sonnet-4-20250514
   - Falls through to fallback: Groq

6. Groq call succeeds:
   - recordSuccess for groq
   - Log: "fallback_success" with provider: "groq"
   - Previous AiServiceError rows remain with resolved: false (could backfill)
   - Processing continues normally
```

---

## 8. Integration Points (Files That Change)

### New files

| File | Purpose |
|------|---------|
| `worker/lib/ai-errors.ts` | `AIServiceErrorData` interface, `classifyError()`, `writeAiError()` |
| `worker/lib/ai-retry.ts` | `RetryConfig`, `calculateDelay()`, `getRetryConfig()` |
| `worker/lib/ai-fallback.ts` | `buildFallbackChain()` |
| `worker/lib/ai-circuit-breaker.ts` | In-memory circuit breaker |
| `worker/lib/ai-call.ts` | `callWithRecovery()` wrapper |
| `worker/routes/admin/ai-errors.ts` | Admin API endpoints for error queries |
| `src/pages/admin/ai-errors.tsx` | Admin UI for error dashboard |

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `AiServiceError` model |
| `worker/lib/logger.ts` | Add `aiError()` method, `withCorrelationId()` |
| `worker/lib/llm-providers.ts` | Capture HTTP status and response body on error |
| `worker/lib/stt-providers.ts` | Capture HTTP status and response body on error |
| `worker/lib/tts-providers.ts` | Capture HTTP status and response body on error |
| `worker/queues/transcription.ts` | Use `callWithRecovery` for STT calls, pass correlationId |
| `worker/queues/distillation.ts` | Use `callWithRecovery` for LLM calls, pass correlationId |
| `worker/queues/narrative-generation.ts` | Use `callWithRecovery` for LLM calls, pass correlationId |
| `worker/queues/audio-generation.ts` | Use `callWithRecovery` for TTS calls, pass correlationId |
| `worker/queues/orchestrator.ts` | Pass correlationId in dispatched messages |
| `worker/routes/admin/index.ts` | Mount ai-errors routes |
| `worker/routes/admin/dashboard.ts` | Add AI error summary to dashboard response |
| `src/types/admin.ts` | Add `AiServiceError` types |
| `src/App.tsx` | Add AI errors route |

### Queue message shape changes

All queue messages gain a `correlationId` field. Existing messages without it should be handled gracefully (generate a new UUID as fallback).

---

## 9. Implementation Phases

### Phase 1: Foundation (MVP)

1. Add `AiServiceError` model to Prisma schema
2. Create `ai-errors.ts` with `classifyError()` and `writeAiError()`
3. Modify provider implementations to throw errors with HTTP status context
4. Add error capture to each queue handler's catch block (without retry/fallback yet)
5. Add `correlationId` to queue messages

**Outcome**: All AI errors are captured with structured data. No behavior change.

### Phase 2: Recovery

6. Implement `ai-retry.ts` with exponential backoff
7. Implement `ai-fallback.ts` for fallback chain construction
8. Create `callWithRecovery()` wrapper
9. Integrate into queue handlers (replace direct provider calls)

**Outcome**: Transient errors are automatically retried. Permanent errors fall back to alternate providers.

### Phase 3: Observability

10. Build admin API endpoints for error queries
11. Build admin UI dashboard
12. Add error summary to existing dashboard
13. Add AI-analyzable export endpoint

**Outcome**: Full visibility into AI service health and error patterns.

### Phase 4: Circuit Breaker

14. Implement circuit breaker
15. Integrate into `callWithRecovery()`
16. Surface circuit state in admin dashboard

**Outcome**: Automatic protection against cascading failures.

---

## 10. Design Decisions

### Why in-memory circuit breaker (not DB)?

CF Workers share isolate memory across requests within the same deployment. An in-memory circuit breaker provides good-enough protection during an outage window. A DB-backed circuit breaker would add a read per AI call, which is unnecessary overhead for the protection it provides.

### Why a separate table (not extending PipelineStep)?

`PipelineStep` is per-job-per-stage. AI errors need to be queryable across all jobs by provider/model/time. A dedicated table with proper indexes enables this without complicating the existing pipeline audit trail.

### Why not use Cloudflare Queues retry?

CF Queue retries are coarse-grained (retry the entire message). AI service retries should be fine-grained (retry just the AI call, not the entire stage processing). The `callWithRecovery` wrapper handles this at the right granularity.

### Why correlationId = BriefingRequest.id?

The `BriefingRequest.id` is already the natural unit of work. Using it as the correlation ID means existing admin pages can link directly to error context without additional mapping.
