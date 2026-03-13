/**
 * Transcript parsing utilities for VTT and SRT subtitle formats.
 * Strips timing/cue information and returns plain text for distillation.
 */

/**
 * Parses a WebVTT transcript, stripping timing metadata and cue headers.
 * Removes lines matching timestamp patterns and the "WEBVTT" header.
 *
 * @param vtt - Raw WebVTT content
 * @returns Plain text with timing information removed
 */
export function parseVTT(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip WEBVTT header, blank lines, cue IDs (numeric), and timestamp lines
    if (
      trimmed === "" ||
      trimmed === "WEBVTT" ||
      trimmed.startsWith("NOTE") ||
      /^\d+$/.test(trimmed) ||
      /-->/.test(trimmed)
    ) {
      continue;
    }
    // Strip inline HTML tags (e.g., <v Speaker>, <b>, etc.) and bracket speaker labels
    const clean = trimmed
      .replace(/<[^>]+>/g, "")
      .replace(/\[SPEAKER_\d+\]\s*:?\s*/gi, "")
      .replace(/\[Speaker\s*\d*\]\s*:?\s*/gi, "")
      .trim();
    if (clean) {
      textLines.push(clean);
    }
  }

  return textLines.join(" ");
}

/**
 * Parses an SRT transcript, stripping sequence numbers and timing metadata.
 *
 * @param srt - Raw SRT content
 * @returns Plain text with timing information removed
 */
export function parseSRT(srt: string): string {
  const lines = srt.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip blank lines, sequence numbers, and timestamp lines
    if (
      trimmed === "" ||
      /^\d+$/.test(trimmed) ||
      /-->/.test(trimmed)
    ) {
      continue;
    }
    // Strip HTML tags
    const clean = trimmed.replace(/<[^>]+>/g, "").trim();
    if (clean) {
      textLines.push(clean);
    }
  }

  return textLines.join(" ");
}

/**
 * Fetches and parses a transcript from a URL.
 * Automatically detects VTT vs SRT format based on content or URL extension.
 *
 * @param url - URL to the transcript file (VTT or SRT)
 * @returns Plain text transcript content
 * @throws Error if fetch fails or response is not OK
 */
export async function fetchTranscript(url: string): Promise<string> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch transcript: ${res.status} ${res.statusText}`
    );
  }

  const text = await res.text();

  // Detect format by content or URL extension
  if (text.trimStart().startsWith("WEBVTT") || url.endsWith(".vtt")) {
    return parseVTT(text);
  }

  return parseSRT(text);
}
