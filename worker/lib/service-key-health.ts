/**
 * Per-provider health check implementations for service keys.
 * Each check makes a lightweight, read-only API call to verify the key is valid.
 */

export interface HealthCheckResult {
  valid: boolean;
  latencyMs: number;
  error?: string;
  /** HTTP status from the provider, if applicable */
  httpStatus?: number;
}

type HealthChecker = (
  apiKey: string,
  extra?: { secret?: string; projectId?: string }
) => Promise<HealthCheckResult>;

const TIMEOUT_MS = 5000;

async function timedFetch(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; body: string; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const body = await resp.text();
    return { ok: resp.ok, status: resp.status, body, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider Implementations ──

const checkAnthropic: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.anthropic.com/v1/models",
    { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkOpenAI: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.openai.com/v1/models",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkGroq: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.groq.com/openai/v1/models",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkDeepgram: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.deepgram.com/v1/projects",
    { headers: { Authorization: `Token ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkStripe: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.stripe.com/v1/balance",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkClerk: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.clerk.com/v1/users?limit=1",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkPodcastIndex: HealthChecker = async (apiKey, extra) => {
  const secret = extra?.secret;
  if (!secret) {
    return { valid: false, latencyMs: 0, error: "Podcast Index secret not provided" };
  }
  const ts = Math.floor(Date.now() / 1000).toString();
  // HMAC-SHA1 auth header: hash of key + secret + timestamp
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey + secret + ts);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.podcastindex.org/api/1.0/stats/current",
    {
      headers: {
        "X-Auth-Key": apiKey,
        "X-Auth-Date": ts,
        "Authorization": hashHex,
        "User-Agent": "Blipp/1.0",
      },
    }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkCloudflare: HealthChecker = async (apiKey) => {
  const { ok, status, body, latencyMs } = await timedFetch(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

const checkNeon: HealthChecker = async (apiKey, extra) => {
  const projectId = extra?.projectId;
  if (!projectId) {
    return { valid: false, latencyMs: 0, error: "Neon project ID not provided" };
  }
  const { ok, status, body, latencyMs } = await timedFetch(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return ok
    ? { valid: true, latencyMs }
    : { valid: false, latencyMs, error: body.slice(0, 200), httpStatus: status };
};

// ── Dispatcher ──

const HEALTH_CHECKERS: Record<string, HealthChecker> = {
  anthropic: checkAnthropic,
  openai: checkOpenAI,
  groq: checkGroq,
  deepgram: checkDeepgram,
  stripe: checkStripe,
  clerk: checkClerk,
  "podcast-index": checkPodcastIndex,
  cloudflare: checkCloudflare,
  neon: checkNeon,
};

/**
 * Run a health check for a given provider.
 * Returns null if the provider has no health check implementation.
 */
export function runHealthCheck(
  provider: string,
  apiKey: string,
  extra?: { secret?: string; projectId?: string }
): Promise<HealthCheckResult> | null {
  const checker = HEALTH_CHECKERS[provider];
  if (!checker) return null;
  return checker(apiKey, extra);
}

/** Check if a provider supports health checking. */
export function isHealthCheckable(provider: string): boolean {
  return provider in HEALTH_CHECKERS;
}
