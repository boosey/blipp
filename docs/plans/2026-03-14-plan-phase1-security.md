# Phase 1: Security Hardening

**Estimated effort:** 1-2 days
**Prerequisites:** None -- this is the first phase
**Branch:** `refactor/code-review` or a dedicated `security/hardening` branch

## Overview

This phase closes all CRITICAL and HIGH security vulnerabilities identified in the security review. These are exploitable issues that must be resolved before any production traffic: an unauthenticated attacker can forge Clerk webhook payloads to create admin users, any website can make cross-origin API calls on behalf of logged-in users, and authenticated users can access other users' audio clips via predictable URLs.

## Tasks

---

### Task 1.1: Clerk Webhook Svix Signature Verification

**Files to modify:**
- `worker/routes/webhooks/clerk.ts`

**Depends on:** None

**Security finding:** CRITICAL #1 + Brittleness B6

**Background:** The Clerk webhook handler at line 20 of `clerk.ts` accepts any POST body without verifying the Svix signature. The comment on line 18 says "For Phase 0, we trust the payload structure." The `CLERK_WEBHOOK_SECRET` binding is declared in `worker/types.ts:30` but never used. An attacker can POST crafted payloads to create admin users, delete users, or modify user data.

The `@clerk/backend` package (already installed at `^2.32.2`) provides `verifyWebhook` from `@clerk/backend/webhooks` which takes a `Request` object and a `signingSecret` option, and returns a typed `WebhookEvent`. This is the recommended approach -- no need to install `svix` directly.

**What to do:**

1. Import `verifyWebhook` from `@clerk/backend/webhooks` and the `WebhookEvent` type.

2. Replace the current body parsing (lines 21-23) with signature verification. The `verifyWebhook` function needs the raw `Request` object, which Hono provides via `c.req.raw`.

3. Replace the current handler body with this pattern:

```typescript
import { verifyWebhook } from "@clerk/backend/webhooks";
import type { WebhookEvent } from "@clerk/backend/webhooks";

clerkWebhooks.post("/", async (c) => {
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(c.req.raw, {
      signingSecret: c.env.CLERK_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return c.json({ error: "Invalid webhook signature" }, 400);
  }

  const eventType = event.type;
  const data = event.data;

  const prisma = c.get("prisma") as any;

  switch (eventType) {
    case "user.created": {
      // ... existing logic unchanged ...
    }
    // ... rest of cases unchanged ...
  }

  return c.json({ received: true });
});
```

4. Remove the old comment about "Phase 0" trusting payloads.

5. Remove the manual `eventType`/`data` null checks (lines 25-27) since `verifyWebhook` returns a typed `WebhookEvent` that guarantees `type` and `data` exist.

**Important:** The `verifyWebhook` function consumes the request body. Do NOT call `c.req.json()` before it -- pass `c.req.raw` directly.

**Environment setup:** Ensure `CLERK_WEBHOOK_SECRET` is set in:
- `.dev.vars` for local development (get from Clerk Dashboard > Webhooks > Signing Secret)
- Cloudflare Worker secrets for production (`wrangler secret put CLERK_WEBHOOK_SECRET`)

**Acceptance criteria:**
- [ ] `verifyWebhook` is called with `c.req.raw` and `CLERK_WEBHOOK_SECRET` before any body processing
- [ ] Invalid/missing signatures return 400 with `"Invalid webhook signature"`
- [ ] Valid signed payloads are processed as before (create/update/delete user)
- [ ] The "Phase 0" trust comment is removed
- [ ] No calls to `c.req.json()` in the handler (body is consumed by `verifyWebhook`)

**Tests to add/update** (in `worker/routes/__tests__/webhooks.test.ts`):

The existing Clerk webhook tests (lines 33-181) send plain JSON without signatures. These must be updated:

1. Mock `verifyWebhook` at the module level:
```typescript
const mockVerifyWebhook = vi.fn();
vi.mock("@clerk/backend/webhooks", () => ({
  verifyWebhook: (...args: any[]) => mockVerifyWebhook(...args),
}));
```

2. Update each test to configure `mockVerifyWebhook` to return the expected `WebhookEvent` shape:
```typescript
mockVerifyWebhook.mockResolvedValueOnce({
  type: "user.created",
  data: {
    id: "clerk_123",
    email_addresses: [{ email_address: "test@example.com" }],
    first_name: "John",
    last_name: "Doe",
    image_url: "https://example.com/avatar.jpg",
  },
});
```

3. Add new test: **"should return 400 when signature verification fails"** -- mock `verifyWebhook` to throw, assert 400 response.

4. Add new test: **"should pass raw request and signing secret to verifyWebhook"** -- verify `mockVerifyWebhook` was called with the request object and `{ signingSecret: env.CLERK_WEBHOOK_SECRET }`.

---

### Task 1.2: CORS Origin Allowlist

**Files to modify:**
- `worker/index.ts` (line 21)
- `worker/types.ts` (add optional `ALLOWED_ORIGINS` binding)

**Depends on:** None

**Security finding:** CRITICAL #2

**Background:** Line 21 of `worker/index.ts` calls `cors()` with no arguments, which defaults to `Access-Control-Allow-Origin: *`. This means any website can make authenticated cross-origin requests to the Blipp API on behalf of a logged-in user. Combined with Clerk's Bearer token auth pattern, this is exploitable if tokens are intercepted or if the browser sends credentials.

**What to do:**

1. In `worker/types.ts`, add an optional env binding for configurable origins:
```typescript
/** Comma-separated list of allowed CORS origins (optional, overrides defaults) */
ALLOWED_ORIGINS?: string;
```

2. In `worker/index.ts`, replace line 21:

**Before (line 21):**
```typescript
app.use("/api/*", cors());
```

**After:**
```typescript
app.use("/api/*", cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS
      ? c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
      : [
          "http://localhost:8787",
          "http://localhost:5173",
          "https://blipp.app",
          "https://www.blipp.app",
        ];
    return allowedOrigins.includes(origin) ? origin : "";
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));
```

The `origin` callback in Hono's CORS middleware receives the request `Origin` header and the Hono context. Returning `""` (empty string) effectively blocks the origin by not setting `Access-Control-Allow-Origin`. Returning the origin string reflects it back.

3. Include `credentials: true` so the browser sends cookies/auth headers with cross-origin requests.

4. Explicitly list allowed methods and headers to avoid overly permissive defaults.

**Why a callback instead of an array:** Hono's `cors()` `origin` option accepts a string, an array, or a function. The function approach lets us read `ALLOWED_ORIGINS` from the environment at request time, enabling per-deployment configuration without code changes.

**Environment setup:**
- For production: set `ALLOWED_ORIGINS=https://blipp.app,https://www.blipp.app` in Cloudflare Worker secrets or `wrangler.toml` vars
- For local dev: the defaults include `localhost:8787` and `localhost:5173`
- For staging: override with the staging domain

**Acceptance criteria:**
- [ ] `cors()` is called with explicit origin checking (not `*`)
- [ ] `credentials: true` is set
- [ ] Requests from `http://localhost:8787` are allowed in development
- [ ] Requests from unlisted origins receive no `Access-Control-Allow-Origin` header
- [ ] Origins are configurable via `ALLOWED_ORIGINS` env var
- [ ] Preflight OPTIONS requests work correctly for allowed origins

**Tests to add:**

Create `worker/__tests__/cors.test.ts`:

1. **"should set ACAO header for allowed origin"** -- send request with `Origin: http://localhost:8787`, verify `Access-Control-Allow-Origin: http://localhost:8787` in response.
2. **"should not set ACAO header for disallowed origin"** -- send request with `Origin: https://evil.com`, verify no `Access-Control-Allow-Origin` header (or empty value) in response.
3. **"should respect ALLOWED_ORIGINS env var"** -- set env `ALLOWED_ORIGINS` to `https://staging.blipp.app`, verify that origin is allowed and defaults are not.
4. **"should include credentials header"** -- verify `Access-Control-Allow-Credentials: true` in response.

---

### Task 1.3: Clip Audio Route User-Scoping (IDOR Fix)

**Files to modify:**
- `worker/routes/clips.ts` (lines 12-30)

**Depends on:** None

**Security finding:** HIGH #3

**Background:** The clip audio route at `worker/routes/clips.ts:12` serves R2 objects based on `episodeId` and `durationTier` URL parameters. The `requireAuth` middleware (line 7) ensures the user is authenticated, but there is no check that the authenticated user has a Briefing or FeedItem for that clip. R2 keys are predictable (`clips/{episodeId}/{durationTier}.mp3`), so any authenticated user can access any other user's clips by guessing episode IDs (which are cuid-format, but could be enumerated via the API).

**What to do:**

1. Import `getAuth` from `../middleware/auth` to get the authenticated user's Clerk ID.

2. After extracting `episodeId` and `durationTier`, query the database to verify the user has access. The access check should verify the user has at least one FeedItem for this episode+durationTier combination, or a Briefing whose clip matches.

3. The updated handler:

```typescript
import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";

export const clips = new Hono<{ Bindings: Env }>();

clips.use("*", requireAuth);

clips.get("/:episodeId/:durationTier", async (c) => {
  const episodeId = c.req.param("episodeId");
  const durationTier = c.req.param("durationTier").replace(/\.mp3$/, "");
  const prisma = c.get("prisma") as any;

  // Resolve authenticated user
  const clerkId = getAuth(c)!.userId!;
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  // Check if user is admin (admins can access any clip for debugging)
  if (!user.isAdmin) {
    // Verify user has a FeedItem for this episode+durationTier
    const feedItem = await prisma.feedItem.findFirst({
      where: {
        userId: user.id,
        episodeId,
        durationTier: parseInt(durationTier, 10),
      },
    });

    if (!feedItem) {
      return c.json({ error: "Clip not found" }, 404);
    }
  }

  const key = `clips/${episodeId}/${durationTier}.mp3`;
  const obj = await c.env.R2.get(key);
  if (!obj) {
    return c.json({ error: "Clip not found" }, 404);
  }

  const body = await obj.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
});
```

**Design decisions:**
- **Admin bypass:** Admins can access any clip for debugging/support purposes. This is a deliberate escape hatch.
- **404 instead of 403:** Returning 404 for unauthorized access prevents information leakage (attacker can't distinguish "clip exists but you can't access it" from "clip doesn't exist").
- **FeedItem check vs Briefing check:** FeedItem is the right join because it directly associates a user with an episode+durationTier. A user gets a FeedItem when their subscription triggers clip generation for that episode at their chosen duration tier.
- **Performance:** This adds one DB query per clip request. For audio streaming, this is acceptable -- the R2 fetch is the bottleneck. If it becomes a concern, consider caching the access check result with a short TTL.

**Acceptance criteria:**
- [ ] Authenticated users can only access clips they have a FeedItem for
- [ ] Admin users can access any clip (bypass check)
- [ ] Unauthorized clip access returns 404 (not 403)
- [ ] The R2 key construction is unchanged
- [ ] Response headers (Content-Type, Cache-Control) are unchanged

**Tests to add:**

Create `worker/routes/__tests__/clips.test.ts`:

1. **"should return audio for user with matching FeedItem"** -- mock user + feedItem.findFirst returning a match, mock R2.get returning an object. Assert 200 with audio/mpeg content-type.
2. **"should return 404 when user has no FeedItem for clip"** -- mock user (non-admin) + feedItem.findFirst returning null. Assert 404.
3. **"should allow admin to access any clip"** -- mock user with `isAdmin: true`, skip feedItem check. Assert 200.
4. **"should return 404 when R2 object doesn't exist"** -- mock user + feedItem match, but R2.get returns null. Assert 404.
5. **"should return 401 when user not found in DB"** -- mock user.findUnique returning null. Assert 401.

---

### Task 1.4: Admin PATCH Privilege Escalation Prevention

**Files to modify:**
- `worker/routes/admin/users.ts` (lines 225-242)

**Depends on:** None

**Security finding:** HIGH #4

**Background:** The admin `PATCH /:id` endpoint at line 226 accepts `{ isAdmin: boolean }` in the request body and directly applies it to the user record. Any admin can grant admin privileges to any user (including themselves if they somehow lost it), or revoke admin from other admins. There is no super-admin concept, no audit logging, and no protection against the last admin removing their own admin status.

**What to do:**

1. Add a guard that prevents admins from modifying the `isAdmin` field of any user (including themselves) unless they are a designated "super admin." For now, since there is no super-admin concept, **remove `isAdmin` from the allowed PATCH fields entirely** and add a console log for audit.

2. If `isAdmin` changes are needed in the future, they should go through a separate dedicated endpoint with additional safeguards (e.g., requiring confirmation, preventing removal of the last admin).

3. Replace the PATCH handler (lines 225-242):

**Before:**
```typescript
usersRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ planId?: string; isAdmin?: boolean }>();

  const updated = await prisma.user.update({
    where: { id: c.req.param("id") },
    data: {
      ...(body.planId !== undefined && { planId: body.planId }),
      ...(body.isAdmin !== undefined && { isAdmin: body.isAdmin }),
    },
    include: { plan: { select: { id: true, name: true, slug: true } } },
  });

  return c.json({
    data: { id: updated.id, plan: { id: updated.plan.id, name: updated.plan.name, slug: updated.plan.slug }, isAdmin: updated.isAdmin },
  });
});
```

**After:**
```typescript
usersRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{ planId?: string; isAdmin?: boolean }>();

  // Block isAdmin changes via this endpoint — requires dedicated super-admin flow
  if (body.isAdmin !== undefined) {
    console.warn(
      `[SECURITY] Admin privilege change attempted via PATCH /admin/users/${c.req.param("id")} — blocked. ` +
      `Requested isAdmin=${body.isAdmin}`
    );
    return c.json(
      { error: "Cannot modify admin privileges via this endpoint" },
      403
    );
  }

  // Only allow plan assignment
  const data: Record<string, unknown> = {};
  if (body.planId !== undefined) {
    // Validate that the plan exists
    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) {
      return c.json({ error: "Plan not found" }, 404);
    }
    data.planId = body.planId;
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const updated = await prisma.user.update({
    where: { id: c.req.param("id") },
    data,
    include: { plan: { select: { id: true, name: true, slug: true } } },
  });

  return c.json({
    data: {
      id: updated.id,
      plan: { id: updated.plan.id, name: updated.plan.name, slug: updated.plan.slug },
      isAdmin: updated.isAdmin,
    },
  });
});
```

**Design decisions:**
- **Hard block, not silent ignore:** Returning 403 with a clear message is better than silently stripping `isAdmin` from the body. The frontend admin UI should remove the toggle, and any attempt to set it via API is suspicious.
- **Console.warn for audit:** Until a proper audit log system exists (Phase 6), `console.warn` with a `[SECURITY]` prefix ensures the attempt is logged in Cloudflare's log stream and can be monitored.
- **Plan existence validation:** While we're hardening this endpoint, also validate that `planId` references an existing plan. Previously, an invalid `planId` would cause a Prisma foreign key error (500) instead of a clean 404.

**Acceptance criteria:**
- [ ] Requests with `isAdmin` in the body return 403
- [ ] A `[SECURITY]` warning is logged when `isAdmin` change is attempted
- [ ] `planId` changes still work and are validated against existing plans
- [ ] Empty update bodies return 400
- [ ] Response shape is unchanged for successful updates

**Tests to add/update** (in existing admin users test file, or create `worker/routes/admin/__tests__/users.test.ts`):

1. **"PATCH should return 403 when isAdmin is in request body"** -- send `{ isAdmin: true }`, assert 403 with error message.
2. **"PATCH should allow planId changes"** -- send `{ planId: "plan_123" }`, mock plan.findUnique returning a plan, assert 200.
3. **"PATCH should return 404 for invalid planId"** -- send `{ planId: "nonexistent" }`, mock plan.findUnique returning null, assert 404.
4. **"PATCH should return 400 for empty body"** -- send `{}`, assert 400.

---

### Task 1.5: Stripe Webhook Signature Verification (Audit & Harden)

**Files to modify:**
- `worker/routes/webhooks/stripe.ts` (lines 56-57)

**Depends on:** None

**Security finding:** Positive finding #3 (already implemented), but needs hardening

**Background:** Unlike the Clerk webhook, the Stripe webhook handler **already correctly verifies** signatures using `stripe.webhooks.constructEventAsync` (lines 49-55 of `stripe.ts`). The security review's positive finding #3 confirms this. However, there are two minor improvements to make:

1. **Line 56-57:** The `catch` block catches all errors but doesn't log the verification failure. Distinguishing between "invalid signature" and "other errors" (e.g., network issues, JSON parsing) is important for debugging.

2. **Error specificity:** The handler returns a generic `"Invalid signature"` message (line 57). While this is fine for production (don't leak details to attackers), the server log should capture the actual error.

**What to do:**

1. Add error logging to the catch block:

**Before (lines 56-57):**
```typescript
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }
```

**After:**
```typescript
  } catch (err) {
    console.error(
      "[SECURITY] Stripe webhook signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    return c.json({ error: "Invalid webhook signature" }, 400);
  }
```

2. This is a minor change. The primary purpose of including this task is to **document that Stripe webhooks are already secure** and to bring the error logging in line with the Clerk webhook pattern from Task 1.1.

**Acceptance criteria:**
- [ ] Signature verification failures are logged with `[SECURITY]` prefix
- [ ] The error message in the log includes the actual error reason
- [ ] The response to the client remains generic (`"Invalid webhook signature"`)
- [ ] Existing Stripe webhook test cases continue to pass

**Tests to update** (in `worker/routes/__tests__/webhooks.test.ts`):

1. Existing test **"should return 400 on invalid signature"** (line 223) -- update expected error text from `"Invalid signature"` to `"Invalid webhook signature"` if the message changes. Verify the test still passes.

---

### Task 1.6: `parseSort` Field Allowlist Validation

**Files to modify:**
- `worker/lib/admin-helpers.ts` (lines 14-22 -- `parseSort` function)
- `worker/routes/admin/users.ts` (line 64)
- `worker/routes/admin/plans.ts` (line 15)
- `worker/routes/admin/episodes.ts` (line 16)
- `worker/routes/admin/briefings.ts` (line 14)
- `worker/routes/admin/podcasts.ts` (line 67)
- `worker/routes/admin/stt-benchmark.ts` (line 300)

**Depends on:** None

**Security finding:** HIGH #6

**Background:** The `parseSort` function at `worker/lib/admin-helpers.ts:15-22` takes a user-supplied `sort` query parameter, splits it on `:`, and uses the first part as a Prisma `orderBy` key with no validation. While Prisma prevents SQL injection (it parameterizes queries), invalid field names cause 500 errors that could leak information. More importantly, attackers can sort by sensitive fields like `stripeCustomerId` or `clerkId` to infer data ordering.

**What to do:**

1. Add a `allowedFields` parameter to `parseSort` that callers must provide. If the requested sort field is not in the allowlist, fall back to the default.

2. Update the `parseSort` signature and implementation:

**Before:**
```typescript
export function parseSort(c: Context, defaultField = "createdAt") {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [sortField, sortDir] = sort.split(":");
  return { [sortField || defaultField]: sortDir || "desc" } as Record<
    string,
    string
  >;
}
```

**After:**
```typescript
export function parseSort(
  c: Context,
  defaultField = "createdAt",
  allowedFields?: string[]
) {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [rawField, rawDir] = sort.split(":");
  const sortField = rawField || defaultField;
  const sortDir = rawDir === "asc" ? "asc" : "desc";

  // If an allowlist is provided, validate the field
  if (allowedFields && !allowedFields.includes(sortField)) {
    return { [defaultField]: sortDir };
  }

  return { [sortField]: sortDir } as Record<string, string>;
}
```

3. Also validate `sortDir` to only allow `"asc"` or `"desc"` (currently it passes through any string, which Prisma would reject with a 500).

4. Update each call site with the appropriate allowlist. The allowlists should include only fields that are safe to sort by and exist on the model:

**`worker/routes/admin/users.ts:64`:**
```typescript
const orderBy = parseSort(c, "createdAt", [
  "createdAt", "email", "name", "isAdmin",
]);
```

**`worker/routes/admin/plans.ts:15`:**
```typescript
const orderBy = parseSort(c, "sortOrder", [
  "sortOrder", "name", "slug", "priceCentsMonthly", "createdAt", "active",
]);
```

**`worker/routes/admin/episodes.ts:16`:**
```typescript
const orderBy = parseSort(c, "publishedAt", [
  "publishedAt", "title", "createdAt", "durationSeconds",
]);
```

**`worker/routes/admin/briefings.ts:14`:**
```typescript
const orderBy = parseSort(c, "createdAt", [
  "createdAt",
]);
```

**`worker/routes/admin/podcasts.ts:67`:**
```typescript
const orderBy = parseSort(c, "createdAt", [
  "createdAt", "title", "episodeCount", "status", "lastFetchedAt",
]);
```

**`worker/routes/admin/stt-benchmark.ts:300`:**
```typescript
const orderBy = parseSort(c, "createdAt", [
  "createdAt", "model", "provider", "status", "wer", "latencyMs", "costDollars",
]);
```

**Design decisions:**
- **Optional `allowedFields`:** Making it optional preserves backward compatibility -- existing callers without an allowlist continue to work (with no field validation, as before). This allows incremental adoption. However, all current callers should be updated in this task.
- **Silent fallback vs error:** When an invalid field is requested, we fall back to the default sort rather than returning 400. This is more forgiving for frontend code that might send stale sort parameters after a backend change.
- **Direction validation:** Clamping `sortDir` to `"asc"` or `"desc"` prevents Prisma from receiving invalid values and throwing 500 errors.

**Acceptance criteria:**
- [ ] `parseSort` accepts an optional `allowedFields` array
- [ ] Sort fields not in the allowlist fall back to the default field
- [ ] Sort direction is validated to `"asc"` or `"desc"` only
- [ ] All 6 admin route call sites pass an explicit allowlist
- [ ] No sensitive fields (e.g., `stripeCustomerId`, `clerkId`, `stripeProductId`) appear in any allowlist
- [ ] Existing sorting behavior is preserved for valid fields

**Tests to add/update** (in `worker/lib/__tests__/admin-helpers.test.ts`):

The existing `parseSort` tests (lines 34-53) need updating plus new cases:

1. **"should accept valid field from allowlist"** -- `parseSort(ctx({ sort: "email:asc" }), "createdAt", ["createdAt", "email"])` returns `{ email: "asc" }`.
2. **"should fall back to default for field not in allowlist"** -- `parseSort(ctx({ sort: "stripeCustomerId:asc" }), "createdAt", ["createdAt", "email"])` returns `{ createdAt: "asc" }`.
3. **"should allow any field when no allowlist provided"** -- `parseSort(ctx({ sort: "anything:asc" }))` returns `{ anything: "asc" }` (backward compat).
4. **"should normalize invalid sort direction to desc"** -- `parseSort(ctx({ sort: "name:INVALID" }))` returns `{ name: "desc" }`.
5. **"should normalize missing direction to desc"** -- `parseSort(ctx({ sort: "name" }))` returns `{ name: "desc" }` (existing test, keep).

---

### Task 1.7: Plans Route Mass Assignment Prevention

**Files to modify:**
- `worker/routes/admin/plans.ts` (lines 46-73 for POST, lines 76-110 for PATCH)

**Depends on:** None

**Security finding:** HIGH #5

**Background:** Both the `POST /` (line 68) and `PATCH /:id` (line 103) endpoints in `worker/routes/admin/plans.ts` pass the entire request body directly to `prisma.plan.create({ data: body })` and `prisma.plan.update({ data: body })`. An attacker with admin access could set any Plan field, including internal fields like `id`, `stripeProductId`, `stripePriceIdMonthly`, `stripePriceIdAnnual`, `createdAt`, or `updatedAt`. Setting Stripe price IDs to another plan's values could bypass billing.

**What to do:**

1. Define a whitelist of fields that can be set via the admin API. These are the "safe" Plan fields that admins should be able to configure:

```typescript
/** Fields allowed in Plan create/update via admin API. */
const PLAN_WRITABLE_FIELDS = [
  "name",
  "slug",
  "description",
  "briefingsPerWeek",
  "maxDurationMinutes",
  "maxPodcastSubscriptions",
  "adFree",
  "priorityProcessing",
  "earlyAccess",
  "researchMode",
  "crossPodcastSynthesis",
  "priceCentsMonthly",
  "priceCentsAnnual",
  "trialDays",
  "features",
  "highlighted",
  "active",
  "sortOrder",
  "isDefault",
] as const;
```

2. Create a helper to pick only allowed fields from the body:

```typescript
function pickPlanFields(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of PLAN_WRITABLE_FIELDS) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}
```

3. **Update POST handler** (lines 46-73). Replace `data: body` with `data: sanitized`:

```typescript
plansRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const sanitized = pickPlanFields(body);

  // Require at minimum name and slug for creation
  if (!sanitized.name || !sanitized.slug) {
    return c.json({ error: "name and slug are required" }, 400);
  }

  // Validate slug uniqueness
  const existing = await prisma.plan.findUnique({
    where: { slug: sanitized.slug as string },
  });
  if (existing) {
    return c.json({ error: `Plan with slug "${sanitized.slug}" already exists` }, 409);
  }

  // If isDefault is true, unset on all other plans first
  if (sanitized.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.create({
    data: sanitized,
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: plan }, 201);
});
```

4. **Update PATCH handler** (lines 76-110). Replace `data: body` with `data: sanitized`:

```typescript
plansRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();
  const sanitized = pickPlanFields(body);

  if (Object.keys(sanitized).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Plan not found" }, 404);

  // If slug is being changed, validate uniqueness
  if (sanitized.slug && sanitized.slug !== existing.slug) {
    const slugTaken = await prisma.plan.findUnique({
      where: { slug: sanitized.slug as string },
    });
    if (slugTaken) {
      return c.json({ error: `Plan with slug "${sanitized.slug}" already exists` }, 409);
    }
  }

  // If setting isDefault to true, unset on all other plans first
  if (sanitized.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.update({
    where: { id },
    data: sanitized,
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: plan });
});
```

**Fields deliberately excluded from the whitelist:**
- `id` -- auto-generated, never writable
- `stripePriceIdMonthly` -- managed by Stripe webhook/integration, not manual admin entry
- `stripePriceIdAnnual` -- same
- `stripeProductId` -- same
- `createdAt` -- auto-managed by Prisma
- `updatedAt` -- auto-managed by Prisma

**Note on Stripe fields:** If there's a legitimate need for admins to manually set Stripe price/product IDs (e.g., during initial setup before Stripe integration is automated), add a separate endpoint or a `PLAN_STRIPE_FIELDS` allowlist behind additional confirmation. Do not mix Stripe billing fields with general plan configuration.

**Acceptance criteria:**
- [ ] POST `/admin/plans` only writes whitelisted fields to the database
- [ ] PATCH `/admin/plans/:id` only writes whitelisted fields to the database
- [ ] Attempts to set `id`, `stripeProductId`, `stripePriceIdMonthly`, `stripePriceIdAnnual`, `createdAt`, or `updatedAt` are silently ignored
- [ ] POST requires `name` and `slug` (returns 400 if missing)
- [ ] PATCH with no valid fields returns 400
- [ ] Existing slug uniqueness checks are preserved
- [ ] Existing `isDefault` cascade logic is preserved

**Tests to add:**

Create or extend `worker/routes/admin/__tests__/plans.test.ts`:

1. **"POST should create plan with only allowed fields"** -- send body with `name`, `slug`, `priceCentsMonthly`, assert `prisma.plan.create` is called with only those fields.
2. **"POST should strip disallowed fields"** -- send body with `name`, `slug`, `id`, `stripeProductId`, `stripePriceIdMonthly`, assert `prisma.plan.create` data does NOT contain `id`, `stripeProductId`, or `stripePriceIdMonthly`.
3. **"POST should return 400 when name is missing"** -- send `{ slug: "test" }`, assert 400.
4. **"POST should return 400 when slug is missing"** -- send `{ name: "Test" }`, assert 400.
5. **"PATCH should update only allowed fields"** -- send `{ name: "New Name", stripeProductId: "prod_evil" }`, assert update data contains `name` but not `stripeProductId`.
6. **"PATCH should return 400 when body has no valid fields"** -- send `{ id: "evil_id", createdAt: "2020-01-01" }`, assert 400.

---

## Verification Checklist

After all 7 tasks are complete, verify:

- [ ] `npm run typecheck` passes with zero errors
- [ ] All existing tests pass (568/568 on the branch baseline)
- [ ] New tests pass
- [ ] Manual smoke test: start dev server, hit `/api/webhooks/clerk` without Svix headers -> 400
- [ ] Manual smoke test: check browser console for CORS headers on API requests from `localhost:8787`
- [ ] Manual smoke test: attempt to access a clip URL for an episode you don't have a FeedItem for -> 404

## Dependencies & Package Changes

- **No new packages required.** `@clerk/backend` (already `^2.32.2`) provides `verifyWebhook`.
- **No database migrations.** All changes are application-level.
- **No wrangler config changes.** `CLERK_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` are already declared in `worker/types.ts`. `ALLOWED_ORIGINS` is optional.

## Risk Assessment

| Task | Risk | Mitigation |
|------|------|------------|
| 1.1 Clerk webhook | Medium -- `verifyWebhook` consumes request body differently | Test with real Clerk webhook in dev before merging |
| 1.2 CORS | Low -- could break local dev if origins are wrong | Include `localhost:8787` and `localhost:5173` in defaults |
| 1.3 Clip IDOR | Low -- adds a DB query per audio request | Admin bypass ensures debugging is still possible |
| 1.4 Admin PATCH | Low -- removes existing functionality (isAdmin toggle) | Frontend admin UI may need update to remove toggle |
| 1.5 Stripe webhook | Very low -- logging change only | N/A |
| 1.6 parseSort | Low -- invalid sorts silently fall back instead of erroring | Existing frontend sort params should match allowlists |
| 1.7 Plans mass assignment | Low -- restricts writable fields | Verify admin plan creation UI still works end-to-end |
