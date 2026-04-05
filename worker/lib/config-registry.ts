/**
 * Registry of all known PlatformConfig keys with types, defaults, and descriptions.
 * Serves as both runtime validation and documentation.
 *
 * Dynamic keys (cron.*.enabled, pipeline.stage.*.enabled, ai.*.model, etc.)
 * are validated via pattern entries.
 */

interface ConfigEntry {
  type: "boolean" | "number" | "string" | "string[]" | "json";
  defaultValue: unknown;
  description: string;
}

/** All known static PlatformConfig keys. */
export const CONFIG_REGISTRY: Record<string, ConfigEntry> = {
  // ── Ads ──
  "ads.enabled":            { type: "boolean", defaultValue: false, description: "Master ads toggle" },
  "ads.preroll.enabled":    { type: "boolean", defaultValue: false, description: "Enable preroll VAST ads" },
  "ads.preroll.vastUrl":    { type: "string",  defaultValue: "",    description: "VAST tag URL for preroll" },
  "ads.postroll.enabled":   { type: "boolean", defaultValue: false, description: "Enable postroll VAST ads" },
  "ads.postroll.vastUrl":   { type: "string",  defaultValue: "",    description: "VAST tag URL for postroll" },

  // ── Catalog ──
  "catalog.source":               { type: "string",  defaultValue: "podcast-index", description: "Default catalog source (apple or podcast-index)" },
  "catalog.seedSize":             { type: "number",  defaultValue: 20,   description: "Number of podcasts to discover per seed run" },
  "catalog.maxSize":              { type: "number",  defaultValue: 10000, description: "Hard upper limit on active catalog size. When full, least-ranked PI podcasts with no engagement signals are soft-deleted." },
  "catalog.refreshAllPodcasts":   { type: "boolean", defaultValue: false, description: "Refresh all podcasts (not just active subscribed)" },
  "catalog.requests.enabled":     { type: "boolean", defaultValue: true,  description: "Allow user podcast requests" },
  "catalog.requests.maxPerUser":  { type: "number",  defaultValue: 5,     description: "Max pending requests per user" },
  "catalog.cleanup.enabled":      { type: "boolean", defaultValue: false, description: "Enable stale podcast cleanup cron" },

  // ── Cost Alerts ──
  "cost.alert.dailyThreshold":  { type: "number", defaultValue: 5.0,  description: "Daily AI cost alert threshold ($)" },
  "cost.alert.weeklyThreshold": { type: "number", defaultValue: 25.0, description: "Weekly AI cost alert threshold ($)" },

  // ── Episodes ──
  "episodes.aging.enabled":    { type: "boolean", defaultValue: false, description: "Enable episode aging/deletion" },
  "episodes.aging.maxAgeDays": { type: "number",  defaultValue: 180,   description: "Max age before episode cleanup" },

  // ── Pipeline ──
  "pipeline.enabled":           { type: "boolean", defaultValue: true,  description: "Master pipeline toggle" },
  "pipeline.logLevel":          { type: "string",  defaultValue: "info", description: "Pipeline log level (error, info, debug)" },
  "pipeline.contentPrefetch.fetchTimeoutMs":    { type: "number", defaultValue: 15000, description: "Content prefetch timeout (ms)" },
  "pipeline.feedRefresh.maxEpisodesPerPodcast": { type: "number", defaultValue: 5,     description: "Max episodes to upsert per feed refresh" },
  "pipeline.feedRefresh.fetchTimeoutMs":        { type: "number", defaultValue: 10000, description: "Feed refresh timeout (ms)" },
  "pipeline.feedRefresh.batchConcurrency":      { type: "number", defaultValue: 10,    description: "Feed refresh queue send batch size" },

  // ── Geo Classification ──
  "geoClassification.llmProviderId": { type: "string",  defaultValue: "",    description: "AiProvider ID for LLM-based geo classification (pass 2)" },
  "geoClassification.batchSize":     { type: "number",  defaultValue: 500,   description: "Max podcasts to geo-tag per cron run" },

  // ── Recommendations ──
  "recommendations.enabled":                  { type: "boolean", defaultValue: true,  description: "Enable recommendation engine" },
  "recommendations.embeddings.enabled":       { type: "boolean", defaultValue: false, description: "Enable embedding-based similarity" },
  "recommendations.cache.maxResults":         { type: "number",  defaultValue: 20,    description: "Max cached recommendation results" },
  "recommendations.coldStart.minSubscriptions": { type: "number", defaultValue: 3,    description: "Min subscriptions before personalized recs" },
  "recommendations.weights.category":         { type: "number",  defaultValue: 0.25,  description: "Category similarity weight" },
  "recommendations.weights.popularity":       { type: "number",  defaultValue: 0.20,  description: "Popularity score weight" },
  "recommendations.weights.freshness":        { type: "number",  defaultValue: 0.10,  description: "Freshness recency weight" },
  "recommendations.weights.subscriberOverlap": { type: "number", defaultValue: 0.15,  description: "Subscriber overlap weight" },
  "recommendations.weights.topic":            { type: "number",  defaultValue: 0.15,  description: "Topic similarity weight" },
  "recommendations.weights.embedding":        { type: "number",  defaultValue: 0.15,  description: "Embedding similarity weight" },
  "recommendations.weights.explicitTopicBonus": { type: "number", defaultValue: 0.05, description: "Additive bonus for explicit topic matches" },
  "recommendations.weights.localBoost":        { type: "number",  defaultValue: 0.10,  description: "Local content scoring weight" },
  "recommendations.explicit.categoryBoost":   { type: "number",  defaultValue: 1.0,   description: "Weight boost per explicit preferred category" },
  "recommendations.explicit.topicBoostFactor": { type: "number", defaultValue: 1.5,   description: "Factor above max implicit weight for explicit topics" },
  "recommendations.exclusion.topicPenalty":    { type: "number",  defaultValue: 0.3,   description: "Per-topic exclusion penalty multiplier" },
  "recommendations.coldStart.explicitMinCategories": { type: "number", defaultValue: 2, description: "Min explicit categories to escape cold start" },
  "recommendations.coldStart.explicitMinTopics": { type: "number", defaultValue: 3,    description: "Min explicit topics to escape cold start" },

  // ── Requests ──
  "requests.archiving.enabled": { type: "boolean", defaultValue: false, description: "Enable request archiving in data retention" },

  // ── Transcript ──
  "transcript.sources": { type: "string[]", defaultValue: ["rss-feed", "podcast-index"], description: "Ordered transcript source providers" },

  // ── Duration Tiers ──
  "tiers.duration": { type: "json", defaultValue: null, description: "Available duration tiers (JSON array)" },
};

/** Dynamic key patterns that match prefixed keys (e.g. cron.*.enabled). */
export const CONFIG_PATTERNS: { pattern: RegExp; type: ConfigEntry["type"]; description: string }[] = [
  { pattern: /^cron\.\w[\w-]*\.enabled$/,          type: "boolean", description: "Enable/disable a cron job" },
  { pattern: /^cron\.\w[\w-]*\.intervalMinutes$/,   type: "number",  description: "Cron job run interval (minutes)" },
  { pattern: /^cron\.\w[\w-]*\.lastRunAt$/,         type: "string",  description: "Last run ISO timestamp" },
  { pattern: /^pipeline\.stage\.\w+\.enabled$/,     type: "boolean", description: "Enable/disable a pipeline stage" },
  { pattern: /^ai\.\w+\.model(\.secondary|\.tertiary)?$/, type: "json", description: "AI model config ({provider, model})" },
  { pattern: /^prompt\./,                           type: "string",  description: "Prompt template override" },
  { pattern: /^feature\./,                          type: "boolean", description: "Feature flag" },
];

/**
 * Validate a config key is known. Returns the registry entry if found,
 * or null if the key is unrecognized. Logs a warning for unknown keys.
 */
export function validateConfigKey(key: string): ConfigEntry | null {
  const entry = CONFIG_REGISTRY[key];
  if (entry) return entry;

  for (const { pattern, type, description } of CONFIG_PATTERNS) {
    if (pattern.test(key)) return { type, defaultValue: null, description };
  }

  console.warn(JSON.stringify({
    level: "warn",
    action: "unknown_config_key",
    key,
    ts: new Date().toISOString(),
  }));
  return null;
}
