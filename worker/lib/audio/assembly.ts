import { concatMp3Buffers } from "../mp3-concat";
import { JINGLE_INTRO_KEY, JINGLE_OUTRO_KEY } from "./constants";
import type { AssemblyResult } from "./types";

/**
 * Assembles a complete briefing audio from clip + jingle assets.
 * Loads intro and outro jingles from R2, concatenates around the clip.
 * Falls back to raw clip on any error — assembly must never block briefing delivery.
 */
export async function assembleBriefingAudio(
  clipAudio: ArrayBuffer,
  r2: R2Bucket,
  log?: { warn?: (action: string, data: Record<string, unknown>) => void }
): Promise<AssemblyResult> {
  try {
    const [introObj, outroObj] = await Promise.all([
      r2.get(JINGLE_INTRO_KEY),
      r2.get(JINGLE_OUTRO_KEY),
    ]);

    const intro = introObj ? await introObj.arrayBuffer() : null;
    const outro = outroObj ? await outroObj.arrayBuffer() : null;

    const parts: ArrayBuffer[] = [];
    if (intro) parts.push(intro);
    parts.push(clipAudio);
    if (outro) parts.push(outro);

    const hasJingles = intro !== null || outro !== null;

    if (!hasJingles) {
      return {
        audio: clipAudio,
        sizeBytes: clipAudio.byteLength,
        hasJingles: false,
        isFallback: false,
      };
    }

    const assembled = concatMp3Buffers(parts);

    return {
      audio: assembled,
      sizeBytes: assembled.byteLength,
      hasJingles: true,
      isFallback: false,
    };
  } catch (err) {
    log?.warn?.("assembly_fallback", {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      audio: clipAudio,
      sizeBytes: clipAudio.byteLength,
      hasJingles: false,
      isFallback: true,
    };
  }
}
