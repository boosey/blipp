// ── Plans ──

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  briefingsPerWeek: number | null;
  maxDurationMinutes: number;
  maxPodcastSubscriptions: number | null;
  pastEpisodesLimit: number | null;
  transcriptAccess: boolean;
  dailyDigest: boolean;
  concurrentPipelineJobs: number;
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;

  offlineAccess: boolean;
  publicSharing: boolean;
  priceCentsMonthly: number;
  priceCentsAnnual: number | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  stripeProductId: string | null;
  appleProductIdMonthly: string | null;
  appleProductIdAnnual: string | null;
  trialDays: number;
  allowedVoicePresetIds: string[];
  features: string[];
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  _count: { users: number };
}

// ── Voice Presets ──

export interface VoicePresetProviderConfig {
  voice?: string;
  instructions?: string;
  speed?: number;
}

export interface VoicePresetConfig {
  openai?: VoicePresetProviderConfig;
  groq?: { voice?: string };
  cloudflare?: Record<string, unknown>;
  [provider: string]: unknown;
}

export interface VoiceCharacteristics {
  gender?: "female" | "male" | "neutral";
  tone?: "warm" | "calm" | "energetic" | "neutral";
  pace?: "steady" | "fast" | "slow";
}

export interface VoicePresetEntry {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  config: VoicePresetConfig;
  voiceCharacteristics: VoiceCharacteristics | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoicePresetOption {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

// ── Prompt Versioning ──

export interface PromptVersionEntry {
  id: string;
  stage: string;
  version: number;
  label: string | null;
  values: Record<string, string>;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  isActive: boolean;
}
