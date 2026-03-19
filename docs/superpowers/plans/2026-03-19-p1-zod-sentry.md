# P1: Zod Validation + Sentry Error Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime Zod validation to all 15 public API endpoints and integrate Sentry error tracking via `@sentry/cloudflare`.

**Architecture:** A `validateBody(c, schema)` helper throws a `ValidationError` caught by the global error handler. Zod schemas live inline in each route file. Sentry wraps the worker export via `withSentry()`, replacing console-log stubs with real SDK calls. Sentry no-ops when DSN is unset.

**Tech Stack:** Zod v4 (already installed), `@sentry/cloudflare` (new), Hono, Cloudflare Workers

**Spec:** `docs/superpowers/specs/2026-03-19-p1-zod-sentry-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `worker/lib/validation.ts` | Create | `ValidationError` class + `validateBody()` helper |
| `worker/lib/__tests__/validation.test.ts` | Create | Unit tests for validation helper |
| `worker/lib/errors.ts` | Modify | Add `ValidationError` branch + `details` to return type |
| `worker/routes/__tests__/error-handler.test.ts` | Modify | Add ValidationError test case |
| `worker/routes/me.ts` | Modify | Add Zod schemas to 5 endpoints |
| `worker/routes/__tests__/me.test.ts` | Modify | Add validation rejection tests |
| `worker/routes/podcasts.ts` | Modify | Add Zod schemas to 7 endpoints |
| `worker/routes/__tests__/podcasts.test.ts` | Modify | Add validation rejection tests |
| `worker/routes/__tests__/podcasts-subscribe.test.ts` | Modify | Add validation rejection tests |
| `worker/routes/briefings.ts` | Modify | Add Zod schema to 1 endpoint |
| `worker/routes/__tests__/briefings-ondemand.test.ts` | Modify | Add validation rejection test |
| `worker/routes/billing.ts` | Modify | Add Zod schema to 1 endpoint |
| `worker/routes/__tests__/billing.test.ts` | Modify | Add validation rejection test |
| `worker/routes/ads.ts` | Modify | Add Zod schema to 1 endpoint |
| `worker/routes/__tests__/ads.test.ts` | Create | Validation tests for unauthenticated ads endpoint |
| `worker/lib/sentry.ts` | Modify | Replace stubs with `@sentry/cloudflare` calls |
| `worker/lib/__tests__/sentry.test.ts` | Create | Tests for sentry wrapper functions |
| `worker/types.ts` | Modify | Add `SENTRY_DSN` to Env |
| `worker/index.ts` | Modify | `withSentry()` wrapper + `captureException` in `onError` + `details` pass-through |

---

### Task 1: Validation Helper + Error Classification

**Files:**
- Create: `worker/lib/validation.ts`
- Create: `worker/lib/__tests__/validation.test.ts`
- Modify: `worker/lib/errors.ts:7-11,17`
- Modify: `worker/routes/__tests__/error-handler.test.ts`
- Modify: `worker/index.ts:30,46-48`

- [ ] **Step 1: Write failing tests for `validateBody` and `ValidationError`**

Create `worker/lib/__tests__/validation.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { z } from "zod/v4";
import { ValidationError, validateBody } from "../validation";

describe("ValidationError", () => {
  it("constructs with Zod issues and formats details", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = new ValidationError(result.error.issues);
      expect(err.message).toBe("Validation error");
      expect(err.name).toBe("ValidationError");
      expect(err.status).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details[0]).toHaveProperty("path");
      expect(err.details[0]).toHaveProperty("message");
    }
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  function mockContext(body: unknown) {
    return {
      req: {
        json: vi.fn().mockResolvedValue(body),
      },
    } as any;
  }

  it("returns parsed data on valid input", async () => {
    const c = mockContext({ name: "test" });
    const result = await validateBody(c, schema);
    expect(result).toEqual({ name: "test" });
  });

  it("strips unknown fields", async () => {
    const c = mockContext({ name: "test", extra: "field" });
    const result = await validateBody(c, schema);
    expect(result).toEqual({ name: "test" });
  });

  it("throws ValidationError on invalid input", async () => {
    const c = mockContext({ name: "" });
    await expect(validateBody(c, schema)).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError with details on missing fields", async () => {
    const c = mockContext({});
    try {
      await validateBody(c, schema);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details[0].path).toBe("name");
    }
  });

  it("handles unparseable JSON gracefully", async () => {
    const c = { req: { json: vi.fn().mockRejectedValue(new Error("bad json")) } } as any;
    await expect(validateBody(c, schema)).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/validation.test.ts`
Expected: FAIL — module `../validation` not found

- [ ] **Step 3: Implement `ValidationError` and `validateBody`**

Create `worker/lib/validation.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for `classifyHttpError` with `ValidationError`**

Add to `worker/routes/__tests__/error-handler.test.ts`:

```typescript
import { ValidationError } from "../../lib/validation";

// Add inside the describe block:
it("classifies ValidationError as 400 with details", () => {
  const err = new ValidationError([
    { path: ["name"], message: "Required", code: "invalid_type", expected: "string", received: "undefined" } as any,
  ]);
  const result = classifyHttpError(err);
  expect(result.status).toBe(400);
  expect(result.message).toBe("Validation error");
  expect(result.code).toBe("VALIDATION_ERROR");
  expect(result.details).toEqual([{ path: "name", message: "Required" }]);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run worker/routes/__tests__/error-handler.test.ts`
Expected: FAIL — `details` not in return type / `ValidationError` not handled

- [ ] **Step 7: Update `classifyHttpError` and `ApiErrorResponse`**

In `worker/lib/errors.ts`:

1. Add import at top: `import { ValidationError } from "./validation";`
2. Add `details` to `ApiErrorResponse`:
```typescript
export interface ApiErrorResponse {
  error: string;
  requestId?: string;
  code?: string;
  details?: Array<{ path: string; message: string }>;
}
```
3. Update `classifyHttpError` return type and add `ValidationError` as first check:
```typescript
export function classifyHttpError(err: unknown): { status: number; message: string; code?: string; details?: Array<{ path: string; message: string }> } {
  // Validation errors — return 400 with field-level details
  if (err instanceof ValidationError) {
    return { status: 400, message: err.message, code: err.code, details: err.details };
  }

  if (err instanceof Error) {
    // ... rest unchanged
```

- [ ] **Step 8: Update `app.onError` to pass `details` through**

In `worker/index.ts`, change lines 30 and 46-48:

```typescript
// Line 30: destructure details
const { status, message, code, details } = classifyHttpError(err);

// Lines 46-48: pass details to response
const body: ApiErrorResponse = { error: message, requestId };
if (code) body.code = code;
if (details) body.details = details;
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/validation.test.ts worker/routes/__tests__/error-handler.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add worker/lib/validation.ts worker/lib/__tests__/validation.test.ts worker/lib/errors.ts worker/routes/__tests__/error-handler.test.ts worker/index.ts
git commit -m "feat: add Zod validateBody helper + ValidationError error classification"
```

---

### Task 2: Zod Validation on `me.ts` (5 endpoints)

**Files:**
- Modify: `worker/routes/me.ts:1,55-67,81-84,128-137,164-174,197-204`
- Modify: `worker/routes/__tests__/me.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add to `worker/routes/__tests__/me.test.ts` — a new describe block for validation:

```typescript
describe("Validation", () => {
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    resetMockPrisma();
    currentAuth = mockUserId;
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/me", me);
  });

  it("PATCH /me/onboarding-complete rejects non-boolean reset", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/me/onboarding-complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: "yes" }),
      }),
      createMockEnv(),
      mockExCtx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /me/preferences rejects invalid duration tier", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultDurationTier: 99 }),
      }),
      createMockEnv(),
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /me rejects missing confirm field", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      createMockEnv(),
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("POST /me/push/subscribe rejects missing keys", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/me/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "not-a-url" }),
      }),
      createMockEnv(),
      mockExCtx
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/__tests__/me.test.ts`
Expected: FAIL — currently these return 200 or different error codes

- [ ] **Step 3: Add Zod schemas and `validateBody` to `me.ts`**

At the top of `worker/routes/me.ts`, add imports:
```typescript
import { z } from "zod/v4";
import { validateBody } from "../lib/validation";
import { DURATION_TIERS } from "../lib/constants";
```

Replace `c.req.json` calls in each endpoint:

**PATCH /onboarding-complete** (lines 59-67): Replace the try/catch block:
```typescript
const OnboardingSchema = z.object({ reset: z.boolean().optional() });

// Inside handler, replace lines 59-67:
const body = await validateBody(c, OnboardingSchema);
let complete = true;
if (body.reset && user.isAdmin) {
  complete = false;
}
```

**PATCH /preferences** (line 84): Replace `c.req.json`:
```typescript
const PreferencesSchema = z.object({
  defaultDurationTier: z.number().refine((v) => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }).optional(),
});

// Inside handler:
const body = await validateBody(c, PreferencesSchema);
```

**DELETE /** (lines 132-137): Replace `c.req.json` and manual check:
```typescript
const DeleteAccountSchema = z.object({ confirm: z.literal("DELETE") });

// Inside handler, replace lines 132-137:
await validateBody(c, DeleteAccountSchema);
// ValidationError now handles the 400 — remove the manual `if` check
```

**POST /push/subscribe** (lines 167-174): Replace `c.req.json` and manual check:
```typescript
const PushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Inside handler, replace lines 167-174:
const body = await validateBody(c, PushSubscribeSchema);
```

**DELETE /push/subscribe** (lines 200-204): Replace `c.req.json` and manual check:
```typescript
const PushUnsubscribeSchema = z.object({ endpoint: z.url() });

// Inside handler:
const body = await validateBody(c, PushUnsubscribeSchema);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/routes/__tests__/me.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add worker/routes/me.ts worker/routes/__tests__/me.test.ts
git commit -m "feat: add Zod validation to me.ts endpoints (5 routes)"
```

---

### Task 3: Zod Validation on `podcasts.ts` (7 endpoints)

**Files:**
- Modify: `worker/routes/podcasts.ts:1-9,82-88,119-136,273-279,380-387,462-467,586-590,628-632`
- Modify: `worker/routes/__tests__/podcasts.test.ts`
- Modify: `worker/routes/__tests__/podcasts-subscribe.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add a new describe block at the end of `worker/routes/__tests__/podcasts.test.ts` (uses existing `app`, `env`, `mockExCtx`, `mockPrisma` from the file's setup):

```typescript
describe("Validation", () => {
  it("POST /search-podcasts rejects query shorter than 2 chars", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/podcasts/search-podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "a" }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("POST /favorites rejects non-array podcastIds", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/podcasts/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastIds: "not-array" }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("POST /request rejects missing feedUrl", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/podcasts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("POST /vote/:podcastId rejects vote outside range", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/podcasts/vote/pod1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: 5 }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("POST /episodes/vote/:episodeId rejects non-integer vote", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
    const res = await app.fetch(
      new Request("http://localhost/podcasts/episodes/vote/ep1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: 0.5 }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });
});
```

Add validation tests to `worker/routes/__tests__/podcasts-subscribe.test.ts` (uses existing test setup from the file):

```typescript
it("POST /subscribe rejects missing required fields", async () => {
  const res = await app.fetch(
    new Request("http://localhost/podcasts/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
  const json: any = await res.json();
  expect(json.code).toBe("VALIDATION_ERROR");
});

it("POST /subscribe rejects invalid durationTier", async () => {
  const res = await app.fetch(
    new Request("http://localhost/podcasts/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl: "http://x.com/feed", title: "Test", durationTier: 99 }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
});

it("PATCH /subscribe/:podcastId rejects invalid durationTier", async () => {
  const res = await app.fetch(
    new Request("http://localhost/podcasts/subscribe/pod1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationTier: 1 }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/__tests__/podcasts.test.ts worker/routes/__tests__/podcasts-subscribe.test.ts`
Expected: FAIL

- [ ] **Step 3: Add Zod schemas and `validateBody` to `podcasts.ts`**

Add imports at top of `worker/routes/podcasts.ts`:
```typescript
import { z } from "zod/v4";
import { validateBody } from "../lib/validation";
```

Define schemas and replace `c.req.json` calls:

```typescript
const SearchSchema = z.object({ query: z.string().min(2).max(200) });
const SubscribeSchema = z.object({
  feedUrl: z.string().min(1),
  title: z.string().min(1),
  durationTier: z.number().refine((v) => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  podcastIndexId: z.string().optional(),
  author: z.string().optional(),
});
const UpdateSubscriptionSchema = z.object({
  durationTier: z.number().refine((v) => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }),
});
const FavoritesSchema = z.object({ podcastIds: z.array(z.string().min(1)) });
const RequestSchema = z.object({ feedUrl: z.string().min(1), title: z.string().optional() });
const VoteSchema = z.object({ vote: z.number().int().min(-1).max(1).optional() });
```

Replace in each handler:
- **POST /search-podcasts** (line 84): `const body = await validateBody(c, SearchSchema);` — remove manual length check (lines 86-88)
- **POST /subscribe** (lines 120-136): `const body = await validateBody(c, SubscribeSchema);` — remove manual feedUrl/title/durationTier checks
- **PATCH /subscribe/:podcastId** (lines 275-279): `const body = await validateBody(c, UpdateSubscriptionSchema);` — remove manual durationTier check
- **POST /favorites** (lines 383-387): `const { podcastIds } = await validateBody(c, FavoritesSchema);` — remove manual Array.isArray check
- **POST /request** (lines 465-467): `const body = await validateBody(c, RequestSchema);` — remove manual feedUrl check
- **POST /vote/:podcastId** (line 590): `const { vote } = await validateBody(c, VoteSchema);`
- **POST /episodes/vote/:episodeId** (line 632): `const { vote } = await validateBody(c, VoteSchema);`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/routes/__tests__/podcasts.test.ts worker/routes/__tests__/podcasts-subscribe.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add worker/routes/podcasts.ts worker/routes/__tests__/podcasts.test.ts worker/routes/__tests__/podcasts-subscribe.test.ts
git commit -m "feat: add Zod validation to podcasts.ts endpoints (7 routes)"
```

---

### Task 4: Zod Validation on `briefings.ts`, `billing.ts`, `ads.ts` (3 endpoints)

**Files:**
- Modify: `worker/routes/briefings.ts:1-6,27-39`
- Modify: `worker/routes/__tests__/briefings-ondemand.test.ts`
- Modify: `worker/routes/billing.ts:1,24-31`
- Modify: `worker/routes/__tests__/billing.test.ts`
- Modify: `worker/routes/ads.ts:1-4,87-112`
- Create: `worker/routes/__tests__/ads.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add to `worker/routes/__tests__/briefings-ondemand.test.ts` (uses existing test setup):
```typescript
it("POST /generate rejects invalid durationTier", async () => {
  const res = await app.fetch(
    new Request("http://localhost/briefings/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podcastId: "p1", durationTier: 99 }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
  const json: any = await res.json();
  expect(json.code).toBe("VALIDATION_ERROR");
});

it("POST /generate rejects missing podcastId", async () => {
  const res = await app.fetch(
    new Request("http://localhost/briefings/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationTier: 5 }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
});
```

Add to `worker/routes/__tests__/billing.test.ts` (uses existing test setup):
```typescript
it("POST /checkout rejects invalid interval", async () => {
  mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
  const res = await app.fetch(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "p1", interval: "weekly" }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
  const json: any = await res.json();
  expect(json.code).toBe("VALIDATION_ERROR");
});

it("POST /checkout rejects missing planId", async () => {
  mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", clerkId: "user_test123" });
  const res = await app.fetch(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: "monthly" }),
    }),
    env,
    mockExCtx
  );
  expect(res.status).toBe(400);
});
```

Create `worker/routes/__tests__/ads.test.ts` — the ads/event endpoint has NO auth, making it the highest abuse risk:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));
vi.mock("../../lib/db", () => ({ createPrismaClient: vi.fn() }));

const mockUserId = { userId: "user_test123" };
vi.mock("@hono/clerk-auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => mockUserId),
}));
vi.mock("../../middleware/auth", () => ({
  clerkMiddleware: vi.fn(() => vi.fn((c: any, next: any) => next())),
  getAuth: vi.fn(() => mockUserId),
  requireAuth: vi.fn((c: any, next: any) => next()),
}));
vi.mock("hono/factory", () => ({ createMiddleware: vi.fn((fn) => fn) }));

const mockPrisma = createMockPrisma();
const { ads } = await import("../ads");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("POST /ads/event Validation", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => { c.set("prisma", mockPrisma); await next(); });
    app.route("/ads", ads);
  });

  it("rejects invalid placement", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ads/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement: "midroll", event: "start" }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid event type", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ads/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement: "preroll", event: "invalid" }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ads/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid event with optional fields", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ads/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placement: "preroll",
          event: "impression",
          briefingId: "b1",
          metadata: { duration: 30 },
        }),
      }),
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/routes/__tests__/briefings-ondemand.test.ts worker/routes/__tests__/billing.test.ts worker/routes/__tests__/ads.test.ts`
Expected: FAIL

- [ ] **Step 3: Add Zod schemas to `briefings.ts`**

Add imports:
```typescript
import { z } from "zod/v4";
import { validateBody } from "../lib/validation";
```

Define schema and replace handler:
```typescript
const GenerateSchema = z.object({
  podcastId: z.string().min(1),
  episodeId: z.string().optional(),
  durationTier: z.number().refine((v) => DURATION_TIERS.includes(v as any), {
    message: `Must be one of: ${DURATION_TIERS.join(", ")}`,
  }),
});

// Line 27: replace c.req.json and remove manual checks (lines 33-39):
const body = await validateBody(c, GenerateSchema);
```

- [ ] **Step 4: Add Zod schema to `billing.ts`**

Add imports:
```typescript
import { z } from "zod/v4";
import { validateBody } from "../lib/validation";
```

Define schema and replace handler:
```typescript
const CheckoutSchema = z.object({
  planId: z.string().min(1),
  interval: z.enum(["monthly", "annual"]),
});

// Line 24: replace c.req.json and remove manual check (lines 29-31):
const { planId, interval } = await validateBody(c, CheckoutSchema);
```

- [ ] **Step 5: Add Zod schema to `ads.ts`**

Add imports:
```typescript
import { z } from "zod/v4";
import { validateBody } from "../lib/validation";
```

Define schema and replace handler:
```typescript
const AdEventSchema = z.object({
  briefingId: z.string().optional(),
  feedItemId: z.string().optional(),
  placement: z.enum(["preroll", "postroll"]),
  event: z.enum(["impression", "start", "firstQuartile", "midpoint", "thirdQuartile", "complete", "error"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Line 89: replace c.req.json and remove manual placement/event checks (lines 97-112):
const body = await validateBody(c, AdEventSchema);
```

Note: For `ads.ts`, the existing `VALID_PLACEMENTS` and `VALID_EVENTS` constants + types can be removed since the Zod enum handles this.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run worker/routes/__tests__/briefings-ondemand.test.ts worker/routes/__tests__/billing.test.ts worker/routes/__tests__/ads.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add worker/routes/briefings.ts worker/routes/billing.ts worker/routes/ads.ts worker/routes/__tests__/briefings-ondemand.test.ts worker/routes/__tests__/billing.test.ts worker/routes/__tests__/ads.test.ts
git commit -m "feat: add Zod validation to briefings, billing, ads endpoints (3 routes)"
```

---

### Task 5: Sentry Integration

**Files:**
- Modify: `worker/types.ts:88`
- Modify: `worker/lib/sentry.ts` (full rewrite)
- Create: `worker/lib/__tests__/sentry.test.ts`
- Modify: `worker/index.ts:1-24,29,134-144`

- [ ] **Step 1: Install `@sentry/cloudflare`**

Run: `npm install --legacy-peer-deps @sentry/cloudflare`

- [ ] **Step 2: Write failing tests for sentry module**

Create `worker/lib/__tests__/sentry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/cloudflare before importing
const mockCaptureException = vi.fn();
const mockCaptureMessage = vi.fn();
vi.mock("@sentry/cloudflare", () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

import { captureException, captureMessage } from "../sentry";

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captureException forwards to Sentry SDK with extra context", () => {
    const err = new Error("test");
    captureException(err, { key: "value" });
    expect(mockCaptureException).toHaveBeenCalledWith(err, { extra: { key: "value" } });
  });

  it("captureException works without context", () => {
    const err = new Error("test");
    captureException(err);
    expect(mockCaptureException).toHaveBeenCalledWith(err, { extra: undefined });
  });

  it("captureMessage forwards with level and context", () => {
    captureMessage("hello", "warning", { foo: "bar" });
    expect(mockCaptureMessage).toHaveBeenCalledWith("hello", { level: "warning", extra: { foo: "bar" } });
  });

  it("captureMessage defaults to info level", () => {
    captureMessage("hello");
    expect(mockCaptureMessage).toHaveBeenCalledWith("hello", { level: "info", extra: undefined });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/sentry.test.ts`
Expected: FAIL — current sentry.ts uses console.log, not Sentry SDK

- [ ] **Step 4: Replace sentry stubs with real SDK calls**

Rewrite `worker/lib/sentry.ts`:

```typescript
import * as Sentry from "@sentry/cloudflare";

export function captureException(
  err: Error,
  context?: Record<string, unknown>
): void {
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/sentry.test.ts`
Expected: PASS

- [ ] **Step 6: Add `SENTRY_DSN` to Env type**

In `worker/types.ts`, add before the closing `};` (after line 87):

```typescript
/** Sentry DSN for error tracking (optional — Sentry no-ops when unset) */
SENTRY_DSN?: string;
```

- [ ] **Step 7: Wrap worker export with `withSentry` and add `captureException` to `onError`**

In `worker/index.ts`:

Add import at top:
```typescript
import * as Sentry from "@sentry/cloudflare";
import { captureException } from "./lib/sentry";
```

Add `captureException` call inside `app.onError` (after line 29, before `classifyHttpError`):
```typescript
app.onError((err, c) => {
  captureException(err instanceof Error ? err : new Error(String(err)), {
    method: c.req.method,
    path: c.req.path,
  });
  const { status, message, code, details } = classifyHttpError(err);
  // ... rest unchanged
```

Replace the default export (lines 134-144):
```typescript
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

- [ ] **Step 8: Run all tests to verify nothing broke**

Run: `npx vitest run worker/lib/__tests__/sentry.test.ts worker/routes/__tests__/error-handler.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add worker/lib/sentry.ts worker/lib/__tests__/sentry.test.ts worker/types.ts worker/index.ts package.json package-lock.json
git commit -m "feat: integrate @sentry/cloudflare with withSentry wrapper and real SDK calls"
```

---

### Task 6: Full Test Suite + Typecheck

- [ ] **Step 1: Run full worker test suite**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`
Expected: ALL PASS — no regressions from validation or Sentry changes

- [ ] **Step 2: Fix any test failures**

If existing tests break because they send invalid bodies that now fail validation, update those tests to send valid bodies.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: update tests for Zod validation + resolve typecheck issues"
```

---

### Task 7: Update Docs + Remaining Work

- [ ] **Step 1: Update `docs/plans/remaining-work-comprehensive.md`**

Mark items 1 and 4 as done. Item 5 was already done (Hyperdrive). Update the P1 table to reflect completion.

- [ ] **Step 2: Commit**

```bash
git add docs/plans/remaining-work-comprehensive.md
git commit -m "docs: mark P1 items 1, 4, 5 as complete in remaining work"
```
