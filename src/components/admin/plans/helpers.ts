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
  onDemandRequestsPerWeek: string;
  outputFormats: string;
  transcriptAccess: boolean;
  refreshLatencyTier: string;
  dailyDigest: boolean;
  weeklyRecap: boolean;
  narrativeDepthTier: string;
  episodeHighlightClips: boolean;
  // Pipeline & Processing
  aiModelTier: string;
  ttsModelTier: string;
  sttModelTier: string;
  customInstructions: boolean;
  retryBudget: string;
  concurrentPipelineJobs: string;
  // Feature flags
  adFree: boolean;
  priorityProcessing: boolean;
  earlyAccess: boolean;
  researchMode: boolean;
  crossPodcastSynthesis: boolean;
  // Library & Discovery
  topicTracking: boolean;
  customCollections: boolean;
  searchBriefings: boolean;
  catalogAccess: string;
  savedSearches: string;
  rssExport: boolean;
  apiAccess: boolean;
  // Personalization
  tonePresets: boolean;
  languageSupport: string;
  focusTopics: boolean;
  skipTopics: boolean;
  briefingIntro: boolean;
  maxStorageDays: string;
  offlineAccess: boolean;
  publicSharing: boolean;
  interactiveBriefing: boolean;
  // Billing
  priceCentsMonthly: string;
  priceCentsAnnual: string;
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
    onDemandRequestsPerWeek: "",
    outputFormats: "audio",
    transcriptAccess: false,
    refreshLatencyTier: "standard",
    dailyDigest: false,
    weeklyRecap: false,
    narrativeDepthTier: "standard",
    episodeHighlightClips: false,
    aiModelTier: "standard",
    ttsModelTier: "standard",
    sttModelTier: "standard",
    customInstructions: false,
    retryBudget: "1",
    concurrentPipelineJobs: "1",
    adFree: false,
    priorityProcessing: false,
    earlyAccess: false,
    researchMode: false,
    crossPodcastSynthesis: false,
    topicTracking: false,
    customCollections: false,
    searchBriefings: false,
    catalogAccess: "subscribed",
    savedSearches: "",
    rssExport: false,
    apiAccess: false,
    tonePresets: false,
    languageSupport: "",
    focusTopics: false,
    skipTopics: false,
    briefingIntro: false,
    maxStorageDays: "",
    offlineAccess: false,
    publicSharing: false,
    interactiveBriefing: false,
    priceCentsMonthly: "0",
    priceCentsAnnual: "",
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
    onDemandRequestsPerWeek: plan.onDemandRequestsPerWeek != null ? String(plan.onDemandRequestsPerWeek) : "",
    outputFormats: (plan.outputFormats ?? []).join(", "),
    transcriptAccess: plan.transcriptAccess,
    refreshLatencyTier: plan.refreshLatencyTier ?? "standard",
    dailyDigest: plan.dailyDigest,
    weeklyRecap: plan.weeklyRecap,
    narrativeDepthTier: plan.narrativeDepthTier ?? "standard",
    episodeHighlightClips: plan.episodeHighlightClips,
    aiModelTier: plan.aiModelTier ?? "standard",
    ttsModelTier: plan.ttsModelTier ?? "standard",
    sttModelTier: plan.sttModelTier ?? "standard",
    customInstructions: plan.customInstructions,
    retryBudget: String(plan.retryBudget ?? 1),
    concurrentPipelineJobs: String(plan.concurrentPipelineJobs ?? 1),
    adFree: plan.adFree,
    priorityProcessing: plan.priorityProcessing,
    earlyAccess: plan.earlyAccess,
    researchMode: plan.researchMode,
    crossPodcastSynthesis: plan.crossPodcastSynthesis,
    topicTracking: plan.topicTracking,
    customCollections: plan.customCollections,
    searchBriefings: plan.searchBriefings,
    catalogAccess: plan.catalogAccess ?? "subscribed",
    savedSearches: plan.savedSearches != null ? String(plan.savedSearches) : "",
    rssExport: plan.rssExport,
    apiAccess: plan.apiAccess,
    tonePresets: plan.tonePresets,
    languageSupport: (plan.languageSupport ?? []).join(", "),
    focusTopics: plan.focusTopics,
    skipTopics: plan.skipTopics,
    briefingIntro: plan.briefingIntro,
    maxStorageDays: plan.maxStorageDays != null ? String(plan.maxStorageDays) : "",
    offlineAccess: plan.offlineAccess,
    publicSharing: plan.publicSharing,
    interactiveBriefing: plan.interactiveBriefing,
    priceCentsMonthly: String(plan.priceCentsMonthly),
    priceCentsAnnual: plan.priceCentsAnnual != null ? String(plan.priceCentsAnnual) : "",
    trialDays: String(plan.trialDays),
    allowedVoicePresetIds: plan.allowedVoicePresetIds ?? [],
    features: plan.features.join(", "),
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
    onDemandRequestsPerWeek: form.onDemandRequestsPerWeek ? Number(form.onDemandRequestsPerWeek) : null,
    outputFormats: form.outputFormats.split(",").map((s) => s.trim()).filter(Boolean),
    transcriptAccess: form.transcriptAccess,
    refreshLatencyTier: form.refreshLatencyTier,
    dailyDigest: form.dailyDigest,
    weeklyRecap: form.weeklyRecap,
    narrativeDepthTier: form.narrativeDepthTier,
    episodeHighlightClips: form.episodeHighlightClips,
    aiModelTier: form.aiModelTier,
    ttsModelTier: form.ttsModelTier,
    sttModelTier: form.sttModelTier,
    customInstructions: form.customInstructions,
    retryBudget: Number(form.retryBudget),
    concurrentPipelineJobs: Number(form.concurrentPipelineJobs),
    adFree: form.adFree,
    priorityProcessing: form.priorityProcessing,
    earlyAccess: form.earlyAccess,
    researchMode: form.researchMode,
    crossPodcastSynthesis: form.crossPodcastSynthesis,
    topicTracking: form.topicTracking,
    customCollections: form.customCollections,
    searchBriefings: form.searchBriefings,
    catalogAccess: form.catalogAccess,
    savedSearches: form.savedSearches ? Number(form.savedSearches) : null,
    rssExport: form.rssExport,
    apiAccess: form.apiAccess,
    tonePresets: form.tonePresets,
    languageSupport: form.languageSupport.split(",").map((s) => s.trim()).filter(Boolean),
    focusTopics: form.focusTopics,
    skipTopics: form.skipTopics,
    briefingIntro: form.briefingIntro,
    maxStorageDays: form.maxStorageDays ? Number(form.maxStorageDays) : null,
    offlineAccess: form.offlineAccess,
    publicSharing: form.publicSharing,
    interactiveBriefing: form.interactiveBriefing,
    priceCentsMonthly: Number(form.priceCentsMonthly),
    priceCentsAnnual: form.priceCentsAnnual ? Number(form.priceCentsAnnual) : null,
    trialDays: Number(form.trialDays),
    allowedVoicePresetIds: form.allowedVoicePresetIds,
    features: form.features
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    highlighted: form.highlighted,
    sortOrder: Number(form.sortOrder),
    isDefault: form.isDefault,
  };
}
