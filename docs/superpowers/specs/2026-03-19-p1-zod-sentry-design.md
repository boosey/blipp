# P1 Implementation: Zod Validation + Sentry Error Tracking

**Date:** 2026-03-19
**Scope:** P1 items 1 and 4 from `docs/plans/remaining-work-comprehensive.md`
**Item 5 (Hyperdrive):** Dropped — already configured with real IDs.

---

## 1. Zod Validation on Public API Routes

### Problem

All 33 POST/PUT/PATCH endpoints use `c.req.json<T>()` type-casting without runtime validation. Invalid payloads pass through unchecked, creating security and reliability risks. Public routes are the real attack surface.

### Scope

8 public endpoints (admin routes deferred — already behind `requireAdmin` auth).

### Design

#### Validation Helper

**File:** `worker/lib/validation.ts`

```typescript
import { z } from "zod/v4";
import type { Context } from "hono";

export async function validateBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => ({}));
  const result = schema.safeParse(body);
  if (!result.success) {
    // Throw an error that classifyHttpError maps to 400
    const error = new Error("Validation error");
    (error as any).status = 400;
    (error as any).details = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw error;
  }
  return result.data;
}
```

#### Error Response Format

The global error handler in `worker/index.ts` already catches thrown errors via `classifyHttpError()`. Extend it to pass through `details` when present:

```json
{
  "error": "Validation error",
  "details": [{ "path": "keys.auth", "message": "Required" }],
  "requestId": "abc-123"
}
```

#### Schemas Per Route

**`worker/routes/me.ts`** (4 endpoints):

| Endpoint | Schema |
|----------|--------|
| `PATCH /onboarding-complete` | `z.object({ reset: z.boolean().optional() })` |
| `PATCH /preferences` | `z.object({ defaultDurationTier: z.enum(["1","2","3","5","7","10","15"]).transform(Number).optional() })` |
| `POST /push/subscribe` | `z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })` |
| `DELETE /push/subscribe` | `z.object({ endpoint: z.url() })` |

**`worker/routes/podcasts.ts`** (1 endpoint):

| Endpoint | Schema |
|----------|--------|
| `POST /search-podcasts` | `z.object({ query: z.string().min(1).max(200) })` |

**`worker/routes/briefings.ts`** (1 endpoint):

| Endpoint | Schema |
|----------|--------|
| `POST /generate` | `z.object({ podcastId: z.string().min(1), episodeId: z.string().optional(), durationTier: z.number().refine(v => [1,2,3,5,7,10,15].includes(v)) })` |

**`worker/routes/billing.ts`** (1 endpoint):

| Endpoint | Schema |
|----------|--------|
| `POST /checkout` | `z.object({ planId: z.string().min(1), interval: z.enum(["monthly", "annual"]) })` |

`POST /portal` has no body — skip.

#### Where Schemas Live

Inline at the top of each route file. No shared schema file — keeps schemas co-located with the endpoints that use them.

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

Wrap the default export in `worker/index.ts` with `withSentry()`:

```typescript
import * as Sentry from "@sentry/cloudflare";

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  }),
  {
    fetch: app.fetch,
    queue: queueHandler,
    scheduled: scheduledHandler,
  }
);
```

This automatically captures:
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
  // ... existing classifyHttpError + console.error + response
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
| `worker/lib/validation.ts` | **New** — `validateBody()` helper |
| `worker/routes/me.ts` | Add Zod schemas + `validateBody()` calls |
| `worker/routes/podcasts.ts` | Add Zod schema + `validateBody()` call |
| `worker/routes/briefings.ts` | Add Zod schema + `validateBody()` call |
| `worker/routes/billing.ts` | Add Zod schema + `validateBody()` call |
| `worker/lib/errors.ts` | Pass through `details` array on validation errors |
| `worker/index.ts` | Wrap with `withSentry()`, add `captureException` to `onError` |
| `worker/lib/sentry.ts` | Replace stubs with real `@sentry/cloudflare` calls |
| `worker/types.ts` | Add `SENTRY_DSN` to Env |
| `package.json` | Add `@sentry/cloudflare` dependency |
