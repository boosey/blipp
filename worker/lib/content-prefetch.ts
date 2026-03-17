import { wpKey, putWorkProduct } from "./work-products";
import type { Env } from "../types";

/**
 * Checks content availability for a new episode and stores transcript in R2 if found.
 *
 * Flow:
 * 1. If episode has a transcriptUrl from RSS → fetch it → store in R2 → TRANSCRIPT_READY
 * 2. If no transcript → HEAD the audio URL to verify accessibility → AUDIO_READY
 * 3. If neither → NOT_DELIVERABLE
 *
 * Does NOT call Podcast Index API — that's too expensive at scale during feed-refresh.
 * PI transcript lookup happens later in the transcription pipeline stage on-demand.
 */
export async function prefetchEpisodeContent(
  episode: {
    id: string;
    guid: string;
    title: string;
    audioUrl: string;
    transcriptUrl: string | null;
  },
  _podcast: {
    title: string;
    feedUrl: string;
    podcastIndexId: string | null;
  },
  _env: Env,
  r2: R2Bucket
): Promise<{
  contentStatus: "TRANSCRIPT_READY" | "AUDIO_READY" | "NOT_DELIVERABLE";
  transcriptR2Key: string | null;
}> {
  // Step 1: Try RSS transcript URL (no API calls, just a direct fetch)
  if (episode.transcriptUrl) {
    try {
      const res = await fetch(episode.transcriptUrl);
      if (res.ok) {
        const transcript = await res.text();
        if (transcript.length > 100) {
          const r2Key = wpKey({ type: "TRANSCRIPT", episodeId: episode.id });
          await putWorkProduct(r2, r2Key, transcript, {
            contentType: "text/plain",
          });
          return { contentStatus: "TRANSCRIPT_READY", transcriptR2Key: r2Key };
        }
      }
    } catch {
      // Transcript fetch failed — fall through to audio check
    }
  }

  // Step 2: HEAD the audio URL
  try {
    const headRes = await fetch(episode.audioUrl, { method: "HEAD" });
    if (headRes.ok) {
      const contentType =
        headRes.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (
        contentType.startsWith("audio/") ||
        contentType === "application/octet-stream"
      ) {
        return { contentStatus: "AUDIO_READY", transcriptR2Key: null };
      }
    }
  } catch {
    // HEAD failed
  }

  return { contentStatus: "NOT_DELIVERABLE", transcriptR2Key: null };
}
