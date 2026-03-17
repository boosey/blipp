# Episode Content Prefetch

## Problem

Episodes are created during feed-refresh without knowing if their content (transcript/audio) is actually accessible. Users see episodes that will fail when the pipeline tries to process them.

## Solution

Inline content validation in feed-refresh after each new episode upsert. No new queue — transcripts are small text, audio checks are HEAD requests. The existing batch size of 3 keeps this manageable.

## Schema Changes

```prisma
enum ContentStatus {
  PENDING           // Not yet checked
  TRANSCRIPT_READY  // Transcript fetched and stored in R2
  AUDIO_READY       // No transcript, but audio URL verified accessible
  NOT_DELIVERABLE   // Neither transcript nor audio available
}

model Episode {
  // ... existing fields ...
  contentStatus   ContentStatus @default(PENDING)
  transcriptR2Key String?       // R2 key if transcript was pre-fetched
  audioR2Key      String?       // R2 key if audio was pre-fetched (future)
}
```

## Feed-Refresh Flow (per new episode)

After the existing episode upsert:

1. If `transcriptUrl` exists on the episode, fetch the transcript text, store in R2 at `transcripts/prefetch/{episodeId}.txt`, mark `TRANSCRIPT_READY`
2. If no transcript URL on the episode, check Podcast Index for a transcript URL (reuse existing `transcript-sources.ts`)
3. If still no transcript, send a HEAD request on `audioUrl` — if 200 + audio content-type, mark `AUDIO_READY`
4. If HEAD fails or wrong content-type, mark `NOT_DELIVERABLE`

## Downstream Integration

### Transcription Stage

The transcription stage already checks R2 cache via `wpKey()`. Pre-fetched transcripts use the same key format, so this is an automatic cache hit with zero duplicate work.

### Feed Queries

Add `contentStatus: { not: 'NOT_DELIVERABLE' }` filter where episodes are shown to users. NOT_DELIVERABLE episodes are hidden from the user-facing feed but remain visible in admin.

### FeedItem Creation

Skip NOT_DELIVERABLE episodes when creating FeedItems for subscribers.

## Memory Safety

- **Transcripts**: Typically < 100KB text, safe to buffer in the Worker
- **Audio**: HEAD only, no body downloaded
- No change to existing transcription pipeline (it still downloads audio when needed for STT)
- **Future**: Full audio download via streaming to R2 (`R2.put(key, response.body)`) using the `audioR2Key` field

## Files Changed

- `prisma/schema.prisma` — New `ContentStatus` enum + Episode fields (`contentStatus`, `transcriptR2Key`, `audioR2Key`)
- `worker/queues/feed-refresh.ts` — Content check logic after new episode upsert
- `worker/routes/feed.ts` (or wherever feed is queried) — Filter `NOT_DELIVERABLE` episodes
- Tests for content check logic
