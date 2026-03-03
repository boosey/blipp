# Pipeline Logging Design

## Goal

Add structured, runtime-configurable logging throughout the Blipp pipeline for real-time debugging via `wrangler tail` and future external service integration.

## Architecture

A thin `PipelineLogger` utility emits structured JSON to `console.log`/`console.error`. Log level is controlled at runtime via PlatformConfig (`pipeline.logLevel`), read once per batch through the existing `getConfig` 60s TTL cache. Every demand-driven log line carries `requestId` for end-to-end tracing.

## Logger API

Single file: `worker/lib/logger.ts`

```typescript
const log = createPipelineLogger({ stage: "transcription", requestId, env });

log.info("transcript_fetched", { episodeId, bytes: 14200 });
log.debug("idempotency_skip", { episodeId, status: "COMPLETED" });
log.error("transcript_fetch_failed", { episodeId, url }, err);

const elapsed = log.timer("claude_extraction");
// ... work ...
elapsed(); // logs: { action: "claude_extraction", durationMs: 3420 }
```

### Output Format

Each call emits one JSON line:

```json
{
  "level": "info",
  "stage": "transcription",
  "action": "transcript_fetched",
  "requestId": "req_abc",
  "episodeId": "ep_123",
  "bytes": 14200,
  "ts": "2026-03-03T12:00:00.000Z"
}
```

### Log Levels

- `error` — only errors (always emitted)
- `info` — key events: stage start/complete, queue dispatches, timing, errors (default)
- `debug` — verbose: per-episode detail, idempotency skips, DB upserts, intermediate values

Hierarchy: `error` < `info` < `debug`. Setting `"debug"` emits everything.

## Runtime Configuration

One PlatformConfig key: `pipeline.logLevel` with values `"error"` | `"info"` | `"debug"`, default `"info"`.

A dropdown is added to the existing Pipeline Controls panel on the Configuration page.

## Log Points Per Handler

### Standard (all handlers)

- Batch received (message count, stage)
- Stage gate check result (enabled / disabled / bypassed by manual)
- Per-message start and completion or error
- Timer around expensive operations

### Handler-Specific

| Handler | info-level | debug-level |
|---------|-----------|-------------|
| Feed Refresh (1) | batch start, per-podcast episodes found/created, batch complete with total timing | per-episode upsert skip, fetchAll vs filtered decision |
| Transcription (2) | transcript fetched (byte size), status transition to TRANSCRIPT_READY, orchestrator callback sent | idempotency skip, PipelineJob creation detail |
| Distillation (3) | claims extracted (claim count), Claude API call timing, orchestrator callback sent | idempotency skip, transcript word count |
| Clip Generation (4) | narrative generated (word count), TTS call timing, R2 upload complete, orchestrator callback sent | idempotency skip, duration tier selected |
| Briefing Assembly (5) | clips ready vs missing count, re-queue decision (with delay), MP3 concat timing, R2 upload complete, briefing completed | per-clip cache hit/miss, segment creation |
| Orchestrator | request evaluated (action type), stage dispatched (which stage, episode count), all-ready assembly triggered, request completed/failed | per-episode readiness check, per-podcast latest episode resolution |
| Scheduled | pipeline enabled/disabled result, interval check (elapsed time vs minimum), feed-refresh enqueued | lastAutoRunAt timestamp value |

### Error Logging

Every existing `catch` block gets `log.error(action, context, err)` alongside the existing DB error storage. The error object's message and stack are included in the JSON output.

## Correlation

All demand-driven pipeline logs include `requestId` (from BriefingRequest). Feed refresh (cron-triggered) logs include `batchId` (generated per batch) instead. This enables filtering in `wrangler tail`:

```bash
wrangler tail --format=json | jq 'select(.requestId == "req_abc")'
```

## UI Changes

Single addition: log level dropdown (`Error` / `Info` / `Debug`) in the Pipeline Controls panel on the Configuration page. No new pages, no new admin routes (uses existing config PATCH endpoint).

## Non-Goals

- No external log shipping (future work — the JSON format is ready for it)
- No new database tables or columns
- No changes to existing error handling behavior (DB storage + queue retry)
- No frontend log viewer
