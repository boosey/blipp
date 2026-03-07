# Transcription Pipeline Improvements Design

## Problem

1. When a podcast RSS feed doesn't include a transcript URL, we go straight to Whisper STT. The Podcast Index API often has transcript URLs we could use for free, but we never check it.
2. Whisper has a 25MB file size limit. Long podcast episodes (2+ hours) exceed this and fail.

## Goal

Add a Podcast Index transcript lookup as a middle tier between RSS and Whisper, and add chunked transcription for oversized audio files.

## Three-Tier Transcript Waterfall

```
Episode arrives at transcription handler
         |
         v
1. episode.transcriptUrl set?  ---YES--> fetch + parse (existing)
         |
         NO
         v
2. Podcast has podcastIndexId?  ---YES--> lookup transcript via PI API
   Match episode by GUID               |
   Found transcriptUrl?  ---YES-------->  fetch + parse + backfill episode.transcriptUrl
         |
         NO
         v
3. Whisper STT
   Content-Length > 25MB?  ---YES--> chunk into ~20MB pieces, transcribe each, concatenate
         |
         NO
         v
   Single-file transcription (existing)
```

## Podcast Index Transcript Lookup (Tier 2)

- Load the episode's podcast to get `podcast.podcastIndexId`
- If present, call `PodcastIndexClient.episodesByFeedId()` with max ~20 results
- Match the target episode by GUID (preferred) or title similarity fallback
- If the matched episode has a `transcriptUrl`, use `fetchTranscript()` (existing VTT/SRT parser)
- Backfill `episode.transcriptUrl` in the DB so future requests skip this step
- If no match or no transcript, fall through to Whisper

## Whisper Chunking (Tier 3 fix)

- Before downloading audio, send a HEAD request to get Content-Length and Content-Type
- If ≤25MB: proceed as today (single file upload to Whisper)
- If >25MB and MP3 format: download in ~20MB byte-range chunks, send each to Whisper, concatenate transcript text in order
- If >25MB and non-MP3: fail with clear error message ("Audio file too large and format does not support chunking")
- MP3 cuts are simple byte splits (no frame alignment). Whisper resyncs automatically with ~26ms loss per cut boundary.
- Format detection: check Content-Type header or URL file extension

## Files to Modify

- `worker/queues/transcription.ts` — Add PI lookup step and chunking logic
- `worker/lib/podcast-index.ts` — May need a method to look up single episode by GUID (or reuse episodesByFeedId with filtering)
- `worker/lib/transcript.ts` — No changes needed (fetchTranscript already handles VTT/SRT)

## What Stays the Same

- Cache check logic unchanged
- WorkProduct/PipelineStep tracking unchanged
- Orchestrator reporting unchanged
- getModelConfig for STT model unchanged
- RSS feed transcript parsing unchanged
