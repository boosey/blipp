import type { SttProvider, SttResult } from "./providers";
import { ASSUMED_BITRATE_BYTES_PER_SEC } from "../constants";
import { safeFetch } from "../url-validation";
import type { Env } from "../../types";
import { DEFAULT_STT_CHUNK_SIZE } from "../constants";

// ---------------------------------------------------------------------------
// Audio format detection (moved from transcription.ts)
// ---------------------------------------------------------------------------

export const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
  "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/ogg": "ogg",
  "audio/wav": "wav", "audio/webm": "webm", "audio/flac": "flac",
  "audio/x-flac": "flac", "audio/mpga": "mpga", "audio/oga": "oga",
};

/** Detect actual audio format from magic bytes (first 12 bytes). */
export function detectAudioFormat(buffer: ArrayBuffer): { format: string; details?: string } {
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  if (bytes.length < 4) return { format: "unknown", details: "too small" };

  // ID3 tag (MP3 with metadata header)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return { format: "mp3", details: `ID3v2.${bytes[3]}` };
  }
  // MP3 sync word (0xFF followed by 0xE0+ for various MPEG versions/layers)
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    const version = (bytes[1] >> 3) & 0x03;
    const layer = (bytes[1] >> 1) & 0x03;
    const versionStr = version === 3 ? "MPEG1" : version === 2 ? "MPEG2" : version === 0 ? "MPEG2.5" : "unknown";
    const layerStr = layer === 1 ? "Layer3" : layer === 2 ? "Layer2" : layer === 3 ? "Layer1" : "unknown";
    return { format: "mp3", details: `${versionStr} ${layerStr}` };
  }
  // RIFF/WAV
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return { format: "wav", details: "RIFF" };
  }
  // fLaC
  if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return { format: "flac" };
  }
  // OggS
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return { format: "ogg" };
  }
  // MP4/M4A (ftyp box)
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { format: "m4a", details: "ftyp" };
  }
  return { format: "unknown", details: `magic: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, "0")).join(" ")}` };
}

export function extFromContentType(contentType: string | null, url: string): string {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (ext) return ext;
  }
  // Fallback: extract from URL path
  const match = url.match(/\.(\w{2,5})(?:[?#]|$)/);
  if (match) {
    const urlExt = match[1].toLowerCase();
    if (["mp3", "m4a", "mp4", "ogg", "oga", "wav", "webm", "flac", "mpeg", "mpga"].includes(urlExt)) return urlExt;
  }
  return "mp3"; // last resort default
}

// ---------------------------------------------------------------------------
// Audio probing (HEAD + 12-byte range request)
// ---------------------------------------------------------------------------

export interface AudioProbe {
  contentLength: number | null;
  contentType: string | null;
  ext: string;
  detectedFormat: { format: string; details?: string };
  durationEstimateSeconds: number;
  supportsRangeRequests: boolean;
}

/**
 * Probe an audio URL via HEAD + 12-byte range request.
 * Never downloads more than 12 bytes of audio data.
 */
export async function probeAudio(audioUrl: string, episodeDurationSeconds: number | null): Promise<AudioProbe> {
  // HEAD request for metadata
  const headResp = await safeFetch(audioUrl, { method: "HEAD" });
  const clHeader = headResp.headers.get("content-length");
  const contentLength = clHeader ? Number(clHeader) : null;
  const contentType = headResp.headers.get("content-type")?.split(";")[0].trim() || null;
  const acceptRanges = headResp.headers.get("accept-ranges");
  const supportsRangeRequests = acceptRanges === "bytes";

  // Tiny range request for magic bytes (12 bytes)
  let detectedFormat: { format: string; details?: string } = { format: "unknown" };
  try {
    const rangeResp = await safeFetch(audioUrl, {
      headers: { Range: "bytes=0-11" },
    });
    if (rangeResp.status === 206 || rangeResp.ok) {
      const magicBuffer = await rangeResp.arrayBuffer();
      detectedFormat = detectAudioFormat(magicBuffer);
    }
  } catch {
    // Range request failed — not critical, we still have Content-Type
  }

  const ext = extFromContentType(contentType, audioUrl);

  // Duration estimate: prefer episode metadata, fall back to bitrate estimate
  const durationEstimateSeconds = episodeDurationSeconds
    ?? (contentLength != null ? Math.round(contentLength / ASSUMED_BITRATE_BYTES_PER_SEC) : 0);

  return {
    contentLength,
    contentType,
    ext,
    detectedFormat,
    durationEstimateSeconds,
    supportsRangeRequests,
  };
}

// ---------------------------------------------------------------------------
// Provider-agnostic chunked transcription via byte-range requests
// ---------------------------------------------------------------------------

/**
 * Download audio in byte-range chunks and call the provider's transcribe()
 * for each chunk. Concatenates transcripts.
 *
 * @param audioUrl - URL to download from
 * @param totalBytes - From HEAD Content-Length
 * @param chunkSize - From provider's limits.maxFileSizeBytes (or DEFAULT_STT_CHUNK_SIZE)
 * @param ext - File extension for the filename
 * @param provider - SttProvider implementation
 * @param durationSeconds - For the provider's cost calculation
 * @param env - Worker env bindings
 * @param providerModelId - Model ID to pass to provider
 */
export async function transcribeChunked(
  audioUrl: string,
  totalBytes: number,
  chunkSize: number,
  ext: string,
  provider: SttProvider,
  durationSeconds: number,
  env: Env,
  providerModelId: string,
): Promise<SttResult> {
  const effectiveChunkSize = chunkSize || DEFAULT_STT_CHUNK_SIZE;
  const totalChunks = Math.ceil(totalBytes / effectiveChunkSize);
  const chunks: string[] = [];
  const start = Date.now();

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * effectiveChunkSize;
    const end = Math.min(offset + effectiveChunkSize, totalBytes) - 1;

    const resp = await safeFetch(audioUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
    });

    const buffer = await resp.arrayBuffer();
    const result = await provider.transcribe(
      { buffer, filename: `chunk-${i + 1}.${ext}`, sourceUrl: audioUrl },
      durationSeconds,
      env,
      providerModelId,
    );

    if (result.transcript) chunks.push(result.transcript);
  }

  return {
    transcript: chunks.join(" "),
    costDollars: null,
    latencyMs: Date.now() - start,
  };
}
