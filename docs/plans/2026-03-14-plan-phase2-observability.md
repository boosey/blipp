# Phase 2: Error Handling & Observability -- Implementation Plan

**Date:** 2026-03-14
**Branch:** `refactor/code-review`
**Source:** [Master Review Plan](./2026-03-14-master-review-plan.md) Phase 2 items 2.1-2.7
**Prerequisites:** [Error Handling Review](./2026-03-14-error-handling-review.md), [AI Error Capture Design](./2026-03-14-ai-error-capture-design.md)
**Estimated effort:** 2-3 days

---

## Overview

This plan covers 7 tasks that establish the observability foundation for Blipp's production deployment. After completing these tasks, every API request and pipeline job will be traceable end-to-end, AI provider failures will be captured with structured context, and silent catch blocks will no longer swallow critical errors.

### Dependency Graph

```
Task 2.1 (Global onError)     ─┐
Task 2.2 (Correlation IDs)    ─┤─> Task 2.4 (AI error capture wrapping)
Task 2.3 (AIServiceError)     ─┘         │
Task 2.5 (HTTP request logging)           │─> Task 2.7 (Admin AI errors endpoint)
Task 2.6 (Fix silent catches)            ─┘
```

Tasks 2.1, 2.2, 2.3, 2.5, and 2.6 can largely proceed in parallel. Task 2.4 depends on 2.2 and 2.3. Task 2.7 depends on 2.3.

---

## Task 2.1: Global Hono `onError` Handler with Structured Error Responses

**Files:**
- `worker/index.ts` (modify)
- `worker/lib/errors.ts` (new)

**Depends on:** None

### What to do

**Step 1: Create `worker/lib/errors.ts` with error classification utilities.**

This file defines the standard error response shape and classifies known error types into appropriate HTTP status codes.

```typescript
// worker/lib/errors.ts

import type { Context } from "hono";
import type { Env } from "../types";

/** Standard API error response shape. Every error from the API uses this. */
export interface ApiErrorResponse {
  error: string;
  requestId?: string;
  code?: string;
}

/**
 * Determines the HTTP status code and user-safe message for a thrown error.
 * Prevents Prisma internals, stack traces, and API keys from leaking to clients.
 */
export function classifyHttpError(err: unknown): { status: number; message: string; code?: string } {
  if (err instanceof Error) {
    const msg = err.message;
    const name = err.name;

    // Prisma P2025: Record not found (findUniqueOrThrow, findFirstOrThrow, update/delete on missing)
    if (name === "PrismaClientKnownRequestError" || name === "NotFoundError") {
      if (msg.includes("P2025") || name === "NotFoundError") {
        return { status: 404, message: "Not found", code: "NOT_FOUND" };
      }
    }

    // Prisma P2002: Unique constraint violation
    if (msg.includes("P2002")) {
      return { status: 409, message: "Resource already exists", code: "CONFLICT" };
    }

    // Prisma P2003: Foreign key constraint violation
    if (msg.includes("P2003")) {
      return { status: 400, message: "Invalid reference", code: "INVALID_REFERENCE" };
    }

    // Explicit 404 throws from route handlers (e.g., "Episode not found")
    if (msg.toLowerCase().includes("not found")) {
      return { status: 404, message: msg, code: "NOT_FOUND" };
    }

    // Stripe errors
    if (name === "StripeError" || msg.includes("Stripe")) {
      return { status: 502, message: "Payment service error", code: "PAYMENT_ERROR" };
    }

    // Auth errors
    if (msg.includes("Unauthorized") || msg.includes("No default plan configured")) {
      return { status: 401, message: "Authentication required", code: "UNAUTHORIZED" };
    }
  }

  // Default: internal server error with no details leaked
  return { status: 500, message: "Internal server error", code: "INTERNAL_ERROR" };
}
```

**Step 2: Register `app.onError` in `worker/index.ts`.**

Add the global error handler after the app creation but before route mounting. The handler must:
1. Classify the error to determine status code and safe message.
2. Read the `x-request-id` header (set by Task 2.2's middleware, or fall back to crypto.randomUUID).
3. Log a structured JSON line to `console.error`.
4. Return a consistent `{ error, requestId, code }` JSON response.

Insert after line 18 (`const app = new Hono<{ Bindings: Env }>();`), before the CORS middleware:

```typescript
import { classifyHttpError, type ApiErrorResponse } from "./lib/errors";

// Global error handler — catches all unhandled throws from routes/middleware
app.onError((err, c) => {
  const { status, message, code } = classifyHttpError(err);
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

  // Structured error log — includes enough context to diagnose without leaking to client
  console.error(JSON.stringify({
    level: "error",
    action: "unhandled_error",
    method: c.req.method,
    path: c.req.path,
    status,
    code,
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ts: new Date().toISOString(),
  }));

  const body: ApiErrorResponse = { error: message, requestId };
  if (code) body.code = code;

  return c.json(body, status as any);
});
```

**Step 3: Add `notFound` handler for clean 404s on unmatched routes.**

```typescript
app.notFound((c) => {
  return c.json({ error: "Not found", code: "ROUTE_NOT_FOUND" }, 404);
});
```

### Acceptance criteria

- [ ] All unhandled errors from API routes return `{ error: string, requestId: string }` JSON with appropriate HTTP status (not Hono's default `Internal Server Error` plaintext)
- [ ] `PrismaClientKnownRequestError` with P2025 returns 404
- [ ] Error responses never contain Prisma table names, field names, or stack traces
- [ ] A structured JSON log line is emitted to `console.error` for every unhandled error
- [ ] Unmatched routes return `{ error: "Not found" }` with 404 (not 500 or HTML)
- [ ] The `requestId` in the response matches the `requestId` in the console log

### Tests to add

**File:** `worker/routes/__tests__/error-handler.test.ts`

- Test that a route throwing `new Error("Episode not found")` returns 404 JSON with `requestId`
- Test that a route throwing a mock Prisma `NotFoundError` (name = "NotFoundError") returns 404
- Test that a route throwing a generic `new Error("something broke")` returns 500 with `"Internal server error"` (not the actual message)
- Test that a route throwing a Prisma P2002 error returns 409
- Test that the `notFound` handler returns 404 JSON for `GET /api/nonexistent`
- Test that the error response includes `requestId` as a UUID string

---

## Task 2.2: Request Correlation IDs (Propagated Through Queues)

**Files:**
- `worker/middleware/request-id.ts` (new)
- `worker/index.ts` (modify -- register middleware)
- `worker/lib/logger.ts` (modify -- add `correlationId` support)
- `worker/queues/orchestrator.ts` (modify -- propagate `correlationId` in dispatched messages)
- `worker/queues/transcription.ts` (modify -- read/pass `correlationId`)
- `worker/queues/distillation.ts` (modify -- read/pass `correlationId`)
- `worker/queues/narrative-generation.ts` (modify -- read/pass `correlationId`)
- `worker/queues/audio-generation.ts` (modify -- read/pass `correlationId`)
- `worker/queues/briefing-assembly.ts` (modify -- read `correlationId`)

**Depends on:** None

### What to do

**Step 1: Create `worker/middleware/request-id.ts`.**

This middleware generates or reads a correlation/request ID and sets it on the response headers and Hono context.

```typescript
// worker/middleware/request-id.ts

import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

/**
 * Middleware that assigns a unique request ID to every HTTP request.
 * If the client sends an `x-request-id` header, it is reused; otherwise
 * a new UUID is generated. The ID is set on the response header and
 * stored in context for downstream use.
 */
export const requestIdMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  }
);
```

**Step 2: Extend `ContextVariableMap` in `worker/types.ts`.**

Add `requestId` to the Hono context type map:

```typescript
declare module "hono" {
  interface ContextVariableMap {
    prisma: any;
    requestId: string;
  }
}
```

**Step 3: Register in `worker/index.ts`.**

Add the middleware **before** all other `/api/*` middleware (it must run first so other middleware can access `requestId`):

```typescript
import { requestIdMiddleware } from "./middleware/request-id";

// Register BEFORE cors, clerk, prisma
app.use("/api/*", requestIdMiddleware);
```

**Step 4: Add `correlationId` to all queue message interfaces.**

Each queue message type (in their respective queue handler files) gains an optional `correlationId?: string` field. When absent, handlers generate a fallback UUID.

For each of `TranscriptionMessage`, `DistillationMessage`, `NarrativeGenerationMessage`, `AudioGenerationMessage`, `BriefingAssemblyMessage`, and `OrchestratorMessage`:

```typescript
interface XxxMessage {
  // ... existing fields ...
  correlationId?: string;  // NEW: traces through the entire pipeline
}
```

**Step 5: Orchestrator propagates `correlationId` in dispatched messages.**

In `worker/queues/orchestrator.ts`, the `handleEvaluate` function dispatches to `TRANSCRIPTION_QUEUE`. It should include `correlationId: request.id` (using the BriefingRequest ID as the natural correlation ID):

```typescript
// In handleEvaluate, when dispatching to TRANSCRIPTION_QUEUE:
await env.TRANSCRIPTION_QUEUE.send({
  jobId: job.id,
  episodeId: resolved.episodeId,
  correlationId: request.id,  // BriefingRequest.id is the natural correlation ID
});
```

In `handleJobStageComplete`, when dispatching to the next stage queue:

```typescript
const message: Record<string, any> = {
  jobId,
  episodeId: job.episodeId,
  correlationId: msg.body.correlationId ?? requestId,  // Propagate from incoming message
};
```

The orchestrator's own `OrchestratorMessage` also receives a `correlationId` field. Each stage handler must propagate it when sending back to the orchestrator:

```typescript
// In each stage handler's success path (e.g., distillation.ts):
await env.ORCHESTRATOR_QUEUE.send({
  requestId: job.requestId,
  action: "job-stage-complete",
  jobId,
  correlationId: msg.body.correlationId,  // Propagate
});
```

**Step 6: Update `createPipelineLogger` to accept and emit `correlationId`.**

In `worker/lib/logger.ts`, add `correlationId?: string` to `LoggerOptions`:

```typescript
interface LoggerOptions {
  stage: string;
  requestId?: string;
  jobId?: string;
  correlationId?: string;  // NEW
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } };
}
```

In the `base` object construction, include it:

```typescript
if (opts.correlationId) base.correlationId = opts.correlationId;
```

**Step 7: Each queue handler reads `correlationId` from the message and passes it to the logger.**

For each of the 6 queue handlers (transcription, distillation, narrative-generation, audio-generation, briefing-assembly, orchestrator), in the per-message loop:

```typescript
const correlationId = msg.body.correlationId ?? crypto.randomUUID();
// When creating the logger for this message (or pass to the batch-level logger):
const log = await createPipelineLogger({
  stage: "distillation",
  jobId,
  correlationId,
  prisma,
});
```

Note: Some handlers create the logger at batch level (outside the message loop). For these, the `correlationId` should be passed per-message via the log context or a message-scoped logger.

### Acceptance criteria

- [ ] Every API response includes an `x-request-id` header
- [ ] If the client sends `x-request-id`, it is echoed back (not replaced)
- [ ] Queue messages dispatched from the orchestrator include `correlationId`
- [ ] Each stage handler reads `correlationId` from the message and includes it in structured logs
- [ ] All structured log lines from pipeline processing include a `correlationId` field
- [ ] Old messages without `correlationId` are handled gracefully (fallback UUID generated)

### Tests to add

**File:** `worker/middleware/__tests__/request-id.test.ts`

- Test that a request without `x-request-id` gets a UUID in the response header
- Test that a request with `x-request-id: abc-123` echoes `abc-123` in the response header
- Test that `c.get("requestId")` returns the correct value inside a route handler

**File:** Update existing queue handler tests

- Verify that when a message includes `correlationId`, it appears in the orchestrator notification sent back
- Verify that when a message omits `correlationId`, a fallback UUID is generated (not `undefined`)

---

## Task 2.3: AIServiceError Class and DB Table

**Files:**
- `prisma/schema.prisma` (modify -- add `AiServiceError` model)
- `worker/lib/ai-errors.ts` (new -- error class, classifier, DB writer)

**Depends on:** None

### What to do

**Step 1: Add the `AiServiceError` model to `prisma/schema.prisma`.**

Insert after the `PipelineEvent` model block (after line 393 in the current schema):

```prisma
// ── AI Service Error Tracking ──

model AiServiceError {
  id                String   @id @default(cuid())

  // Identity
  service           String                      // "stt" | "distillation" | "narrative" | "tts"
  provider          String                      // "anthropic", "openai", "groq", "deepgram", etc.
  model             String                      // model ID that was called
  operation         String                      // "transcribe", "complete", "synthesize"

  // Context
  correlationId     String                      // traces through the pipeline
  jobId             String?                     // PipelineJob reference
  stepId            String?                     // PipelineStep reference
  episodeId         String?

  // Error details
  category          String                      // rate_limit, timeout, auth, model_not_found, etc.
  severity          String                      // "transient" | "permanent"
  httpStatus        Int?
  errorMessage      String
  rawResponse       String?                     // first 2KB of error body (sanitized)

  // Timing
  requestDurationMs Int
  timestamp         DateTime @default(now())

  // Retry context
  retryCount        Int      @default(0)
  maxRetries        Int      @default(0)
  willRetry         Boolean  @default(false)
  resolved          Boolean  @default(false)    // true if a subsequent retry succeeded

  // Rate limit headers (when available)
  rateLimitRemaining Int?
  rateLimitResetAt   DateTime?

  createdAt         DateTime @default(now())

  @@index([service, provider, createdAt])
  @@index([correlationId])
  @@index([category, createdAt])
  @@index([episodeId])
  @@index([resolved, createdAt])
}
```

**Step 2: Run `npx prisma generate` to regenerate the client.**

**Step 3: Create `worker/lib/ai-errors.ts`.**

This file contains:
1. The `AiErrorCategory` and `AiErrorSeverity` types
2. The `AIServiceErrorData` interface
3. The `classifyAiError()` function (determines category and severity from an error)
4. The `sanitizeResponse()` helper (truncates raw response to 2KB, strips API keys)
5. The `writeAiError()` function (fire-and-forget DB write)

```typescript
// worker/lib/ai-errors.ts

export type AiErrorCategory =
  | "rate_limit"
  | "timeout"
  | "auth"
  | "model_not_found"
  | "content_filter"
  | "invalid_request"
  | "server_error"
  | "network"
  | "quota_exceeded"
  | "unknown";

export type AiErrorSeverity = "transient" | "permanent";

export interface AIServiceErrorData {
  // Identity
  service: "stt" | "distillation" | "narrative" | "tts";
  provider: string;
  model: string;
  operation: string;

  // Context
  correlationId: string;
  jobId?: string;
  stepId?: string;
  episodeId?: string;

  // Error details
  category: AiErrorCategory;
  severity: AiErrorSeverity;
  httpStatus?: number;
  errorMessage: string;
  rawResponse?: string;

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

/**
 * Classify an error from an AI service call into a category and severity.
 * Used to decide whether to retry and how to log.
 */
export function classifyAiError(
  err: unknown,
  httpStatus?: number,
  responseBody?: string
): { category: AiErrorCategory; severity: AiErrorSeverity } {
  const message = err instanceof Error ? err.message : String(err);
  const status = httpStatus ?? extractHttpStatus(message);

  // Rate limiting
  if (status === 429 || message.includes("rate_limit") || message.toLowerCase().includes("too many requests")) {
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
  if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.toLowerCase().includes("network")) {
    return { category: "network", severity: "transient" };
  }

  // Auth errors
  if (status === 401 || status === 403 || message.includes("api_key") || message.toLowerCase().includes("unauthorized")) {
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

  // Default to transient for safety (retry unknown errors)
  return { category: "unknown", severity: "transient" };
}

/**
 * Extract HTTP status code from error message strings like
 * "API error 429:" or "HTTP 503".
 */
export function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/(?:error|HTTP)\s+(\d{3})/i);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Truncate and sanitize a raw error response body for storage.
 * Strips potential API keys and limits to 2KB.
 */
export function sanitizeResponse(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const truncated = body.slice(0, 2048);
  // Strip anything that looks like an API key (sk-..., key_..., etc.)
  return truncated.replace(/(?:sk|key|token|secret|bearer)[_-][\w-]{16,}/gi, "[REDACTED]");
}

/**
 * Write an AI service error to the database. Fire-and-forget --
 * errors are logged to console but never thrown.
 */
export async function writeAiError(
  prisma: any,
  data: AIServiceErrorData
): Promise<void> {
  try {
    await prisma.aiServiceError.create({
      data: {
        service: data.service,
        provider: data.provider,
        model: data.model,
        operation: data.operation,
        correlationId: data.correlationId,
        jobId: data.jobId,
        stepId: data.stepId,
        episodeId: data.episodeId,
        category: data.category,
        severity: data.severity,
        httpStatus: data.httpStatus,
        errorMessage: data.errorMessage.slice(0, 2048),
        rawResponse: sanitizeResponse(data.rawResponse),
        requestDurationMs: data.requestDurationMs,
        retryCount: data.retryCount,
        maxRetries: data.maxRetries,
        willRetry: data.willRetry,
        rateLimitRemaining: data.rateLimitRemaining,
        rateLimitResetAt: data.rateLimitResetAt,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      action: "ai_error_write_failed",
      service: data.service,
      provider: data.provider,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
  }
}
```

### Acceptance criteria

- [ ] `npx prisma generate` succeeds with the new `AiServiceError` model
- [ ] `npx prisma db push` creates the table with all 5 indexes
- [ ] `classifyAiError` correctly categorizes all 10 error types (see tests)
- [ ] `sanitizeResponse` truncates to 2KB and strips API key patterns
- [ ] `writeAiError` creates a row in the DB and logs a structured error if the write fails
- [ ] `extractHttpStatus` correctly parses status from error message strings

### Tests to add

**File:** `worker/lib/__tests__/ai-errors.test.ts`

- `classifyAiError`: 429 response -> `rate_limit` / `transient`
- `classifyAiError`: 504 response -> `timeout` / `transient`
- `classifyAiError`: 500 response -> `server_error` / `transient`
- `classifyAiError`: 401 response -> `auth` / `permanent`
- `classifyAiError`: 404 with "does not exist" -> `model_not_found` / `permanent`
- `classifyAiError`: message containing "content_policy" -> `content_filter` / `permanent`
- `classifyAiError`: message containing "quota" -> `quota_exceeded` / `permanent`
- `classifyAiError`: 400 response -> `invalid_request` / `permanent`
- `classifyAiError`: unknown error -> `unknown` / `transient`
- `classifyAiError`: message "Groq API error 429: rate limit" -> `rate_limit` (extracts status from string)
- `classifyAiError`: message "fetch failed" -> `network` / `transient`
- `classifyAiError`: Error with "1031" in message -> `timeout` / `transient`
- `sanitizeResponse`: truncates to 2048 characters
- `sanitizeResponse`: replaces `sk-abc123def456ghij789` with `[REDACTED]`
- `sanitizeResponse`: returns `undefined` for `undefined` input
- `extractHttpStatus`: parses "API error 429:" -> 429
- `extractHttpStatus`: parses "HTTP 503" -> 503
- `extractHttpStatus`: returns undefined for "some random error"
- `writeAiError`: calls `prisma.aiServiceError.create` with correct shape
- `writeAiError`: does not throw when prisma.create fails (logs to console.error instead)

---

## Task 2.4: Wrap AI Provider Calls with Error Capture

**Files:**
- `worker/lib/llm-providers.ts` (modify)
- `worker/lib/stt-providers.ts` (modify)
- `worker/lib/tts-providers.ts` (modify)

**Depends on:** Task 2.3 (AIServiceError types)

### What to do

This task adds structured error context to AI provider calls. Each provider's error path must capture the HTTP status, response body snippet, and request duration so they can be passed to the `writeAiError` function (called from the queue handler catch blocks in Task 2.4b, or eventually from `callWithRecovery` in a future phase).

The approach is to define a custom error class that carries this context, then throw it from each provider when a call fails.

**Step 1: Add `AiProviderError` class to `worker/lib/ai-errors.ts`.**

```typescript
/**
 * Error thrown by AI provider implementations with structured context.
 * Carries HTTP status, response body, and timing for downstream capture.
 */
export class AiProviderError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly httpStatus?: number;
  readonly rawResponse?: string;
  readonly requestDurationMs: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitResetAt?: Date;

  constructor(opts: {
    message: string;
    provider: string;
    model: string;
    httpStatus?: number;
    rawResponse?: string;
    requestDurationMs: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: Date;
  }) {
    super(opts.message);
    this.name = "AiProviderError";
    this.provider = opts.provider;
    this.model = opts.model;
    this.httpStatus = opts.httpStatus;
    this.rawResponse = opts.rawResponse;
    this.requestDurationMs = opts.requestDurationMs;
    this.rateLimitRemaining = opts.rateLimitRemaining;
    this.rateLimitResetAt = opts.rateLimitResetAt;
  }
}
```

**Step 2: Modify `worker/lib/llm-providers.ts` -- wrap all three providers.**

For each provider, wrap the API call in timing and structured error capture.

*AnthropicProvider* (currently has no error handling):

```typescript
const AnthropicProvider: LlmProvider = {
  name: "Anthropic",
  provider: "anthropic",

  async complete(messages, providerModelId, maxTokens, env) {
    const start = Date.now();
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: providerModelId,
        max_tokens: maxTokens,
        messages,
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      // Anthropic SDK errors have a `status` property
      const status = (err as any)?.status ?? (err as any)?.statusCode;
      const rawBody = (err as any)?.message ?? String(err);

      throw new AiProviderError({
        message: `Anthropic API error${status ? ` ${status}` : ""}: ${rawBody.slice(0, 500)}`,
        provider: "anthropic",
        model: providerModelId,
        httpStatus: typeof status === "number" ? status : undefined,
        rawResponse: rawBody.slice(0, 2048),
        requestDurationMs: durationMs,
      });
    }
  },
};
```

*GroqLlmProvider* (already checks `resp.ok` -- enhance with `AiProviderError`):

```typescript
async complete(messages, providerModelId, maxTokens, env) {
  const start = Date.now();
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: providerModelId, max_tokens: maxTokens, messages }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new AiProviderError({
      message: `Groq LLM API error ${resp.status}: ${body.slice(0, 500)}`,
      provider: "groq",
      model: providerModelId,
      httpStatus: resp.status,
      rawResponse: body.slice(0, 2048),
      requestDurationMs: Date.now() - start,
      rateLimitRemaining: parseIntHeader(resp.headers.get("x-ratelimit-remaining-tokens")),
      rateLimitResetAt: parseResetHeader(resp.headers.get("x-ratelimit-reset-tokens")),
    });
  }
  // ... rest unchanged ...
}
```

*CloudflareLlmProvider* (currently no error handling):

Wrap the `env.AI.run` call in try/catch:

```typescript
async complete(messages, providerModelId, maxTokens, env) {
  const start = Date.now();
  try {
    const result = (await env.AI.run(providerModelId as any, {
      messages,
      max_tokens: maxTokens,
    })) as any;

    return {
      text: result?.response ?? result?.result ?? "",
      model: providerModelId,
      inputTokens: result?.usage?.prompt_tokens ?? 0,
      outputTokens: result?.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    throw new AiProviderError({
      message: `Cloudflare AI error: ${err instanceof Error ? err.message : String(err)}`,
      provider: "cloudflare",
      model: providerModelId,
      requestDurationMs: Date.now() - start,
      rawResponse: err instanceof Error ? err.message : String(err),
    });
  }
}
```

Add a helper at the top of the file for parsing rate limit headers:

```typescript
import { AiProviderError } from "./ai-errors";

function parseIntHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value);
  return isNaN(n) ? undefined : n;
}

function parseResetHeader(value: string | null): Date | undefined {
  if (!value) return undefined;
  // Some providers return epoch seconds, others ISO strings
  const n = Number(value);
  if (!isNaN(n)) return new Date(n > 1e12 ? n : n * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
```

**Step 3: Apply the same pattern to `worker/lib/stt-providers.ts`.**

For each of the 6 STT providers (OpenAI, Deepgram, AssemblyAI, Google, Groq, Cloudflare), replace the existing `throw new Error(...)` with `throw new AiProviderError(...)`. Key changes:

- **Deepgram**: Remove the raw `console.error` on line 134. Replace with `AiProviderError` that carries the HTTP status.
- **Cloudflare (Whisper)**: The existing retry logic (lines 381-393) stays, but both the initial error and the retry error should throw `AiProviderError`.
- All providers should wrap the entire `transcribe` method in a start/end timer.

Example for OpenAI STT:

```typescript
async transcribe(audio, durationSeconds, env, providerModelId) {
  const start = Date.now();
  // ... existing code ...
  if (!resp.ok) {
    const body = await resp.text();
    throw new AiProviderError({
      message: `OpenAI Whisper API error ${resp.status}: ${body.slice(0, 500)}`,
      provider: "openai",
      model: providerModelId,
      httpStatus: resp.status,
      rawResponse: body.slice(0, 2048),
      requestDurationMs: Date.now() - start,
    });
  }
  // ... rest unchanged ...
}
```

**Step 4: Apply the same pattern to `worker/lib/tts-providers.ts`.**

For each of the 3 TTS providers (OpenAI, Groq, Cloudflare):

- **OpenAI**: Wrap the `client.audio.speech.create` call in try/catch, throw `AiProviderError`.
- **Groq**: Replace the existing `throw new Error(...)` with `throw new AiProviderError(...)`.
- **Cloudflare**: Wrap `env.AI.run` in try/catch, throw `AiProviderError`.

**Step 5: In each queue handler's catch block, detect `AiProviderError` and write to `AiServiceError` table.**

In the catch block of each queue handler (transcription, distillation, narrative-generation, audio-generation), add:

```typescript
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";

// ... in catch block ...
if (err instanceof AiProviderError) {
  const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
  writeAiError(prisma, {
    service: "distillation",  // or "stt", "narrative", "tts" depending on stage
    provider: err.provider,
    model: err.model,
    operation: "complete",     // or "transcribe", "synthesize"
    correlationId: correlationId ?? crypto.randomUUID(),
    jobId,
    stepId: step?.id,
    episodeId,
    category,
    severity,
    httpStatus: err.httpStatus,
    errorMessage: err.message,
    rawResponse: err.rawResponse,
    requestDurationMs: err.requestDurationMs,
    timestamp: new Date(),
    retryCount: 0,
    maxRetries: 0,
    willRetry: false,
    rateLimitRemaining: err.rateLimitRemaining,
    rateLimitResetAt: err.rateLimitResetAt,
  }).catch(() => {});  // Fire-and-forget
}
```

### Acceptance criteria

- [ ] All 3 LLM providers throw `AiProviderError` on failure (not plain `Error`)
- [ ] All 6 STT providers throw `AiProviderError` on failure
- [ ] All 3 TTS providers throw `AiProviderError` on failure
- [ ] `AiProviderError` carries `provider`, `model`, `httpStatus`, `rawResponse`, and `requestDurationMs`
- [ ] Deepgram no longer uses raw `console.error` (line 134 in current stt-providers.ts)
- [ ] Groq providers capture rate limit headers (`x-ratelimit-remaining-tokens`, etc.)
- [ ] Queue handler catch blocks detect `AiProviderError` and write to `AiServiceError` table
- [ ] The existing error handling flow (mark step FAILED, notify orchestrator) is unchanged

### Tests to add

**File:** `worker/lib/__tests__/llm-providers.test.ts`

- Test that Anthropic provider throws `AiProviderError` with `provider: "anthropic"` when the SDK throws
- Test that Groq provider throws `AiProviderError` with `httpStatus: 429` on rate limit response
- Test that Cloudflare provider throws `AiProviderError` when `env.AI.run` throws

**File:** `worker/lib/__tests__/stt-providers.test.ts`

- Test that each provider's error path produces `AiProviderError` with correct `provider` field
- Test that Cloudflare STT retry still works and throws `AiProviderError` after retry exhaustion

**File:** `worker/lib/__tests__/tts-providers.test.ts`

- Test that each provider's error path produces `AiProviderError` with correct `provider` field

---

## Task 2.5: HTTP Request Logging Middleware

**Files:**
- `worker/middleware/request-logger.ts` (new)
- `worker/index.ts` (modify -- register middleware)

**Depends on:** Task 2.2 (request ID middleware, so requestId is available)

### What to do

**Step 1: Create `worker/middleware/request-logger.ts`.**

This middleware logs every API request with method, path, status, duration, user ID, and request ID in structured JSON format.

```typescript
// worker/middleware/request-logger.ts

import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import type { Env } from "../types";

/**
 * Middleware that logs every HTTP request in structured JSON.
 * Emits one log line after the response is complete.
 *
 * Fields: method, path, status, durationMs, requestId, userId, userAgent
 */
export const requestLogger = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const status = c.res.status;
    const requestId = c.get("requestId") ?? c.req.header("x-request-id");
    const auth = getAuth(c);

    // Skip logging for health checks to reduce noise
    if (c.req.path === "/api/health") return;

    const logLine = JSON.stringify({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      action: "http_request",
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
      requestId,
      userId: auth?.userId ?? undefined,
      userAgent: c.req.header("user-agent")?.slice(0, 200),
      ts: new Date().toISOString(),
    });

    if (status >= 500) {
      console.error(logLine);
    } else {
      console.log(logLine);
    }
  }
);
```

**Step 2: Register in `worker/index.ts`.**

Add the logger middleware **after** `requestIdMiddleware` and **after** `clerkMiddleware` (so auth context is available), but **before** `prismaMiddleware`:

```typescript
import { requestLogger } from "./middleware/request-logger";

// Middleware order for /api/*:
// 1. requestIdMiddleware  (generates/reads request ID)
// 2. cors()
// 3. clerkMiddleware()    (populates auth context)
// 4. requestLogger        (logs after response, needs auth + requestId)
// 5. prismaMiddleware     (creates DB client)
app.use("/api/*", requestIdMiddleware);
app.use("/api/*", cors());
app.use("/api/*", clerkMiddleware());
app.use("/api/*", requestLogger);
app.use("/api/*", prismaMiddleware);
```

Note: The `requestLogger` must be registered with `await next()` called inside it. It captures the response status after all downstream middleware and route handlers complete.

### Acceptance criteria

- [ ] Every API request (except `/api/health`) emits a structured JSON log line
- [ ] Log includes: `method`, `path`, `status`, `durationMs`, `requestId`, `userId`
- [ ] 5xx responses are logged at `error` level via `console.error`
- [ ] 4xx responses are logged at `warn` level via `console.log`
- [ ] 2xx responses are logged at `info` level via `console.log`
- [ ] Health check requests are not logged (noise reduction)
- [ ] User agent is truncated to 200 characters
- [ ] Middleware does not interfere with response body or headers

### Tests to add

**File:** `worker/middleware/__tests__/request-logger.test.ts`

- Test that a successful 200 request logs a `console.log` with `action: "http_request"` and correct `method`/`path`/`status`
- Test that a 500 request logs via `console.error`
- Test that `/api/health` is not logged
- Test that `durationMs` is a non-negative number
- Test that an unauthenticated request logs `userId: undefined`

---

## Task 2.6: Fix Silent Catch Blocks

**Files:** (18 locations across 11 files)
- `worker/queues/transcription.ts` (3 silent catches in error path)
- `worker/queues/distillation.ts` (3 silent catches in error path)
- `worker/queues/narrative-generation.ts` (2 silent catches in error path)
- `worker/queues/audio-generation.ts` (3 silent catches in error path)
- `worker/queues/briefing-assembly.ts` (2 silent catches in error path)
- `worker/queues/orchestrator.ts` (1 silent catch in error path)
- `worker/lib/config.ts` (1 silent catch)
- `worker/lib/transcript-source.ts` (1 silent catch)
- `worker/routes/admin/pipeline.ts` (1 silent catch)
- `worker/routes/admin/podcasts.ts` (1 silent catch)
- `worker/routes/admin/config.ts` (1 silent catch)

**Depends on:** None (but should coordinate with Task 2.2 for correlationId availability)

### What to do

The principle: **No catch block should be completely empty.** At minimum, every catch must log a structured warning. For critical failures (orchestrator notification sends), the catch should also attempt a fallback or record the failure for later recovery.

**Category A: Orchestrator notification failures (CRITICAL -- 4 locations)**

These are the most dangerous silent catches. If the orchestrator queue send fails, the pipeline job is stuck forever.

Files and locations:
1. `worker/queues/transcription.ts` ~line 318: `.send({...}).catch(() => {})`
2. `worker/queues/distillation.ts` ~line 258: `.send({...}).catch(() => {})`
3. `worker/queues/narrative-generation.ts` ~line 242: `.send({...}).catch(() => {})`
4. `worker/queues/audio-generation.ts` ~line 262: `.send({...}).catch(() => {})`

Replace each with:

```typescript
await env.ORCHESTRATOR_QUEUE.send({
  requestId,
  action: "job-failed",
  jobId,
  errorMessage,
}).catch((sendErr) => {
  // CRITICAL: orchestrator will never learn this job failed.
  // The job will be stuck in an intermediate state.
  console.error(JSON.stringify({
    level: "error",
    action: "orchestrator_send_failed",
    stage: "distillation",  // change per file
    jobId,
    requestId,
    error: sendErr instanceof Error ? sendErr.message : String(sendErr),
    ts: new Date().toISOString(),
  }));
});
```

**Category B: Step/domain record update failures in error paths (9 locations)**

These `.catch(() => {})` blocks swallow failures when marking PipelineStep or domain records as FAILED. If the DB write fails, the step is stuck IN_PROGRESS forever.

Files and locations:
1. `worker/queues/transcription.ts` ~line 293: `.updateMany({...}).catch(() => {})` (step FAILED)
2. `worker/queues/transcription.ts` ~line 307: `.upsert({...}).catch(() => {})` (distillation FAILED)
3. `worker/queues/distillation.ts` ~line 235: `.update({...}).catch(() => {})` (step FAILED)
4. `worker/queues/distillation.ts` ~line 245: `.upsert({...}).catch(() => {})` (distillation FAILED)
5. `worker/queues/narrative-generation.ts` ~line 231: `.updateMany({...}).catch(() => {})` (step FAILED)
6. `worker/queues/audio-generation.ts` ~line 223: `.updateMany({...}).catch(() => {})` (step FAILED)
7. `worker/queues/audio-generation.ts` ~line 240: `.upsert({...}).catch(() => {})` (clip FAILED)
8. `worker/queues/briefing-assembly.ts` ~line 154: `.updateMany({...}).catch(() => {})` (feedItem FAILED)
9. `worker/queues/briefing-assembly.ts` ~line 164: `.updateMany({...}).catch(() => {})` (request FAILED)

Replace each with a logging `.catch`:

```typescript
.catch((dbErr) => {
  console.error(JSON.stringify({
    level: "error",
    action: "error_path_db_write_failed",
    stage: "transcription",    // change per file
    target: "pipelineStep",    // or "distillation", "clip", "feedItem", "briefingRequest"
    jobId,
    error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    ts: new Date().toISOString(),
  }));
});
```

**Category C: Orchestrator's own error-path catch (1 location)**

File: `worker/queues/orchestrator.ts` ~line 77: `.catch(() => null)`

Replace with:

```typescript
.catch((dbErr) => {
  log.error("request_update_failed", { requestId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
  return null;
});
```

**Category D: Config/utility silent catches (3 locations)**

1. `worker/lib/config.ts` ~line 34: `catch { return fallback; }`

Replace with:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "warn",
    action: "config_read_failed",
    key,
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
  return fallback;
}
```

2. `worker/lib/transcript-source.ts` ~line 26: `catch { return null; }`

Replace with:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "warn",
    action: "podcast_index_lookup_failed",
    podcastIndexId,
    episodeGuid,
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
  return null;
}
```

3. `worker/lib/pipeline-events.ts` ~line 19: `console.error("[pipeline-event] Failed to write event:", err)`

Replace with structured JSON:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "warn",
    action: "pipeline_event_write_failed",
    stepId,
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
}
```

**Category E: Admin route silent catches (3 locations)**

1. `worker/routes/admin/pipeline.ts` ~line 58: `catch { return c.json({...}) }`

Replace with:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "error",
    action: "admin_pipeline_jobs_query_failed",
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
  return c.json({ data: [], total: 0, page, pageSize, totalPages: 0 });
}
```

2. `worker/routes/admin/podcasts.ts` ~line 157: `catch { }` (empty catch)

Replace with:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "warn",
    action: "admin_podcast_pipeline_jobs_failed",
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
}
```

3. `worker/routes/admin/config.ts` ~line 17: `catch { return c.json({ data: [] }) }`

Replace with:

```typescript
catch (err) {
  console.error(JSON.stringify({
    level: "warn",
    action: "admin_config_read_failed",
    error: err instanceof Error ? err.message : String(err),
    ts: new Date().toISOString(),
  }));
  return c.json({ data: [] });
}
```

### Acceptance criteria

- [ ] Zero `.catch(() => {})` or `catch { }` blocks remain in the codebase (search: `.catch(() => {` and `catch {` and `catch { }`)
- [ ] All 4 orchestrator send failures log at `error` level with `action: "orchestrator_send_failed"`
- [ ] All 9 error-path DB write failures log at `error` level with `action: "error_path_db_write_failed"`
- [ ] Config read failures log at `warn` level (not silent)
- [ ] Transcript source lookup failures log at `warn` level (not silent)
- [ ] Pipeline event write failures use structured JSON (not raw `console.error`)
- [ ] The `pipeline-events.ts` catch no longer uses raw `console.error` with string interpolation
- [ ] Admin route catches log the error before returning fallback data

### Tests to add

**File:** `worker/lib/__tests__/config.test.ts` (existing or new)

- Test that when `prisma.platformConfig.findUnique` throws, `getConfig` returns the fallback AND calls `console.error` with structured JSON

**File:** `worker/lib/__tests__/transcript-source.test.ts`

- Test that when the PI client throws, `lookupPodcastIndexTranscript` returns null AND calls `console.error` with structured JSON

**File:** Update existing queue handler tests

- For each of the 4 queue handlers, add a test that when the orchestrator queue send throws, the error is logged (mock `console.error` and verify it was called with a JSON string containing `"orchestrator_send_failed"`)

---

## Task 2.7: Admin AI Errors Dashboard Endpoint

**Files:**
- `worker/routes/admin/ai-errors.ts` (new)
- `worker/routes/admin/index.ts` (modify -- mount new routes)
- `src/types/admin.ts` (modify -- add types)

**Depends on:** Task 2.3 (AiServiceError model exists in schema)

### What to do

**Step 1: Create `worker/routes/admin/ai-errors.ts`.**

This file provides three endpoints for querying AI service errors.

```typescript
// worker/routes/admin/ai-errors.ts

import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const aiErrorsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET / - Paginated list of AI service errors with filters.
 *
 * Query params:
 *   service    - "stt" | "distillation" | "narrative" | "tts"
 *   provider   - "anthropic" | "openai" | "groq" | etc.
 *   category   - "rate_limit" | "timeout" | "auth" | etc.
 *   severity   - "transient" | "permanent"
 *   resolved   - "true" | "false"
 *   since      - ISO date string (errors after this timestamp)
 *   search     - Free text search on errorMessage
 *   page, pageSize - Standard pagination
 *   sort       - "timestamp:desc" (default)
 */
aiErrorsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const service = c.req.query("service");
  const provider = c.req.query("provider");
  const category = c.req.query("category");
  const severity = c.req.query("severity");
  const resolved = c.req.query("resolved");
  const since = c.req.query("since");
  const search = c.req.query("search");

  const where: Record<string, unknown> = {};
  if (service) where.service = service;
  if (provider) where.provider = provider;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (resolved !== undefined) where.resolved = resolved === "true";
  if (since) where.timestamp = { gte: new Date(since) };
  if (search) where.errorMessage = { contains: search, mode: "insensitive" };

  const [errors, total] = await Promise.all([
    prisma.aiServiceError.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { timestamp: "desc" },
    }),
    prisma.aiServiceError.count({ where }),
  ]);

  const data = errors.map((e: any) => ({
    id: e.id,
    service: e.service,
    provider: e.provider,
    model: e.model,
    operation: e.operation,
    correlationId: e.correlationId,
    jobId: e.jobId,
    stepId: e.stepId,
    episodeId: e.episodeId,
    category: e.category,
    severity: e.severity,
    httpStatus: e.httpStatus,
    errorMessage: e.errorMessage,
    rawResponse: e.rawResponse,
    requestDurationMs: e.requestDurationMs,
    timestamp: e.timestamp.toISOString(),
    retryCount: e.retryCount,
    maxRetries: e.maxRetries,
    willRetry: e.willRetry,
    resolved: e.resolved,
    rateLimitRemaining: e.rateLimitRemaining,
    rateLimitResetAt: e.rateLimitResetAt?.toISOString(),
    createdAt: e.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

/**
 * GET /summary - Aggregate error statistics.
 *
 * Query params:
 *   since - ISO date string (default: last 24 hours)
 *
 * Returns:
 *   totalErrors, byService, byProvider, byCategory, bySeverity,
 *   errorRate (last 1h, 24h, 7d), topErrors (top 10 by count)
 */
aiErrorsRoutes.get("/summary", async (c) => {
  const prisma = c.get("prisma") as any;
  const since = c.req.query("since")
    ? new Date(c.req.query("since")!)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);  // Default: last 24h

  const baseWhere = { timestamp: { gte: since } };

  const [
    totalErrors,
    byService,
    byProvider,
    byCategory,
    bySeverity,
    errorsLast1h,
    errorsLast7d,
    topErrors,
  ] = await Promise.all([
    prisma.aiServiceError.count({ where: baseWhere }),
    prisma.aiServiceError.groupBy({
      by: ["service"],
      _count: true,
      where: baseWhere,
    }),
    prisma.aiServiceError.groupBy({
      by: ["provider"],
      _count: true,
      where: baseWhere,
    }),
    prisma.aiServiceError.groupBy({
      by: ["category"],
      _count: true,
      where: baseWhere,
    }),
    prisma.aiServiceError.groupBy({
      by: ["severity"],
      _count: true,
      where: baseWhere,
    }),
    prisma.aiServiceError.count({
      where: { timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
    prisma.aiServiceError.count({
      where: { timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.aiServiceError.groupBy({
      by: ["errorMessage"],
      _count: true,
      _max: { timestamp: true },
      where: baseWhere,
      orderBy: { _count: { errorMessage: "desc" } },
      take: 10,
    }),
  ]);

  const toMap = (groups: any[]) =>
    Object.fromEntries(groups.map((g) => [g.service ?? g.provider ?? g.category ?? g.severity, g._count]));

  return c.json({
    data: {
      totalErrors,
      byService: toMap(byService),
      byProvider: toMap(byProvider),
      byCategory: toMap(byCategory),
      bySeverity: toMap(bySeverity),
      errorRate: {
        last1h: errorsLast1h,
        last24h: totalErrors,
        last7d: errorsLast7d,
      },
      topErrors: topErrors.map((g: any) => ({
        errorMessage: g.errorMessage.slice(0, 200),
        count: g._count,
        lastSeen: g._max.timestamp?.toISOString(),
      })),
      since: since.toISOString(),
    },
  });
});

/**
 * GET /:id - Single error detail.
 */
aiErrorsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const error = await prisma.aiServiceError.findUnique({
    where: { id: c.req.param("id") },
  });

  if (!error) return c.json({ error: "AI error not found" }, 404);

  return c.json({
    data: {
      id: error.id,
      service: error.service,
      provider: error.provider,
      model: error.model,
      operation: error.operation,
      correlationId: error.correlationId,
      jobId: error.jobId,
      stepId: error.stepId,
      episodeId: error.episodeId,
      category: error.category,
      severity: error.severity,
      httpStatus: error.httpStatus,
      errorMessage: error.errorMessage,
      rawResponse: error.rawResponse,
      requestDurationMs: error.requestDurationMs,
      timestamp: error.timestamp.toISOString(),
      retryCount: error.retryCount,
      maxRetries: error.maxRetries,
      willRetry: error.willRetry,
      resolved: error.resolved,
      rateLimitRemaining: error.rateLimitRemaining,
      rateLimitResetAt: error.rateLimitResetAt?.toISOString(),
      createdAt: error.createdAt.toISOString(),
    },
  });
});

export { aiErrorsRoutes };
```

**Step 2: Mount in `worker/routes/admin/index.ts`.**

Add the import and route:

```typescript
import { aiErrorsRoutes } from "./ai-errors";

// Add after existing route mountings:
adminRoutes.route("/ai-errors", aiErrorsRoutes);
```

**Step 3: Add TypeScript types to `src/types/admin.ts`.**

```typescript
/** AI service error record for the admin dashboard. */
export interface AdminAiServiceError {
  id: string;
  service: "stt" | "distillation" | "narrative" | "tts";
  provider: string;
  model: string;
  operation: string;
  correlationId: string;
  jobId?: string;
  stepId?: string;
  episodeId?: string;
  category: string;
  severity: "transient" | "permanent";
  httpStatus?: number;
  errorMessage: string;
  rawResponse?: string;
  requestDurationMs: number;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  resolved: boolean;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  createdAt: string;
}

/** Summary of AI errors for the admin dashboard. */
export interface AiErrorSummary {
  totalErrors: number;
  byService: Record<string, number>;
  byProvider: Record<string, number>;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  errorRate: {
    last1h: number;
    last24h: number;
    last7d: number;
  };
  topErrors: Array<{
    errorMessage: string;
    count: number;
    lastSeen: string;
  }>;
  since: string;
}
```

### Acceptance criteria

- [ ] `GET /api/admin/ai-errors` returns a paginated list of errors with all fields
- [ ] `GET /api/admin/ai-errors?service=stt&provider=openai` correctly filters
- [ ] `GET /api/admin/ai-errors?since=2026-03-14T00:00:00Z` only returns recent errors
- [ ] `GET /api/admin/ai-errors?search=rate_limit` searches in error messages
- [ ] `GET /api/admin/ai-errors/summary` returns aggregate counts by service, provider, category, severity
- [ ] `GET /api/admin/ai-errors/summary` includes `errorRate` with 1h, 24h, 7d windows
- [ ] `GET /api/admin/ai-errors/summary` includes `topErrors` (top 10 by frequency)
- [ ] `GET /api/admin/ai-errors/:id` returns full error detail or 404
- [ ] All endpoints require admin auth (mounted under `adminRoutes` which uses `requireAdmin`)
- [ ] Frontend types in `src/types/admin.ts` match the API response shapes

### Tests to add

**File:** `worker/routes/admin/__tests__/ai-errors.test.ts`

- Test `GET /` returns paginated results from mock data
- Test `GET /?service=stt` filters correctly
- Test `GET /?since=...` filters by timestamp
- Test `GET /?search=timeout` filters by error message
- Test `GET /summary` returns aggregate counts matching the mock data
- Test `GET /summary` includes `errorRate` with correct window calculations
- Test `GET /:id` returns 404 for nonexistent ID
- Test `GET /:id` returns full error detail for valid ID
- Test that routes return 401 without auth (via admin middleware)

---

## Implementation Order

Recommended execution order for an agent team:

| Order | Task | Agent | Blocking? |
|-------|------|-------|-----------|
| 1a | Task 2.1 (Global onError) | Agent A | No |
| 1b | Task 2.3 (AIServiceError schema + class) | Agent B | No |
| 1c | Task 2.5 (HTTP request logging) | Agent C | No (but needs 2.2 to register) |
| 1d | Task 2.2 (Correlation IDs) | Agent D | **Yes** -- needed by 2.4 |
| 2a | Task 2.6 (Fix silent catches) | Agent A (after 2.1) | No |
| 2b | Task 2.4 (Wrap AI providers) | Agent B (after 2.2 + 2.3) | No |
| 3 | Task 2.7 (Admin AI errors endpoint) | Agent C (after 2.3) | No |

Tasks 2.1, 2.2, 2.3, 2.5 can all start in parallel. Task 2.4 waits for 2.2 and 2.3. Task 2.6 is independent. Task 2.7 waits for 2.3 (schema must exist).

After all tasks complete, run:
```bash
npx prisma generate
npm run typecheck
npm test
```

---

## Files Created/Modified Summary

### New files (5)
| File | Purpose |
|------|---------|
| `worker/lib/errors.ts` | HTTP error classification for global onError handler |
| `worker/lib/ai-errors.ts` | `AiProviderError` class, `classifyAiError()`, `writeAiError()` |
| `worker/middleware/request-id.ts` | Request correlation ID middleware |
| `worker/middleware/request-logger.ts` | HTTP request logging middleware |
| `worker/routes/admin/ai-errors.ts` | Admin AI errors list/summary/detail endpoints |

### Modified files (15)
| File | Change |
|------|--------|
| `worker/index.ts` | Add `onError`, `notFound`, register 2 new middleware |
| `worker/types.ts` | Add `requestId` to ContextVariableMap |
| `worker/lib/logger.ts` | Add `correlationId` to LoggerOptions and base fields |
| `worker/lib/config.ts` | Replace silent catch with structured log |
| `worker/lib/transcript-source.ts` | Replace silent catch with structured log |
| `worker/lib/pipeline-events.ts` | Replace raw `console.error` with structured JSON |
| `worker/lib/llm-providers.ts` | Wrap all 3 providers with `AiProviderError` |
| `worker/lib/stt-providers.ts` | Wrap all 6 providers with `AiProviderError` |
| `worker/lib/tts-providers.ts` | Wrap all 3 providers with `AiProviderError` |
| `worker/queues/orchestrator.ts` | Propagate `correlationId`, fix 1 silent catch |
| `worker/queues/transcription.ts` | Add `correlationId`, fix 3 silent catches, add AI error capture |
| `worker/queues/distillation.ts` | Add `correlationId`, fix 3 silent catches, add AI error capture |
| `worker/queues/narrative-generation.ts` | Add `correlationId`, fix 2 silent catches, add AI error capture |
| `worker/queues/audio-generation.ts` | Add `correlationId`, fix 3 silent catches, add AI error capture |
| `worker/queues/briefing-assembly.ts` | Add `correlationId`, fix 2 silent catches |
| `worker/routes/admin/index.ts` | Mount `ai-errors` routes |
| `worker/routes/admin/pipeline.ts` | Fix 1 silent catch |
| `worker/routes/admin/podcasts.ts` | Fix 1 silent catch |
| `worker/routes/admin/config.ts` | Fix 1 silent catch |
| `prisma/schema.prisma` | Add `AiServiceError` model |
| `src/types/admin.ts` | Add `AdminAiServiceError` and `AiErrorSummary` types |

### New test files (7)
| File | Coverage |
|------|----------|
| `worker/routes/__tests__/error-handler.test.ts` | Global onError handler |
| `worker/middleware/__tests__/request-id.test.ts` | Request ID middleware |
| `worker/middleware/__tests__/request-logger.test.ts` | HTTP request logging |
| `worker/lib/__tests__/ai-errors.test.ts` | Error classification, sanitization, DB write |
| `worker/lib/__tests__/llm-providers.test.ts` | LLM provider error wrapping |
| `worker/lib/__tests__/tts-providers.test.ts` | TTS provider error wrapping |
| `worker/routes/admin/__tests__/ai-errors.test.ts` | Admin AI errors endpoints |
