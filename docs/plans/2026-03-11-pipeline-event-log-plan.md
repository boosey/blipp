# Pipeline Event Log — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent pipeline event logging and surface it in the admin requests page as a nested accordion under each step.

**Architecture:** New `PipelineEvent` Prisma model written in real-time by queue handlers via a `writeEvent()` utility. Events are included in the existing request detail API response and rendered in the frontend as a nested accordion with two sub-rows (Event Log + Work Products) under each step.

**Tech Stack:** Prisma 7, Hono, React 19, Tailwind v4, Vitest

**Spec:** `docs/plans/2026-03-11-pipeline-event-log-design.md`

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Modify | `prisma/schema.prisma` | Add `PipelineEvent` model + `PipelineEventLevel` enum + relation on `PipelineStep` |
| Create | `worker/lib/pipeline-events.ts` | `writeEvent()` utility — fire-and-forget INSERT |
| Create | `worker/lib/__tests__/pipeline-events.test.ts` | Tests for `writeEvent()` |
| Modify | `worker/queues/transcription.ts` | Add `writeEvent()` calls at decision points |
| Modify | `worker/queues/distillation.ts` | Add `writeEvent()` calls at decision points |
| Modify | `worker/queues/narrative-generation.ts` | Add `writeEvent()` calls at decision points |
| Modify | `worker/queues/audio-generation.ts` | Add `writeEvent()` calls at decision points |
| Skip   | `worker/queues/briefing-assembly.ts` | Not instrumented — request-level, no PipelineStep |
| Modify | `src/types/admin.ts` | Add `PipelineEventSummary` interface, add `events` to `StepProgress` |
| Modify | `worker/routes/admin/requests.ts` | Include events in detail query, map to response |
| Modify | `worker/routes/admin/__tests__/requests.test.ts` | Test events in detail response |
| Modify | `src/pages/admin/requests.tsx` | Nested accordion: Event Log + Work Products sub-rows |
| Modify | `scripts/clean-pipeline.mjs` | Add `PipelineEvent` to cleanup tables |
| Modify | `tests/helpers/mocks.ts` | Add `pipelineEvent` to mock Prisma |

---

## Chunk 1: Data Model + Utility

### Task 1: Prisma Schema — PipelineEvent model

**Files:**
- Modify: `prisma/schema.prisma:265-287` (PipelineStep model) and end of file

- [ ] **Step 1: Add PipelineEventLevel enum and PipelineEvent model**

Add after the `PipelineStepStatus` enum (line 295):

```prisma
enum PipelineEventLevel {
  DEBUG
  INFO
  WARN
  ERROR
}
```

Add after the `WorkProduct` model (before `PlatformConfig`):

```prisma
model PipelineEvent {
  id        String             @id @default(cuid())
  stepId    String
  step      PipelineStep       @relation(fields: [stepId], references: [id], onDelete: Cascade)
  level     PipelineEventLevel
  message   String
  data      Json?
  createdAt DateTime           @default(now())

  @@index([stepId, createdAt])
}
```

- [ ] **Step 2: Add events relation to PipelineStep**

In the `PipelineStep` model (line 265), add after the `workProduct` relation (line 286):

```prisma
  events      PipelineEvent[]
```

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`

Then verify the barrel export at `src/generated/prisma/index.ts` still works. If the `enums` re-export fails, update it to include `PipelineEventLevel`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/generated/prisma/index.ts
git commit -m "feat: add PipelineEvent model and PipelineEventLevel enum"
```

---

### Task 2: writeEvent() utility

**Files:**
- Create: `worker/lib/pipeline-events.ts`
- Create: `worker/lib/__tests__/pipeline-events.test.ts`

- [ ] **Step 1: Write the test**

Create `worker/lib/__tests__/pipeline-events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockPrisma = {
  pipelineEvent: { create: mockCreate },
};

// Import after mocks — no external deps to mock
const { writeEvent } = await import("../pipeline-events");

describe("writeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "evt_1" });
  });

  it("inserts an event with correct fields", async () => {
    await writeEvent(mockPrisma, "step_1", "INFO", "Cache miss");

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        stepId: "step_1",
        level: "INFO",
        message: "Cache miss",
        data: undefined,
      },
    });
  });

  it("passes optional data field", async () => {
    await writeEvent(mockPrisma, "step_1", "DEBUG", "Fetched transcript", { bytes: 4532 });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        stepId: "step_1",
        level: "DEBUG",
        message: "Fetched transcript",
        data: { bytes: 4532 },
      },
    });
  });

  it("swallows errors and logs to console", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error("DB down"));

    await writeEvent(mockPrisma, "step_1", "INFO", "Should not throw");

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not throw on failure", async () => {
    mockCreate.mockRejectedValue(new Error("DB down"));

    // Should resolve without throwing
    await expect(writeEvent(mockPrisma, "step_1", "INFO", "Test")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/pipeline-events.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `worker/lib/pipeline-events.ts`:

```typescript
type EventLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Write a pipeline event to the database. Fire-and-forget — errors are
 * swallowed and logged to console so event writes never break stage processing.
 */
export async function writeEvent(
  prisma: any,
  stepId: string,
  level: EventLevel,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.pipelineEvent.create({
      data: { stepId, level, message, data },
    });
  } catch (err) {
    console.error("[pipeline-event] Failed to write event:", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/pipeline-events.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Update mock factory**

In `tests/helpers/mocks.ts`, add `pipelineEvent: modelMethods(),` to the `createMockPrisma()` return object (after `pipelineStep`).

- [ ] **Step 6: Commit**

```bash
git add worker/lib/pipeline-events.ts worker/lib/__tests__/pipeline-events.test.ts tests/helpers/mocks.ts
git commit -m "feat: add writeEvent() utility for pipeline event logging"
```

---

## Chunk 2: Queue Handler Instrumentation

### Task 3: Instrument transcription handler

**Files:**
- Modify: `worker/queues/transcription.ts`

- [ ] **Step 1: Add import**

Add to imports at top of `worker/queues/transcription.ts`:

```typescript
import { writeEvent } from "../lib/pipeline-events";
```

- [ ] **Step 2: Add writeEvent() calls at decision points**

After the PipelineStep is created (line 79-86), add:
```typescript
await writeEvent(prisma, step.id, "INFO", "Checking cache for existing transcript");
```

After the cache hit check (inside `if (cached && cached.transcript ...)`), before the step update (line 91):
```typescript
await writeEvent(prisma, step.id, "INFO", "Cache hit — existing transcript found, skipping");
await writeEvent(prisma, step.id, "DEBUG", `Existing distillation status: ${cached.status}`, { distillationId: cached.id });
```

After the episode load check (line 138-141), if episode found:
```typescript
await writeEvent(prisma, step.id, "DEBUG", `Episode loaded: "${episode.title}"`, { audioUrl: episode.audioUrl?.slice(0, 120) });
```

In the RSS feed transcript branch (line 146-150), before the fetch:
```typescript
await writeEvent(prisma, step.id, "INFO", "Fetching transcript from RSS feed URL");
```
After successful fetch:
```typescript
await writeEvent(prisma, step.id, "INFO", `Transcript fetched from RSS feed`, { bytes: transcript.length, source: "feed" });
```

In the Podcast Index branch (line 162-169), when URL found:
```typescript
await writeEvent(prisma, step.id, "INFO", "Found transcript via Podcast Index");
await writeEvent(prisma, step.id, "DEBUG", "Backfilled episode transcriptUrl from Podcast Index", { source: "podcast-index", bytes: transcript.length });
```

When Podcast Index returns nothing, before Whisper (line 170):
```typescript
await writeEvent(prisma, step.id, "WARN", "No transcript in RSS or Podcast Index — falling back to Whisper STT");
```

In the chunked Whisper branch (line 176-186):
```typescript
await writeEvent(prisma, step.id, "INFO", `Audio file oversized (${Math.round(contentLength! / 1024 / 1024)}MB) — using chunked Whisper`);
```
After chunked transcription completes:
```typescript
await writeEvent(prisma, step.id, "INFO", `Transcript generated via chunked Whisper`, { bytes: transcript.length, source: "whisper-chunked" });
```

In the standard Whisper branch (line 187-211):
```typescript
await writeEvent(prisma, step.id, "INFO", `Transcribing audio via Whisper`);
```
After Whisper completes:
```typescript
await writeEvent(prisma, step.id, "INFO", `Transcript generated via Whisper`, { bytes: transcript.length, source: "whisper" });
```

After saving work product (line 224-233):
```typescript
await writeEvent(prisma, step.id, "INFO", "Saved transcript work product to R2", { r2Key, sizeBytes: new TextEncoder().encode(transcript).byteLength });
```

In the catch block (line 261-288), before `msg.retry()`:
```typescript
await writeEvent(prisma, step.id, "ERROR", `Transcription failed: ${errorMessage}`);
```
Note: This requires the step to exist. Wrap in a conditional: only write if we have a step ID. The step is created at line 79, so any error after that has a step. For errors before step creation, skip the event write.

- [ ] **Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: existing tests PASS (writeEvent is fire-and-forget, won't break existing mocks since pipelineEvent.create will be undefined and writeEvent swallows errors)

- [ ] **Step 4: Commit**

```bash
git add worker/queues/transcription.ts
git commit -m "feat: instrument transcription handler with pipeline events"
```

---

### Task 4: Instrument distillation handler

**Files:**
- Modify: `worker/queues/distillation.ts`

- [ ] **Step 1: Add import**

```typescript
import { writeEvent } from "../lib/pipeline-events";
```

- [ ] **Step 2: Add writeEvent() calls**

After step creation (line 60-67):
```typescript
await writeEvent(prisma, step.id, "INFO", "Checking cache for completed distillation");
```

Cache hit branch (line 74):
```typescript
await writeEvent(prisma, step.id, "INFO", "Cache hit — completed distillation found, skipping");
```

No transcript check (line 125-127):
```typescript
await writeEvent(prisma, step.id, "ERROR", "No transcript available — transcription stage must run first");
```

Before Claude extraction (line 136-138):
```typescript
await writeEvent(prisma, step.id, "INFO", `Sending transcript to ${distillationModel} for claim extraction`);
```

After claims extracted (line 140):
```typescript
await writeEvent(prisma, step.id, "INFO", `Extracted ${claims.length} claims from transcript`);
await writeEvent(prisma, step.id, "DEBUG", `Model: ${claimsUsage.model}`, { inputTokens: claimsUsage.inputTokens, outputTokens: claimsUsage.outputTokens, cost: claimsUsage.cost });
```

After saving work product (line 148-160):
```typescript
await writeEvent(prisma, step.id, "INFO", "Saved claims work product to R2", { r2Key, sizeBytes: new TextEncoder().encode(claimsJson).byteLength, claimCount: claims.length });
```

In catch block, before `msg.retry()` (line 221):
```typescript
if (step) await writeEvent(prisma, step.id, "ERROR", `Distillation failed: ${errorMessage}`);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/queues/distillation.ts
git commit -m "feat: instrument distillation handler with pipeline events"
```

---

### Task 5: Instrument narrative generation handler

**Files:**
- Modify: `worker/queues/narrative-generation.ts`

- [ ] **Step 1: Add import**

```typescript
import { writeEvent } from "../lib/pipeline-events";
```

- [ ] **Step 2: Add writeEvent() calls**

After step creation (line 60-67):
```typescript
await writeEvent(prisma, step.id, "INFO", "Checking cache for existing narrative");
```

Cache hit (line 74):
```typescript
await writeEvent(prisma, step.id, "INFO", "Cache hit — narrative work product exists, skipping");
```

No claims check (line 105-107):
```typescript
await writeEvent(prisma, step.id, "ERROR", "No completed distillation with claims found");
```

Before generation (line 114-121):
```typescript
await writeEvent(prisma, step.id, "INFO", `Generating ${durationTier}-minute narrative from ${claims.length} claims via ${narrativeModel}`);
```

After generation (line 122-123):
```typescript
await writeEvent(prisma, step.id, "INFO", `Narrative generated: ${wordCount} words`);
await writeEvent(prisma, step.id, "DEBUG", `Model: ${narrativeUsage.model}`, { inputTokens: narrativeUsage.inputTokens, outputTokens: narrativeUsage.outputTokens, cost: narrativeUsage.cost });
```

After saving WP (line 127-138):
```typescript
await writeEvent(prisma, step.id, "INFO", "Saved narrative work product to R2", { r2Key: narrativeR2Key, wordCount });
```

In catch block (line 190-200):
```typescript
await writeEvent(prisma, step.id, "ERROR", `Narrative generation failed: ${errorMessage}`).catch(() => {});
```
Note: step.id may not exist if step creation itself failed. Use `step?.id` check or wrap entire writeEvent in catch. Since writeEvent already swallows errors and step variable is declared outside try, pass step ID if step was created. The step variable is `let step` — if step creation failed, step is still the initial value. In this handler, step is declared inside the for-loop try, so we need to check:

```typescript
// In catch — step was created at line 60 so it should exist unless the error happened before that
await prisma.pipelineStep.updateMany(...)  // existing code already handles this
// Add event write — safe because writeEvent swallows errors
if (step) await writeEvent(prisma, step.id, "ERROR", `Narrative generation failed: ${errorMessage}`);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/queues/narrative-generation.ts
git commit -m "feat: instrument narrative generation handler with pipeline events"
```

---

### Task 6: Instrument audio generation handler

**Files:**
- Modify: `worker/queues/audio-generation.ts`

- [ ] **Step 1: Add import**

```typescript
import { writeEvent } from "../lib/pipeline-events";
```

- [ ] **Step 2: Add writeEvent() calls**

After step creation (line 61-68):
```typescript
await writeEvent(prisma, step.id, "INFO", "Checking cache for completed audio clip");
```

Cache hit (line 75-80):
```typescript
await writeEvent(prisma, step.id, "INFO", "Cache hit — completed audio clip exists, skipping");
```

No narrative check (line 114-116):
```typescript
await writeEvent(prisma, step.id, "ERROR", "No clip with narrative text found — narrative stage must run first");
```

Before TTS (line 121-125):
```typescript
await writeEvent(prisma, step.id, "INFO", `Generating audio via TTS (model: ${ttsModel})`);
```

After TTS (line 126):
```typescript
await writeEvent(prisma, step.id, "INFO", "Audio generated successfully");
await writeEvent(prisma, step.id, "DEBUG", `Audio size: ${audio.byteLength} bytes`, { model: ttsUsage.model, sizeBytes: audio.byteLength });
```

After saving WP + clip update (line 128-153):
```typescript
await writeEvent(prisma, step.id, "INFO", "Saved audio clip to R2 and updated clip record", { r2Key: audioR2Key });
```

In catch block (line 192-203):
```typescript
await writeEvent(prisma, step.id, "ERROR", `Audio generation failed: ${errorMessage}`).catch(() => {});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run worker/queues/__tests__/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/queues/audio-generation.ts
git commit -m "feat: instrument audio generation handler with pipeline events"
```

---

### Task 7: Update clean-pipeline script

**Files:**
- Modify: `scripts/clean-pipeline.mjs`

**Note:** Briefing assembly is NOT instrumented with events. The assembly handler operates at the request level (not per-job) and doesn't create PipelineStep records. Its success/failure is already visible via the BriefingRequest status. Only the 4 per-job stages (transcription, distillation, narrative, audio) are instrumented.

- [ ] **Step 1: Add PipelineEvent to cleanup tables**

In `scripts/clean-pipeline.mjs`, add `PipelineEvent` to the tables array before `PipelineStep` (line 81). The FK from PipelineEvent → PipelineStep requires PipelineEvent to be deleted first:

```javascript
    ["PipelineEvent", '"PipelineEvent"'],
    ["PipelineStep", '"PipelineStep"'],
```

- [ ] **Step 2: Commit**

```bash
git add scripts/clean-pipeline.mjs
git commit -m "chore: add PipelineEvent to clean-pipeline script"
```

---

## Chunk 3: API + Types

### Task 8: Add PipelineEventSummary type and update StepProgress

**Files:**
- Modify: `src/types/admin.ts:540-551`

- [ ] **Step 1: Add PipelineEventSummary interface**

Add after `WorkProductSummary` (line 569):

```typescript
// ── Pipeline Events ──

export type PipelineEventLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface PipelineEventSummary {
  id: string;
  level: PipelineEventLevel;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] **Step 2: Add events to StepProgress**

In `StepProgress` (line 540), add after `workProducts`:

```typescript
  events?: PipelineEventSummary[];
```

- [ ] **Step 3: Commit**

```bash
git add src/types/admin.ts
git commit -m "feat: add PipelineEventSummary type and events field to StepProgress"
```

---

### Task 9: Include events in request detail API response

**Files:**
- Modify: `worker/routes/admin/requests.ts:73-87`
- Modify: `worker/routes/admin/__tests__/requests.test.ts`

- [ ] **Step 1: Write the test**

In `worker/routes/admin/__tests__/requests.test.ts`, add a test (inside the existing describe block or a new one):

```typescript
it("GET /requests/:id includes events in step data", async () => {
  const mockRequest = {
    id: "req_1",
    userId: "user_1",
    status: "COMPLETED",
    targetMinutes: 5,
    items: [],
    isTest: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { name: "Test", email: "test@test.com" },
  };

  const mockJobs = [{
    id: "job_1",
    requestId: "req_1",
    episodeId: "ep_1",
    durationTier: 5,
    status: "COMPLETED",
    currentStage: "BRIEFING_ASSEMBLY",
    steps: [{
      id: "step_1",
      stage: "TRANSCRIPTION",
      status: "COMPLETED",
      cached: false,
      durationMs: 2000,
      cost: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      errorMessage: null,
      workProduct: null,
      events: [
        { id: "evt_1", level: "INFO", message: "Cache miss", data: null, createdAt: new Date() },
        { id: "evt_2", level: "INFO", message: "Fetched transcript", data: { bytes: 4532 }, createdAt: new Date() },
      ],
    }],
    episode: { title: "Ep 1", durationSeconds: 3600, podcast: { title: "Pod 1" } },
  }];

  mockPrisma.briefingRequest.findUnique.mockResolvedValue(mockRequest);
  mockPrisma.pipelineJob.findMany.mockResolvedValue(mockJobs);
  mockPrisma.workProduct.findMany.mockResolvedValue([]);

  const res = await app.request("/requests/req_1", {}, env, mockExCtx as any);
  expect(res.status).toBe(200);

  const body = await res.json() as any;
  const step = body.data.jobProgress[0].steps[0];
  expect(step.events).toHaveLength(2);
  expect(step.events[0]).toMatchObject({ id: "evt_1", level: "INFO", message: "Cache miss" });
  expect(step.events[1]).toMatchObject({ id: "evt_2", level: "INFO", message: "Fetched transcript" });
  expect(step.events[1].data).toEqual({ bytes: 4532 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/routes/admin/__tests__/requests.test.ts`
Expected: FAIL — events not in response

- [ ] **Step 3: Modify the detail endpoint**

In `worker/routes/admin/requests.ts`, update the `steps` include in the detail query (line 77-84) to add events:

```typescript
      steps: {
        orderBy: { createdAt: "asc" },
        include: {
          workProduct: {
            select: { id: true, type: true, r2Key: true, sizeBytes: true, metadata: true, createdAt: true },
          },
          events: {
            orderBy: { createdAt: "asc" },
            select: { id: true, level: true, message: true, data: true, createdAt: true },
          },
        },
      },
```

Then in the step mapping (inside `job.steps.map`, around line 159-170), add events to the return:

```typescript
      return {
        stage: s.stage,
        status: s.status,
        cached: s.cached,
        durationMs: s.durationMs,
        cost: s.cost,
        model: s.model ?? undefined,
        inputTokens: s.inputTokens ?? undefined,
        outputTokens: s.outputTokens ?? undefined,
        errorMessage: s.errorMessage,
        workProducts: matched.length > 0 ? matched : undefined,
        events: s.events?.length > 0
          ? s.events.map((e: any) => ({
              id: e.id,
              level: e.level,
              message: e.message,
              data: e.data ?? undefined,
              createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
            }))
          : undefined,
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/routes/admin/__tests__/requests.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/routes/admin/requests.ts worker/routes/admin/__tests__/requests.test.ts
git commit -m "feat: include pipeline events in request detail API response"
```

---

## Chunk 4: Frontend

### Task 10: Refactor ExpandableStepRow into nested accordion

**Files:**
- Modify: `src/pages/admin/requests.tsx:381-471` (ExpandableStepRow component)

- [ ] **Step 1: Add imports**

At the top of `src/pages/admin/requests.tsx`, add to the lucide-react import:

```typescript
import { ..., List, Eye, EyeOff } from "lucide-react";
```

Add to the types import:

```typescript
import type { ..., PipelineEventSummary } from "@/types/admin";
```

- [ ] **Step 2: Add EventTimeline sub-component**

Add before the `ExpandableStepRow` component (around line 380):

```typescript
const EVENT_LEVEL_COLORS: Record<string, string> = {
  ERROR: "#EF4444",
  WARN: "#F59E0B",
  INFO: "#9CA3AF",
  DEBUG: "#6B7280",
};

const SUCCESS_KEYWORDS = ["saved", "extracted", "generated", "completed", "found", "fetched", "created", "linked", "assembly complete"];

function isSuccessEvent(event: PipelineEventSummary): boolean {
  if (event.level !== "INFO") return false;
  const lower = event.message.toLowerCase();
  return SUCCESS_KEYWORDS.some((kw) => lower.includes(kw));
}

function eventColor(event: PipelineEventSummary): string {
  if (event.level === "ERROR") return EVENT_LEVEL_COLORS.ERROR;
  if (event.level === "WARN") return EVENT_LEVEL_COLORS.WARN;
  if (isSuccessEvent(event)) return "#22C55E"; // green for success INFO
  if (event.level === "DEBUG") return EVENT_LEVEL_COLORS.DEBUG;
  return EVENT_LEVEL_COLORS.INFO;
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function EventTimeline({
  events,
  stepStatus,
}: {
  events: PipelineEventSummary[];
  stepStatus: PipelineStepStatus;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const filtered = showDebug ? events : events.filter((e) => e.level !== "DEBUG");
  const debugCount = events.filter((e) => e.level === "DEBUG").length;

  const borderColor =
    stepStatus === "FAILED" ? "#EF4444" :
    stepStatus === "IN_PROGRESS" ? "#3B82F6" :
    stepStatus === "COMPLETED" ? "#22C55E" :
    "#6B7280";

  return (
    <div className="py-1">
      {debugCount > 0 && (
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="flex items-center gap-1 text-[9px] text-[#6B7280] hover:text-[#9CA3AF] mb-1 transition-colors"
        >
          {showDebug ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
          {showDebug ? "Hide" : "Show"} debug ({debugCount})
        </button>
      )}
      <div
        className="border-l-2 pl-3 space-y-0.5"
        style={{ borderColor }}
      >
        {filtered.map((event) => (
          <div key={event.id} className="flex items-start gap-2 text-[10px]">
            <span className="text-[#6B7280] font-mono text-[9px] shrink-0 tabular-nums">
              {formatEventTime(event.createdAt)}
            </span>
            <span style={{ color: eventColor(event) }}>
              {event.message}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <span className="text-[9px] text-[#6B7280] italic">No events recorded</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Refactor ExpandableStepRow**

Replace the current `ExpandableStepRow` component (lines 381-471) with a version that has two nested sub-rows:

```typescript
function ExpandableStepRow({
  step,
}: {
  step: StepProgress;
}) {
  const events = step.events ?? [];
  const wps = step.workProducts ?? [];
  const hasContent = events.length > 0 || wps.length > 0;

  // Auto-expand for failed/in-progress steps
  const [expanded, setExpanded] = useState(
    step.status === "FAILED" || step.status === "IN_PROGRESS"
  );
  const [showEvents, setShowEvents] = useState(
    step.status === "FAILED" || step.status === "IN_PROGRESS"
  );
  const [showWps, setShowWps] = useState(false);

  const infoEventCount = events.filter((e) => e.level !== "DEBUG").length;

  return (
    <div>
      {/* Main step row — same grid as before */}
      <div
        className={cn(
          "grid grid-cols-[14px_90px_60px_55px_60px_60px_60px_auto_1fr] gap-2 items-center text-[10px] py-0.5",
          hasContent && "cursor-pointer hover:bg-white/[0.02] rounded -mx-1 px-1"
        )}
        onClick={hasContent ? () => setExpanded((v) => !v) : undefined}
      >
        {/* Expand chevron */}
        <div>
          {hasContent ? (
            expanded ? (
              <ChevronDown className="h-2.5 w-2.5 text-[#9CA3AF]" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5 text-[#9CA3AF]" />
            )
          ) : null}
        </div>

        {/* Stage name */}
        <span className="text-[#9CA3AF] truncate">{formatStageName(step.stage)}</span>

        {/* Status */}
        <div className="flex items-center gap-1">
          <StepStatusIcon step={step} />
          {step.cached && (
            <span title="Cached"><Zap className="h-2.5 w-2.5 text-[#F59E0B]" /></span>
          )}
        </div>

        {/* Duration */}
        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.durationMs != null ? `${step.durationMs}ms` : "—"}
        </span>

        {/* Tokens In */}
        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.inputTokens != null ? formatTokens(step.inputTokens) : "—"}
        </span>

        {/* Tokens Out */}
        <span className="text-[9px] text-[#9CA3AF] font-mono tabular-nums text-right">
          {step.outputTokens != null ? formatTokens(step.outputTokens) : "—"}
        </span>

        {/* Cost */}
        <span className="text-[9px] text-[#10B981] font-mono tabular-nums text-right">
          {step.cost != null ? `$${step.cost.toFixed(4)}` : "—"}
        </span>

        {/* Assets */}
        <div className="flex items-center gap-1">
          {wps.length > 0 && wps.map((wp) => (
            <WorkProductBadge key={wp.id} wp={wp} />
          ))}
        </div>

        {/* Model + error */}
        <div className="flex items-center gap-1 min-w-0">
          {step.model && (
            <span className="text-[8px] text-[#8B5CF6] font-mono tabular-nums truncate max-w-[120px]" title={step.model}>
              {step.model.split("+").map(m => m.split("-").slice(0, 3).join("-")).join("+")}
            </span>
          )}
          {step.status === "FAILED" && step.errorMessage && (
            <span className="text-[9px] text-[#EF4444] truncate max-w-[200px]" title={step.errorMessage}>
              {step.errorMessage}
            </span>
          )}
        </div>
      </div>

      {/* Nested accordion: Event Log + Work Products */}
      {expanded && (
        <div className="pl-6 space-y-0.5 pb-1">
          {/* Event Log sub-row */}
          {events.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] py-0.5 transition-colors w-full text-left"
                onClick={() => setShowEvents((v) => !v)}
              >
                {showEvents ? (
                  <ChevronDown className="h-2.5 w-2.5" />
                ) : (
                  <ChevronRight className="h-2.5 w-2.5" />
                )}
                <List className="h-2.5 w-2.5" />
                <span>Event Log</span>
                <span className="text-[#6B7280]">({infoEventCount})</span>
              </button>
              {showEvents && (
                <div className="pl-5">
                  <EventTimeline events={events} stepStatus={step.status} />
                </div>
              )}
            </div>
          )}

          {/* Work Products sub-row */}
          {wps.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-[#F9FAFB] py-0.5 transition-colors w-full text-left"
                onClick={() => setShowWps((v) => !v)}
              >
                {showWps ? (
                  <ChevronDown className="h-2.5 w-2.5" />
                ) : (
                  <ChevronRight className="h-2.5 w-2.5" />
                )}
                <HardDrive className="h-2.5 w-2.5" />
                <span>Work Products</span>
                <span className="text-[#6B7280]">({wps.length})</span>
              </button>
              {showWps && (
                <div className="pl-5 space-y-1">
                  {wps.map((wp) => (
                    <StepWorkProductPanel key={wp.id} wp={wp} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no type errors related to the changes

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/requests.tsx
git commit -m "feat: nested accordion UI for pipeline events and work products"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: successful build

- [ ] **Step 4: Final commit if any uncommitted changes remain**

```bash
git status
# If anything uncommitted, add and commit
```
