/**
 * Runtime service key resolution.
 *
 * Resolution order (3-level fallback):
 * 1. Context assignment → PlatformConfig `serviceKey.assignment.<context>` → decrypt ServiceKey
 * 2. Primary DB key → ServiceKey where envKey matches and isPrimary=true → decrypt
 * 3. Env var fallback → env[envKey] (the CF Workers secret)
 *
 * This ensures the system works with zero DB keys configured.
 */

import type { Env } from "../types";
import { decryptKey } from "./service-key-crypto";
import { getConfig } from "./config";

/**
 * Resolve the API key value for a given env key, optionally scoped to a usage context.
 *
 * @param prisma  - Prisma client for DB lookups
 * @param env     - Worker env bindings (for fallback and encryption key)
 * @param envKey  - The Env property name, e.g. "ANTHROPIC_API_KEY"
 * @param context - Optional usage context, e.g. "pipeline.distillation"
 */
export async function resolveApiKey(
  prisma: any,
  env: Env,
  envKey: string,
  context?: string
): Promise<string> {
  const masterKey = env.SERVICE_KEY_ENCRYPTION_KEY;

  // If no encryption key is configured, skip DB lookups entirely
  if (masterKey) {
    try {
      // Step 1: Check context-specific assignment
      if (context) {
        const assignedKeyId = await getConfig<string | null>(
          prisma,
          `serviceKey.assignment.${context}`,
          null
        );
        if (assignedKeyId) {
          const sk = await prisma.serviceKey.findUnique({
            where: { id: assignedKeyId },
            select: { encryptedValue: true, iv: true },
          });
          if (sk) {
            return decryptKey(sk.encryptedValue, sk.iv, masterKey);
          }
        }
      }

      // Step 2: Check for primary key in DB
      const primaryKey = await prisma.serviceKey.findFirst({
        where: { envKey, isPrimary: true },
        select: { encryptedValue: true, iv: true },
      });
      if (primaryKey) {
        return decryptKey(primaryKey.encryptedValue, primaryKey.iv, masterKey);
      }
    } catch (err) {
      // DB errors should not break the system — fall through to env
      console.error(
        JSON.stringify({
          level: "error",
          action: "service_key_resolve_error",
          envKey,
          context,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }
  }

  // Step 3: Fall back to env var
  return (env as Record<string, unknown>)[envKey] as string;
}

/**
 * Convenience helper that resolves multiple keys for a context and returns
 * an object with the same shape as Env. Use this to minimize diff at call sites:
 *
 *   const keys = await resolveKeysForContext(prisma, env, "billing.stripe", ["STRIPE_SECRET_KEY"]);
 *   new Stripe(keys.STRIPE_SECRET_KEY);
 *
 * Unresolved keys fall back to env values.
 */
export async function resolveKeysForContext(
  prisma: any,
  env: Env,
  context: string,
  envKeys: string[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  // Resolve in parallel
  const entries = await Promise.all(
    envKeys.map(async (key) => {
      const value = await resolveApiKey(prisma, env, key, context);
      return [key, value] as const;
    })
  );
  for (const [key, value] of entries) {
    results[key] = value;
  }
  return results;
}
