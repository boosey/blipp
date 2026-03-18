# Admin Pipeline Observability & UX Improvements

**Date:** 2026-03-17
**Status:** Approved

## Overview

Four improvements to the admin platform: source audio preservation for transcription debugging, enriched pipeline events across all stages, double-click navigation from Monitor/CC to Requests, and dismissable failed jobs.

---

## Feature 1 — Source Audio Work Product

### Problem

When transcription fails via STT (tier 3), the downloaded audio is discarded. There's no way to inspect the source file to diagnose provider failures (e.g., Groq 500 errors).

### Design

**New work product type:** `SOURCE_AUDIO`

**R2 key pattern:** `wp/source-audio/{episodeId}.{ext}`

**Backend changes (`worker/queues/transcription.ts`):**
- After downloading audio for STT (tier 3 only), store to R2 as `SOURCE_AUDIO` work product before passing to STT provider
- Upsert WorkProduct index row with metadata: content-type, content-length, source URL
- Log source metadata via `writeEvent`

**Work product types (`worker/lib/work-products.ts`):**
- Add `SOURCE_AUDIO` to `WorkProductType` enum and `wpKey()` function

**Schema (`prisma/schema.prisma`):**
- Add `SOURCE_AUDIO` to `WorkProductType` enum

**Frontend (`src/pages/admin/requests.tsx`):**
- Add `SOURCE_AUDIO` to work product type handling (icon: `FileAudio`, label: "Source Audio")
- Sort order: `SOURCE_AUDIO` renders first in the work products list
- Uses same audio player as `AUDIO_CLIP`

**API:**
- Existing `/requests/work-product/:id/audio` endpoint handles streaming — no changes needed
- Existing work product matching in `GET /requests/:id` needs `SOURCE_AUDIO` mapped to `TRANSCRIPTION` stage

---

## Feature 2 — Enriched Pipeline Events

### Problem

Pipeline events are too coarse for debugging failures. A "Transcription failed" event doesn't include the audio file metadata, provider response details, or context needed to find common failure patterns.

### Design

No UI changes. Enrich `writeEvent` calls across all 5 stages with diagnostic context.

**Transcription (`worker/queues/transcription.ts`):**
- Before STT call: audio file size, duration (if known), content-type, source URL (truncated), provider + model
- On audio download: HTTP status, content-type, content-length headers
- On STT failure: full error body/message, HTTP status code, audio metadata, retry attempt number
- On transcript source lookup: which sources tried, why each failed/succeeded

**Distillation (`worker/queues/distillation.ts`):**
- Before LLM call: transcript size (bytes), model selected, prompt token estimate
- On LLM failure: full error response, model, token counts at failure point
- On claim extraction: claim count, any parsing issues

**Narrative Generation (`worker/queues/narrative-generation.ts`):**
- Before LLM call: claim count, duration tier, model, target word count
- On failure: full error body, partial output length if any

**Audio Generation (`worker/queues/audio-generation.ts`):**
- Before TTS call: narrative word count, voice selection, provider + model
- On failure: full error body, provider response details

**Briefing Assembly (`worker/queues/briefing-assembly.ts`):**
- Clip resolution: whether clipId came from job record or required DB fallback lookup
- Per-feedItem processing: userId, whether briefing was created or reused

### Implementation note

Each enrichment is an additional `writeEvent()` call or expanding the `data` parameter on an existing call. No new infrastructure.

---

## Feature 3 — Double-click Job Navigation

### Problem

When investigating a job in Pipeline Monitor or Command Center, there's no way to jump to its full history in the Requests page.

### Design

**Pipeline page (`src/pages/admin/pipeline.tsx`):**
- Add `onDoubleClick` handler to job cards in stage columns
- Navigate to `/admin/requests?requestId={requestId}&jobId={jobId}`

**Command Center (`src/pages/admin/command-center.tsx`):**
- Active Issues: `onDoubleClick` on issue card → navigate using issue's `entityId` (resolves to requestId/jobId)
- Pipeline Pulse events: `onDoubleClick` on event row → navigate using event's job/request context

**Requests page — receiving end (`src/pages/admin/requests.tsx`):**
- On mount, read `requestId` and `jobId` from URL search params
- Auto-select the matching request in the list
- Auto-expand the matching job accordion
- Scroll the job into view

**Navigation:**
- Use `react-router-dom` `useNavigate()` for programmatic navigation
- Use `useSearchParams()` on the requests page to read incoming params

---

## Feature 4 — Dismiss Failed Jobs

### Problem

Failed jobs persist in Pipeline Monitor stage columns and CC Active Issues indefinitely, cluttering the real-time views with stale failures.

### Design

**Schema (`prisma/schema.prisma`):**
- Add `dismissedAt DateTime?` to `PipelineJob` model

**API (`worker/routes/admin/pipeline.ts` or new file):**
- `PATCH /api/admin/pipeline/jobs/:id/dismiss` — sets `dismissedAt = now()` on the job
- `PATCH /api/admin/pipeline/jobs/dismiss-all` — sets `dismissedAt = now()` on all FAILED jobs where `dismissedAt IS NULL`

**Pipeline page (`src/pages/admin/pipeline.tsx`):**
- Add dismiss button (X icon) on failed job cards in stage columns
- Add "Dismiss All" button in the Dead Letter Queue section header
- Filter: pipeline queries add `dismissedAt: null` to WHERE clause
- Optimistic UI: job disappears immediately on dismiss

**Command Center (`src/pages/admin/command-center.tsx`):**
- Existing Active Issues dismiss button → also calls the new dismiss API to set `dismissedAt` on the underlying PipelineJob
- Add "Dismiss All" button to Active Issues section header
- Dismissing from either Monitor or CC dismisses from both (same `dismissedAt` field)

**Requests page:**
- No change. Shows all jobs regardless of `dismissedAt` — complete history preserved.

**Query changes:**
- Pipeline list API: add `AND dismissedAt IS NULL` to job queries
- CC Active Issues API: filter out jobs where `dismissedAt IS NOT NULL`
- Requests detail API: no filter (shows everything)

---

## Files Affected

### Schema
- `prisma/schema.prisma` — `WorkProductType` enum + `PipelineJob.dismissedAt`

### Backend
- `worker/lib/work-products.ts` — `SOURCE_AUDIO` type + key pattern
- `worker/queues/transcription.ts` — store source audio + enriched events
- `worker/queues/distillation.ts` — enriched events
- `worker/queues/narrative-generation.ts` — enriched events
- `worker/queues/audio-generation.ts` — enriched events
- `worker/queues/briefing-assembly.ts` — enriched events
- `worker/routes/admin/requests.ts` — SOURCE_AUDIO stage mapping
- `worker/routes/admin/pipeline.ts` — dismiss endpoints + dismissedAt filter

### Frontend
- `src/types/admin.ts` — `SOURCE_AUDIO` type, `dismissedAt` field
- `src/pages/admin/requests.tsx` — SOURCE_AUDIO rendering + URL param auto-select
- `src/pages/admin/pipeline.tsx` — dismiss buttons + double-click handler
- `src/pages/admin/command-center.tsx` — dismiss integration + double-click handler
