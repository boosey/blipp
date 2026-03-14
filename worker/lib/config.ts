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
  } catch (err) {
    console.error(JSON.stringify({
      level: "warn",
      action: "config_read_failed",
      key,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
    return fallback;
  }
}

/** Clears the config cache. Useful for testing. */
export function clearConfigCache(): void {
  cache.clear();
}

