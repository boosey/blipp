import type { PrismaClient } from "../src/generated/prisma";

// Extend Hono's ContextVariableMap so c.get("prisma") / c.set("prisma", ...) is type-safe.
declare module "hono" {
  interface ContextVariableMap {
    prisma: PrismaClient;
    requestId: string;
    apiKeyScopes: string[];
    apiKeyUserId: string;
  }
}

import type { FeedRefreshMessage, CatalogRefreshMessage, WelcomeEmailMessage, SubscriptionPauseEmailMessage } from "./lib/queue-messages";

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
  /** RevenueCat webhook Authorization header secret (shared secret configured in RC dashboard) */
  REVENUECAT_WEBHOOK_SECRET?: string;
  /** RevenueCat REST API v2 secret key (Bearer token) for server-side purchase verification */
  REVENUECAT_REST_API_KEY?: string;
  /** RevenueCat project ID — required in v2 URL path (e.g. proj_xxx) */
  REVENUECAT_PROJECT_ID?: string;
  /** Anthropic API key for Claude distillation */
  ANTHROPIC_API_KEY: string;
  /** OpenAI API key for TTS generation */
  OPENAI_API_KEY: string;
  /** Podcast Index API key */
  PODCAST_INDEX_KEY: string;
  /** Podcast Index API secret */
  PODCAST_INDEX_SECRET: string;
  /** Queue: triggers RSS feed polling for new episodes */
  FEED_REFRESH_QUEUE: Queue<FeedRefreshMessage>;
  /** Queue: seeds or refreshes the podcast catalog from Podcast Index */
  CATALOG_REFRESH_QUEUE: Queue<CatalogRefreshMessage>;
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
  /** Queue: slow content prefetch (transcript/audio validation) for episodes */
  CONTENT_PREFETCH_QUEUE: Queue;
  /** Queue: sends the one-time welcome email on user.created */
  WELCOME_EMAIL_QUEUE: Queue<WelcomeEmailMessage>;
  /** Queue: sends the subscription auto-paused notification email */
  SUBSCRIPTION_PAUSE_EMAIL_QUEUE: Queue<SubscriptionPauseEmailMessage>;
  /** ZeptoMail Send Mail API token (the "Zoho-enczapikey" value, without the prefix) */
  ZEPTOMAIL_TOKEN?: string;
  /** Verified sender email address for welcome emails (e.g. welcome@podblipp.com) */
  ZEPTOMAIL_FROM_ADDRESS?: string;
  /** Display name on welcome emails (e.g. "Blipp") */
  ZEPTOMAIL_FROM_NAME?: string;
  /** ZeptoMail template key for the welcome email template */
  ZEPTOMAIL_WELCOME_TEMPLATE_KEY?: string;
  /** ZeptoMail template key for the subscription auto-paused email */
  ZEPTOMAIL_SUBSCRIPTION_PAUSE_TEMPLATE_KEY?: string;
  /** HMAC signing secret for subscription resume tokens (optional — falls back to derivation off CLERK_WEBHOOK_SECRET) */
  SUBSCRIPTION_RESUME_SECRET?: string;
  /** Deepgram API key for STT benchmark */
  DEEPGRAM_API_KEY: string;
  /** Groq API key for fast STT inference */
  GROQ_API_KEY: string;
  /** Comma-separated list of allowed CORS origins */
  ALLOWED_ORIGINS: string;
  /** Base URL for this environment (e.g., https://podblipp.com) — used for Stripe redirects */
  APP_ORIGIN: string;
  /** Clerk Frontend API URL (e.g., https://clerk.podblipp.com) */
  CLERK_FAPI_URL: string;
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
  /** KV namespace for persistent rate limiting (optional — falls back to in-memory) */
  RATE_LIMIT_KV?: KVNamespace;
  /** GitHub PAT for triggering Actions workflows (optional — Apple refresh button) */
  GITHUB_TOKEN?: string;
  /** Cloudflare API token for Workers Observability queries */
  CF_API_TOKEN?: string;
  /** Cloudflare account ID for API calls */
  CF_ACCOUNT_ID?: string;
  /** AES-256 master key (64-char hex) for encrypting service keys at rest in the DB */
  SERVICE_KEY_ENCRYPTION_KEY?: string;
  /** Worker script name for CF API secret sync ("blipp" or "blipp-staging") */
  WORKER_SCRIPT_NAME?: string;
  /** HMAC secret for audio URL tokens (optional — falls back to derivation off CLERK_WEBHOOK_SECRET) */
  AUDIO_TOKEN_SECRET?: string;
  /** Server kill-switch for the audio token endpoint. If "false", `/audio-url` returns 503. */
  ENABLE_AUDIO_TOKEN?: string;
  /** Show slug for the landing-page "Hear a sample" CTA. Falls back to the most recent public episode if invalid. */
  LANDING_SAMPLE_SHOW_SLUG?: string;
  /** Episode slug paired with `LANDING_SAMPLE_SHOW_SLUG`. Validated against `publicPage: true`. */
  LANDING_SAMPLE_EPISODE_SLUG?: string;
};
