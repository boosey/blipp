/**
 * Cloudflare Worker environment bindings for the Blipp API.
 *
 * Includes all runtime bindings: Hyperdrive (database), R2 (audio storage),
 * Queues (background jobs), and secret strings (API keys).
 */
export type Env = {
  /** Vite-managed static asset fetcher (Cloudflare Pages integration) */
  ASSETS: Fetcher;
  /** Cloudflare Hyperdrive connection to Neon PostgreSQL */
  HYPERDRIVE: Hyperdrive;
  /** R2 bucket for cached clips and assembled briefings */
  R2: R2Bucket;
  /** Clerk secret key for server-side auth verification */
  CLERK_SECRET_KEY: string;
  /** Clerk publishable key */
  CLERK_PUBLISHABLE_KEY: string;
  /** Clerk webhook signing secret */
  CLERK_WEBHOOK_SECRET: string;
  /** Stripe secret API key */
  STRIPE_SECRET_KEY: string;
  /** Stripe webhook signing secret */
  STRIPE_WEBHOOK_SECRET: string;
  /** Stripe Price ID for Pro tier ($9.99/mo) */
  STRIPE_PRO_PRICE_ID: string;
  /** Stripe Price ID for Pro+ tier ($19.99/mo) */
  STRIPE_PRO_PLUS_PRICE_ID: string;
  /** Anthropic API key for Claude distillation */
  ANTHROPIC_API_KEY: string;
  /** OpenAI API key for TTS generation */
  OPENAI_API_KEY: string;
  /** Podcast Index API key */
  PODCAST_INDEX_KEY: string;
  /** Podcast Index API secret */
  PODCAST_INDEX_SECRET: string;
  /** Queue: triggers RSS feed polling for new episodes */
  FEED_REFRESH_QUEUE: Queue;
  /** Queue: fetches transcripts and extracts claims via Claude */
  DISTILLATION_QUEUE: Queue;
  /** Queue: generates narrative + TTS for a specific (episode, tier) clip */
  CLIP_GENERATION_QUEUE: Queue;
  /** Queue: assembles cached clips into a user's final briefing */
  BRIEFING_ASSEMBLY_QUEUE: Queue;
};
