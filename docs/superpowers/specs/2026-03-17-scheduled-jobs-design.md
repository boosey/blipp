# Scheduled Jobs — Design Spec
**Date:** 2026-03-17
**Status:** Approved

## Overview

Refactor the monolithic `scheduled()` handler into 5 independent named jobs, each with its own enable toggle, configurable run interval, persistent run history, and on-demand per-run logs. A new admin page (System → Scheduled Jobs) provides a master/detail UI to manage and observe all jobs.

---

## 1. Job Definitions

| jobKey | What it does | Default interval |
|--------|-------------|-----------------|
| `pipeline-trigger` | Enqueues feed refresh cycle (gated by `pipeline.enabled`) | 15 min |
| `monitoring` | Refreshes AI model pricing + checks cost threshold alerts | 60 min |
| `user-lifecycle` | Checks for expired free trials | 360 min (6h) |
| `data-retention` | Counts/deletes aged episodes, stale podcasts, old briefing requests | 1440 min (24h) |
| `recommendations` | Rebuilds podcast recommendation profiles for all users | 10080 min (7d) |

---

## 2. Data Model

### New Prisma models

```prisma
model CronRun {
  id          String        @id @default(cuid())
  jobKey      String
  startedAt   DateTime      @default(now())
  completedAt DateTime?
  durationMs  Int?
  status      CronRunStatus @default(IN_PROGRESS)
  result      Json?         // structured output: counts, summaries
  errorMessage String?

  logs CronRunLog[]

  @@index([jobKey, startedAt(sort: Desc)])
}

enum CronRunStatus {
  IN_PROGRESS
  SUCCESS
  FAILED
  SKIPPED
}

model CronRunLog {
  id        String           @id @default(cuid())
  runId     String
  run       CronRun          @relation(fields: [runId], references: [id], onDelete: Cascade)
  level     CronRunLogLevel
  message   String
  data      Json?
  timestamp DateTime         @default(now())

  @@index([runId, timestamp])
}

enum CronRunLogLevel {
  DEBUG
  INFO
  WARN
  ERROR
}
```

### PlatformConfig keys (per job)

| Key | Type | Description |
|-----|------|-------------|
| `cron.{jobKey}.enabled` | boolean | Whether this job runs (default: true) |
| `cron.{jobKey}.intervalMinutes` | number | Minimum minutes between runs |
| `cron.{jobKey}.lastRunAt` | ISO string | Timestamp of last execution |

Existing scattered `lastRunAt` keys (`pricing.lastRefreshedAt`, `requests.archiving.lastRunAt`, `recommendations.lastProfileRefresh`, `pipeline.lastAutoRunAt`) are migrated to the `cron.*` namespace during implementation.

---

## 3. Worker Refactor

### Heartbeat cron
`wrangler.jsonc` cron changes from `*/30 * * * *` to `*/5 * * * *`. All jobs share this single heartbeat; each checks its own interval independently.

### Job runner contract

```typescript
async function runJob(
  jobKey: string,
  prisma: PrismaClient,
  intervalMinutes: number,
  execute: (log: CronLogger) => Promise<Record<string, unknown>>
): Promise<void>
```

Each `runJob` call:
1. Reads `cron.{jobKey}.enabled` — returns early if false (no CronRun created)
2. Reads `cron.{jobKey}.lastRunAt` + `intervalMinutes` — if interval not elapsed, creates a `SKIPPED` CronRun and returns
3. Creates a `CronRun` record with status `IN_PROGRESS`
4. Calls `execute(log)` — job logic emits log lines via `log.info(...)` → persisted to `CronRunLog`
5. On success: updates CronRun with `SUCCESS`, result object, durationMs
6. On throw: updates CronRun with `FAILED`, errorMessage
7. Writes `cron.{jobKey}.lastRunAt` = now

### Job functions (each in its own file under `worker/lib/cron/`)

- `worker/lib/cron/pipeline-trigger.ts` — feed refresh enqueue; retains internal `pipeline.enabled` check
- `worker/lib/cron/monitoring.ts` — pricing refresh + cost alerts
- `worker/lib/cron/user-lifecycle.ts` — trial expiration check
- `worker/lib/cron/data-retention.ts` — episode aging + catalog cleanup + request archiving
- `worker/lib/cron/recommendations.ts` — recommendation profile rebuild

`worker/queues/index.ts` `scheduled()` becomes a thin dispatcher that calls each job function via `runJob`.

---

## 4. API Routes

New file: `worker/routes/admin/cron-jobs.ts`, mounted at `/api/admin/cron-jobs`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/cron-jobs` | All 5 jobs with config + most recent CronRun |
| `PATCH` | `/api/admin/cron-jobs/:jobKey` | Update `enabled` and/or `intervalMinutes` |
| `GET` | `/api/admin/cron-jobs/:jobKey/runs` | Paginated run history (newest first), no logs |
| `GET` | `/api/admin/cron-jobs/:jobKey/runs/:runId/logs` | All log lines for one run (on-demand) |

`GET /cron-jobs` merges hardcoded job definitions + live PlatformConfig + latest CronRun into a single response — page loads in one request.

Uses standard admin helpers: `parsePagination`, `paginatedResponse`, `requireAdmin`.

---

## 5. Frontend

**File:** `src/pages/admin/scheduled-jobs.tsx`
**Route:** `/admin/scheduled-jobs`
**Sidebar:** System group → "Scheduled Jobs" (`Clock` icon)

### Layout (master/detail split)

**Left panel (~240px fixed)**
- 5 job rows: status dot + name + last run relative time
- Active selection highlighted
- Status dot: green (last run SUCCESS), red (last run FAILED), grey (never run / disabled)

**Right panel (flex-1)**

Header row:
- Job name
- `enabled` toggle → `PATCH /cron-jobs/:jobKey`
- Interval dropdown (15m / 30m / 1h / 6h / 12h / 24h / 7d) → `PATCH /cron-jobs/:jobKey`
- Manual refresh button (re-fetches run history)

Run history list (newest first, paginated):
- Each row: timestamp, duration, status badge, result summary
- "Logs" button → fetches `/runs/:runId/logs` on click, expands inline log viewer below that row
- Log viewer: monospace, level-colored lines (DEBUG=grey, INFO=blue, WARN=yellow, ERROR=red), dismiss button

### Data fetching

| Data | Hook | Trigger |
|------|------|---------|
| Job list + config + last run | `useFetch('/api/admin/cron-jobs')` | Mount |
| Run history | `useFetch('/api/admin/cron-jobs/:jobKey/runs')` | Job selection change |
| Logs for a run | `useApiFetch` (manual) | "Logs" button click |

No automatic polling. Manual refresh button re-fetches run history for the selected job.

### Sidebar change

`admin-layout.tsx` System group gains one entry:
```typescript
{ path: "scheduled-jobs", label: "Scheduled Jobs", icon: Clock }
```

---

## 6. Out of Scope

- Manual "Run Now" trigger
- Per-run retry
- Email/webhook notifications on failure
- Recommendations management UI (handled by separate session)
- CronRun retention/cleanup (can be added later as a 6th job)
