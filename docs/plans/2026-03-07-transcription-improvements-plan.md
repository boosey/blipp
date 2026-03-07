# Transcription Pipeline Improvements Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Podcast Index transcript lookup as a middle tier and chunked Whisper transcription for oversized audio files.

**Architecture:** Extend the transcription handler's waterfall from 2 to 3 tiers (RSS → Podcast Index → Whisper), and add byte-range chunking for MP3 files exceeding Whisper's 25MB limit. Extract transcript fetching logic into a helper module for testability.

**Tech Stack:** TypeScript, Vitest, OpenAI Whisper API, Podcast Index API, existing PodcastIndexClient

---

### Task 1: Create transcript source helper module

**Files:**
- Create: `worker/lib/transcript-source.ts`
- Test: `worker/lib/__tests__/transcript-source.test.ts`

This module encapsulates the three-tier transcript waterfall logic, making the transcription queue handler simpler and each tier independently testable.

**Step 1: Write the test file**

```typescript
// worker/lib/__tests__/transcript-source.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupPodcastIndexTranscript } from "../transcript-source";

// Mock the podcast-index module
vi.mock("../podcast-index", () => ({
  PodcastIndexClient: vi.fn().mockImplementation(() => ({
    episodesByFeedId: vi.fn(),
  })),
}));

import { PodcastIndexClient } from "../podcast-index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lookupPodcastIndexTranscript", () => {
  const mockClient = {
    episodesByFeedId: vi.fn(),
  };

  it("returns null when podcast has no podcastIndexId", async () => {
    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      null,
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
    expect(mockClient.episodesByFeedId).not.toHaveBeenCalled();
  });

  it("returns transcriptUrl when episode matched by GUID", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "test-guid", title: "Test Episode", transcriptUrl: "https://example.com/transcript.vtt" },
      { guid: "other-guid", title: "Other Episode", transcriptUrl: null },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-123",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBe("https://example.com/transcript.vtt");
    expect(mockClient.episodesByFeedId).toHaveBeenCalledWith(123, 20);
  });

  it("returns null when matched episode has no transcriptUrl", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "test-guid", title: "Test Episode", transcriptUrl: null },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-456",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
  });

  it("returns null when no episodes match", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([
      { guid: "unrelated", title: "Unrelated Episode", transcriptUrl: "https://example.com/t.vtt" },
    ]);

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-789",
      "no-match-guid",
      "No Match Title"
    );
    expect(result).toBeNull();
  });

  it("returns null when API call fails (does not throw)", async () => {
    mockClient.episodesByFeedId.mockRejectedValue(new Error("API down"));

    const result = await lookupPodcastIndexTranscript(
      mockClient as any,
      "pi-999",
      "test-guid",
      "Test Episode"
    );
    expect(result).toBeNull();
  });

  it("parses numeric podcastIndexId from string", async () => {
    mockClient.episodesByFeedId.mockResolvedValue([]);

    await lookupPodcastIndexTranscript(
      mockClient as any,
      "42",
      "test-guid",
      "Test Episode"
    );
    expect(mockClient.episodesByFeedId).toHaveBeenCalledWith(42, 20);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/transcript-source.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// worker/lib/transcript-source.ts
import type { PodcastIndexClient } from "./podcast-index";

/**
 * Looks up a transcript URL for an episode via the Podcast Index API.
 * Matches by GUID (preferred). Returns null if not found or on error.
 * This is a best-effort lookup — errors are swallowed, not thrown.
 */
export async function lookupPodcastIndexTranscript(
  client: PodcastIndexClient,
  podcastIndexId: string | null,
  episodeGuid: string,
  episodeTitle: string
): Promise<string | null> {
  if (!podcastIndexId) return null;

  try {
    const feedId = Number(podcastIndexId);
    if (isNaN(feedId)) return null;

    const episodes = await client.episodesByFeedId(feedId, 20);

    // Match by GUID (primary)
    const match = episodes.find((ep) => ep.guid === episodeGuid);
    return match?.transcriptUrl ?? null;
  } catch {
    // Best-effort: don't fail the pipeline over a PI lookup failure
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/transcript-source.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/lib/transcript-source.ts worker/lib/__tests__/transcript-source.test.ts
git commit -m "feat: add Podcast Index transcript lookup helper"
```

---

### Task 2: Create chunked Whisper transcription helper

**Files:**
- Create: `worker/lib/whisper-chunked.ts`
- Test: `worker/lib/__tests__/whisper-chunked.test.ts`

**Step 1: Write the test file**

```typescript
// worker/lib/__tests__/whisper-chunked.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAudioMetadata,
  transcribeChunked,
  WHISPER_MAX_BYTES,
  CHUNK_SIZE,
} from "../whisper-chunked";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("constants", () => {
  it("WHISPER_MAX_BYTES is 25MB", () => {
    expect(WHISPER_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it("CHUNK_SIZE is 20MB", () => {
    expect(CHUNK_SIZE).toBe(20 * 1024 * 1024);
  });
});

describe("getAudioMetadata", () => {
  it("returns content length and type from HEAD request", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Map([
        ["content-length", "52428800"],
        ["content-type", "audio/mpeg"],
      ]),
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: 52428800, contentType: "audio/mpeg" });
    expect(fetch).toHaveBeenCalledWith("https://example.com/audio.mp3", { method: "HEAD" });
  });

  it("returns null contentLength when header is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Map([["content-type", "audio/mpeg"]]),
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: null, contentType: "audio/mpeg" });
  });

  it("returns null contentType when header is missing", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Map([["content-length", "1000"]]),
    });

    const result = await getAudioMetadata("https://example.com/audio.mp3");
    expect(result).toEqual({ contentLength: 1000, contentType: null });
  });
});

describe("transcribeChunked", () => {
  const mockOpenai = {
    audio: {
      transcriptions: {
        create: vi.fn(),
      },
    },
  } as any;

  // Stub File if not available in test env
  beforeEach(() => {
    if (typeof globalThis.File === "undefined") {
      globalThis.File = class File extends Blob {
        name: string;
        lastModified: number;
        constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(parts, opts);
          this.name = name;
          this.lastModified = Date.now();
        }
      } as any;
    }
  });

  it("transcribes multiple chunks and concatenates text", async () => {
    const totalSize = 45 * 1024 * 1024; // 45MB = 3 chunks at 20MB each

    // Mock Range requests returning blobs
    (fetch as any).mockImplementation((_url: string, opts: any) => {
      if (opts?.method === "HEAD") {
        return Promise.resolve({
          ok: true,
          headers: new Map([
            ["content-length", String(totalSize)],
            ["content-type", "audio/mpeg"],
          ]),
        });
      }
      // Range request
      return Promise.resolve({
        ok: true,
        status: 206,
        blob: () => Promise.resolve(new Blob(["audio-chunk"])),
      });
    });

    mockOpenai.audio.transcriptions.create
      .mockResolvedValueOnce({ text: "Chunk one." })
      .mockResolvedValueOnce({ text: "Chunk two." })
      .mockResolvedValueOnce({ text: "Chunk three." });

    const result = await transcribeChunked(
      mockOpenai,
      "https://example.com/audio.mp3",
      totalSize,
      "whisper-1"
    );
    expect(result).toBe("Chunk one. Chunk two. Chunk three.");
    expect(mockOpenai.audio.transcriptions.create).toHaveBeenCalledTimes(3);
  });

  it("passes correct Range headers for each chunk", async () => {
    const totalSize = CHUNK_SIZE * 2 + 1000; // 2 full chunks + small remainder

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 206,
      blob: () => Promise.resolve(new Blob(["audio"])),
    });

    mockOpenai.audio.transcriptions.create.mockResolvedValue({ text: "text" });

    await transcribeChunked(mockOpenai, "https://example.com/a.mp3", totalSize, "whisper-1");

    // First chunk: bytes=0-20971519
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=0-${CHUNK_SIZE - 1}` },
    });
    // Second chunk
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=${CHUNK_SIZE}-${CHUNK_SIZE * 2 - 1}` },
    });
    // Third chunk (remainder)
    expect(fetch).toHaveBeenCalledWith("https://example.com/a.mp3", {
      headers: { Range: `bytes=${CHUNK_SIZE * 2}-${totalSize - 1}` },
    });
  });

  it("uses the provided model for each chunk", async () => {
    const totalSize = CHUNK_SIZE + 1000;

    (fetch as any).mockResolvedValue({
      ok: true,
      status: 206,
      blob: () => Promise.resolve(new Blob(["audio"])),
    });

    mockOpenai.audio.transcriptions.create.mockResolvedValue({ text: "text" });

    await transcribeChunked(mockOpenai, "https://example.com/a.mp3", totalSize, "whisper-1");

    for (const call of mockOpenai.audio.transcriptions.create.mock.calls) {
      expect(call[0].model).toBe("whisper-1");
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/whisper-chunked.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// worker/lib/whisper-chunked.ts
import type OpenAI from "openai";

/** Whisper API maximum file size: 25MB */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/** Target chunk size for splitting: 20MB (leaves margin under the 25MB limit) */
export const CHUNK_SIZE = 20 * 1024 * 1024;

/**
 * Fetches audio file metadata via HEAD request.
 * Returns content length and type for size/format decisions.
 */
export async function getAudioMetadata(
  audioUrl: string
): Promise<{ contentLength: number | null; contentType: string | null }> {
  const res = await fetch(audioUrl, { method: "HEAD" });
  const cl = res.headers.get("content-length");
  return {
    contentLength: cl ? Number(cl) : null,
    contentType: res.headers.get("content-type"),
  };
}

/**
 * Returns true if the content type or URL indicates MP3 format.
 */
export function isMp3(contentType: string | null, audioUrl: string): boolean {
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) return true;
  return audioUrl.toLowerCase().endsWith(".mp3");
}

/**
 * Transcribes an oversized audio file by downloading in byte-range chunks
 * and sending each chunk to Whisper separately. Concatenates results.
 *
 * Only works with MP3 files (frame-based format allows arbitrary byte splits).
 */
export async function transcribeChunked(
  client: OpenAI,
  audioUrl: string,
  totalBytes: number,
  model: string
): Promise<string> {
  const chunks: string[] = [];
  let offset = 0;

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE, totalBytes) - 1;
    const res = await fetch(audioUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
    });
    const blob = await res.blob();
    const file = new File([blob], "chunk.mp3", { type: "audio/mpeg" });

    const transcription = await client.audio.transcriptions.create({
      model,
      file,
    });
    chunks.push(transcription.text);
    offset = end + 1;
  }

  return chunks.join(" ");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run worker/lib/__tests__/whisper-chunked.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/lib/whisper-chunked.ts worker/lib/__tests__/whisper-chunked.test.ts
git commit -m "feat: add chunked Whisper transcription for oversized audio files"
```

---

### Task 3: Wire Podcast Index lookup into transcription handler

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/__tests__/transcription.test.ts`

**Step 1: Update the test file**

Add a mock for the new module after the existing mocks:

```typescript
vi.mock("../../lib/transcript-source", () => ({
  lookupPodcastIndexTranscript: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/podcast-index", () => ({
  PodcastIndexClient: vi.fn().mockImplementation(() => ({})),
}));
```

Add imports:

```typescript
const { lookupPodcastIndexTranscript } = await import("../../lib/transcript-source");
```

In `beforeEach`, re-set after `vi.clearAllMocks()`:

```typescript
(lookupPodcastIndexTranscript as any).mockReset();
(lookupPodcastIndexTranscript as any).mockResolvedValue(null);
```

Add the EPISODE's podcast mock setup. The handler now needs to load the podcast to get `podcastIndexId`. Add a PODCAST constant:

```typescript
const PODCAST = {
  id: "pod1",
  podcastIndexId: "42",
  feedUrl: "https://example.com/feed.xml",
};
```

Add `mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);` to all existing tests that reach the transcript-fetching logic (the ones that set `mockPrisma.episode.findUnique`).

Add new tests:

```typescript
it("Podcast Index lookup -> fetches transcript when RSS has none", async () => {
  const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
  const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
  mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
  mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
  mockPrisma.episode.update.mockResolvedValue({});
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
  mockPrisma.pipelineStep.update.mockResolvedValue({});

  (lookupPodcastIndexTranscript as any).mockResolvedValue("https://pi.example.com/transcript.vtt");

  // fetch returns VTT content for the PI transcript URL
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    text: vi.fn().mockResolvedValue("WEBVTT\n\n00:00.000 --> 00:05.000\nHello from Podcast Index"),
  }));

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(lookupPodcastIndexTranscript).toHaveBeenCalled();
  // Should fetch the PI transcript URL
  expect(fetch).toHaveBeenCalledWith("https://pi.example.com/transcript.vtt");
  // Should NOT call Whisper
  expect(mockWhisperCreate).not.toHaveBeenCalled();
  // Should backfill episode.transcriptUrl
  expect(mockPrisma.episode.update).toHaveBeenCalledWith({
    where: { id: "ep1" },
    data: { transcriptUrl: "https://pi.example.com/transcript.vtt" },
  });
  expect(msg.ack).toHaveBeenCalled();
});

it("falls through to Whisper when Podcast Index has no transcript", async () => {
  const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
  const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
  mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
  mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
  mockPrisma.pipelineStep.update.mockResolvedValue({});

  (lookupPodcastIndexTranscript as any).mockResolvedValue(null);

  if (typeof globalThis.File === "undefined") {
    globalThis.File = class File extends Blob {
      name: string;
      lastModified: number;
      constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
        super(parts, opts);
        this.name = name;
        this.lastModified = Date.now();
      }
    } as any;
  }

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(lookupPodcastIndexTranscript).toHaveBeenCalled();
  expect(mockWhisperCreate).toHaveBeenCalled();
  expect(msg.ack).toHaveBeenCalled();
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: FAIL — handler doesn't call lookupPodcastIndexTranscript yet

**Step 3: Update the transcription handler**

In `worker/queues/transcription.ts`, add imports:

```typescript
import { PodcastIndexClient } from "../lib/podcast-index";
import { lookupPodcastIndexTranscript } from "../lib/transcript-source";
import { fetchTranscript } from "../lib/transcript";
```

Replace the transcript-fetching block (lines ~124-144) with the three-tier waterfall:

```typescript
let transcript: string;

if (episode.transcriptUrl) {
  // Tier 1: RSS feed transcript URL
  const response = await fetch(episode.transcriptUrl);
  transcript = await response.text();
  log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "feed" });
} else {
  // Tier 2: Podcast Index lookup
  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
  const piClient = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
  const piTranscriptUrl = await lookupPodcastIndexTranscript(
    piClient,
    podcast?.podcastIndexId ?? null,
    episode.guid,
    episode.title
  );

  if (piTranscriptUrl) {
    // Found via Podcast Index — fetch and parse, backfill episode
    transcript = await fetchTranscript(piTranscriptUrl);
    await prisma.episode.update({
      where: { id: episodeId },
      data: { transcriptUrl: piTranscriptUrl },
    });
    log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "podcast-index" });
  } else {
    // Tier 3: Whisper STT
    const { model: sttModel } = await getModelConfig(prisma, "stt");
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const audioResponse = await fetch(episode.audioUrl);
    const audioBlob = await audioResponse.blob();
    const file = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });
    const transcription = await openai.audio.transcriptions.create({
      model: sttModel,
      file,
    });
    transcript = transcription.text;
    log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "whisper" });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: add Podcast Index as tier 2 transcript source"
```

---

### Task 4: Wire chunked Whisper into transcription handler

**Files:**
- Modify: `worker/queues/transcription.ts`
- Modify: `worker/queues/__tests__/transcription.test.ts`

**Step 1: Add tests for chunking**

Add mock for the chunked module:

```typescript
vi.mock("../../lib/whisper-chunked", () => ({
  getAudioMetadata: vi.fn().mockResolvedValue({ contentLength: 1000, contentType: "audio/mpeg" }),
  isMp3: vi.fn().mockReturnValue(true),
  transcribeChunked: vi.fn().mockResolvedValue("Chunked transcript text."),
  WHISPER_MAX_BYTES: 25 * 1024 * 1024,
  CHUNK_SIZE: 20 * 1024 * 1024,
}));
```

Add import:

```typescript
const { getAudioMetadata, isMp3, transcribeChunked } = await import("../../lib/whisper-chunked");
```

In `beforeEach`, re-set after `vi.clearAllMocks()`:

```typescript
(getAudioMetadata as any).mockReset();
(getAudioMetadata as any).mockResolvedValue({ contentLength: 1000, contentType: "audio/mpeg" });
(isMp3 as any).mockReset();
(isMp3 as any).mockReturnValue(true);
(transcribeChunked as any).mockReset();
(transcribeChunked as any).mockResolvedValue("Chunked transcript text.");
```

Add new tests:

```typescript
it("uses chunked transcription when audio exceeds 25MB", async () => {
  const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
  const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
  mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
  mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
  mockPrisma.pipelineStep.update.mockResolvedValue({});

  (lookupPodcastIndexTranscript as any).mockResolvedValue(null);
  (getAudioMetadata as any).mockResolvedValue({
    contentLength: 50 * 1024 * 1024,
    contentType: "audio/mpeg",
  });
  (isMp3 as any).mockReturnValue(true);

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(transcribeChunked).toHaveBeenCalledWith(
    expect.anything(),
    "https://example.com/audio.mp3",
    50 * 1024 * 1024,
    "whisper-1"
  );
  expect(mockWhisperCreate).not.toHaveBeenCalled();
  expect(msg.ack).toHaveBeenCalled();
});

it("fails with clear error for non-MP3 files over 25MB", async () => {
  const episodeNoTranscript = { ...EPISODE, transcriptUrl: null, audioUrl: "https://example.com/audio.m4a" };
  const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
  mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
  mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
  mockPrisma.distillation.upsert.mockResolvedValue({});

  (lookupPodcastIndexTranscript as any).mockResolvedValue(null);
  (getAudioMetadata as any).mockResolvedValue({
    contentLength: 50 * 1024 * 1024,
    contentType: "audio/mp4",
  });
  (isMp3 as any).mockReturnValue(false);

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
    where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
    data: expect.objectContaining({
      status: "FAILED",
      errorMessage: expect.stringContaining("too large"),
    }),
  });
  expect(msg.retry).toHaveBeenCalled();
});

it("uses single-file Whisper when audio is under 25MB", async () => {
  const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
  const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
  mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
  mockPrisma.pipelineJob.update.mockResolvedValue({});
  mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
  mockPrisma.distillation.findUnique.mockResolvedValue(null);
  mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
  mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
  mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
  mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
  mockPrisma.pipelineStep.update.mockResolvedValue({});

  (lookupPodcastIndexTranscript as any).mockResolvedValue(null);
  (getAudioMetadata as any).mockResolvedValue({
    contentLength: 10 * 1024 * 1024,
    contentType: "audio/mpeg",
  });

  if (typeof globalThis.File === "undefined") {
    globalThis.File = class File extends Blob {
      name: string;
      lastModified: number;
      constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
        super(parts, opts);
        this.name = name;
        this.lastModified = Date.now();
      }
    } as any;
  }

  await handleTranscription(createBatch([msg]), env, ctx);

  expect(transcribeChunked).not.toHaveBeenCalled();
  expect(mockWhisperCreate).toHaveBeenCalled();
  expect(msg.ack).toHaveBeenCalled();
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: FAIL — handler doesn't check file size or use chunked transcription

**Step 3: Update the Whisper section of the handler**

In `worker/queues/transcription.ts`, add imports:

```typescript
import { getAudioMetadata, isMp3, transcribeChunked, WHISPER_MAX_BYTES } from "../lib/whisper-chunked";
```

Replace the Tier 3 (Whisper) block with size-aware logic:

```typescript
    // Tier 3: Whisper STT (with chunking for large files)
    const { model: sttModel } = await getModelConfig(prisma, "stt");
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const meta = await getAudioMetadata(episode.audioUrl);

    if (meta.contentLength && meta.contentLength > WHISPER_MAX_BYTES) {
      // Large file — check if MP3 (only format we can chunk)
      if (!isMp3(meta.contentType, episode.audioUrl)) {
        throw new Error(
          `Audio file too large (${Math.round(meta.contentLength / 1024 / 1024)}MB) and format does not support chunking. Only MP3 files can be chunked.`
        );
      }
      transcript = await transcribeChunked(openai, episode.audioUrl, meta.contentLength, sttModel);
      log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "whisper-chunked", chunks: Math.ceil(meta.contentLength / (20 * 1024 * 1024)) });
    } else {
      const audioResponse = await fetch(episode.audioUrl);
      const audioBlob = await audioResponse.blob();
      const file = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });
      const transcription = await openai.audio.transcriptions.create({
        model: sttModel,
        file,
      });
      transcript = transcription.text;
      log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "whisper" });
    }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/queues/__tests__/transcription.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/queues/transcription.ts worker/queues/__tests__/transcription.test.ts
git commit -m "feat: add chunked Whisper transcription for files over 25MB"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all affected tests**

```bash
npx vitest run worker/lib/__tests__/transcript-source.test.ts worker/lib/__tests__/whisper-chunked.test.ts worker/queues/__tests__/transcription.test.ts
```

Expected: All PASS

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No new errors (pre-existing ones in podcasts-detail.test.ts and requests.test.ts are OK)

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address any test/type issues from transcription improvements"
```
