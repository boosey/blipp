# Security Review — Blipp

**Date:** 2026-03-14
**Reviewer:** Security Agent (automated)
**Scope:** Full-stack: worker routes, middleware, webhooks, frontend, infrastructure

---

## Executive Summary

Blipp has a solid authentication foundation via Clerk and a well-structured admin authorization layer. However, there are **2 CRITICAL**, **4 HIGH**, and **6 MEDIUM** findings that must be addressed before production launch. The most urgent issues are the unverified Clerk webhook (allowing arbitrary user creation/deletion) and the open CORS policy.

---

## Findings

### 1. [CRITICAL] Clerk Webhook Signature Not Verified

**File:** `worker/routes/webhooks/clerk.ts:20`

The Clerk webhook handler accepts **any** POST body without verifying the Svix signature. The code even has a comment acknowledging this: *"For Phase 0, we trust the payload structure."*

**Impact:** An attacker can:
- Create arbitrary admin users in the database
- Delete any user's account
- Modify user email/profile to hijack accounts

**Evidence:**
```typescript
// Line 20: No signature verification — trusts raw body
clerkWebhooks.post("/", async (c) => {
  const body = await c.req.json();
  // ... directly uses body.data to create/update/delete users
```

The `CLERK_WEBHOOK_SECRET` binding exists in `worker/types.ts` but is never used.

**Fix:** Use the Svix library or Clerk's `@clerk/backend` webhook verification:
```typescript
import { Webhook } from "svix";
const wh = new Webhook(c.env.CLERK_WEBHOOK_SECRET);
const payload = wh.verify(rawBody, headers); // throws if invalid
```

---

### 2. [CRITICAL] CORS Allows All Origins

**File:** `worker/index.ts:21`

```typescript
app.use("/api/*", cors());
```

The `cors()` middleware is called with **no configuration**, which defaults to `Access-Control-Allow-Origin: *`. This means any website on the internet can make authenticated API requests on behalf of a logged-in Blipp user (via cookies/credentials).

**Impact:** Full cross-origin exploitation — any malicious site can read a user's feed, create subscriptions, access billing endpoints, or perform admin operations if the user is an admin.

**Fix:** Restrict to known origins:
```typescript
app.use("/api/*", cors({
  origin: ["https://blipp.app", "http://localhost:8787"],
  credentials: true,
}));
```

---

### 3. [HIGH] Clip Audio Route Has No User-Scoping (IDOR)

**File:** `worker/routes/clips.ts:12`

The clip streaming route serves audio from R2 based on `episodeId/durationTier` — there is **no check** that the requesting user owns (or has access to) that clip.

```typescript
clips.get("/:episodeId/:durationTier", async (c) => {
  const key = `clips/${episodeId}/${durationTier}.mp3`;
  const obj = await c.env.R2.get(key); // No ownership check
```

**Impact:** Any authenticated user can access any other user's clip audio by guessing or enumerating episode IDs and duration tiers. The R2 keys are predictable (`clips/{uuid}/{1-15}.mp3`).

**Fix:** Verify the requesting user has a FeedItem or Briefing for that clip before serving it. Alternatively, use signed/time-limited URLs.

---

### 4. [HIGH] Admin User PATCH Allows Privilege Escalation

**File:** `worker/routes/admin/users.ts:226-242`

The admin `PATCH /:id` endpoint accepts `{ isAdmin: boolean }` in the body, allowing any admin to grant or revoke admin privileges to any user, including themselves.

```typescript
const body = await c.req.json<{ planId?: string; isAdmin?: boolean }>();
const updated = await prisma.user.update({
  where: { id: c.req.param("id") },
  data: {
    ...(body.isAdmin !== undefined && { isAdmin: body.isAdmin }),
  },
```

**Impact:** While this requires admin access, there is no super-admin concept. A compromised admin account can create more admins, and there's no audit log of admin privilege changes.

**Fix:** Add audit logging for privilege changes. Consider requiring a super-admin role or multi-admin approval for granting admin rights.

---

### 5. [HIGH] Admin Plans POST/PATCH Accepts Raw Body as Prisma Data

**File:** `worker/routes/admin/plans.ts:68, 103`

```typescript
const plan = await prisma.plan.create({ data: body }); // line 68
const plan = await prisma.plan.update({ where: { id }, data: body }); // line 103
```

The entire request body is passed directly to Prisma `create`/`update` without field validation. An attacker with admin access could set any Plan field, including fields that shouldn't be writable via API (e.g., internal IDs, `isDefault` without proper cascading in all cases, `stripePriceId*`).

**Impact:** Mass assignment vulnerability. Could corrupt plan data, bypass billing by setting `stripePriceIdMonthly` to another plan's price ID, or manipulate feature gates.

**Fix:** Explicitly whitelist allowed fields:
```typescript
const { name, slug, description, priceCentsMonthly, ... } = body;
const plan = await prisma.plan.create({ data: { name, slug, ... } });
```

---

### 6. [HIGH] `parseSort` Allows Arbitrary Prisma OrderBy Keys

**File:** `worker/lib/admin-helpers.ts:15-22`

```typescript
export function parseSort(c: Context, defaultField = "createdAt") {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [sortField, sortDir] = sort.split(":");
  return { [sortField || defaultField]: sortDir || "desc" };
}
```

The user-supplied `sort` query param is split and directly used as a Prisma `orderBy` key without validation. While Prisma's query engine rejects invalid fields (preventing SQL injection), this can:
- Cause 500 errors by passing invalid field names (information disclosure via error messages)
- Sort by sensitive fields that shouldn't be exposed (e.g., `stripeCustomerId`)

**Impact:** Low severity for injection (Prisma parameterizes), but information disclosure and potential DoS via error-triggering queries.

**Fix:** Validate against an allowlist of sortable fields per route.

---

### 7. [MEDIUM] No Rate Limiting on Any Endpoint

**Files:** All route files, `worker/index.ts`

There is zero rate limiting across the entire API surface. This includes:
- `/api/billing/checkout` — unlimited Stripe session creation
- `/api/briefings/generate` — unlimited pipeline triggering (costly AI operations)
- `/api/podcasts/subscribe` — unlimited subscription creation
- `/api/webhooks/*` — unlimited webhook processing
- `/api/admin/pipeline/trigger/*` — unlimited pipeline stage triggering
- Login attempts (handled by Clerk, but API calls are unthrottled)

**Impact:** Financial damage via AI cost abuse, DoS via resource exhaustion, webhook replay attacks.

**Fix:** Add rate limiting middleware. Cloudflare Workers supports rate limiting via the Rate Limiting API or custom solutions with Workers KV/D1.

---

### 8. [MEDIUM] Clerk Webhook User Deletion Cascading Risk

**File:** `worker/routes/webhooks/clerk.ts:64-67`

```typescript
case "user.deleted": {
  await prisma.user.delete({ where: { clerkId: data.id } });
```

A user deletion via webhook performs a hard delete. Depending on Prisma cascade configuration, this could delete all associated data (subscriptions, feed items, briefings). Combined with finding #1, an unauthenticated attacker could delete any user and all their data.

**Impact:** Complete data loss for targeted users.

**Fix:** After fixing webhook verification (#1), also consider soft-delete (set `deletedAt`) instead of hard delete, and add a grace period.

---

### 9. [MEDIUM] Webhook Routes Receive Clerk Auth Context Unnecessarily

**File:** `worker/index.ts:24` + `worker/routes/index.ts:27-28`

Webhooks are mounted under `/api/webhooks/*`, which means they pass through `clerkMiddleware()`. While this doesn't break functionality (Clerk middleware is non-blocking — it populates context but doesn't reject), webhook routes from Stripe/Clerk should ideally bypass auth middleware entirely, as they use their own signature-based verification.

The Stripe webhook correctly verifies its own signature (`stripe.webhooks.constructEventAsync`), but the Clerk webhook does not (see #1).

**Impact:** Low, but indicates architectural concern about the middleware chain for webhook routes.

---

### 10. [MEDIUM] Database Connection String in wrangler.jsonc

**File:** `wrangler.jsonc:15`

```json
"localConnectionString": "postgresql://neondb_owner:npg_PY4eWZT5wuVI@...neon.tech/neondb?sslmode=require"
```

A real database connection string (with password) is committed to the repository in the wrangler config. Even though this is for local development via Hyperdrive, it connects to a real Neon database.

**Impact:** Anyone with repo access has direct database credentials. If this is the production database, it's a full compromise.

**Fix:** Move connection strings to `.dev.vars` (already gitignored) or use environment-specific Hyperdrive configs. Rotate the exposed credentials immediately.

---

### 11. [MEDIUM] No Input Validation on Admin Config Writes

**File:** `worker/routes/admin/config.ts:50, 59`

```typescript
const body = await c.req.json<{ value: unknown; description?: string }>();
// ...
data: { value: body.value as any }
```

The config PATCH endpoint accepts `value: unknown` and casts it to `any` before saving. There is no schema validation on what goes into platform config. Feature flags, duration tiers, and pipeline settings are all controlled through this mechanism.

**Impact:** An admin could store malformed config values that crash downstream consumers, or inject unexpected data types.

**Fix:** Add type validation per config key namespace (e.g., `feature.*` must have `{ enabled: boolean, ... }` shape).

---

### 12. [MEDIUM] Admin Episode Detail Leaks User IDs in Feed Item Deliveries

**File:** `worker/routes/admin/episodes.ts:94-107`

```typescript
const feedItemDeliveries = await prisma.feedItem.findMany({
  where: { episodeId: episode.id },
  select: {
    userId: true,  // Exposes which users listened to which episodes
    // ...
  },
});
```

Admin routes expose `userId` values in feed item deliveries without any redaction. While admin routes are access-controlled, this still represents a privacy concern — admins can see exactly which users listened to which episodes, creating a detailed listening profile.

**Impact:** Privacy concern. User listening habits are visible to all admins.

**Fix:** Consider whether this level of detail is necessary. If not, aggregate rather than list individual user activities.

---

## Positive Findings

1. **Clerk auth is properly enforced** on all public user routes via `requireAuth` middleware
2. **Admin routes are properly gated** with `requireAdmin` middleware checking `User.isAdmin` in the database
3. **Stripe webhook signature verification** is correctly implemented using `constructEventAsync`
4. **No raw SQL queries** — all database access uses Prisma's parameterized query builder, eliminating SQL injection
5. **No XSS vectors found** — React frontend uses safe rendering patterns throughout; no unsafe HTML injection APIs are used
6. **Secrets are gitignored** — `.env*` and `.dev.vars` are in `.gitignore`
7. **User data isolation** is generally good — feed items, subscriptions, and briefings are all scoped by `userId` in queries
8. **Frontend auth tokens** are properly managed via Clerk's `useAuth()` hook with Bearer token pattern
9. **R2 audio is served through authenticated routes**, not via public bucket URLs
10. **Plan limit enforcement** properly checks duration, subscription count, and weekly briefing limits

---

## Risk Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| CRITICAL | 2 | Unverified webhook + open CORS |
| HIGH | 4 | IDOR on clips, mass assignment, privilege escalation, sort injection |
| MEDIUM | 6 | No rate limiting, DB creds in repo, input validation gaps, privacy |
| LOW | 0 | — |

---

## Recommended Priority Order

1. **Immediate (pre-launch blockers):**
   - Fix Clerk webhook signature verification (#1)
   - Configure CORS with explicit origin allowlist (#2)
   - Rotate exposed database credentials (#10)

2. **High priority (first sprint):**
   - Add user-scoping to clip audio route (#3)
   - Whitelist fields on plan POST/PATCH (#5)
   - Validate `parseSort` field names (#6)
   - Add audit logging for admin privilege changes (#4)

3. **Medium priority (second sprint):**
   - Implement rate limiting on expensive endpoints (#7)
   - Switch user deletion to soft-delete (#8)
   - Add config value schema validation (#11)
   - Review admin data exposure for privacy (#12)

4. **Architecture improvements:**
   - Mount webhooks outside `/api/*` to bypass auth middleware (#9)
   - Add Content-Security-Policy headers
   - Implement CSRF protection (SameSite cookies + token)
   - Add request logging and security event monitoring
