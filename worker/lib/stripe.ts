import Stripe from "stripe";

/**
 * Creates a Stripe client configured for Cloudflare Workers.
 * Uses the fetch-based HTTP client instead of Node.js http module.
 *
 * @param secretKey - Stripe secret API key
 * @returns A Stripe client instance safe for Workers runtime
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
