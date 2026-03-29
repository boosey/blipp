import { validateConfigKey } from "./config-registry";

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
  validateConfigKey(key);

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  try {
    const entry = await prisma.platformConfig.findUnique({ where: { key } });
    if (!entry) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "config_using_fallback",
        key,
        fallback,
        ts: new Date().toISOString(),
      }));
    }
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

/**
 * Reads a required PlatformConfig key. Throws if not found in DB.
 * Use this for prompts and other values that MUST exist in the database.
 */
export async function getRequiredConfig(
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } },
  key: string
): Promise<string> {
  validateConfigKey(key);

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as string;
  }

  const entry = await prisma.platformConfig.findUnique({ where: { key } });
  if (!entry) {
    throw new Error(`Required config "${key}" not found in database. Run seed or configure via admin.`);
  }
  const value = entry.value as string;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

/** Clears the config cache. Useful for testing. */
export function clearConfigCache(): void {
  cache.clear();
}

