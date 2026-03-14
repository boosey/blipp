/**
 * Work product R2 key builders and storage helpers.
 *
 * All stage outputs are stored under the `wp/` prefix in R2.
 * Existing `clips/` and `briefings/` prefixes remain for backwards compat.
 */

export type WpKeyParams =
  | { type: "TRANSCRIPT"; episodeId: string }
  | { type: "CLAIMS"; episodeId: string }
  | { type: "NARRATIVE"; episodeId: string; durationTier: number }
  | { type: "AUDIO_CLIP"; episodeId: string; durationTier: number; voice?: string }
  | { type: "BRIEFING_AUDIO"; briefingId: string };

/** Builds an R2 key from a work product type and its parameters. */
export function wpKey(params: WpKeyParams): string {
  switch (params.type) {
    case "TRANSCRIPT":
      return `wp/transcript/${params.episodeId}.txt`;
    case "CLAIMS":
      return `wp/claims/${params.episodeId}.json`;
    case "NARRATIVE":
      return `wp/narrative/${params.episodeId}/${params.durationTier}.txt`;
    case "AUDIO_CLIP":
      return `wp/clip/${params.episodeId}/${params.durationTier}/${params.voice ?? "default"}.mp3`;
    case "BRIEFING_AUDIO":
      return `wp/briefing/${params.briefingId}.mp3`;
  }
}

/** Writes data to R2 at the given key. */
export async function putWorkProduct(
  r2: R2Bucket,
  key: string,
  data: ArrayBuffer | string,
  options?: { contentType?: string }
): Promise<void> {
  await r2.put(key, data, options?.contentType ? {
    httpMetadata: { contentType: options.contentType },
  } : undefined);
}

/** Reads data from R2 at the given key. Returns null if not found. */
export async function getWorkProduct(
  r2: R2Bucket,
  key: string
): Promise<ArrayBuffer | null> {
  const obj = await r2.get(key);
  if (!obj) return null;
  return obj.arrayBuffer();
}
