# Pipeline Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured, runtime-configurable logging across all 7 pipeline handlers + scheduled trigger.

**Architecture:** A thin `createPipelineLogger` factory in `worker/lib/logger.ts` emits structured JSON via `console.log`/`console.error`. Log level is read from PlatformConfig (`pipeline.logLevel`) once per batch. All demand-driven logs carry `requestId` for correlation. A log level dropdown is added to the Configuration page's Pipeline Controls panel.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers console, PlatformConfig (existing)

---

### Task 1: Create the logger utility with tests

**Files:**
- Create: `worker/lib/__tests__/logger.test.ts`
- Create: `worker/lib/logger.ts`

**Step 1: Write the tests**

Create `worker/lib/__tests__/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

vi.mock("../config", () => ({
  getConfig: vi.fn().mockResolvedValue("info"),
}));

const { getConfig } = await import("../config");
const { createPipelineLogger, LOG_LEVELS } = await import("../logger");

describe("createPipelineLogger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as any).mockResolvedValue("info");
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should emit info-level JSON to console.log", async () => {
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.info("transcript_fetched", { episodeId: "ep1", bytes: 5000 });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({
      level: "info",
      stage: "transcription",
      action: "transcript_fetched",
      episodeId: "ep1",
      bytes: 5000,
    });
    expect(parsed.ts).toBeDefined();
  });

  it("should emit error-level JSON to console.error with error details", async () => {
    const log = await createPipelineLogger({ stage: "distillation", prisma: {} as any });
    const err = new Error("connection timeout");
    log.error("claude_api_failed", { episodeId: "ep2" }, err);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({
      level: "error",
      stage: "distillation",
      action: "claude_api_failed",
      episodeId: "ep2",
      error: "connection timeout",
    });
    expect(parsed.stack).toBeDefined();
  });

  it("should include requestId when provided", async () => {
    const log = await createPipelineLogger({ stage: "orchestrator", requestId: "req_abc", prisma: {} as any });
    log.info("request_evaluated", {});

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBe("req_abc");
  });

  it("should suppress debug logs when level is info", async () => {
    (getConfig as any).mockResolvedValue("info");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.debug("idempotency_skip", { episodeId: "ep1" });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should emit debug logs when level is debug", async () => {
    (getConfig as any).mockResolvedValue("debug");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.debug("idempotency_skip", { episodeId: "ep1" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.level).toBe("debug");
  });

  it("should always emit errors regardless of log level", async () => {
    (getConfig as any).mockResolvedValue("error");
    const log = await createPipelineLogger({ stage: "transcription", prisma: {} as any });
    log.info("should_be_suppressed", {});
    log.error("should_appear", {}, new Error("fail"));

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("timer should log elapsed duration", async () => {
    const log = await createPipelineLogger({ stage: "clip-generation", prisma: {} as any });
    const elapsed = log.timer("tts_generation");
    // Simulate some work
    elapsed();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.action).toBe("tts_generation");
    expect(typeof parsed.durationMs).toBe("number");
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("LOG_LEVELS should define correct hierarchy", () => {
    expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.info);
    expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.debug);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/lib/__tests__/logger.test.ts`
Expected: FAIL — `worker/lib/logger.ts` does not exist

**Step 3: Implement the logger**

Create `worker/lib/logger.ts`:

```typescript
import { getConfig } from "./config";

export const LOG_LEVELS: Record<string, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

interface LoggerOptions {
  stage: string;
  requestId?: string;
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } };
}

interface PipelineLogger {
  info: (action: string, data: Record<string, unknown>) => void;
  debug: (action: string, data: Record<string, unknown>) => void;
  error: (action: string, data: Record<string, unknown>, err?: unknown) => void;
  timer: (action: string) => () => void;
}

export async function createPipelineLogger(opts: LoggerOptions): Promise<PipelineLogger> {
  const levelName = await getConfig(opts.prisma, "pipeline.logLevel", "info");
  const threshold = LOG_LEVELS[levelName as string] ?? LOG_LEVELS.info;

  const base = {
    stage: opts.stage,
    ...(opts.requestId ? { requestId: opts.requestId } : {}),
  };

  function emit(level: string, action: string, data: Record<string, unknown>) {
    const line = JSON.stringify({ level, ...base, action, ...data, ts: new Date().toISOString() });
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    info(action, data) {
      if (threshold >= LOG_LEVELS.info) emit("info", action, data);
    },
    debug(action, data) {
      if (threshold >= LOG_LEVELS.debug) emit("debug", action, data);
    },
    error(action, data, err?) {
      const errData: Record<string, unknown> = { ...data };
      if (err instanceof Error) {
        errData.error = err.message;
        errData.stack = err.stack;
      } else if (err !== undefined) {
        errData.error = String(err);
      }
      emit("error", action, errData);
    },
    timer(action) {
      const start = Date.now();
      return () => {
        emit(threshold >= LOG_LEVELS.info ? "info" : "debug", action, { durationMs: Date.now() - start });
      };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/logger.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add worker/lib/logger.ts worker/lib/__tests__/logger.test.ts
git commit -m "feat: add structured pipeline logger with runtime log levels"
```

---

### Task 2: Instrument feed-refresh handler

**Files:**
- Modify: `worker/queues/feed-refresh.ts`
- Modify: `worker/queues/__tests__/feed-refresh.test.ts`

**Context:** Feed refresh is stage 1. It has no `requestId` (cron-triggered), so use a generated `batchId` for correlation. Currently has 1 `console.error` which will be replaced by `log.error`.

**Step 1: Update the test file to mock the logger**

Add to the top of `worker/queues/__tests__/feed-refresh.test.ts`, alongside existing mocks:

```typescript
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
};
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));
```

In `beforeEach`, add:

```typescript
mockLogger.info.mockReset();
mockLogger.debug.mockReset();
mockLogger.error.mockReset();
mockLogger.timer.mockReset().mockReturnValue(vi.fn());
```

Add these test cases:

```typescript
it("should log batch_start and batch_complete", async () => {
  const msg = createMsg({});
  mockPrisma.podcast.findMany.mockResolvedValue([]);

  await handleFeedRefresh(createBatch([msg]), env, ctx);

  expect(mockLogger.info).toHaveBeenCalledWith("batch_start", expect.objectContaining({ messageCount: 1 }));
  expect(mockLogger.info).toHaveBeenCalledWith("batch_complete", expect.objectContaining({ podcastCount: 0 }));
});

it("should log stage_disabled when stage is off", async () => {
  (getConfig as any).mockResolvedValueOnce(false);
  const msg = createMsg({});

  await handleFeedRefresh(createBatch([msg]), env, ctx);

  expect(mockLogger.info).toHaveBeenCalledWith("stage_disabled", expect.objectContaining({ stage: 1 }));
});

it("should log per-podcast results at info level", async () => {
  const msg = createMsg({});
  mockPrisma.podcast.findMany.mockResolvedValue([
    { id: "p1", feedUrl: "https://example.com/feed.xml" },
  ]);
  mockPrisma.episode.upsert.mockResolvedValue({});
  mockPrisma.podcast.update.mockResolvedValue({});

  await handleFeedRefresh(createBatch([msg]), env, ctx);

  expect(mockLogger.info).toHaveBeenCalledWith("podcast_refreshed", expect.objectContaining({ podcastId: "p1" }));
});

it("should log podcast_error on feed failure", async () => {
  const msg = createMsg({});
  mockPrisma.podcast.findMany.mockResolvedValue([
    { id: "p1", feedUrl: "https://bad-url.com/feed.xml" },
  ]);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

  await handleFeedRefresh(createBatch([msg]), env, ctx);

  expect(mockLogger.error).toHaveBeenCalledWith("podcast_error", expect.objectContaining({ podcastId: "p1" }), expect.any(Error));
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run worker/queues/__tests__/feed-refresh.test.ts`
Expected: New tests FAIL (handler doesn't emit logs yet)

**Step 3: Instrument the handler**

Modify `worker/queues/feed-refresh.ts`:

1. Add import at top:
```typescript
import { createPipelineLogger } from "../lib/logger";
```

2. After `const prisma = ...`, add:
```typescript
const log = await createPipelineLogger({ stage: "feed-refresh", prisma });
log.info("batch_start", { messageCount: batch.messages.length });
```

3. After the stage gate `if (!stageEnabled)` block, add inside the if:
```typescript
log.info("stage_disabled", { stage: 1 });
```

4. After the podcast filter logic (`fetchAll` decision), add:
```typescript
log.debug("podcast_filter", { fetchAll, podcastIds: [...podcastIds] });
```

5. After `const podcasts = ...`, add:
```typescript
log.debug("podcasts_loaded", { count: podcasts.length });
```

6. Inside the per-podcast `try` block, after the episode loop completes, add:
```typescript
log.info("podcast_refreshed", { podcastId: podcast.id, episodesProcessed: recent.length });
```

7. Replace the existing `console.error(...)` in the per-podcast catch with:
```typescript
log.error("podcast_error", { podcastId: podcast.id }, err);
```

8. Before the final ack loop, add:
```typescript
log.info("batch_complete", { podcastCount: podcasts.length });
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/feed-refresh.test.ts`
Expected: All tests PASS (existing + new)

**Step 5: Commit**

```bash
git add worker/queues/feed-refresh.ts worker/queues/__tests__/feed-refresh.test.ts
git commit -m "feat: add structured logging to feed-refresh handler"
```

---

### Task 3: Instrument transcription handler

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/__tests__/transcription.test.ts`

**Context:** Stage 2. Has `requestId` from orchestrator. Key events: stage gate, idempotency skip, transcript fetch + size, status transition, orchestrator callback, errors.

**Step 1: Add logger mock and tests**

Add to `worker/queues/__tests__/transcription.test.ts` alongside existing mocks:

```typescript
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
};
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));
```

In `beforeEach`, add resets for mockLogger (same pattern as Task 2).

Add test cases:

```typescript
it("should log transcript_fetched with byte count on success", async () => {
  const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
  mockPrisma.pipelineJob.create.mockResolvedValue({});
  mockPrisma.distillation.update.mockResolvedValue({});

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(mockLogger.info).toHaveBeenCalledWith("transcript_fetched", expect.objectContaining({
    episodeId: "ep1",
    bytes: expect.any(Number),
  }));
});

it("should log idempotency_skip at debug level", async () => {
  const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
  mockPrisma.distillation.findUnique.mockResolvedValue({ status: "COMPLETED" });

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(mockLogger.debug).toHaveBeenCalledWith("idempotency_skip", expect.objectContaining({
    episodeId: "ep1",
    existingStatus: "COMPLETED",
  }));
});

it("should log episode_error on failure", async () => {
  const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.distillation.upsert.mockRejectedValue(new Error("DB error"));

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(mockLogger.error).toHaveBeenCalledWith("episode_error", expect.objectContaining({
    episodeId: "ep1",
  }), expect.any(Error));
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: New tests FAIL

**Step 3: Instrument the handler**

Modify `worker/queues/transcription.ts`:

1. Add import: `import { createPipelineLogger } from "../lib/logger";`

2. After `const prisma = ...`:
```typescript
const log = await createPipelineLogger({ stage: "transcription", prisma });
log.info("batch_start", { messageCount: batch.messages.length });
```

3. In the stage gate disabled block: `log.info("stage_disabled", { stage: 2 });`

4. In the idempotency skip block (where `SKIP_STATUSES.has`):
```typescript
log.debug("idempotency_skip", { episodeId, existingStatus: existing.status });
```

5. After `const transcript = await response.text()`:
```typescript
log.info("transcript_fetched", { episodeId, bytes: transcript.length });
```

6. After orchestrator callback send:
```typescript
log.debug("orchestrator_notified", { episodeId, requestId, stage: 2 });
```

7. In the catch block, before `msg.retry()`:
```typescript
log.error("episode_error", { episodeId }, err);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: add structured logging to transcription handler"
```

---

### Task 4: Instrument distillation handler

**Files:**
- Modify: `worker/queues/distillation.ts`
- Modify: `worker/queues/__tests__/distillation.test.ts`

**Context:** Stage 3. Key events: stage gate, idempotency skip, claims extraction with Claude API timing, orchestrator callback, errors. Uses `requestId`.

**Step 1: Add logger mock and tests**

Same mock pattern as Tasks 2-3. Key test cases:

```typescript
it("should log claims_extracted with claim count and timing", async () => {
  // Setup: existing distillation with transcript
  // Assert: mockLogger.info called with "claims_extracted" and { episodeId, claimCount }
  // Assert: mockLogger.timer was called with "claude_extraction"
});

it("should log idempotency_skip when COMPLETED", async () => {
  // Setup: existing completed distillation
  // Assert: mockLogger.debug called with "idempotency_skip"
});

it("should log episode_error on failure", async () => {
  // Setup: extractClaims throws
  // Assert: mockLogger.error called with "episode_error"
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`

**Step 3: Instrument the handler**

Add to `worker/queues/distillation.ts`:

1. Import logger, create at start with `requestId` from first message (or undefined)
2. `log.info("batch_start", { messageCount })` after creation
3. `log.info("stage_disabled", { stage: 3 })` in gate block
4. `log.debug("idempotency_skip", { episodeId, existingStatus: existing.status })` on skip
5. `const elapsed = log.timer("claude_extraction")` before `extractClaims` call
6. After claims extracted: `elapsed()` then `log.info("claims_extracted", { episodeId, claimCount: claims.length })`
7. `log.debug("orchestrator_notified", { episodeId, requestId, stage: 3 })` after callback
8. `log.error("episode_error", { episodeId }, err)` in catch

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/distillation.test.ts`

**Step 5: Commit**

```bash
git add worker/queues/distillation.ts worker/queues/__tests__/distillation.test.ts
git commit -m "feat: add structured logging to distillation handler"
```

---

### Task 5: Instrument clip-generation handler

**Files:**
- Modify: `worker/queues/clip-generation.ts`
- Modify: `worker/queues/__tests__/clip-generation.test.ts`

**Context:** Stage 4. Key events: stage gate, idempotency skip, narrative generation (Claude Pass 2) timing, TTS timing, R2 upload, orchestrator callback. Most expensive handler — timing is critical.

**Step 1: Add logger mock and tests**

Same mock pattern. Key test cases:

```typescript
it("should log narrative_generated with word count", async () => {
  // Assert: mockLogger.info called with "narrative_generated" and { episodeId, wordCount }
});

it("should use timer for tts_generation", async () => {
  // Assert: mockLogger.timer called with "tts_generation"
});

it("should log clip_completed on success", async () => {
  // Assert: mockLogger.info called with "clip_completed" and { episodeId, durationTier, audioKey }
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/clip-generation.test.ts`

**Step 3: Instrument the handler**

Add to `worker/queues/clip-generation.ts`:

1. Import logger, create at start
2. `log.info("batch_start", ...)` and `log.info("stage_disabled", { stage: 4 })` in gate
3. `log.debug("idempotency_skip", { episodeId, durationTier })` on skip
4. `const narrativeTimer = log.timer("narrative_generation")` before `generateNarrative`
5. After narrative: `narrativeTimer()` then `log.info("narrative_generated", { episodeId, wordCount })`
6. `const ttsTimer = log.timer("tts_generation")` before `generateSpeech`
7. After TTS: `ttsTimer()` then `log.info("audio_generated", { episodeId })`
8. After R2 put: `log.info("clip_completed", { episodeId, durationTier, audioKey })`
9. `log.debug("orchestrator_notified", { episodeId, requestId, stage: 4 })` after callback
10. `log.error("episode_error", { episodeId, durationTier }, err)` in catch

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/clip-generation.test.ts`

**Step 5: Commit**

```bash
git add worker/queues/clip-generation.ts worker/queues/__tests__/clip-generation.test.ts
git commit -m "feat: add structured logging to clip-generation handler"
```

---

### Task 6: Instrument briefing-assembly handler

**Files:**
- Modify: `worker/queues/briefing-assembly.ts`
- Modify: `worker/queues/__tests__/briefing-assembly.test.ts`

**Context:** Stage 5. Key events: stage gate, subscription count, ready episodes count, clips ready/missing, re-queue decision, MP3 concat timing, R2 upload, completion.

**Step 1: Add logger mock and tests**

Same mock pattern. Key test cases:

```typescript
it("should log assembly_start and assembly_complete", async () => { ... });
it("should log requeue_waiting when clips are missing", async () => { ... });
it("should log assembly_error on failure", async () => { ... });
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/briefing-assembly.test.ts`

**Step 3: Instrument the handler**

Add to `worker/queues/briefing-assembly.ts`:

1. Import logger, create at start
2. `log.info("batch_start", ...)` and `log.info("stage_disabled", { stage: 5 })` in gate
3. `log.info("assembly_start", { briefingId })` at start of per-message block
4. `log.info("episodes_ready", { briefingId, readyCount: readyEpisodes.length, totalSubscriptions: subscriptions.length })` after readiness check
5. `log.info("clips_status", { briefingId, ready: validBuffers.length, missing: allocations.length - validBuffers.length })` after clip check
6. `log.info("requeue_waiting", { briefingId, delaySeconds: 60 })` when re-queueing
7. Timer around `concatMp3Buffers`: `const concatTimer = log.timer("mp3_concat")` / `concatTimer()`
8. `log.info("assembly_complete", { briefingId, audioKey })` on success
9. `log.error("assembly_error", { briefingId }, err)` in catch

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/briefing-assembly.test.ts`

**Step 5: Commit**

```bash
git add worker/queues/briefing-assembly.ts worker/queues/__tests__/briefing-assembly.test.ts
git commit -m "feat: add structured logging to briefing-assembly handler"
```

---

### Task 7: Instrument orchestrator handler

**Files:**
- Modify: `worker/queues/orchestrator.ts`
- Modify: `worker/queues/__tests__/orchestrator.test.ts`

**Context:** The pipeline brain. Key events: request status check, status transition, per-podcast episode evaluation, stage dispatch decisions, all-ready assembly, completion, failure. Every log carries `requestId`.

**Step 1: Add logger mock and tests**

Same mock pattern. Key test cases:

```typescript
it("should log request_evaluated with action type", async () => { ... });
it("should log stage_dispatched when queueing work", async () => { ... });
it("should log request_completed on success", async () => { ... });
it("should log request_failed on error", async () => { ... });
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/orchestrator.test.ts`

**Step 3: Instrument the handler**

Add to `worker/queues/orchestrator.ts`:

1. Import logger
2. Inside the per-message loop, create logger with `requestId`:
```typescript
const log = await createPipelineLogger({ stage: "orchestrator", requestId, prisma });
log.info("request_evaluated", { action: msg.body.action });
```
3. `log.info("request_status_transition", { from: "PENDING", to: "PROCESSING" })` on status change
4. Inside per-podcast loop, use debug for each episode evaluation:
```typescript
log.debug("episode_evaluated", { podcastId, episodeId: episode?.id, distillationStatus: dist?.status, decision });
```
5. When dispatching to a queue:
```typescript
log.info("stage_dispatched", { stage: N, episodeId: episode.id, queue: "queue-name" });
```
6. `log.info("all_episodes_ready", { requestId, episodeCount: readyEpisodes.length })` before assembly
7. Timer around assembly: `log.timer("briefing_assembly")`
8. `log.info("request_completed", { requestId, briefingId: briefing.id })` on success
9. `log.info("request_failed", { requestId, reason })` on no-episodes-available
10. `log.error("request_error", { requestId }, err)` in catch

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/orchestrator.test.ts`

**Step 5: Commit**

```bash
git add worker/queues/orchestrator.ts worker/queues/__tests__/orchestrator.test.ts
git commit -m "feat: add structured logging to orchestrator handler"
```

---

### Task 8: Instrument scheduled handler

**Files:**
- Modify: `worker/queues/index.ts`
- Modify: `worker/queues/__tests__/scheduled.test.ts`

**Context:** The cron entry point. Key events: pipeline enabled/disabled, interval check (elapsed vs minimum), feed-refresh enqueued, lastAutoRunAt updated.

**Step 1: Add logger mock and tests**

Same mock pattern. Key test cases:

```typescript
it("should log pipeline_disabled when pipeline is off", async () => { ... });
it("should log interval_skip when too soon", async () => { ... });
it("should log feed_refresh_enqueued on successful trigger", async () => { ... });
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/queues/__tests__/scheduled.test.ts`

**Step 3: Instrument the scheduled function**

In `worker/queues/index.ts`, modify the `scheduled` function:

1. Import logger
2. After `const prisma = ...`:
```typescript
const log = await createPipelineLogger({ stage: "scheduled", prisma });
```
3. In the `if (!enabled)` block: `log.info("pipeline_disabled", {})`
4. In the interval check `if (elapsedMinutes < minIntervalMinutes)`:
```typescript
log.debug("interval_skip", { elapsedMinutes: Math.round(elapsedMinutes), minIntervalMinutes });
```
5. After enqueueing feed refresh:
```typescript
log.info("feed_refresh_enqueued", { trigger: "cron" });
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/scheduled.test.ts`

**Step 5: Commit**

```bash
git add worker/queues/index.ts worker/queues/__tests__/scheduled.test.ts
git commit -m "feat: add structured logging to scheduled handler"
```

---

### Task 9: Add log level dropdown to Configuration page

**Files:**
- Modify: `src/pages/admin/configuration.tsx`

**Context:** The Pipeline Controls panel already has the master toggle, interval selector, stage toggles, max episodes input, and manual run button. Add a log level dropdown after the max episodes input.

**Step 1: Add the log level dropdown**

In `src/pages/admin/configuration.tsx`, in the `PipelineControlsPanel` function, after the "Max Episodes per Podcast" `div` (around line 293) and before the "Manual Run" `div`, add:

```tsx
{/* Log Level */}
<div className="bg-[#0F1D32] border border-white/5 rounded-lg p-4">
  <div className="flex items-center justify-between">
    <div>
      <Label className="text-xs text-[#F9FAFB]">Pipeline Log Level</Label>
      <p className="text-[10px] text-[#9CA3AF] mt-0.5">
        Controls verbosity of pipeline console output
      </p>
    </div>
    <Select
      value={
        (() => {
          const entry = configs.find((c) => c.key === "pipeline.logLevel");
          return (entry?.value as string) ?? "info";
        })()
      }
      onValueChange={(v) => updateConfig("pipeline.logLevel", v)}
      disabled={saving === "pipeline.logLevel"}
    >
      <SelectTrigger className="w-28 h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
        <SelectItem value="error" className="text-xs">Error</SelectItem>
        <SelectItem value="info" className="text-xs">Info</SelectItem>
        <SelectItem value="debug" className="text-xs">Debug</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

**Step 2: Verify it renders**

Run: `npx vitest run src/__tests__/configuration.test.tsx` (if exists) or verify manually with `npm run dev`.

**Step 3: Commit**

```bash
git add src/pages/admin/configuration.tsx
git commit -m "feat: add log level dropdown to Pipeline Controls panel"
```

---

### Task 10: Run full test suite and fix any issues

**Step 1: Run all backend tests**

Run: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/`
Expected: All tests PASS (331+ existing + new logging tests)

**Step 2: Run frontend tests**

Run: `npx vitest run src/`
Expected: 60+ tests PASS (2 pre-existing failures in discover/settings are OK)

**Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Fix any failures, then commit fixes**

If any tests fail, fix them and commit with `fix: resolve logging test failures`.

---

### Task 11: Update STAGE_QUEUE_MAP and STAGE_NAMES in config.ts

**Files:**
- Modify: `worker/lib/config.ts`

**Context:** The `STAGE_QUEUE_MAP` and `STAGE_NAMES` in `worker/lib/config.ts` are outdated — they still show the old 4-stage numbering (missing transcription at stage 2, wrong names for 2-4). Update to match the current 5-stage pipeline.

**Step 1: Update the maps**

Replace the existing `STAGE_QUEUE_MAP` and `STAGE_NAMES` in `worker/lib/config.ts`:

```typescript
/** Pipeline stage number → queue message type mapping */
export const STAGE_QUEUE_MAP: Record<number, string> = {
  1: "FEED_REFRESH",
  2: "TRANSCRIPTION",
  3: "DISTILLATION",
  4: "CLIP_GENERATION",
  5: "BRIEFING_ASSEMBLY",
};

/** Pipeline stage number → display name */
export const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};
```

**Step 2: Run tests to make sure nothing breaks**

Run: `npx vitest run worker/lib/__tests__/config.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add worker/lib/config.ts
git commit -m "fix: update STAGE_QUEUE_MAP and STAGE_NAMES to 5-stage pipeline"
```
