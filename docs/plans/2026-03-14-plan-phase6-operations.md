# Phase 6: SaaS Operations Readiness — Implementation Plan

**Date:** 2026-03-14
**Phase:** 6 of 6 (from Master Review Plan)
**Estimated effort:** 3-5 days
**Prerequisites:** Phases 1-3 (security, error handling, code quality) should be complete. Phase 4 (tests) and Phase 5 (UX) can proceed in parallel.

---

## Overview

This phase adds the operational infrastructure needed before scaling Blipp as a production SaaS: rate limiting, audit logging, GDPR compliance, health checks, cost alerting, feature flags, and usage metering. All implementations target the Cloudflare Workers runtime with its specific constraints (no long-lived connections, no Node.js crypto, 128MB memory limit, 30s CPU time for fetch handlers).

---

## Task 6.1: Rate Limiting on API Routes

### Problem

No rate limiting exists on any endpoint. A single user or bot can exhaust Neon connection pool slots, trigger unbounded AI costs via briefing generation, or DDoS the worker.

### Approach: Cloudflare Rate Limiting Rules (preferred) + In-App Sliding Window (fallback)

**Option A — Cloudflare Rate Limiting Rules (recommended for launch):**
Cloudflare's built-in rate limiting operates at the edge before the Worker executes, protecting both the Worker and downstream services. Configure via the Cloudflare dashboard or API, not in application code. This requires a paid Cloudflare plan (Pro+).

**Option B — In-App KV Sliding Window (if CF rate limiting unavailable):**
Use Cloudflare KV as the counter store. Workers KV has eventual consistency (~60s), so this is a soft limit — acceptable for abuse prevention, not for strict metering. For strict counters, use Durable Objects (see note below).

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/middleware/rate-limit.ts` | **Create** | Rate limiting middleware for Option B |
| `worker/index.ts` | Modify | Mount rate limit middleware on `/api/*` |
| `worker/types.ts` | Modify | Add `RATE_LIMIT_KV: KVNamespace` binding |
| `wrangler.jsonc` | Modify | Add KV namespace binding for rate limit counters |

### Design: In-App Sliding Window (Option B)

```typescript
// worker/middleware/rate-limit.ts

interface RateLimitConfig {
  windowMs: number;       // e.g., 60_000 (1 minute)
  maxRequests: number;    // e.g., 60
  keyPrefix: string;      // e.g., "rl:api"
}

// Key structure: "rl:{prefix}:{identifier}:{windowBucket}"
// Identifier: Clerk userId for authenticated, CF-Connecting-IP for anonymous
// Window bucket: Math.floor(Date.now() / windowMs)

export function rateLimit(config: RateLimitConfig) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const kv = c.env.RATE_LIMIT_KV;
    const auth = getAuth(c);
    const identifier = auth?.userId ?? c.req.header("cf-connecting-ip") ?? "unknown";
    const bucket = Math.floor(Date.now() / config.windowMs);
    const key = `${config.keyPrefix}:${identifier}:${bucket}`;

    const current = parseInt(await kv.get(key) ?? "0");
    if (current >= config.maxRequests) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    // Increment — fire-and-forget (KV is eventually consistent)
    c.executionCtx.waitUntil(
      kv.put(key, String(current + 1), { expirationTtl: Math.ceil(config.windowMs / 1000) + 60 })
    );

    await next();
  });
}
```

### Rate Limit Tiers

| Route Pattern | Window | Max Requests | Rationale |
|---------------|--------|--------------|-----------|
| `POST /api/briefings/on-demand` | 1 hour | 10 | Expensive pipeline operation |
| `POST /api/podcasts/subscribe` | 1 minute | 5 | Prevents subscription spam |
| `POST /api/billing/*` | 1 minute | 5 | Stripe session creation |
| `GET /api/*` (authenticated) | 1 minute | 120 | General read operations |
| `GET /api/*` (anonymous) | 1 minute | 30 | Unauthenticated reads |
| `POST /api/webhooks/*` | exempt | -- | Stripe/Clerk need unrestricted access |
| `GET /api/health` | exempt | -- | Monitoring must always work |

### Durable Objects Alternative (strict counting)

If exact counting matters (e.g., billing-critical limits), Durable Objects provide strongly consistent counters without the KV eventual consistency window. This is more complex and costs more — defer unless KV proves insufficient.

```
// Durable Object class per user, storing a Map<windowBucket, count>
// Each rate limit check is a single fetch to the DO
// Pro: exact counts. Con: latency (~5-20ms per DO fetch), $0.15/million requests
```

### Acceptance Criteria

- [ ] Requests exceeding the configured rate return HTTP 429 with `{ error: "Rate limit exceeded" }`
- [ ] Rate limit headers included in responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Webhook routes are exempt from rate limiting
- [ ] Health check endpoint is exempt from rate limiting
- [ ] Authenticated users are identified by Clerk userId; anonymous by IP
- [ ] KV TTL ensures stale counters are garbage collected
- [ ] PlatformConfig key `rateLimit.enabled` can disable rate limiting globally

---

## Task 6.2: API Key Management for External Integrations

### Problem

External services (webhooks, partner integrations) currently have no programmatic API access. All routes require Clerk session auth, which is browser-only. If Blipp ever needs machine-to-machine API access (e.g., a partner feeds system, CI/CD health checks, external monitoring), there is no mechanism.

### Approach

Create an API key model and middleware. API keys are scoped to specific operations and are a secondary auth path alongside Clerk sessions. Admin-managed via the admin dashboard.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `ApiKey` model |
| `worker/middleware/api-key.ts` | **Create** | API key authentication middleware |
| `worker/routes/admin/api-keys.ts` | **Create** | Admin CRUD for API keys |
| `worker/routes/admin/index.ts` | Modify | Mount api-keys routes |

### Prisma Schema Addition

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  name        String                        // "Monitoring", "Partner Feed"
  keyHash     String    @unique             // SHA-256 hash of the key (never store plaintext)
  keyPrefix   String                        // First 8 chars for identification: "blp_abc1..."
  scopes      String[]                      // ["health:read", "feed:read", "admin:read"]
  userId      String                        // Admin who created it
  expiresAt   DateTime?                     // null = no expiry
  lastUsedAt  DateTime?
  revokedAt   DateTime?                     // Soft revoke
  createdAt   DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Key Format

Keys follow the pattern `blp_live_<32 random hex chars>` (total 42 chars). The plaintext is shown once at creation time and never stored. Only the SHA-256 hash is persisted.

### Middleware Pattern

```typescript
// worker/middleware/api-key.ts
// Checks for Authorization: Bearer blp_live_... header
// Falls through to Clerk auth if no API key present (dual auth strategy)
// Sets c.set("apiKeyScopes", scopes) if API key valid
```

### Scopes

| Scope | Grants Access To |
|-------|-----------------|
| `health:read` | `GET /api/health` (deep check) |
| `feed:read` | `GET /api/feed` |
| `admin:read` | `GET /api/admin/*` |
| `admin:write` | `POST/PATCH/DELETE /api/admin/*` |
| `webhooks:send` | Incoming webhook delivery |

### Acceptance Criteria

- [ ] API keys are generated with cryptographically random bytes via `crypto.getRandomValues()`
- [ ] Only the SHA-256 hash is stored in the database; plaintext shown once at creation
- [ ] Keys can be scoped to specific operations
- [ ] Keys can be revoked (soft delete via `revokedAt`)
- [ ] Keys have optional expiration dates
- [ ] `lastUsedAt` is updated on each use (fire-and-forget via `waitUntil`)
- [ ] Admin UI for create, list, revoke API keys
- [ ] Revoked or expired keys return 401

---

## Task 6.3: Audit Logging (Admin Actions)

### Problem

Admin actions (config changes, user tier changes, plan CRUD, pipeline triggers) are not recorded. `PlatformConfig.updatedBy` stores the last editor but no history. There is no way to answer "who changed this setting and when?"

### Approach

Create an `AuditLog` model and a reusable helper function that admin route handlers call after mutating operations. This is not automatic middleware — admin routes explicitly call `writeAuditLog()` after successful mutations to capture before/after state.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `AuditLog` model |
| `worker/lib/audit-log.ts` | **Create** | `writeAuditLog()` helper |
| `worker/routes/admin/config.ts` | Modify | Add audit logging to PATCH/PUT handlers |
| `worker/routes/admin/users.ts` | Modify | Add audit logging to PATCH handler |
| `worker/routes/admin/plans.ts` | Modify | Add audit logging to POST/PATCH/DELETE |
| `worker/routes/admin/pipeline.ts` | Modify | Add audit logging to trigger/retry actions |
| `worker/routes/admin/ai-models.ts` | Modify | Add audit logging to model config changes |
| `worker/routes/admin/audit-log.ts` | **Create** | Admin endpoint to query audit log |
| `worker/routes/admin/index.ts` | Modify | Mount audit-log routes |

### Prisma Schema Addition

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String                        // Clerk userId of the admin
  actorEmail String?                       // Denormalized for readability
  action     String                        // "config.update", "user.plan.change", "plan.create"
  entityType String                        // "PlatformConfig", "User", "Plan", "PipelineJob"
  entityId   String                        // ID of the affected record
  before     Json?                         // Snapshot of relevant fields before change
  after      Json?                         // Snapshot of relevant fields after change
  metadata   Json?                         // Extra context: { ip, userAgent, reason }
  createdAt  DateTime @default(now())

  @@index([actorId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

### Helper Pattern

```typescript
// worker/lib/audit-log.ts
export interface AuditLogEntry {
  actorId: string;
  actorEmail?: string;
  action: string;        // Dot-separated: "config.update", "user.plan.change"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  prisma: any,
  entry: AuditLogEntry
): Promise<void> {
  // Fire-and-forget — audit log writes must not fail the request
  try {
    await prisma.auditLog.create({ data: entry });
  } catch (err) {
    console.error("[audit-log] Failed to write audit log", err);
  }
}
```

### Action Taxonomy

| Action | Entity Type | Trigger |
|--------|-------------|---------|
| `config.update` | PlatformConfig | PATCH /admin/config/:key |
| `config.tiers.update` | PlatformConfig | PUT /admin/config/tiers/duration |
| `feature.toggle` | PlatformConfig | PUT /admin/config/features/:id |
| `user.plan.change` | User | PATCH /admin/users/:id (planId change) |
| `user.admin.toggle` | User | PATCH /admin/users/:id (isAdmin change) |
| `plan.create` | Plan | POST /admin/plans |
| `plan.update` | Plan | PATCH /admin/plans/:id |
| `plan.delete` | Plan | DELETE /admin/plans/:id |
| `pipeline.trigger` | PipelineJob | POST /admin/pipeline/trigger/* |
| `pipeline.retry` | PipelineJob | POST /admin/pipeline/jobs/:id/retry |
| `model.config.update` | AiModel | PATCH /admin/ai-models/* |

### Admin Query Endpoint

```
GET /api/admin/audit-log?page=1&pageSize=50&entityType=User&actorId=...&from=...&to=...
```

Returns paginated audit log entries with standard `parsePagination` / `paginatedResponse` helpers.

### Acceptance Criteria

- [ ] All admin mutation endpoints write an audit log entry with before/after state
- [ ] Audit log entries are queryable by actor, entity type, entity ID, and date range
- [ ] Audit log writes are fire-and-forget (do not fail the parent request)
- [ ] Audit log entries include the admin's Clerk userId and email
- [ ] Admin dashboard has an audit log viewer (at minimum, an API endpoint; frontend page is optional)
- [ ] Old audit log entries are not automatically deleted (retention policy is a future task)

---

## Task 6.4: User Data Export / Deletion (GDPR)

### Problem

No GDPR compliance endpoints exist. The Clerk `user.deleted` webhook deletes the DB user record (which cascades to most child records) but does not clean up R2 artifacts (work products, clips, briefing audio). There is no data export capability.

### Approach

Add two endpoints to the user-facing API:

1. **`GET /api/me/export`** — Generates a JSON archive of all user data (GDPR data portability, Article 20).
2. **`DELETE /api/me`** — Deletes the user account and all associated data including R2 artifacts (GDPR right to erasure, Article 17).

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/routes/me.ts` | Modify | Add `/export` and `DELETE /` endpoints |
| `worker/lib/user-data.ts` | **Create** | Data export and R2 cleanup logic |

### Data Export Shape

```typescript
// GET /api/me/export — returns JSON
interface UserDataExport {
  exportedAt: string;                       // ISO timestamp
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    plan: { name: string; slug: string };
  };
  subscriptions: Array<{
    podcastTitle: string;
    durationTier: number;
    subscribedAt: string;
  }>;
  feedItems: Array<{
    episodeTitle: string;
    podcastTitle: string;
    status: string;
    listened: boolean;
    listenedAt: string | null;
    createdAt: string;
  }>;
  briefingRequests: Array<{
    status: string;
    targetMinutes: number;
    createdAt: string;
  }>;
}
```

### Deletion Flow

```
DELETE /api/me
  1. Verify authenticated user
  2. Fetch all R2 keys associated with the user:
     - Briefing audio: wp/briefing/{userId}/*
     - Any user-scoped work products
  3. Delete R2 objects (batch delete, up to 1000 per call)
  4. Delete Stripe customer (if stripeCustomerId exists)
     - stripe.customers.del(stripeCustomerId)
  5. Delete Clerk user
     - clerk.users.deleteUser(clerkId)
  6. Delete DB user record (cascades to subscriptions, feed items, briefings, requests)
  7. Return 204 No Content
```

### R2 Cleanup

R2 doesn't support prefix-based deletion natively. Use `r2.list({ prefix })` to enumerate objects, then `r2.delete()` each. For users with many briefings, this may need to be chunked.

```typescript
async function deleteR2ByPrefix(r2: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listed = await r2.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map(o => o.key);
    if (keys.length > 0) {
      await Promise.all(keys.map(k => r2.delete(k)));
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}
```

### Safety Measures

- Require re-authentication or confirmation token in the DELETE request body: `{ confirm: "DELETE" }`
- Rate limit DELETE /api/me to 1 request per hour per user
- Write an audit log entry before deletion (actorId = self, action = "user.self.delete")
- Log the deletion event for compliance records (the audit log entry persists after user deletion since AuditLog has no FK to User)

### Acceptance Criteria

- [ ] `GET /api/me/export` returns a complete JSON archive of the user's data
- [ ] `DELETE /api/me` deletes all DB records, R2 artifacts, Stripe customer, and Clerk user
- [ ] Deletion requires `{ confirm: "DELETE" }` in the request body
- [ ] Deletion is rate-limited to prevent abuse
- [ ] An audit log entry is created before deletion begins
- [ ] Cascade deletes remove subscriptions, feed items, briefings, and briefing requests
- [ ] R2 objects with the user's prefix are enumerated and deleted
- [ ] Response is 204 No Content on success
- [ ] If Stripe/Clerk cleanup fails, the DB deletion still proceeds (best-effort external cleanup)

---

## Task 6.5: Health Check Endpoints

### Problem

The current `/api/health` endpoint returns `{ status: "ok" }` unconditionally. It doesn't verify database connectivity, R2 availability, or queue health. External monitoring services would always see "healthy" even when the system is down.

### Approach

Enhance the health endpoint with deep checks. Keep the existing shallow check fast (for load balancer liveness probes) and add a deep check endpoint.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/index.ts` | Modify | Replace shallow health check with new handler |
| `worker/lib/health.ts` | **Create** | Health check logic with component checks |

### Endpoint Design

**`GET /api/health`** (shallow — no auth, no middleware)
- Returns immediately with `{ status: "ok" }` and 200.
- Used by Cloudflare load balancers and uptime monitors.
- Must execute before Prisma middleware (already the case in `worker/index.ts`).

**`GET /api/health/deep`** (deep — no auth required, but behind rate limiting)
- Checks each component and returns aggregate status.
- Returns 200 if all components healthy, 503 if any critical component is degraded.

### Deep Health Check Components

```typescript
interface HealthComponent {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  message?: string;
}

interface DeepHealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version?: string;             // Worker deployment version if available
  components: HealthComponent[];
}
```

| Component | Check | Healthy | Degraded | Unhealthy |
|-----------|-------|---------|----------|-----------|
| **Database** | `SELECT 1` via Prisma `$queryRaw` | < 1000ms | 1000-5000ms | > 5000ms or error |
| **R2** | `r2.head("health-check")` (pre-created sentinel object) | < 500ms | 500-2000ms | > 2000ms or error |
| **Queue** | Verify binding exists (`typeof env.ORCHESTRATOR_QUEUE.send === 'function'`) | Binding exists | -- | Binding missing |
| **Config** | Read `PlatformConfig` count | > 0 rows | 0 rows | Error |

### Implementation Pattern

```typescript
// worker/lib/health.ts
export async function deepHealthCheck(env: Env): Promise<DeepHealthResponse> {
  const components: HealthComponent[] = [];

  // DB check
  const dbStart = Date.now();
  try {
    const prisma = createPrismaClient(env.HYPERDRIVE);
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      const latency = Date.now() - dbStart;
      components.push({
        name: "database",
        status: latency > 5000 ? "unhealthy" : latency > 1000 ? "degraded" : "healthy",
        latencyMs: latency,
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    components.push({
      name: "database",
      status: "unhealthy",
      latencyMs: Date.now() - dbStart,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // R2 check
  const r2Start = Date.now();
  try {
    await env.R2.head("_health-check");
    const latency = Date.now() - r2Start;
    components.push({
      name: "r2",
      status: latency > 2000 ? "degraded" : "healthy",
      latencyMs: latency,
    });
  } catch (err) {
    components.push({
      name: "r2",
      status: "unhealthy",
      latencyMs: Date.now() - r2Start,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // Queue binding check (no way to test send without actually sending)
  components.push({
    name: "queues",
    status: typeof env.ORCHESTRATOR_QUEUE?.send === "function" ? "healthy" : "unhealthy",
    latencyMs: 0,
  });

  // Aggregate
  const hasUnhealthy = components.some(c => c.status === "unhealthy");
  const hasDegraded = components.some(c => c.status === "degraded");

  return {
    status: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    components,
  };
}
```

### Mounting

The deep health check must create its own Prisma client (it runs before the Prisma middleware). Mount it in `worker/index.ts` alongside the existing shallow check:

```typescript
app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

app.get("/api/health/deep", async (c) => {
  const result = await deepHealthCheck(c.env);
  const status = result.status === "healthy" ? 200 : 503;
  return c.json(result, status);
});
```

### Acceptance Criteria

- [ ] `GET /api/health` returns 200 with `{ status: "ok" }` in < 10ms (no DB call)
- [ ] `GET /api/health/deep` checks database, R2, and queue bindings
- [ ] Deep health returns 503 when any critical component is unhealthy
- [ ] Each component reports latency in milliseconds
- [ ] Deep health check creates and cleans up its own Prisma client
- [ ] Deep health check is rate-limited (10 requests/minute) to prevent abuse
- [ ] Neither health endpoint requires authentication

---

## Task 6.6: Automated Backup Verification

### Problem

No backup strategy is documented. Neon provides automatic backups on paid plans (point-in-time recovery with configurable retention), but there is no verification that backups work or alerting when they fail.

### Approach

This task is primarily operational (not code-heavy). Implement a scheduled backup verification job and admin visibility into backup status.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/lib/backup-verify.ts` | **Create** | Backup verification logic via Neon API |
| `worker/queues/index.ts` | Modify | Add backup check to scheduled handler (daily) |
| `worker/routes/admin/dashboard.ts` | Modify | Add backup status to health overview |
| `worker/types.ts` | Modify | Add `NEON_API_KEY` secret binding |

### Neon API Integration

Neon's management API (`https://console.neon.tech/api/v2`) provides endpoints for:
- Listing branches (which include backup/recovery points)
- Checking project status
- Viewing operations history

```typescript
// worker/lib/backup-verify.ts
export async function verifyNeonBackup(apiKey: string, projectId: string): Promise<{
  status: "ok" | "warning" | "error";
  lastBackupAt: string | null;
  message: string;
}> {
  const resp = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}/operations?limit=10`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (!resp.ok) {
    return { status: "error", lastBackupAt: null, message: `Neon API error: ${resp.status}` };
  }

  const { operations } = await resp.json();
  // Check for recent successful backup operations
  // Neon creates automatic WAL backups; look for the latest
  // ...
}
```

### Scheduled Check

Add to the existing `scheduled()` handler in `worker/queues/index.ts`:

```typescript
// Run once daily: check if the last Neon backup is within 24 hours
const lastBackupCheck = await getConfig<string | null>(prisma, "backup.lastCheckedAt", null);
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
if (!lastBackupCheck || new Date(lastBackupCheck) < oneDayAgo) {
  const result = await verifyNeonBackup(env.NEON_API_KEY, env.NEON_PROJECT_ID);
  await prisma.platformConfig.upsert({
    where: { key: "backup.status" },
    update: { value: result },
    create: { key: "backup.status", value: result, description: "Last backup verification result" },
  });
  // Store check timestamp
  await prisma.platformConfig.upsert({
    where: { key: "backup.lastCheckedAt" },
    update: { value: new Date().toISOString() },
    create: { key: "backup.lastCheckedAt", value: new Date().toISOString() },
  });
}
```

### R2 Backup Strategy

R2 objects are durable by default (11 nines durability), but accidental deletion has no recovery path. Consider:
1. Enable R2 object versioning on the bucket (Cloudflare dashboard setting, not code).
2. Document that R2 versioning is the backup strategy for audio assets.

### Acceptance Criteria

- [ ] Daily scheduled check verifies Neon backup recency via the Neon API
- [ ] Backup status is stored in PlatformConfig and visible on the admin dashboard
- [ ] Admin dashboard health overview includes backup age (e.g., "Last backup: 3 hours ago")
- [ ] If backup is older than 24 hours, status shows "warning"
- [ ] If Neon API is unreachable, status shows "error" with message
- [ ] R2 object versioning is documented as the audio asset backup strategy
- [ ] `NEON_API_KEY` and `NEON_PROJECT_ID` are added to Env type and wrangler secrets

---

## Task 6.7: Cost Alerting Thresholds

### Problem

AI pipeline costs are tracked per-step (`PipelineStep.cost`) and visible on the admin dashboard, but there is no alerting when costs exceed thresholds. A runaway pipeline or pricing change could burn through budget unnoticed.

### Approach

Implement threshold-based cost monitoring that runs as part of the existing scheduled handler. When thresholds are exceeded, write an alert to PlatformConfig (visible on admin dashboard) and optionally send a webhook notification.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/lib/cost-alerts.ts` | **Create** | Cost aggregation and threshold checking |
| `worker/queues/index.ts` | Modify | Add cost check to scheduled handler |
| `worker/routes/admin/dashboard.ts` | Modify | Surface active cost alerts |

### PlatformConfig Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cost.alert.dailyThreshold` | `number` | `5.00` | Daily spend threshold in USD |
| `cost.alert.weeklyThreshold` | `number` | `25.00` | Weekly spend threshold in USD |
| `cost.alert.webhookUrl` | `string \| null` | `null` | Webhook URL for alert delivery |
| `cost.alert.active` | `CostAlert[]` | `[]` | Currently active cost alerts |

### Cost Alert Logic

```typescript
// worker/lib/cost-alerts.ts
interface CostAlert {
  type: "daily" | "weekly";
  threshold: number;
  actual: number;
  triggeredAt: string;
  acknowledged: boolean;
}

export async function checkCostThresholds(prisma: any): Promise<CostAlert[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

  // Aggregate costs from PipelineStep
  const [dailyCost, weeklyCost] = await Promise.all([
    prisma.pipelineStep.aggregate({
      _sum: { cost: true },
      where: { createdAt: { gte: todayStart }, cost: { not: null } },
    }),
    prisma.pipelineStep.aggregate({
      _sum: { cost: true },
      where: { createdAt: { gte: weekStart }, cost: { not: null } },
    }),
  ]);

  const dailySpend = dailyCost._sum.cost ?? 0;
  const weeklySpend = weeklyCost._sum.cost ?? 0;

  const dailyThreshold = await getConfig(prisma, "cost.alert.dailyThreshold", 5.0);
  const weeklyThreshold = await getConfig(prisma, "cost.alert.weeklyThreshold", 25.0);

  const alerts: CostAlert[] = [];
  if (dailySpend >= dailyThreshold) {
    alerts.push({
      type: "daily",
      threshold: dailyThreshold,
      actual: Math.round(dailySpend * 100) / 100,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
  }
  if (weeklySpend >= weeklyThreshold) {
    alerts.push({
      type: "weekly",
      threshold: weeklyThreshold,
      actual: Math.round(weeklySpend * 100) / 100,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
  }

  return alerts;
}
```

### Webhook Notification

When alerts fire and a webhook URL is configured, POST a payload:

```json
{
  "type": "cost_alert",
  "alerts": [
    { "type": "daily", "threshold": 5.00, "actual": 7.23, "triggeredAt": "..." }
  ],
  "dashboardUrl": "https://blipp.app/admin"
}
```

This can integrate with Slack (incoming webhook URL), Discord, PagerDuty, or any HTTP endpoint.

### Admin Dashboard Integration

The existing `/api/admin/dashboard/costs` endpoint already calculates `todaySpend`. Extend it to include alert status:

```typescript
// Add to the costs response
alerts: await getConfig(prisma, "cost.alert.active", []),
```

### Acceptance Criteria

- [ ] Cost thresholds are configurable via PlatformConfig (daily and weekly)
- [ ] Scheduled handler checks cost thresholds on each run
- [ ] Active alerts are stored in PlatformConfig and surfaced on the admin dashboard
- [ ] Optional webhook notification when thresholds are breached
- [ ] Alerts are not re-fired for the same period (deduplication by day/week)
- [ ] Admin can acknowledge alerts (clears the active alert)
- [ ] Dashboard cost card shows alert indicator when thresholds are exceeded

---

## Task 6.8: Feature Flags System

### Problem

The current feature flag implementation (`PlatformConfig` keys with `feature.*` prefix) stores `enabled`, `rolloutPercentage`, and `planAvailability` but has no runtime evaluation logic. There is no middleware that checks these flags, no user-level targeting, and no way to gradually roll out features.

### Approach

Build a lightweight feature flag evaluation system on top of the existing PlatformConfig storage. No external service (LaunchDarkly, etc.) — keep it in-app for simplicity.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/lib/feature-flags.ts` | **Create** | Flag evaluation engine |
| `worker/routes/admin/config.ts` | Modify | Enhance feature flag CRUD with new fields |
| `worker/routes/me.ts` | Modify | Include active feature flags in user response |

### Feature Flag Schema (PlatformConfig value)

```typescript
interface FeatureFlag {
  enabled: boolean;                         // Global kill switch
  rolloutPercentage: number;                // 0-100, percentage of users who see the feature
  planAvailability: string[];               // Plan slugs: ["pro", "pro-plus"]
  userAllowlist: string[];                  // Clerk userIds that always get the feature
  userDenylist: string[];                   // Clerk userIds that never get the feature
  startDate?: string;                       // ISO date — feature activates after this date
  endDate?: string;                         // ISO date — feature deactivates after this date
}
```

### Evaluation Logic

```typescript
// worker/lib/feature-flags.ts
export async function isFeatureEnabled(
  prisma: any,
  featureName: string,
  context: { userId?: string; planSlug?: string }
): Promise<boolean> {
  const flag = await getConfig<FeatureFlag | null>(
    prisma,
    `feature.${featureName}`,
    null
  );

  if (!flag || !flag.enabled) return false;

  // Denylist takes priority
  if (context.userId && flag.userDenylist?.includes(context.userId)) return false;

  // Allowlist bypass
  if (context.userId && flag.userAllowlist?.includes(context.userId)) return true;

  // Date window check
  const now = new Date();
  if (flag.startDate && now < new Date(flag.startDate)) return false;
  if (flag.endDate && now > new Date(flag.endDate)) return false;

  // Plan availability check
  if (flag.planAvailability?.length > 0 && context.planSlug) {
    if (!flag.planAvailability.includes(context.planSlug)) return false;
  }

  // Rollout percentage (deterministic hash based on userId + featureName)
  if (flag.rolloutPercentage < 100 && context.userId) {
    const hash = await deterministicHash(`${context.userId}:${featureName}`);
    const bucket = hash % 100;
    if (bucket >= flag.rolloutPercentage) return false;
  }

  return true;
}

// Deterministic hash using Web Crypto (available in Workers)
async function deterministicHash(input: string): Promise<number> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const view = new DataView(hashBuffer);
  return view.getUint32(0) % 10000; // 0-9999 for 0.01% granularity
}
```

### User-Facing Flags

Add active flags to the `GET /api/me` response so the frontend can conditionally render features:

```typescript
// In worker/routes/me.ts, after fetching user
const flags = await getActiveFlags(prisma, {
  userId: user.clerkId,
  planSlug: user.plan.slug,
});
// flags = { "briefing-assembly": true, "research-mode": false, ... }
```

### Acceptance Criteria

- [ ] `isFeatureEnabled()` evaluates flags based on: global toggle, plan, rollout %, allowlist/denylist, date window
- [ ] Rollout percentage uses a deterministic hash (same user always gets the same result)
- [ ] Feature flags are cached via the existing PlatformConfig 60s TTL cache
- [ ] `GET /api/me` response includes the user's resolved feature flags
- [ ] Admin can set rollout percentage, plan availability, and user allow/denylist via existing config UI
- [ ] Feature flags are evaluated server-side (frontend reads resolved flags, does not evaluate)
- [ ] Web Crypto API is used for hashing (compatible with Workers runtime)

---

## Task 6.9: Usage Metering & Limits Enforcement

### Problem

Plan limits exist in the schema (`briefingsPerWeek`, `maxDurationMinutes`, `maxPodcastSubscriptions`) and `checkWeeklyBriefingLimit()` is called in subscription and on-demand routes. But:

1. Users cannot see their current usage vs limits.
2. No usage tracking endpoint for the frontend to display.
3. The weekly briefing count uses `FeedItem.createdAt` which may not align with the billing period.
4. No proactive notification when approaching limits (e.g., "2 briefings remaining this week").

### Approach

Add a usage metering endpoint and tighten the enforcement points.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `worker/routes/me.ts` | Modify | Add `GET /usage` endpoint |
| `worker/lib/plan-limits.ts` | Modify | Add `getUserUsage()` function |
| `src/types/user.ts` | **Create** | Shared usage response type |

### Usage Endpoint

```
GET /api/me/usage
```

Response:

```typescript
interface UsageResponse {
  period: {
    start: string;            // ISO date — start of current 7-day window
    end: string;              // ISO date — end of current 7-day window
    daysRemaining: number;
  };
  briefings: {
    used: number;
    limit: number | null;     // null = unlimited
    remaining: number | null; // null = unlimited
    percentUsed: number;      // 0-100
  };
  subscriptions: {
    used: number;
    limit: number | null;
    remaining: number | null;
    percentUsed: number;
  };
  maxDurationMinutes: number;
  plan: {
    name: string;
    slug: string;
  };
}
```

### Implementation

```typescript
// worker/lib/plan-limits.ts — add getUserUsage()
export async function getUserUsage(
  userId: string,
  prisma: any
): Promise<UsageData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { plan: true },
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [briefingCount, subscriptionCount] = await Promise.all([
    prisma.feedItem.count({
      where: { userId, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.subscription.count({ where: { userId } }),
  ]);

  const plan = user.plan;
  return {
    period: {
      start: oneWeekAgo.toISOString(),
      end: new Date().toISOString(),
      daysRemaining: 7, // Rolling window, always 7
    },
    briefings: {
      used: briefingCount,
      limit: plan.briefingsPerWeek,
      remaining: plan.briefingsPerWeek !== null
        ? Math.max(0, plan.briefingsPerWeek - briefingCount)
        : null,
      percentUsed: plan.briefingsPerWeek !== null
        ? Math.round((briefingCount / plan.briefingsPerWeek) * 100)
        : 0,
    },
    subscriptions: {
      used: subscriptionCount,
      limit: plan.maxPodcastSubscriptions,
      remaining: plan.maxPodcastSubscriptions !== null
        ? Math.max(0, plan.maxPodcastSubscriptions - subscriptionCount)
        : null,
      percentUsed: plan.maxPodcastSubscriptions !== null
        ? Math.round((subscriptionCount / plan.maxPodcastSubscriptions) * 100)
        : 0,
    },
    maxDurationMinutes: plan.maxDurationMinutes,
    plan: { name: plan.name, slug: plan.slug },
  };
}
```

### Enforcement Tightening

The existing `checkWeeklyBriefingLimit()` in `worker/lib/plan-limits.ts` is already called in the subscribe and on-demand routes. Verify and tighten:

1. **Subscribe route** (`worker/routes/podcasts.ts`): Already calls `checkWeeklyBriefingLimit` — verify it's called before creating the subscription and feed items.
2. **On-demand route** (`worker/routes/briefings.ts`): Already calls `checkWeeklyBriefingLimit` — verify it blocks the briefing request creation.
3. **Feed refresh** (automatic pipeline): When new episodes arrive for a subscription, new feed items are created. These should count toward the weekly limit but should NOT be blocked (the user subscribed, they expect briefings). The limit should only gate new subscriptions and on-demand requests.

### Admin Usage Dashboard

Add a per-user usage view to the admin users detail endpoint:

```
GET /api/admin/users/:id
// Include in response:
{
  usage: {
    briefingsThisWeek: number,
    briefingLimit: number | null,
    subscriptionCount: number,
    subscriptionLimit: number | null,
  }
}
```

### Acceptance Criteria

- [ ] `GET /api/me/usage` returns current period usage, limits, and remaining counts
- [ ] Usage counts align with `checkWeeklyBriefingLimit()` logic (7-day rolling window)
- [ ] Unlimited limits are represented as `null` (not Infinity or -1)
- [ ] Usage percentages are calculated correctly (0% for unlimited plans)
- [ ] Admin user detail endpoint includes usage data
- [ ] Frontend can display usage bars/indicators using the response data
- [ ] Usage endpoint responds in < 100ms (two simple count queries)
- [ ] Plan limit enforcement is verified in subscribe and on-demand routes

---

## Implementation Order & Dependencies

```
                    6.5 Health Checks (no deps)
                    6.6 Backup Verify (no deps)
                    6.9 Usage Metering (no deps)
                          |
    6.1 Rate Limiting ----+---- 6.3 Audit Logging
          |                           |
    6.2 API Keys                6.7 Cost Alerts
          |                           |
    6.8 Feature Flags           6.4 GDPR Export/Delete
```

### Recommended Execution Order

| Step | Tasks | Rationale |
|------|-------|-----------|
| 1 | 6.5, 6.9 | Quick wins, no schema changes (6.5) or simple additions (6.9). Unblocks monitoring and frontend usage display. |
| 2 | 6.3, 6.1 | Schema migration (AuditLog model). Rate limiting is the #1 operational gap. |
| 3 | 6.7, 6.8 | Build on PlatformConfig patterns. Cost alerts integrate with scheduled handler. Feature flags extend existing config UI. |
| 4 | 6.4, 6.6 | GDPR endpoints are self-contained. Backup verification depends on Neon API key being configured. |
| 5 | 6.2 | API key management is lowest priority — needed only when external integrations exist. |

### Schema Migrations Required

This phase adds 2 new Prisma models:
1. `AuditLog` (task 6.3)
2. `ApiKey` (task 6.2)

And 1 new Env binding:
1. `RATE_LIMIT_KV: KVNamespace` (task 6.1)
2. `NEON_API_KEY: string` (task 6.6, optional)
3. `NEON_PROJECT_ID: string` (task 6.6, optional)

Run `prisma db push` after adding both models. In production, use `prisma migrate dev` with proper migration files.

---

## Cloudflare Workers-Specific Considerations

| Concern | Approach |
|---------|----------|
| **No persistent state** | All counters must use KV, Durable Objects, or database. In-memory counters reset on every request. |
| **No Node.js crypto** | Use Web Crypto API (`crypto.subtle.digest`, `crypto.getRandomValues`). Available in Workers runtime. |
| **30s CPU limit** (fetch) | Health checks and usage queries must complete quickly. Deep health check timeout at 5s per component. |
| **128MB memory** | Data export for large users must stream or paginate, not load everything into memory. |
| **KV eventual consistency** | Rate limit counters may have a ~60s window where a user slightly exceeds the limit. Acceptable for abuse prevention. |
| **No cron sub-minute** | Scheduled handler runs at most every minute. Cost checks and backup verification piggback on the existing cron. |
| **R2 batch operations** | R2 does not support batch delete. GDPR deletion must iterate and delete objects one at a time (or use `Promise.all` for parallel deletion). |
| **Queue send is async** | Audit log writes use fire-and-forget `waitUntil` to avoid blocking the response. |

---

## Testing Strategy

| Task | Test Approach |
|------|---------------|
| 6.1 Rate limiting | Unit test middleware with mock KV. Integration test: send N+1 requests, verify 429 on last. |
| 6.2 API keys | Unit test middleware with mock DB. Test: valid key, expired key, revoked key, invalid scope. |
| 6.3 Audit logging | Unit test `writeAuditLog()` with mock Prisma. Verify admin routes call it on mutations. |
| 6.4 GDPR | Integration test DELETE /api/me: verify DB cascade, R2 cleanup, Stripe/Clerk calls. |
| 6.5 Health checks | Unit test `deepHealthCheck()` with mock env. Test: all healthy, DB down, R2 down. |
| 6.6 Backup verify | Unit test with mock Neon API response. Test: recent backup, stale backup, API error. |
| 6.7 Cost alerts | Unit test `checkCostThresholds()` with mock Prisma aggregate. Test: under/over threshold. |
| 6.8 Feature flags | Unit test `isFeatureEnabled()`: flag off, rollout 50%, plan restriction, allow/denylist, date window. |
| 6.9 Usage metering | Unit test `getUserUsage()`. Integration test GET /api/me/usage response shape. |

Use existing test patterns from `tests/helpers/mocks.ts`: `createMockPrisma()`, `createMockEnv()`, `createMockContext()`.
