# Decision: Client-Side Jingle Playback Over Server-Side Assembly

**Date:** 2026-03-15
**Status:** Accepted

## Context

Blipp briefings need intro/outro jingles for sonic branding and to delineate boundaries when playing feed items back-to-back.

Two approaches were evaluated:

1. **Server-side MP3 concatenation** (Phase 1 of the wasm audio plan) — concatenate `[intro.mp3] + [clip.mp3] + [outro.mp3]` in the briefing-assembly pipeline stage, store the assembled file in R2, serve as a single audio file.

2. **Client-side sequencing** — play intro, clip, and outro as separate audio segments on the client by swapping the `<audio>` element's src on `ended` events. Cache jingle files via the browser Cache API.

## Decision

Client-side sequencing (option 2).

## Rationale

- The client already sequences pre-roll ads, briefing content, and post-roll ads as separate audio sources. Jingles are the same pattern.
- Server-side assembly creates a copy of every briefing with jingles baked in, consuming R2 storage proportional to total briefings. Client-side plays the same two small jingle files for every briefing.
- Changing jingle files takes effect immediately on client-side. Server-side requires re-assembling all existing briefings.
- Eliminates pipeline complexity: the `BRIEFING_ASSEMBLY_AUDIO_ENABLED` feature flag, the assembly module, the assembled audio lookup in the briefing endpoint, and the WorkProduct records for assembled audio.
- The Cache API provides offline access to jingles with zero custom storage management.

## Trade-offs Accepted

- **Small audible gap** between jingle and content during src swap. Mitigated by preloading jingles into blob object URLs so the swap is instant (no network round-trip). The gap is imperceptible in practice.
- **Offline downloads** would not include jingles in a single file. Not currently on the roadmap. If needed in the future, server-side concatenation can be reintroduced — see the original design at `docs/plans/2026-03-14-wasm-audio-processing-design.md`.
- **Two extra HTTP requests** per app session (one per jingle, cached after first fetch). Negligible for ~200KB total.

## What Was Removed

All server-side assembly code:
- `worker/lib/audio/assembly.ts` — `assembleBriefingAudio()` function
- `worker/lib/audio/types.ts` — `AssemblyResult` type
- `worker/lib/audio/constants.ts` — `JINGLE_INTRO_KEY`, `JINGLE_OUTRO_KEY` R2 key constants
- `worker/lib/mp3-concat.ts` — `concatMp3Buffers()`, `stripId3v2Header()` functions
- Assembly integration in `worker/queues/briefing-assembly.ts`
- Assembled audio lookup in `worker/routes/briefings.ts`

## Reverting This Decision

If server-side assembly is needed in the future (e.g., for offline single-file downloads, volume normalization, crossfading):

1. The original Phase 1 + Phase 2 design is preserved at `docs/plans/2026-03-14-wasm-audio-processing-design.md`
2. The deleted code was straightforward: `concatMp3Buffers()` strips ID3v2 headers and concatenates raw MP3 frames. See git history for the implementation.
3. Phase 2 (wasm) would add decode/encode for normalization and crossfading — the design doc covers this in detail.
4. Client-side and server-side approaches are not mutually exclusive. The client could play assembled audio when available and fall back to sequencing when not.
