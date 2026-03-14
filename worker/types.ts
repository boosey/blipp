// Extend Hono's ContextVariableMap so c.get("prisma") / c.set("prisma", ...) is type-safe.
declare module "hono" {
  interface ContextVariableMap {
    prisma: any;
    requestId: string;
    apiKeyScopes: string[];
    apiKeyUserId: string;
  }
}

/**
 * Cloudflare Worker environment bindings for the Blipp API.
 *
 * Includes all runtime bindings: Hyperdrive (database), R2 (audio storage),
 * Queues (background jobs), and secret strings (API keys).
 */
export type Env = {
  /** Set to "development" in .dev.vars to enable local queue shim */
  ENVIRONMENT?: string;
  /** Vite-managed static asset fetcher (Cloudflare Pages integration) */
  ASSETS: Fetcher;
  /** Cloudflare Workers AI binding for CF-hosted models */
  AI: Ai;
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
  /** Queue: generates spoken narrative from distillation claims (Claude LLM) */
  NARRATIVE_GENERATION_QUEUE: Queue;
  /** Queue: converts narrative to MP3 audio via TTS (OpenAI) */
  AUDIO_GENERATION_QUEUE: Queue;
  /** Queue: assembles cached clips into a user's final briefing */
  BRIEFING_ASSEMBLY_QUEUE: Queue;
  /** Queue: fetches episode transcripts from URLs */
  TRANSCRIPTION_QUEUE: Queue;
  /** Queue: orchestrates demand-driven pipeline stages for briefing requests */
  ORCHESTRATOR_QUEUE: Queue;
  /** Deepgram API key for STT benchmark */
  DEEPGRAM_API_KEY: string;
  /** AssemblyAI API key for STT benchmark */
  ASSEMBLYAI_API_KEY: string;
  /** Google Cloud STT API key for STT benchmark */
  GOOGLE_STT_API_KEY: string;
  /** Groq API key for fast STT inference */
  GROQ_API_KEY: string;
  /** Comma-separated list of allowed CORS origins (optional, overrides defaults) */
  ALLOWED_ORIGINS?: string;
  /** Neon API key for backup verification (optional) */
  NEON_API_KEY?: string;
  /** Neon project ID for backup verification (optional) */
  NEON_PROJECT_ID?: string;
  /** VAPID public key for Web Push (optional) */
  VAPID_PUBLIC_KEY?: string;
  /** VAPID private key for Web Push (optional) */
  VAPID_PRIVATE_KEY?: string;
  /** VAPID subject (mailto: URL) for Web Push (optional) */
  VAPID_SUBJECT?: string;
};
