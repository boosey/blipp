export interface AssemblyResult {
  /** The assembled MP3 audio buffer. */
  audio: ArrayBuffer;
  /** Total size in bytes. */
  sizeBytes: number;
  /** Whether jingles were included (false = fallback to raw clip). */
  hasJingles: boolean;
  /** Whether assembly fell back to raw clip due to error. */
  isFallback: boolean;
}
