/**
 * Reads a PlatformConfig key with in-memory TTL cache.
 *
 * @param prisma - PrismaClient instance
 * @param key - The PlatformConfig key to read
 * @param fallback - Default value if key not found
 * @returns The config value or fallback
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000; // 60 seconds

export async function getConfig<T>(
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } },
  key: string,
  fallback: T
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  try {
    const entry = await prisma.platformConfig.findUnique({ where: { key } });
    const value = entry ? (entry.value as T) : fallback;
    cache.set(key, { value, expiresAt: now + TTL_MS });
    return value;
  } catch {
    // PlatformConfig table may not exist — return fallback
    return fallback;
  }
}

/** Clears the config cache. Useful for testing. */
export function clearConfigCache(): void {
  cache.clear();
}

/** Pipeline stage → display name (keyed by Prisma PipelineStage enum values) */
export const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};

/** Pipeline stage string key → display name (used by admin routes) */
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation", // legacy data display
  NARRATIVE_GENERATION: "Narrative Generation",
  AUDIO_GENERATION: "Audio Generation",
  BRIEFING_ASSEMBLY: "Briefing Assembly",
};
