/**
 * SSRF protection: validates URLs before fetching external resources.
 * Blocks private IPs, link-local, metadata endpoints, and non-HTTP schemes.
 */

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.google",
];

const PRIVATE_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // link-local / AWS metadata
  /^0\./, // current network
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 link-local
  /^fd/i, // IPv6 ULA
  /^\[::1\]$/, // bracketed IPv6 loopback
];

export class SsrfError extends Error {
  constructor(reason: string, public readonly url: string) {
    super(`SSRF blocked: ${reason} (${url})`);
    this.name = "SsrfError";
  }
}

/**
 * Validates a URL is safe to fetch (not targeting internal resources).
 * Throws SsrfError if the URL is blocked.
 */
export function validateExternalUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError("invalid URL", url);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SsrfError(`blocked scheme: ${parsed.protocol}`, url);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.includes(hostname.toLowerCase())) {
    throw new SsrfError("blocked hostname", url);
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SsrfError("private/internal IP", url);
    }
  }

  if (parsed.port && !["80", "443", ""].includes(parsed.port)) {
    throw new SsrfError(`non-standard port: ${parsed.port}`, url);
  }

  return parsed;
}

/**
 * Wrapper: validates URL then fetches. Drop-in replacement for fetch()
 * on user-controlled URLs.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  validateExternalUrl(url);
  return fetch(url, init);
}
