import { wpKey, putWorkProduct } from "./work-products";
import { lookupPodcastIndexTranscript } from "./transcript/podcast-index-source";
import { PodcastIndexClient } from "./podcast-index";
import { safeFetch } from "./url-validation";
import type { Env } from "../types";
import { resolveApiKey } from "./service-key-resolver";

/**
 * Checks content availability for a new episode and stores transcript in R2 if found.
 * Runs at concurrency=1 so PI rate limits are not a concern.
 *
 * Flow:
 * 1. If episode has a transcriptUrl from RSS → fetch it → store in R2 → TRANSCRIPT_READY
 * 2. If no RSS transcript → check Podcast Index for transcript → TRANSCRIPT_READY
 * 3. If no transcript anywhere → HEAD the audio URL → AUDIO_READY
 * 4. If neither → NOT_DELIVERABLE
 */
export async function prefetchEpisodeContent(
  episode: {
    id: string;
    guid: string;
    title: string;
    audioUrl: string;
    transcriptUrl: string | null;
  },
  podcast: {
    title: string;
    feedUrl: string;
    podcastIndexId: string | null;
  },
  env: Env,
  r2: R2Bucket,
  fetchTimeoutMs = 15000,
  prisma?: any
): Promise<{
  contentStatus: "TRANSCRIPT_READY" | "AUDIO_READY" | "NOT_DELIVERABLE";
  transcriptR2Key: string | null;
}> {
  // Step 1: Try RSS transcript URL (direct fetch, no API call)
  if (episode.transcriptUrl) {
    console.log(`[content-prefetch] GET transcript (RSS): ${episode.transcriptUrl} (episode: ${episode.title})`);
    const result = await tryFetchTranscript(episode.transcriptUrl, episode.id, r2, fetchTimeoutMs);
    if (result) {
      console.log(`[content-prefetch] Transcript fetched OK → ${result.contentStatus} (episode: ${episode.title})`);
      return result;
    }
    console.log(`[content-prefetch] Transcript fetch failed (episode: ${episode.title})`);
  }

  // Step 2: Try Podcast Index transcript lookup
  if (podcast.podcastIndexId) {
    console.log(`[content-prefetch] Looking up PI transcript for podcastIndexId=${podcast.podcastIndexId} (episode: ${episode.title})`);
    try {
      const [piKey, piSecret] = await Promise.all([
        resolveApiKey(prisma, env, "PODCAST_INDEX_KEY", "catalog.content-prefetch"),
        resolveApiKey(prisma, env, "PODCAST_INDEX_SECRET", "catalog.content-prefetch"),
      ]);
      const client = new PodcastIndexClient(piKey, piSecret);
      const piUrl = await lookupPodcastIndexTranscript(
        client,
        podcast.podcastIndexId,
        episode.guid,
        episode.title
      );
      if (piUrl) {
        console.log(`[content-prefetch] GET transcript (PI): ${piUrl} (episode: ${episode.title})`);
        const result = await tryFetchTranscript(piUrl, episode.id, r2, fetchTimeoutMs);
        if (result) {
          console.log(`[content-prefetch] PI transcript fetched OK → ${result.contentStatus} (episode: ${episode.title})`);
          return result;
        }
      } else {
        console.log(`[content-prefetch] No PI transcript found (episode: ${episode.title})`);
      }
    } catch {
      console.log(`[content-prefetch] PI transcript lookup failed (episode: ${episode.title})`);
    }
  } else {
    console.log(`[content-prefetch] No podcastIndexId — skipping PI transcript lookup (episode: ${episode.title})`);
  }

  // Step 3: HEAD the audio URL
  console.log(`[content-prefetch] HEAD audio: ${episode.audioUrl} (episode: ${episode.title})`);
  try {
    const audioController = new AbortController();
    const audioTimeout = setTimeout(() => audioController.abort(), fetchTimeoutMs);
    const headRes = await fetch(episode.audioUrl, { method: "HEAD", signal: audioController.signal });
    clearTimeout(audioTimeout);
    console.log(`[content-prefetch] Audio HEAD response: ${headRes.status} ${headRes.statusText} (episode: ${episode.title})`);
    if (headRes.ok) {
      const contentType =
        headRes.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (
        contentType.startsWith("audio/") ||
        contentType.endsWith("/octet-stream")
      ) {
        console.log(`[content-prefetch] Audio OK (${contentType}) → AUDIO_READY (episode: ${episode.title})`);
        return { contentStatus: "AUDIO_READY", transcriptR2Key: null };
      }
      console.log(`[content-prefetch] Audio content-type not audio: ${contentType} (episode: ${episode.title})`);
    }
  } catch {
    // HEAD failed
  }

  return { contentStatus: "NOT_DELIVERABLE", transcriptR2Key: null };
}

/** Fetch a transcript URL, store in R2 if valid. Returns null if failed. */
async function tryFetchTranscript(
  url: string,
  episodeId: string,
  r2: R2Bucket,
  fetchTimeoutMs = 15000
): Promise<{
  contentStatus: "TRANSCRIPT_READY";
  transcriptR2Key: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    const res = await safeFetch(url, { signal: controller.signal });
    if (!res.ok) { clearTimeout(timeout); return null; }
    const transcript = await res.text();
    clearTimeout(timeout);
    if (transcript.length < 100) return null;

    const r2Key = wpKey({ type: "TRANSCRIPT", episodeId });
    await putWorkProduct(r2, r2Key, transcript, { contentType: "text/plain" });
    return { contentStatus: "TRANSCRIPT_READY", transcriptR2Key: r2Key };
  } catch {
    return null;
  }
}
