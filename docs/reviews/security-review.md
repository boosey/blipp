# Security Review — Blipp

**Date:** 2026-03-26
**Reviewer:** Security Review Agent
**Scope:** Full codebase — worker routes, middleware, webhooks, auth, data exposure, dependencies

---

## Summary

The overall security posture is reasonable for an early-stage product. Auth is consistently applied, webhooks are properly verified, and error messages are mostly sanitized. The main risks are: a high-severity vulnerable dependency tree (Hono, fast-xml-parser), a CORS wildcard in one proxy path, raw internal error messages leaking from the native auth endpoint, SSRF exposure on user-supplied URLs, and the use of `CLERK_SECRET_KEY` as a dual-purpose admin bypass token.

---

## Findings

### CRITICAL

None identified.

---

### HIGH

#### H1 — Native Auth Endpoint Leaks Raw Error Messages to Client

**File:** `worker/routes/native-auth.ts:250`

The catch block returns `err.message` directly in a 500 response:

```ts
return c.json({ error: err.message }, 500);
```

Internal error messages from Clerk API calls, Google token verification failures, and other upstream services are exposed verbatim. These may contain internal URLs, API error codes, or account state details (e.g., "User with email X already exists").

**Fix:** Replace with a generic message. Log the full error server-side.

---

#### H2 — Clerk FAPI Proxy Reflects Arbitrary Origin (No Allowlist)

**File:** `worker/routes/clerk-proxy.ts:16`

```ts
const requestOrigin = c.req.header("origin") || "*";
// ...
respHeaders.set("access-control-allow-origin", requestOrigin);
```

The proxy at `/api/__clerk/*` reflects the requester's `Origin` header back with `Access-Control-Allow-Origin: <anything>`. Any origin can make credentialed requests through this proxy. The `/__clerk/*` path (line 99 in `index.ts`) has the same issue.

The `/api/*` CORS middleware correctly uses an allowlist, but these two proxy paths bypass it.

**Fix:** Apply the same allowlist check used in the `/api/*` CORS middleware before reflecting origins.

---

#### H3 — SSRF: Unvalidated External URLs Fetched by Worker

**Files:** Multiple — `worker/queues/feed-refresh.ts:41`, `worker/routes/admin/podcasts.ts:621`, `worker/lib/audio-probe.ts:86`, `worker/lib/stt-providers.ts:37`, `worker/lib/content-prefetch.ts`

User-supplied or podcast-data-derived URLs are fetched without validation:

```ts
// feed-refresh.ts
const response = await fetch(podcast.feedUrl, ...);

// admin/podcasts.ts
const resp = await fetch(request.feedUrl);
```

A malicious actor who can insert or control `feedUrl` or `audioUrl` values (e.g., via the admin catalog seed, or a compromised podcast feed) could target internal services, cloud metadata endpoints (`169.254.169.254`), or other private network resources.

**Risk context:** The admin routes require `isAdmin`, so direct external exploitation of this requires admin access. However, the RSS parser inputs (`feedUrl`) are controlled by podcast data which could be injected. The audio processing chain fetches `episode.audioUrl` from RSS-parsed data with no URL scheme/host validation.

**Fix:** Before fetching any external URL, validate that the scheme is `http` or `https` and that the host is not a private IP range or cloud metadata endpoint.

---

#### H4 — Hono Framework Has Multiple Known HIGH Vulnerabilities

From `npm audit`:

- **GHSA-9r54-q6cx-xmh5** — XSS through ErrorBoundary component (hono <=4.12.6, current: ^4.12.3)
- **GHSA-6wqw-2p9w-4vw4** — Cache middleware ignores `Cache-Control: private` (Web Cache Deception)
- **GHSA-w332-q679-j88p** — Arbitrary key read in Serve Static Middleware (Cloudflare Workers Adapter)
- **GHSA-v8w9-8mx6-g223** — Prototype pollution via `__proto__` key in `parseBody({ dot: true })`
- **GHSA-5pq2-9x2x-5p6w** — Cookie attribute injection via unsanitized domain/path in `setCookie()`
- **GHSA-p6xx-57qc-3wxr** — SSE control field injection via CR/LF in `writeSSE()`
- **GHSA-gq3j-xvxp-8hrf** — Timing comparison hardening missing in basicAuth/bearerAuth

`npm audit fix` resolves the Hono vulnerabilities without breaking changes.

---

#### H5 — fast-xml-parser Has Known HIGH Vulnerability (XML Entity Expansion)

**File:** `worker/lib/rss-parser.ts` uses `fast-xml-parser`

From `npm audit`:

- **GHSA-8gc5-j5rx-235r** — Numeric entity expansion bypasses all entity expansion limits (incomplete fix for previous CVE)
- **GHSA-jp2q-39xq-3w4g** — Entity Expansion Limits Bypassed When Set to Zero Due to JavaScript Falsy Evaluation

RSS feeds are parsed from untrusted external sources. A crafted feed could trigger an XML bomb (exponential entity expansion), causing CPU/memory exhaustion in the worker.

`npm audit fix` resolves this without breaking changes.

---

### MEDIUM

#### M1 — `CLERK_SECRET_KEY` Used as a Dual-Purpose Server-to-Server Token

**Files:** `worker/index.ts:161-167`, `worker/middleware/admin.ts:13-18`, `worker/routes/admin/clean-r2.ts:16`

`CLERK_SECRET_KEY` is used both as the Clerk backend credential and as an admin bypass token for server-to-server requests. If this key is rotated for Clerk-related reasons, the internal bypass also needs updating (and vice versa). If this key leaks, callers gain full admin access to all admin routes.

The `clean-r2.ts` route allows bulk R2 deletion authenticated only by this token with no rate limiting or audit logging.

**Fix:** Issue a separate `INTERNAL_API_TOKEN` / `ADMIN_API_KEY` env var for server-to-server bypass, distinct from the Clerk credential. Add rate limiting and audit logging to destructive internal endpoints.

---

#### M2 — Admin User Detail Endpoint Returns `stripeCustomerId`

**File:** `worker/routes/admin/users.ts:209`

```ts
stripeCustomerId: user.stripeCustomerId,
```

The admin user detail endpoint returns `stripeCustomerId`, a sensitive identifier that could be used to probe the Stripe API. This is admin-only, so exploitability is limited, but the data should only be returned when specifically needed (e.g., in a dedicated billing-info endpoint).

---

#### M3 — Admin PATCH `/users/:id` Does Not Validate `id` Format

**File:** `worker/routes/admin/users.ts:239`

```ts
const body = await c.req.json<...>();
// ...
await prisma.user.update({ where: { id: c.req.param("id") }, data });
```

The user `id` parameter is passed directly to Prisma without format validation. Prisma will reject invalid CUID formats with a `P2023` error, but the error message may reveal the expected ID format. Low impact but worth sanitizing.

---

#### M4 — Rate Limiting Falls Back to Per-Isolate In-Memory Counters

**File:** `worker/middleware/rate-limit.ts:13-15`

```ts
// In-memory fallback (per-isolate, resets on redeploy).
// Used when KV is not configured.
const counters = new Map<...>();
```

If `RATE_LIMIT_KV` is not configured (e.g., in some environments), rate limiting is per-isolate and resets on every redeploy. Cloudflare Workers can run in many isolates simultaneously, so the effective limit is `maxRequests * numIsolates`. Under high load, this degrades rate limiting to near-zero protection.

**Fix:** Ensure `RATE_LIMIT_KV` is configured in all environments. Add a startup warning log if `RATE_LIMIT_KV` is absent.

---

#### M5 — Shared Briefing Links Create Feed Items for Any Authenticated User

**File:** `worker/routes/feed.ts:174-195`

```ts
feedItem = await prisma.feedItem.create({
  data: {
    userId: user.id,
    podcastId: source.podcastId,
    episodeId: source.episodeId,
    briefingId,
    ...
    source: "SHARED",
    status: "READY",
  },
```

Any authenticated user can call `GET /api/feed/shared/:briefingId` with any valid briefing ID, causing a feed item to be created in their account. There is no check that the shared briefing is intended to be public (no `isPublic` flag or sharing token). Users can enumerate other users' briefings and add them to their own feed if they know the ID.

**Fix:** Add a sharing mechanism — either a `isPublic` flag on `Briefing`, or a separate `shareToken` that must be presented, rather than accepting raw briefing IDs.

---

#### M6 — Admin Error Response Contains Internal Error Details

**File:** `worker/routes/admin/podcasts.ts:625`

```ts
return c.json({ error: `Failed to fetch feed: ${err instanceof Error ? err.message : String(err)}` }, 422);
```

Internal error messages from RSS fetch failures are returned to admin clients, which is acceptable for admins but may reveal internal infrastructure details (e.g., internal hostnames, connection strings) if errors propagate from unexpected sources.

---

#### M7 — No HSTS Header Set

**File:** `worker/middleware/security-headers.ts`

The security headers middleware sets CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`, but does not set `Strict-Transport-Security`. Without HSTS, browsers may make initial plain HTTP requests before being redirected.

**Fix:** Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to the security headers middleware.

---

### LOW

#### L1 — Push Subscription Endpoint Does Not Validate Endpoint Ownership

**File:** `worker/routes/me.ts:200-213`

The `POST /api/me/push/subscribe` upserts a push subscription keyed by `endpoint`. If two users share the same push endpoint URL (edge case), the second user's subscription would update the `p256dh`/`auth` keys without changing the `userId`. The `userId` is only set on `create`, not `update`. This is unlikely but worth noting.

---

#### L2 — `$queryRawUnsafe` in Health Check

**File:** `worker/lib/health.ts:25`

```ts
await prisma.$queryRawUnsafe("SELECT 1");
```

The `$queryRawUnsafe` call uses a hardcoded string `"SELECT 1"` with no interpolated values, so there is no actual injection risk. However, use of `$queryRaw` (tagged template, parameterized) is preferred for consistency and as a defense against future edits.

---

#### L3 — Sign-In Token Prefix Logged

**File:** `worker/routes/native-auth.ts:137`

```ts
tokenPrefix: data.token?.substring(0, 20),
```

The first 20 characters of a short-lived (5-minute) Clerk sign-in token are logged to the console. These are worker logs visible to anyone with Cloudflare dashboard access. The prefix alone is not enough to reconstruct the token, but it is unnecessary.

**Fix:** Remove the `tokenPrefix` from the log entry.

---

#### L4 — No Input Length Limit on Push Subscription Endpoint

**File:** `worker/routes/me.ts:31-37`

The `PushSubscribeSchema` validates `endpoint` as a URL and `p256dh`/`auth` as non-empty strings, but does not impose maximum length constraints. A malicious client could submit very long strings. Prisma/Postgres will enforce column limits at the DB layer, but explicit validation is cleaner.

---

#### L5 — Ads Event Endpoint Has No Auth Requirement

**File:** `worker/routes/ads.ts:91`

```ts
ads.post("/event", async (c) => {
  const auth = getAuth(c);
  const body = await validateBody(c, adEventSchema);
  // logs userId: auth?.userId ?? "anonymous"
```

The ad event endpoint accepts unauthenticated requests and logs arbitrary `briefingId`, `feedItemId`, and `metadata` values without requiring auth. The `metadata` field accepts arbitrary key-value pairs. This could be used to inject spam into ad event logs. Actual risk is low since it only affects internal logging.

---

## Checklist Summary

| Area | Status | Notes |
|------|--------|-------|
| Auth: Routes protected | PASS | All user routes use `requireAuth`; admin routes use `requireAdmin` |
| Auth: Webhook verification | PASS | Clerk uses `verifyWebhook`; Stripe uses `constructEventAsync` with signature |
| Authz: Role-based access | PASS | Admin middleware checks DB `isAdmin` flag; `isAdmin` changes blocked at API level |
| Data exposure: API responses | PARTIAL | `stripeCustomerId` in admin detail (M2); raw errors in native auth (H1) |
| User isolation | PASS | All queries scope by `userId`; clips endpoint verifies FeedItem ownership |
| Input validation | PASS | Zod schemas used on all mutation endpoints; route params not always validated (M3) |
| Injection: SQL | PASS | Prisma ORM used; tagged `$queryRaw` for raw queries; one `$queryRawUnsafe("SELECT 1")` is safe |
| Injection: XSS | PARTIAL | CSP set but `unsafe-inline` for scripts; Hono XSS vuln in ErrorBoundary (H4) |
| CORS | PARTIAL | `/api/*` correct; FAPI proxies reflect arbitrary origin (H2) |
| CSRF | PASS | Clerk JWT auth; no session cookies used for API auth |
| Rate limiting | PARTIAL | Present but falls back to per-isolate in-memory (M4); webhooks correctly exempt |
| Secrets management | PARTIAL | No hardcoded secrets; CLERK_SECRET_KEY dual-use is a concern (M1) |
| Webhook verification | PASS | Both Clerk and Stripe webhooks properly verify signatures |
| Error verbosity | PARTIAL | Global handler sanitizes errors; native auth leaks raw messages (H1); admin RSS errors exposed (M6) |
| PII handling | PASS | GDPR export/delete endpoints present; data correctly scoped |
| Dependency security | FAIL | 18 HIGH + 5 MODERATE vulnerabilities; Hono, fast-xml-parser, serialize-javascript, undici affected |
| SSRF | FAIL | External URLs fetched without host validation (H3) |

---

## Priority Remediation Order

1. **H4/H5 (Dependencies)** — Run `npm audit fix` immediately; resolves Hono and fast-xml-parser vulns with no breaking changes.
2. **H1 (Native auth error leak)** — One-line fix; replace `err.message` with a generic message.
3. **H2 (CORS wildcard in proxies)** — Apply origin allowlist to both proxy handlers.
4. **M5 (Shared briefing enumeration)** — Add `isPublic` flag or share token before exposing shared briefing endpoint.
5. **H3 (SSRF)** — Add URL validation helper before any external fetch of user-derived URLs.
6. **M1 (CLERK_SECRET_KEY dual-use)** — Issue dedicated `INTERNAL_API_TOKEN`.
7. **M4 (Rate limit fallback)** — Ensure `RATE_LIMIT_KV` is provisioned in all environments.
8. **M7 (HSTS missing)** — Add `Strict-Transport-Security` header.
