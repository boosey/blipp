# P1 Implementation: Zod Validation + Sentry Error Tracking

**Date:** 2026-03-19
**Scope:** P1 items 1 and 4 from `docs/plans/remaining-work-comprehensive.md`
**Item 5 (Hyperdrive):** Dropped — already configured with real IDs.

---

## 1. Zod Validation on Public API Routes

### Problem

All POST/PUT/PATCH endpoints use `c.req.json<T>()` type-casting without runtime validation. Invalid payloads pass through unchecked, creating security and reliability risks. Public routes are the real attack surface.

### Scope

15 public endpoints across 5 route files (admin routes deferred — already behind `requireAdmin` auth).

### Design

#### Validation Helper

**File:** `worker/lib/validation.ts`

```typescript
import { z } from "zod/v4";
import type { Context } from "hono";

export class ValidationError extends Error {
  status = 400;
  code = "VALIDATION_ERROR";
  details: Array<{ path: string; message: string }>;

  constructor(issues: z.core.$ZodIssue[]) {
    super("Validation error");
    this.name = "ValidationError";
    this.details = issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
  }
}

export async function validateBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => ({}));
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}
```

#### Error Classification

Add a `ValidationError` check to `classifyHttpError()` in `worker/lib/errors.ts`:

```typescript
import { ValidationError } from "./validation";

export function classifyHttpError(err: unknown): { status: number; message: string; code?: string; details?: Array<{ path: string; message: string }> } {
  // Validation errors — return 400 with field-level details
  if (err instanceof ValidationError) {
    return { status: 400, message: err.message, code: err.code, details: err.details };
  }
  // ... existing classification logic unchanged
}
```

Update `ApiErrorResponse` to include optional `details`:

```typescript
export interface ApiErrorResponse {
  error: string;
  requestId?: string;
  code?: string;
  details?: Array<{ path: string; message: string }>;
}
```

Update `app.onError` in `worker/index.ts` to pass `details` through to the response:

```typescript
const { status, message, code, details } = classifyHttpError(err);
const body: ApiErrorResponse = { error: message, requestId };
if (code) body.code = code;
if (details) body.details = details;
```

#### Error Response Format

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [{ "path": "keys.auth", "message": "Required" }],
  "requestId": "abc-123"
}
```

#### Schemas Per Route

Duration tiers use the canonical `DURATION_TIERS` constant from `worker/lib/constants.ts`: `[2, 5, 10, 15, 30]`.

**`worker/routes/me.ts`** (5 endpoints):

| Endpoint | Schema |
|----------|--------|
| `PATCH /onboarding-complete` | `z.object({ reset: z.boolean().optional() })` |
| `PATCH /preferences` | `z.object({ defaultDurationTier: z.number().refine(v => DURATION_TIERS.includes(v as any)).optional() })` |
| `DELETE /` (account delete) | `z.object({ confirm: z.literal("DELETE") })` |
| `POST /push/subscribe` | `z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })` |
| `DELETE /push/subscribe` | `z.object({ endpoint: z.url() })` |

**`worker/routes/podcasts.ts`** (7 endpoints):

| Endpoint | Schema |
|----------|--------|
| `POST /search-podcasts` | `z.object({ query: z.string().min(2).max(200) })` |
| `POST /subscribe` | `z.object({ feedUrl: z.string().min(1), title: z.string().min(1), durationTier: z.number().refine(v => DURATION_TIERS.includes(v as any)), description: z.string().optional(), imageUrl: z.string().optional(), podcastIndexId: z.string().optional(), author: z.string().optional() })` |
| `PATCH /subscribe/:podcastId` | `z.object({ durationTier: z.number().refine(v => DURATION_TIERS.includes(v as any)) })` |
| `POST /favorites` | `z.object({ podcastIds: z.array(z.string().min(1)) })` |
| `POST /request` | `z.object({ feedUrl: z.string().min(1), title: z.string().optional() })` |
| `POST /vote/:podcastId` | `z.object({ vote: z.number().int().min(-1).max(1) })` |
| `POST /episodes/vote/:episodeId` | `z.object({ vote: z.number().int().min(-1).max(1) })` |

**`worker/routes/briefings.ts`** (1 endpoint):

| Endpoint | Schema |
|----------|--------|
| `POST /generate` | `z.object({ podcastId: z.string().min(1), episodeId: z.string().optional(), durationTier: z.number().refine(v => DURATION_TIERS.includes(v as any)) })` |

**`worker/routes/billing.ts`** (1 endpoint):

| Endpoint | Schema |
|----------|--------|
| `POST /checkout` | `z.object({ planId: z.string().min(1), interval: z.enum(["monthly", "annual"]) })` |

**`worker/routes/ads.ts`** (1 endpoint — no auth required, highest abuse risk):

| Endpoint | Schema |
|----------|--------|
| `POST /event` | `z.object({ briefingId: z.string().optional(), feedItemId: z.string().optional(), placement: z.string().min(1), event: z.string().min(1), metadata: z.record(z.string(), z.unknown()).optional() })` |

`POST /billing/portal` has no body — skip.

#### Where Schemas Live

Inline at the top of each route file. No shared schema file — keeps schemas co-located with the endpoints that use them. The `DURATION_TIERS` constant is imported from `worker/lib/constants.ts` where needed.

---

## 2. Sentry Error Tracking

### Problem

Errors are logged to console only. No external error tracking, alerting, or aggregation. A stub exists at `worker/lib/sentry.ts` with `captureException()` and `captureMessage()` that just console.log.

### Scope

Install `@sentry/cloudflare`, wire up `withSentry()` wrapper, replace stubs. Sentry no-ops when `SENTRY_DSN` is not set, so this is safe to deploy before creating a Sentry project.

### Design

#### Package

Install `@sentry/cloudflare` via `npm install --legacy-peer-deps @sentry/cloudflare`.

#### Env Type

Add to `worker/types.ts`:
```typescript
SENTRY_DSN: string; // Optional — Sentry no-ops when empty/undefined
```

#### Worker Entry Point

Wrap the default export in `worker/index.ts` with `withSentry()`, preserving the existing `shimQueuesForLocalDev` calls:

```typescript
import * as Sentry from "@sentry/cloudflare";

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  }),
  {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return app.fetch(request, shimQueuesForLocalDev(env, ctx), ctx);
    },
    queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
      return handleQueue(batch, shimQueuesForLocalDev(env, ctx), ctx);
    },
    scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      return scheduled(event, shimQueuesForLocalDev(env, ctx), ctx);
    },
  }
);
```

This preserves the existing handler structure while adding automatic Sentry capture for:
- Unhandled exceptions in fetch/queue/scheduled handlers
- Request context (method, URL, headers)
- Breadcrumbs and stack traces

#### Replace Stubs

**`worker/lib/sentry.ts`** — Replace console.log stubs with real SDK calls:

```typescript
import * as Sentry from "@sentry/cloudflare";

export function captureException(err: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(err, { extra: context });
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
): void {
  Sentry.captureMessage(message, { level, extra: context });
}
```

Existing call sites (`captureException(err)`, `captureMessage(msg)`) continue working unchanged.

#### Global Error Handler

Add `captureException` to the existing `app.onError` handler in `worker/index.ts` so manually-caught errors (not just uncaught throws) get reported:

```typescript
app.onError((err, c) => {
  captureException(err, { method: c.req.method, path: c.req.path });
  // ... existing classifyHttpError + console.error + response (now with details pass-through)
});
```

#### What Stays the Same

- All existing console.error structured logging
- AI error database recording via `writeAiError()`
- Queue error handling patterns (ack/retry)
- Error classification via `classifyHttpError()` and `classifyAiError()`

#### Activation

When ready, run:
```bash
npx wrangler secret put SENTRY_DSN        # staging
npx wrangler secret put SENTRY_DSN --env production
```

Until then, Sentry silently no-ops.

---

## Out of Scope

- Admin route validation (deferred — behind requireAdmin)
- Hyperdrive config (already working)
- Sentry project/DSN creation (manual step when ready)
- Performance monitoring beyond basic `tracesSampleRate`

## Files Modified

| File | Change |
|------|--------|
| `worker/lib/validation.ts` | **New** — `ValidationError` class + `validateBody()` helper |
| `worker/lib/errors.ts` | Add `ValidationError` check to `classifyHttpError()`, add `details` to `ApiErrorResponse` |
| `worker/routes/me.ts` | Add Zod schemas + `validateBody()` on 5 endpoints |
| `worker/routes/podcasts.ts` | Add Zod schemas + `validateBody()` on 7 endpoints |
| `worker/routes/briefings.ts` | Add Zod schema + `validateBody()` on 1 endpoint |
| `worker/routes/billing.ts` | Add Zod schema + `validateBody()` on 1 endpoint |
| `worker/routes/ads.ts` | Add Zod schema + `validateBody()` on 1 endpoint |
| `worker/index.ts` | Wrap with `withSentry()` (preserving `shimQueuesForLocalDev`), add `captureException` to `onError`, pass `details` to response |
| `worker/lib/sentry.ts` | Replace stubs with real `@sentry/cloudflare` calls |
| `worker/types.ts` | Add `SENTRY_DSN` to Env |
| `package.json` | Add `@sentry/cloudflare` dependency |
