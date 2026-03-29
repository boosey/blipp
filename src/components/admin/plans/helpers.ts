import type { AdminPlan } from "@/types/admin";

// ── Helpers ──

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

// ── Form types & converters ──

export interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  // Limits
  briefingsPerWeek: string;
  maxDurationMinutes: string;
  maxPodcastSubscriptions: string;
  pastEpisodesLimit: string;
  // Content Delivery
  transcriptAccess: boolean;
  dailyDigest: boolean;
  // Pipeline & Processing
  concurrentPipelineJobs: string;
  // Feature flags
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
  // Personalization

  offlineAccess: boolean;
  publicSharing: boolean;
  // Billing
  priceCentsMonthly: string;
  priceCentsAnnual: string;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  trialDays: string;
  allowedVoicePresetIds: string[];
  // Display
  features: string;
  highlighted: boolean;
  sortOrder: string;
  isDefault: boolean;
}

export function emptyForm(): PlanFormData {
  return {
    name: "",
    slug: "",
    description: "",
    briefingsPerWeek: "",
    maxDurationMinutes: "5",
    maxPodcastSubscriptions: "",
    pastEpisodesLimit: "",
    transcriptAccess: false,
    dailyDigest: false,
    concurrentPipelineJobs: "1",
    adFree: false,
    priorityProcessing: false,
    earlyAccess: false,

    offlineAccess: false,
    publicSharing: false,
    priceCentsMonthly: "0",
    priceCentsAnnual: "",
    stripePriceIdMonthly: "",
    stripePriceIdAnnual: "",
    trialDays: "0",
    allowedVoicePresetIds: [],
    features: "",
    highlighted: false,
    sortOrder: "0",
    isDefault: false,
  };
}

export function planToForm(plan: AdminPlan): PlanFormData {
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? "",
    briefingsPerWeek: plan.briefingsPerWeek != null ? String(plan.briefingsPerWeek) : "",
    maxDurationMinutes: String(plan.maxDurationMinutes),
    maxPodcastSubscriptions: plan.maxPodcastSubscriptions != null ? String(plan.maxPodcastSubscriptions) : "",
    pastEpisodesLimit: plan.pastEpisodesLimit != null ? String(plan.pastEpisodesLimit) : "",
    transcriptAccess: plan.transcriptAccess,
    dailyDigest: plan.dailyDigest,
    concurrentPipelineJobs: String(plan.concurrentPipelineJobs ?? 1),
    adFree: plan.adFree,
    priorityProcessing: plan.priorityProcessing,
    earlyAccess: plan.earlyAccess,

    offlineAccess: plan.offlineAccess,
    publicSharing: plan.publicSharing,
    priceCentsMonthly: String(plan.priceCentsMonthly),
    priceCentsAnnual: plan.priceCentsAnnual != null ? String(plan.priceCentsAnnual) : "",
    stripePriceIdMonthly: plan.stripePriceIdMonthly ?? "",
    stripePriceIdAnnual: plan.stripePriceIdAnnual ?? "",
    trialDays: String(plan.trialDays),
    allowedVoicePresetIds: plan.allowedVoicePresetIds ?? [],
    features: plan.features.join("\n"),
    highlighted: plan.highlighted,
    sortOrder: String(plan.sortOrder),
    isDefault: plan.isDefault,
  };
}

export function formToPayload(form: PlanFormData) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description || undefined,
    briefingsPerWeek: form.briefingsPerWeek ? Number(form.briefingsPerWeek) : null,
    maxDurationMinutes: Number(form.maxDurationMinutes),
    maxPodcastSubscriptions: form.maxPodcastSubscriptions ? Number(form.maxPodcastSubscriptions) : null,
    pastEpisodesLimit: form.pastEpisodesLimit ? Number(form.pastEpisodesLimit) : null,
    transcriptAccess: form.transcriptAccess,
    dailyDigest: form.dailyDigest,
    concurrentPipelineJobs: Number(form.concurrentPipelineJobs),
    adFree: form.adFree,
    priorityProcessing: form.priorityProcessing,
    earlyAccess: form.earlyAccess,

    offlineAccess: form.offlineAccess,
    publicSharing: form.publicSharing,
    priceCentsMonthly: Number(form.priceCentsMonthly),
    priceCentsAnnual: form.priceCentsAnnual ? Number(form.priceCentsAnnual) : null,
    stripePriceIdMonthly: form.stripePriceIdMonthly || null,
    stripePriceIdAnnual: form.stripePriceIdAnnual || null,
    trialDays: Number(form.trialDays),
    allowedVoicePresetIds: form.allowedVoicePresetIds,
    features: form.features
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    highlighted: form.highlighted,
    sortOrder: Number(form.sortOrder),
    isDefault: form.isDefault,
  };
}
