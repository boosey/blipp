/**
 * Static registry of all service key usage contexts.
 * Maps each context to its provider, env key, group, and description.
 * This is the single source of truth for what keys exist and where they're used.
 */

export interface ServiceKeyContext {
  /** Unique context identifier, e.g. "pipeline.distillation" */
  context: string;
  /** Human-readable label */
  label: string;
  /** Provider identifier */
  provider: string;
  /** The Env property name this context reads from by default */
  envKey: string;
  /** Logical group for UI display */
  group: ServiceKeyGroup;
  /** What this context does */
  description: string;
  /** Whether a health check can validate this key */
  healthCheckable: boolean;
  /** Whether usage/cost data can be derived from PipelineStep */
  usageTrackable: boolean;
  /** PipelineStep.stage values to aggregate for usage (if usageTrackable) */
  pipelineStages?: string[];
  /** Additional model filter for shared stages (e.g., "deepgram/" prefix) */
  modelPrefix?: string;
  /** Paired secret envKey — when set, the UI asks for both key and secret together */
  pairedSecretEnvKey?: string;
}

export type ServiceKeyGroup =
  | "AI Pipeline"
  | "Catalog & Content"
  | "Auth & Identity"
  | "Billing"
  | "Infrastructure";

/**
 * All known service key usage contexts in the application.
 */
export const SERVICE_KEY_CONTEXTS: ServiceKeyContext[] = [
  // ── AI Pipeline ──
  {
    context: "pipeline.distillation",
    label: "Distillation (LLM)",
    provider: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    group: "AI Pipeline",
    description: "Claude LLM for extracting claims from transcripts",
    healthCheckable: true,
    usageTrackable: true,
    pipelineStages: ["DISTILLATION"],
  },
  {
    context: "pipeline.narrative",
    label: "Narrative Generation (LLM)",
    provider: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    group: "AI Pipeline",
    description: "Claude LLM for generating spoken narratives from claims",
    healthCheckable: true,
    usageTrackable: true,
    pipelineStages: ["NARRATIVE_GENERATION"],
  },
  {
    context: "pipeline.tts",
    label: "Text-to-Speech",
    provider: "openai",
    envKey: "OPENAI_API_KEY",
    group: "AI Pipeline",
    description: "OpenAI TTS for converting narratives to audio",
    healthCheckable: true,
    usageTrackable: true,
    pipelineStages: ["AUDIO_GENERATION"],
  },
  {
    context: "pipeline.stt",
    label: "Speech-to-Text",
    provider: "deepgram",
    envKey: "DEEPGRAM_API_KEY",
    group: "AI Pipeline",
    description: "Deepgram/Groq/OpenAI STT for transcribing podcast audio",
    healthCheckable: true,
    usageTrackable: true,
    pipelineStages: ["TRANSCRIPTION"],
  },

  // ── Catalog & Content ──
  {
    context: "catalog.discovery",
    label: "Podcast Discovery",
    provider: "podcast-index",
    envKey: "PODCAST_INDEX_KEY",
    pairedSecretEnvKey: "PODCAST_INDEX_SECRET",
    group: "Catalog & Content",
    description: "Podcast Index API for trending and search discovery",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "catalog.feed-refresh",
    label: "Feed Refresh",
    provider: "podcast-index",
    envKey: "PODCAST_INDEX_KEY",
    pairedSecretEnvKey: "PODCAST_INDEX_SECRET",
    group: "Catalog & Content",
    description: "Podcast Index for episode metadata during feed refresh",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "catalog.transcript-lookup",
    label: "Transcript Lookup",
    provider: "podcast-index",
    envKey: "PODCAST_INDEX_KEY",
    pairedSecretEnvKey: "PODCAST_INDEX_SECRET",
    group: "Catalog & Content",
    description: "Podcast Index transcript source before STT fallback",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "catalog.content-prefetch",
    label: "Content Prefetch",
    provider: "podcast-index",
    envKey: "PODCAST_INDEX_KEY",
    pairedSecretEnvKey: "PODCAST_INDEX_SECRET",
    group: "Catalog & Content",
    description: "Episode content availability check via Podcast Index",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "catalog.geo-classification",
    label: "Geo Classification (LLM)",
    provider: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    group: "Catalog & Content",
    description: "LLM-based geographic tagging for podcasts",
    healthCheckable: true,
    usageTrackable: false,
  },

  // ── Auth & Identity ──
  {
    context: "auth.clerk",
    label: "Clerk Server Auth",
    provider: "clerk",
    envKey: "CLERK_SECRET_KEY",
    group: "Auth & Identity",
    description: "Clerk server-side operations: user lookup, admin bypass, native auth, user deletion",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "auth.clerk-webhook",
    label: "Clerk Webhook Secret",
    provider: "clerk",
    envKey: "CLERK_WEBHOOK_SECRET",
    group: "Auth & Identity",
    description: "Signing secret for Clerk webhook signature verification",
    healthCheckable: false,
    usageTrackable: false,
  },

  // ── Billing ──
  {
    context: "billing.stripe",
    label: "Stripe API",
    provider: "stripe",
    envKey: "STRIPE_SECRET_KEY",
    group: "Billing",
    description: "Stripe checkout, portal, subscription queries, and user deletion cleanup",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "billing.stripe-webhook",
    label: "Stripe Webhook Secret",
    provider: "stripe",
    envKey: "STRIPE_WEBHOOK_SECRET",
    group: "Billing",
    description: "Signing secret for Stripe webhook signature verification",
    healthCheckable: false,
    usageTrackable: false,
  },

  // ── Infrastructure ──
  {
    context: "infra.cloudflare",
    label: "Cloudflare API",
    provider: "cloudflare",
    envKey: "CF_API_TOKEN",
    group: "Infrastructure",
    description: "CF API for worker logs and observability queries",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "infra.neon",
    label: "Neon Database API",
    provider: "neon",
    envKey: "NEON_API_KEY",
    group: "Infrastructure",
    description: "Neon API for database backup verification",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "infra.github",
    label: "GitHub Actions",
    provider: "github",
    envKey: "GITHUB_TOKEN",
    group: "Infrastructure",
    description: "GitHub PAT for triggering Actions workflows (Apple catalog discovery)",
    healthCheckable: true,
    usageTrackable: false,
  },
  {
    context: "push.vapid",
    label: "VAPID Web Push",
    provider: "vapid",
    envKey: "VAPID_PRIVATE_KEY",
    group: "Infrastructure",
    description: "VAPID keypair for web push notification authentication",
    healthCheckable: false,
    usageTrackable: false,
  },
];

/** Look up a context definition by its identifier. */
export function getContextDef(
  context: string
): ServiceKeyContext | undefined {
  return SERVICE_KEY_CONTEXTS.find((c) => c.context === context);
}

/** Get all contexts that use a given envKey. */
export function getContextsForEnvKey(envKey: string): ServiceKeyContext[] {
  return SERVICE_KEY_CONTEXTS.filter((c) => c.envKey === envKey);
}

/** Get all unique envKeys across all contexts. */
export function getAllEnvKeys(): string[] {
  return [...new Set(SERVICE_KEY_CONTEXTS.map((c) => c.envKey))];
}

/** Get contexts grouped by their group label. */
export function getContextsByGroup(): Record<ServiceKeyGroup, ServiceKeyContext[]> {
  const groups: Record<ServiceKeyGroup, ServiceKeyContext[]> = {
    "AI Pipeline": [],
    "Catalog & Content": [],
    "Auth & Identity": [],
    "Billing": [],
    "Infrastructure": [],
  };
  for (const ctx of SERVICE_KEY_CONTEXTS) {
    groups[ctx.group].push(ctx);
  }
  return groups;
}
