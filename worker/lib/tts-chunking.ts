import { DEFAULT_TTS_MAX_INPUT_CHARS } from "./constants";

/**
 * Split narrative text into chunks that fit within TTS provider character limits.
 * Splits on paragraph boundaries, falls back to sentences, then hard splits.
 */
export function chunkNarrativeText(text: string, maxChars: number = DEFAULT_TTS_MAX_INPUT_CHARS): string[] {
  if (!text || text.length <= maxChars) return text ? [text] : [];

  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // If adding this paragraph would exceed limit
    if (current && (current + "\n\n" + para).length > maxChars) {
      chunks.push(current);
      current = "";
    }

    // If single paragraph exceeds limit, split by sentences
    if (para.length > maxChars) {
      if (current) { chunks.push(current); current = ""; }
      const sentences = splitSentences(para);
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          // Hard split as last resort
          if (current) { chunks.push(current); current = ""; }
          for (let i = 0; i < sentence.length; i += maxChars) {
            chunks.push(sentence.slice(i, i + maxChars));
          }
        } else if (current && (current + " " + sentence).length > maxChars) {
          chunks.push(current);
          current = sentence;
        } else {
          current = current ? current + " " + sentence : sentence;
        }
      }
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Split text into sentences (preserving the period/punctuation with each sentence). */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter(Boolean);
}

/**
 * Create a ~200ms silent MP3 frame for inter-chunk padding.
 * This is a minimal valid MPEG Audio Layer 3 frame with silence.
 */
export function createSilenceFrame(): ArrayBuffer {
  // Minimal valid MP3 frame: MPEG1 Layer3 128kbps 44100Hz stereo
  // Frame header: 0xFFFB9004 (sync, MPEG1, Layer3, 128kbps, 44.1kHz, stereo)
  // Each frame is 417 or 418 bytes at this bitrate. We need ~8 frames for 200ms.
  // (128kbps * 0.2s = 3200 bytes ~ 8 frames)
  const frameSize = 417;
  const frameCount = 8;
  const totalSize = frameSize * frameCount;
  const buffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buffer);

  for (let f = 0; f < frameCount; f++) {
    const offset = f * frameSize;
    // MP3 frame header bytes
    view[offset] = 0xFF;     // sync
    view[offset + 1] = 0xFB; // MPEG1, Layer3, no CRC
    view[offset + 2] = 0x90; // 128kbps, 44100Hz
    view[offset + 3] = 0x04; // stereo, no padding, no private
    // Remaining bytes stay 0 (silence)
  }

  return buffer;
}

/**
 * Concatenate multiple audio chunks with silence frames between them.
 */
export function concatenateAudioChunks(chunks: ArrayBuffer[], silence: ArrayBuffer): ArrayBuffer {
  if (chunks.length === 0) return new ArrayBuffer(0);
  if (chunks.length === 1) return chunks[0];

  // Total size: all chunks + silence between each pair
  const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0) + silence.byteLength * (chunks.length - 1);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (let i = 0; i < chunks.length; i++) {
    result.set(new Uint8Array(chunks[i]), offset);
    offset += chunks[i].byteLength;
    if (i < chunks.length - 1) {
      result.set(new Uint8Array(silence), offset);
      offset += silence.byteLength;
    }
  }

  return result.buffer;
}
