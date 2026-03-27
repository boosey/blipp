import type OpenAI from "openai";
import { calculateAudioCost, type AiUsage, type ModelPricing } from "./ai-usage";
import { ASSUMED_BITRATE_BYTES_PER_SEC, STT_BYTES_PER_TOKEN } from "./constants";

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
 *
 * @param client - OpenAI SDK client instance
 * @param audioUrl - URL of the audio file
 * @param totalBytes - Total file size in bytes
 * @param model - Whisper model ID
 * @param pricing - Pricing from DB for cost calculation
 */
export async function transcribeChunked(
  client: OpenAI,
  audioUrl: string,
  totalBytes: number,
  model: string,
  pricing: ModelPricing | null = null
): Promise<{ transcript: string; usage: AiUsage }> {
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

  const transcript = chunks.join(" ");

  // Approximate duration: totalBytes / (128kbps bitrate in bytes/sec)
  const estimatedSeconds = totalBytes / ASSUMED_BITRATE_BYTES_PER_SEC;
  const usage: AiUsage = {
    model,
    inputTokens: Math.round(totalBytes / STT_BYTES_PER_TOKEN),
    outputTokens: 0,
    cost: calculateAudioCost(pricing, estimatedSeconds),
  };

  return { transcript, usage };
}
