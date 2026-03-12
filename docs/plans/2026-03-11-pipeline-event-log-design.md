# Pipeline Event Log — Design Spec

**Date:** 2026-03-11
**Branch:** `feat/pipeline-detail-ui`
**Status:** Approved

## Problem

When a request is expanded on the admin Requests page, each pipeline step shows metrics (duration, cost, tokens, status) but no narrative of what happened. Logging is ephemeral (`console.log` only). The `PipelineStep` model has unused `input`/`output` JSON fields and an unused `retryCount` field, but nothing is persisted. When steps fail, retry, or succeed through interesting paths (cache hits, fallback strategies, API retries), there's no way to understand what occurred.

## Solution

Add a persistent `PipelineEvent` model that queue handlers write to in real-time as they progress through each stage. Surface these events in the admin UI as a nested accordion under each pipeline step, with a two-tier log level system (INFO for operational overview, DEBUG for diagnostics).

## Data Model

### New Model: `PipelineEvent`

```prisma
model PipelineEvent {
  id        String   @id @default(cuid())
  stepId    String
  step      PipelineStep @relation(fields: [stepId], references: [id], onDelete: Cascade)
  level     PipelineEventLevel
  message   String
  data      Json?
  createdAt DateTime @default(now())

  @@index([stepId, createdAt])
}

enum PipelineEventLevel {
  DEBUG
  INFO
  WARN
  ERROR
}
```

- Cascade delete: cleaning up a `PipelineStep` cleans its events
- Composite index on `(stepId, createdAt)` supports the primary query pattern
- `data` is optional JSON for structured metadata — opaque to the UI (rendered as raw key-value pairs if present). Common keys include `tokens`, `bytes`, `model`, `source`, `count`, but no strict schema is enforced.
- `scripts/clean-pipeline.mjs` uses raw SQL deletes in explicit FK order (not Prisma cascades). Add `PipelineEvent` to the tables list, before `PipelineStep`.

### PipelineStep Relation

Add to existing `PipelineStep` model:

```prisma
events PipelineEvent[]
```

## Backend

### Event Writer Utility

New file: `worker/lib/pipeline-events.ts`

```typescript
writeEvent(prisma, stepId, level, message, data?)
```

Simple INSERT — no read-modify-write, no race conditions. Used directly in queue handlers with inline message strings. `writeEvent()` catches and swallows errors (logs to console) so event writes never break stage processing — logging should not cause pipeline failures.

### Queue Handler Instrumentation

Each of the 5 stage handlers gets ~5-12 `writeEvent()` calls at natural decision points:

| Stage | Example INFO Events | Example DEBUG Events |
|-------|--------------------|--------------------|
| **Transcription** | Cache check result, transcript source found/fallback, transcript saved | RSS episode count, audio URL, transcript format, word/segment counts, R2 key/size |
| **Distillation** | Cache check result, sending to LLM, API errors/retries, claims extracted, saved to R2 | Model name (runtime), token counts, response time |
| **Narrative** | Cache check result, reading claims, sending to LLM, narrative generated, clip created | Model name (runtime), word count, clip ID |
| **Audio** | Cache check result, reading narrative, calling TTS, audio generated, clip updated | Voice/model (runtime), duration, file size |
| **Assembly** | Loading jobs, linking briefings, marking feed items READY, request status update | Job count, briefing IDs, partial/full completion details |

**Log levels:**
- `INFO` — operational steps (what happened and why)
- `DEBUG` — diagnostics (URLs, byte sizes, parsed counts, model names)
- `WARN` — recoverable issues (retry attempts, fallbacks)
- `ERROR` — failures (API errors, max retries exceeded)

**Important:** All references to AI models use runtime values from `getModelConfig()` or API responses — never hardcoded model name strings.

### API Endpoint

`GET /api/admin/requests/:id` — response shape change:

```typescript
// StepProgress gains:
{
  stage, status, durationMs, cost, model, ...
  events: PipelineEventSummary[]  // NEW — ordered by createdAt
  workProducts: WorkProductSummary[]
}

interface PipelineEventSummary {
  id: string
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  message: string
  data?: Record<string, unknown>
  createdAt: string
}
```

Events are included in the existing detail query by adding to the `steps` include:

```typescript
steps: {
  orderBy: { createdAt: "asc" },
  include: {
    workProduct: { ... },
    events: { orderBy: { createdAt: "asc" } },  // NEW
  },
}
```

Expected volume is ~5-20 events per step, so no pagination or cap is needed.

**Type distinction:** `PipelineStep` is the DB-level type; `StepProgress` is the API response type. Events are added to `StepProgress` only.

## Frontend

### Requests Page (`src/pages/admin/requests.tsx`)

**Current behavior:** Expanding a step row shows work products directly.

**New behavior:** Expanding a step row reveals two sub-rows (nested accordion):

1. **Event Log** `(N events)` — expands to show timeline:
   - Left border colored by step status (green=completed, red=failed, blue=in-progress)
   - Each event line: `[timestamp] [color-coded message]`
     - `ERROR` = red
     - `WARN` = yellow/amber
     - `INFO` = gray (default) or green (when message indicates completion/success — e.g., "Saved", "Extracted", "Generated")
     - `DEBUG` = dim gray
   - DEBUG events hidden by default; toggle button "Show debug" reveals them
   - Auto-expanded for FAILED and IN_PROGRESS steps
   - Auto-collapsed for COMPLETED and SKIPPED steps

2. **Work Products** `(N items)` — existing work product expansion moves here, behavior unchanged

### Types (`src/types/admin.ts`)

Add `PipelineEventSummary` interface and add `events` field to `StepProgress`.

## Scope

### In scope
- New `PipelineEvent` model + Prisma migration
- `writeEvent()` utility in `worker/lib/pipeline-events.ts`
- Instrument all 5 stage handlers with inline event messages
- API endpoint returns events nested in steps
- Nested accordion UI with Event Log + Work Products sub-rows
- DEBUG/INFO toggle in UI
- Auto-expand failed/in-progress steps

### Not in scope
- Real-time polling/websocket (refresh to see new events)
- Event log retention/cleanup (events live as long as the step)
- Filtering/searching events across requests
- Modifying orchestrator state machine logic
