# Admin Pipeline Observability & UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source audio work products, enriched pipeline events, double-click navigation, and dismissable failed jobs to the admin platform.

**Architecture:** Schema-first approach. Add `SOURCE_AUDIO` enum value and `dismissedAt` field, then fan out to backend (work products, events, API endpoints) and frontend (rendering, navigation, dismiss UI). Events enrichment is purely additive to existing `writeEvent` calls.

**Tech Stack:** Prisma 7, Hono, Cloudflare Workers (R2), React 19, react-router-dom

**Spec:** `docs/plans/2026-03-17-admin-pipeline-observability-ux.md`

---

## Dependency Graph

```
Task 1 (Schema) ─┬─► Task 2 (Work Products + Transcription Source Audio)
                  │     └─► Task 6 (Frontend: Source Audio + Deep-link)
                  ├─► Task 3 (Dismiss API + CC Issues Backend)
                  │     └─► Task 7 (Frontend: Dismiss UI + Double-click)
                  └─► Task 4 (Events: Transcription + Distillation)
                      Task 5 (Events: Narrative + Audio + Assembly)
```

Tasks 4 and 5 have no dependencies (purely additive). Tasks 2 and 3 depend on Task 1 (schema). Tasks 6 and 7 depend on their respective backend tasks.

**File conflict note:** Tasks 2 and 4 both modify `worker/queues/transcription.ts`. They must NOT run in parallel — run Task 2 first, then Task 4 (or merge them into one agent).

---

### Task 1: Schema Changes

**Files:**
- Modify: `prisma/schema.prisma` — lines 318-337 (PipelineJob model), lines 437-443 (WorkProductType enum)

- [ ] **Step 1: Add `SOURCE_AUDIO` to WorkProductType enum**

In `prisma/schema.prisma` at the `WorkProductType` enum (line 437-443), add `SOURCE_AUDIO` after `BRIEFING_AUDIO`:

```prisma
enum WorkProductType {
  TRANSCRIPT
  CLAIMS
  NARRATIVE
  AUDIO_CLIP
  BRIEFING_AUDIO
  SOURCE_AUDIO
}
```

- [ ] **Step 2: Add `dismissedAt` to PipelineJob model**

In the `PipelineJob` model (lines 318-337), add after `completedAt`:

```prisma
  dismissedAt  DateTime?
```

- [ ] **Step 3: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

Then ensure the barrel export exists (only create if missing):
```bash
test -f src/generated/prisma/index.ts || echo 'export * from "./client";' > src/generated/prisma/index.ts
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add SOURCE_AUDIO work product type and PipelineJob.dismissedAt"
```

---

### Task 2: Source Audio Work Product — Backend

**Files:**
- Modify: `worker/lib/work-products.ts` — lines 8-26 (WpKeyParams + wpKey)
- Modify: `worker/queues/transcription.ts` — lines 182-198 (between audio download and STT call)
- Modify: `worker/routes/admin/requests.ts` — lines 94-100 (STAGE_WP_TYPES), line 224 + line 268 (isAudio guards)
- Test: `worker/queues/__tests__/transcription.test.ts`

**Depends on:** Task 1

- [ ] **Step 1: Add SOURCE_AUDIO to work-products.ts**

In `worker/lib/work-products.ts`, add to the `WpKeyParams` union (after line 12):

```typescript
  | { type: "SOURCE_AUDIO"; episodeId: string }
```

In the `wpKey()` function (after line 24), add case:

```typescript
    case "SOURCE_AUDIO":
      return `wp/source-audio/${params.episodeId}.bin`;
```

- [ ] **Step 2: Store source audio in transcription handler**

In `worker/queues/transcription.ts`, insert **between** the `audioBuffer` assignment (line 190: `const audioBuffer = await audioResponse.arrayBuffer()`) and the STT call (line 198: `const sttResult = await providerImpl.transcribe(...)`). This ensures the source audio is preserved before the STT call that may fail:

```typescript
        // Store source audio for debugging (idempotent — preserve first-seen)
        const sourceAudioKey = wpKey({ type: "SOURCE_AUDIO", episodeId });
        const existingSource = await env.R2.head(sourceAudioKey);
        if (!existingSource) {
          await putWorkProduct(env.R2, sourceAudioKey, audioBuffer, {
            contentType: audioResponse.headers.get("content-type") || "audio/mpeg",
          });
          await prisma.workProduct.upsert({
            where: { r2Key: sourceAudioKey },
            create: {
              episodeId,
              type: "SOURCE_AUDIO",
              r2Key: sourceAudioKey,
              sizeBytes: audioBuffer.byteLength,
              metadata: {
                contentType: audioResponse.headers.get("content-type"),
                contentLength: audioResponse.headers.get("content-length"),
                sourceUrl: episode.audioUrl?.slice(0, 200),
              },
            },
            update: {},
          });
          await writeEvent(prisma, step.id, "INFO", "Source audio stored to R2", {
            r2Key: sourceAudioKey,
            sizeBytes: audioBuffer.byteLength,
            contentType: audioResponse.headers.get("content-type"),
          });
        }
```

- [ ] **Step 3: Update STAGE_WP_TYPES and isAudio guards in requests.ts**

In `worker/routes/admin/requests.ts`:

At line 94-100, add `SOURCE_AUDIO` to the TRANSCRIPTION entry:
```typescript
  TRANSCRIPTION: ["TRANSCRIPT", "SOURCE_AUDIO"],
```

At line 224 (preview endpoint) and line 268 (audio streaming endpoint), update both `isAudio` guards:
```typescript
const isAudio = wp.type === "AUDIO_CLIP" || wp.type === "BRIEFING_AUDIO" || wp.type === "SOURCE_AUDIO";
```

- [ ] **Step 4: Add test for source audio storage**

In `worker/queues/__tests__/transcription.test.ts`, add a test that verifies when STT is used:
- `env.R2.head` is called with the source audio key `wp/source-audio/{episodeId}.bin`
- When `R2.head` returns null: `putWorkProduct` (via `env.R2.put`) is called with the `audioBuffer`
- `prisma.workProduct.upsert` is called with type `SOURCE_AUDIO`
- When `R2.head` returns a value (key exists): neither put nor upsert is called (idempotency)

- [ ] **Step 5: Run tests**

```bash
npx vitest run worker/queues/__tests__/transcription.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add worker/lib/work-products.ts worker/queues/transcription.ts worker/routes/admin/requests.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: store source audio as work product during STT transcription"
```

---

### Task 3: Dismiss API + CC Issues Backend

**Files:**
- Modify: `worker/routes/admin/pipeline.ts` — add dismiss routes, modify retry endpoints, add dismissedAt filter
- Modify: `worker/routes/admin/dashboard.ts` (or wherever `/dashboard/issues` is served) — add dismissedAt filter + jobId/requestId fields to ActiveIssue response
- Modify: `src/types/admin.ts` — add `dismissedAt` to PipelineJob, add `jobId`/`requestId` to ActiveIssue
- Test: `worker/routes/admin/__tests__/pipeline-triggers.test.ts` (or new dismiss test file)

**Depends on:** Task 1

- [ ] **Step 1: Add dismiss endpoints to pipeline.ts**

In `worker/routes/admin/pipeline.ts`, register **before** the `/:id` routes (before line 91). Place after the `/jobs` GET route:

```typescript
// Bulk dismiss — must be registered before :id routes to avoid param conflict
routes.patch("/jobs/bulk-dismiss", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.query("stage");
  const where: any = { status: "FAILED", dismissedAt: null };
  if (stage) where.currentStage = stage;
  const result = await prisma.pipelineJob.updateMany({
    where,
    data: { dismissedAt: new Date() },
  });
  return c.json({ data: { count: result.count } });
});

// Single dismiss
routes.patch("/jobs/:id/dismiss", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const job = await prisma.pipelineJob.update({
    where: { id },
    data: { dismissedAt: new Date() },
    select: { id: true, status: true, dismissedAt: true },
  });
  return c.json({ data: job });
});
```

- [ ] **Step 2: Add dismissedAt filter to pipeline job queries**

In the `/jobs` GET handler (around line 45-56), add `dismissedAt: null` to the `where` clause:

```typescript
where: { ...where, dismissedAt: null },
```

In the `/dlq` GET handler (around line 598), add `dismissedAt: null` to both the `stuckJobs` sub-query and the `exhaustedRetries` sub-query to prevent dismissed jobs from appearing in DLQ.

- [ ] **Step 3: Clear dismissedAt on both retry endpoints**

In the existing `POST /jobs/:id/retry` handler (around line 187-254), add `dismissedAt: null` to the update data:

```typescript
data: { status: "PENDING", errorMessage: null, completedAt: null, dismissedAt: null },
```

In the existing `POST /jobs/bulk/retry` handler (around line 257-324), add `dismissedAt: null` to its update data as well.

- [ ] **Step 4: Add dismissedAt filter + enrichment to CC issues endpoint**

Find the dashboard/issues API endpoint (likely in `worker/routes/admin/dashboard.ts` or similar). This endpoint builds the `ActiveIssue[]` response.

Add `dismissedAt: null` to any PipelineJob queries used to build the issues list.

When the issue source is a PipelineJob, populate `jobId` and `requestId` fields in the response. The PipelineJob model has `requestId` as a direct field.

- [ ] **Step 5: Update frontend types**

In `src/types/admin.ts`:

Add to `PipelineJob` interface (around lines 119-138):
```typescript
  dismissedAt?: string | null;
```

Add to `ActiveIssue` interface (around lines 81-91):
```typescript
  jobId?: string;
  requestId?: string;
```

- [ ] **Step 6: Write tests for dismiss endpoints**

Add tests verifying:
- `PATCH /jobs/:id/dismiss` sets dismissedAt and returns `{ data: { id, status, dismissedAt } }`
- `PATCH /jobs/bulk-dismiss` updates all FAILED undismissed jobs and returns `{ data: { count } }`
- `PATCH /jobs/bulk-dismiss?stage=TRANSCRIPTION` only dismisses FAILED jobs at that stage
- `POST /jobs/:id/retry` clears dismissedAt (sets to null)
- `POST /jobs/bulk/retry` clears dismissedAt
- `GET /jobs` excludes dismissed jobs (where dismissedAt is set)

- [ ] **Step 7: Run tests**

```bash
npx vitest run worker/routes/admin/__tests__/pipeline-triggers.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add worker/routes/admin/pipeline.ts worker/routes/admin/dashboard.ts src/types/admin.ts worker/routes/admin/__tests__/
git commit -m "feat: add dismiss/bulk-dismiss endpoints and CC issues enrichment for failed pipeline jobs"
```

---

### Task 4: Enriched Events — Transcription + Distillation

**Files:**
- Modify: `worker/queues/transcription.ts` — enrich existing writeEvent calls
- Modify: `worker/queues/distillation.ts` — enrich existing writeEvent calls

**No dependencies (purely additive). Must run AFTER Task 2 if both touch transcription.ts.**

- [ ] **Step 1: Hoist diagnostic variables for catch-block access in transcription.ts**

In `worker/queues/transcription.ts`, at the top of the per-message try block (around line 60), declare variables that need to be available in the catch block:

```typescript
      let sttProvider: string | undefined;
      let sttModel: string | undefined;
      let audioSizeBytes: number | undefined;
      let audioContentType: string | undefined;
```

Then, where audio is downloaded (around line 186-190), capture values:
```typescript
        audioContentType = audioResponse.headers.get("content-type") || undefined;
        audioSizeBytes = audioBuffer.byteLength;
```

And where model is resolved (around line 176-178), capture:
```typescript
        sttProvider = resolved.provider;
        sttModel = resolved.providerModelId;
```

- [ ] **Step 2: Enrich transcription events**

In `worker/queues/transcription.ts`:

At line 145 (episode loaded event), enrich with audio metadata:
```typescript
await writeEvent(prisma, step.id, "DEBUG", `Episode loaded: "${episode.title}"`, {
  audioUrl: episode.audioUrl?.slice(0, 200),
  audioDuration: episode.duration,
  podcastTitle: episode.podcast?.title,
});
```

At line 179 (before STT call), enrich with audio + model info:
```typescript
await writeEvent(prisma, step.id, "INFO", `Transcribing via ${providerImpl.name} (model: ${providerModelId})`, {
  audioSizeBytes,
  audioContentType,
  audioContentLength: audioResponse.headers.get("content-length"),
  provider: resolved.provider,
  model: providerModelId,
});
```

At line 287 (failure event in catch block), enrich with diagnostic context using the hoisted variables:
```typescript
await writeEvent(prisma, stepId, "ERROR", `Transcription failed: ${errorMessage.slice(0, 2048)}`, {
  provider: sttProvider,
  model: sttModel,
  audioSizeBytes,
  audioContentType,
  httpStatus: (err as any)?.status || (err as any)?.statusCode,
  errorType: err?.constructor?.name,
});
```

- [ ] **Step 3: Enrich distillation events**

In `worker/queues/distillation.ts`:

At line 122 (loaded transcript), add size info to data param:
```typescript
await writeEvent(prisma, step.id, "INFO", `Loaded transcript from R2 (${transcript.length} bytes)`, {
  transcriptBytes: transcript.length,
});
```

At line 134 (sending to LLM), add model + provider:
```typescript
await writeEvent(prisma, step.id, "INFO", `Sending transcript to ${llm.name} (${resolved.providerModelId}) for claim extraction`, {
  transcriptBytes: transcript.length,
  model: resolved.providerModelId,
  provider: resolved.provider,
});
```

At line 241 (failure), enrich (truncate error to 2KB):
```typescript
await writeEvent(prisma, step.id, "ERROR", `Distillation failed: ${errorMessage.slice(0, 2048)}`, {
  model: resolved?.providerModelId,
  provider: resolved?.provider,
  httpStatus: (err as any)?.status || (err as any)?.statusCode,
  errorType: err?.constructor?.name,
});
```

Note: `resolved` may not be in scope in the distillation catch block. Hoist `let distillModel/distillProvider` at the try-block top, same pattern as transcription.

- [ ] **Step 4: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/distillation.ts
git commit -m "feat: enrich transcription and distillation pipeline events with diagnostic context"
```

---

### Task 5: Enriched Events — Narrative, Audio, Assembly

**Files:**
- Modify: `worker/queues/narrative-generation.ts` — enrich writeEvent calls
- Modify: `worker/queues/audio-generation.ts` — enrich writeEvent calls
- Modify: `worker/queues/briefing-assembly.ts` — enrich writeEvent calls

**No dependencies (purely additive)**

- [ ] **Step 1: Enrich narrative generation events**

In `worker/queues/narrative-generation.ts`:

At line 152 (generating narrative), add structured data:
```typescript
await writeEvent(prisma, step.id, "INFO",
  `Generating ${durationTier}-minute narrative from ${claims.length}/${allClaims.length} claims via ${llm.name} (${resolved.providerModelId})`, {
  claimCount: claims.length,
  totalClaims: allClaims.length,
  durationTier,
  model: resolved.providerModelId,
  provider: resolved.provider,
});
```

At line 254 (failure), enrich. Hoist `narrativeModel`/`narrativeProvider` if `resolved` not in catch scope:
```typescript
await writeEvent(prisma, step.id, "ERROR", `Narrative generation failed: ${errorMessage.slice(0, 2048)}`, {
  model: narrativeModel,
  provider: narrativeProvider,
  durationTier,
  claimCount: claims?.length,
  httpStatus: (err as any)?.status || (err as any)?.statusCode,
  errorType: err?.constructor?.name,
});
```

- [ ] **Step 2: Enrich audio generation events**

In `worker/queues/audio-generation.ts`:

At line 130 (generating audio), add narrative size + voice:
```typescript
await writeEvent(prisma, step.id, "INFO", `Generating audio via ${tts.name} (${resolved.providerModelId})`, {
  narrativeBytes: narrative.length,
  narrativeWords: narrative.split(/\s+/).length,
  model: resolved.providerModelId,
  provider: resolved.provider,
  voice: resolved.voice,
});
```

At line 253 (failure), enrich. Hoist if needed:
```typescript
await writeEvent(prisma, step.id, "ERROR", `Audio generation failed: ${errorMessage.slice(0, 2048)}`, {
  model: audioModel,
  provider: audioProvider,
  narrativeBytes: narrative?.length,
  httpStatus: (err as any)?.status || (err as any)?.statusCode,
  errorType: err?.constructor?.name,
});
```

- [ ] **Step 3: Enrich briefing assembly events**

In `worker/queues/briefing-assembly.ts`:

At line 82 (resolving clip), add diagnostic data:
```typescript
await writeEvent(prisma, step.id, "INFO", "Resolving clip for briefing assembly", {
  clipIdFromJob: !!job.clipId,
  episodeId: job.episodeId,
  durationTier: job.durationTier,
});
```

After the clip fallback lookup (around line 87-92), if fallback was used:
```typescript
if (!job.clipId && clipId) {
  await writeEvent(prisma, step.id, "INFO", "Resolved clipId via DB fallback (Hyperdrive stale read)", {
    clipId,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add worker/queues/narrative-generation.ts worker/queues/audio-generation.ts worker/queues/briefing-assembly.ts
git commit -m "feat: enrich narrative, audio, and assembly pipeline events with diagnostic context"
```

---

### Task 6: Frontend — Source Audio Rendering + Deep-link Navigation

**Files:**
- Modify: `src/pages/admin/requests.tsx` — SOURCE_AUDIO work product rendering, URL param deep-link
- Modify: `src/types/admin.ts` — add SOURCE_AUDIO to WorkProductType

**Depends on:** Task 2

- [ ] **Step 1: Add SOURCE_AUDIO to frontend types**

In `src/types/admin.ts` at the `WorkProductType` (lines 572-577), add:
```typescript
  | "SOURCE_AUDIO"
```

- [ ] **Step 2: Add SOURCE_AUDIO rendering in requests page**

In `src/pages/admin/requests.tsx`, find the work product rendering section (around lines 142-161). Add `SOURCE_AUDIO` to the icon/label mapping with `FileAudio` icon and label "Source Audio". Ensure SOURCE_AUDIO sorts first in the work products list by adding a sort comparator that puts SOURCE_AUDIO at index 0.

The rendering should use the same audio player component as `AUDIO_CLIP`.

- [ ] **Step 3: Add deep-link URL param handling**

In `src/pages/admin/requests.tsx`:

Import `useSearchParams` from `react-router-dom`.

On mount, read `requestId` and `jobId` from search params. When `requestId` is present:
1. Fire a separate `GET /api/admin/requests/${requestId}` fetch to load that specific request (avoids pagination miss)
2. Inject the result at the top of the request list (or select it if already loaded)
3. Auto-expand the matching job accordion (by jobId)
4. Scroll the job into view using a ref + `scrollIntoView({ behavior: "smooth" })`

Use a `useEffect` keyed on the search params to trigger this on mount and on param change.

- [ ] **Step 4: Verify manually**

Start dev server, navigate to `/admin/requests?requestId=<valid-id>&jobId=<valid-id>` and confirm:
- Request auto-selects
- Job accordion auto-expands
- View scrolls to the job

- [ ] **Step 5: Commit**

```bash
git add src/types/admin.ts src/pages/admin/requests.tsx
git commit -m "feat: SOURCE_AUDIO work product rendering and deep-link navigation in requests page"
```

---

### Task 7: Frontend — Dismiss UI + Double-click Navigation

**Files:**
- Modify: `src/pages/admin/pipeline.tsx` — dismiss buttons on failed jobs, Dismiss All in DLQ, double-click handlers
- Modify: `src/pages/admin/command-center.tsx` — dismiss integration, Dismiss All, double-click handlers on issues + pulse events

**Depends on:** Task 3 (dismiss API + CC issues enrichment), Task 6 (deep-link receiving end)

- [ ] **Step 1: Add dismiss button to failed job cards in pipeline.tsx**

In `src/pages/admin/pipeline.tsx`, in the job card rendering (around lines 227-267):
- For jobs with `status === "FAILED"`, add an X button (top-right corner of the card)
- On click, call `PATCH /api/admin/pipeline/jobs/${jobId}/dismiss`
- Optimistic UI: immediately remove the job from the local state
- On error: re-insert the job at its previous position and show error toast via `toast.error()`

- [ ] **Step 2: Add Dismiss All to DLQ section**

In the Dead Letter Queue section (around lines 871-945):
- Add a "Dismiss All" button in the section header
- On click, call `PATCH /api/admin/pipeline/jobs/bulk-dismiss`
- Optimistic UI: clear all DLQ items
- On error: restore previous state and show error toast

- [ ] **Step 3: Add double-click navigation to pipeline job cards**

In the job card click handler area (around lines 705-714):
- Add `onDoubleClick` to job cards: `navigate(\`/admin/requests?requestId=${job.requestId}&jobId=${job.id}\`)`
- Keep existing single-click behavior (opens detail sheet)

- [ ] **Step 4: Wire CC Active Issues dismiss to the API**

In `src/pages/admin/command-center.tsx`, the existing dismiss button (line 365) needs a handler:
- On dismiss click, call `PATCH /api/admin/pipeline/jobs/${issue.jobId}/dismiss` (use `issue.jobId` — now available from Task 3's backend enrichment)
- Only call dismiss API if `issue.jobId` is present (not all issues are job-related)
- For non-job issues, keep existing local-only dismiss behavior
- Optimistic UI: remove issue from list
- On error: restore and show error toast

- [ ] **Step 5: Add Dismiss All to CC Active Issues**

Add a "Dismiss All" button to the Active Issues section header (around line 295):
- On click, call `PATCH /api/admin/pipeline/jobs/bulk-dismiss`
- Optimistic UI: clear all issues
- On error: restore and show error toast

- [ ] **Step 6: Add double-click to CC Active Issues and Pipeline Pulse**

- Active Issues cards: `onDoubleClick` → navigate to `/admin/requests?requestId=${issue.requestId}&jobId=${issue.jobId}` (only if `issue.jobId` is present — skip navigation for non-job issues)
- Pipeline Pulse events: `onDoubleClick` → navigate using the event's requestId/jobId from its data payload

- [ ] **Step 7: Verify manually**

Test in dev:
1. Pipeline: dismiss a failed job → disappears from column, stays in Requests
2. Pipeline: Dismiss All in DLQ → clears all failed
3. Pipeline: double-click a job card → lands on Requests with that job expanded
4. CC: dismiss an Active Issue → disappears, also gone from Pipeline
5. CC: double-click an issue → lands on Requests
6. Retry a dismissed job → reappears in Pipeline

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/pipeline.tsx src/pages/admin/command-center.tsx
git commit -m "feat: dismiss failed jobs and double-click navigation in pipeline and command center"
```

---

## Execution Order

**Parallel group 1 (blocking):**
- Task 1: Schema changes

**Parallel group 2 (after Task 1 — but Tasks 2 and 4 share transcription.ts, so run Task 2 before Task 4):**
- Task 2: Source audio backend → then Task 4: Events — Transcription + Distillation
- Task 3: Dismiss API + CC issues backend
- Task 5: Events — Narrative + Audio + Assembly

**Parallel group 3 (after Tasks 2+3+4):**
- Task 6: Frontend — Source audio + deep-link
- Task 7: Frontend — Dismiss UI + double-click

**Final:** Run full test suite, push, verify on staging.
