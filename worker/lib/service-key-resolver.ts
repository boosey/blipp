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
 * Resolve the API key value for a given env key, optionally scoped to a usage context and provider.
 *
 * @param prisma   - Prisma client for DB lookups
 * @param env      - Worker env bindings (for fallback and encryption key)
 * @param envKey   - The Env property name, e.g. "ANTHROPIC_API_KEY"
 * @param context  - Optional usage context, e.g. "pipeline.distillation"
 * @param provider - Optional provider name, e.g. "anthropic" — enables provider-scoped assignments
 */
export async function resolveApiKey(
  prisma: any,
  env: Env,
  envKey: string,
  context?: string,
  provider?: string
): Promise<string> {
  const masterKey = env.SERVICE_KEY_ENCRYPTION_KEY;

  // If no encryption key or no prisma client, skip DB lookups entirely
  if (masterKey && prisma) {
    try {
      if (context) {
        // Step 1a: Check provider-scoped assignment (e.g. "pipeline.distillation.anthropic")
        if (provider) {
          const providerKeyId = await getConfig<string | null>(
            prisma,
            `serviceKey.assignment.${context}.${provider}`,
            null
          );
          if (providerKeyId) {
            const sk = await prisma.serviceKey.findUnique({
              where: { id: providerKeyId },
              select: { encryptedValue: true, iv: true },
            });
            if (sk) {
              return decryptKey(sk.encryptedValue, sk.iv, masterKey);
            }
          }
        }

        // Step 1b: Check context-only assignment (e.g. "pipeline.distillation")
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
          provider,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }
  }

  // Step 3: Fall back to env var — log a warning since DB should be providing keys
  const envValue = (env as Record<string, unknown>)[envKey] as string;
  if (envValue && masterKey) {
    // Only warn if encryption is configured (meaning DB keys should be set up)
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "service_key_env_fallback",
        envKey,
        context,
        provider,
        message: `Using env var fallback for ${envKey}${context ? ` (context: ${context})` : ""}. Configure a DB-stored key in Admin > Service Keys.`,
        ts: new Date().toISOString(),
      })
    );
  }
  return envValue;
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

/**
 * Provider-to-envKey mapping for pipeline stages.
 * Used by resolveEnvForPipeline to know which env key to resolve for each provider.
 */
const PROVIDER_ENV_KEY: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  deepgram: "DEEPGRAM_API_KEY",
};

export interface ResolvedEnvResult {
  env: Env;
  /** True if the key came from the DB; false if it fell back to the env var */
  fromDb: boolean;
  /** The envKey that was resolved (e.g. "ANTHROPIC_API_KEY") */
  envKey: string | null;
}

/**
 * Creates a shallow copy of `env` with DB-resolved API keys overlaid.
 * Use this at the top of queue handlers so all downstream code (which reads
 * env.ANTHROPIC_API_KEY etc.) automatically gets the DB-stored key.
 *
 * Returns both the resolved env and a `fromDb` flag. When `fromDb` is false,
 * the caller should log a warning — all keys should come from the DB.
 *
 * If resolution fails or no DB key is configured, the original env value is preserved.
 */
export async function resolveEnvForPipeline(
  prisma: any,
  env: Env,
  context: string,
  provider: string
): Promise<ResolvedEnvResult> {
  const envKey = PROVIDER_ENV_KEY[provider];
  if (!envKey) return { env, fromDb: true, envKey: null };

  const resolved = await resolveApiKey(prisma, env, envKey, context, provider);
  const original = (env as Record<string, unknown>)[envKey] as string | undefined;

  // If resolution returned the same value as env, it fell back
  if (resolved === original) {
    return { env, fromDb: false, envKey };
  }

  // Create shallow copy with the resolved key overlaid
  return { env: { ...env, [envKey]: resolved } as Env, fromDb: true, envKey };
}
