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
  /**
   * Which admin page "owns" this key. Owned keys are hidden from the
   * generic System Settings page because they already have dedicated UI.
   *
   * null / undefined = shown on System Settings.
   */
  ownedBy?: string | null;
}

/** All known static PlatformConfig keys. */
export const CONFIG_REGISTRY: Record<string, ConfigEntry> = {
  // ── Ads ── (owned by Ads page)
  "ads.enabled":            { type: "boolean", defaultValue: false, description: "Master toggle for all ad placements. When off, no VAST tags are requested regardless of preroll/postroll settings.", ownedBy: "ads" },
  "ads.preroll.enabled":    { type: "boolean", defaultValue: false, description: "Show a preroll ad before briefing playback. Requires ads.enabled and a valid VAST URL.", ownedBy: "ads" },
  "ads.preroll.vastUrl":    { type: "string",  defaultValue: "",    description: "VAST tag URL for preroll ads. Must return valid VAST XML or the ad slot is skipped silently.", ownedBy: "ads" },
  "ads.postroll.enabled":   { type: "boolean", defaultValue: false, description: "Show a postroll ad after briefing playback. Requires ads.enabled and a valid VAST URL.", ownedBy: "ads" },
  "ads.postroll.vastUrl":   { type: "string",  defaultValue: "",    description: "VAST tag URL for postroll ads. Must return valid VAST XML or the ad slot is skipped silently.", ownedBy: "ads" },

  // ── Catalog ── (owned by Podcast Settings page)
  "catalog.source":               { type: "string",  defaultValue: "podcast-index", description: "Default catalog source for discovery. 'podcast-index' is free/open; 'apple' has richer metadata but stricter rate limits.", ownedBy: "podcast-settings" },
  "catalog.seedSize":             { type: "number",  defaultValue: 20,   description: "Podcasts to fetch per catalog discovery run. Higher values grow the catalog faster but increase API usage and processing time.", ownedBy: "podcast-settings" },
  "catalog.maxSize":              { type: "number",  defaultValue: 10000, description: "Hard upper limit on active catalog size. When full, least-ranked Podcast Index entries with no engagement signals are soft-deleted to make room.", ownedBy: "podcast-settings" },
  "catalog.refreshAllPodcasts":   { type: "boolean", defaultValue: false, description: "Refresh all catalog podcasts during feed refresh, not just those with active subscribers. Increases processing volume significantly.", ownedBy: "podcast-settings" },
  "catalog.requests.enabled":     { type: "boolean", defaultValue: true,  description: "Allow users to submit podcast addition requests. When disabled, the request form is hidden.", ownedBy: "podcast-settings" },
  "catalog.requests.maxPerUser":  { type: "number",  defaultValue: 5,     description: "Maximum pending (unresolved) requests per user. Prevents request flooding. Fulfilled/rejected requests don't count.", ownedBy: "podcast-settings" },
  "catalog.cleanup.enabled":      { type: "boolean", defaultValue: false, description: "Enable automatic cleanup of stale podcasts with no subscribers and no recent episodes. Runs during data retention cron.", ownedBy: "podcast-settings" },

  // ── Cost Alerts ──
  "cost.alert.dailyThreshold":  { type: "number", defaultValue: 5.0,  description: "Daily AI spending alert threshold in USD. When cumulative daily costs across all providers exceed this, a warning is logged. Does not block processing — monitoring only." },
  "cost.alert.weeklyThreshold": { type: "number", defaultValue: 25.0, description: "Weekly AI spending alert threshold in USD. Same behavior as daily threshold but over a 7-day rolling window." },

  // ── Episodes ── (owned by Podcast Settings page)
  "episodes.aging.enabled":    { type: "boolean", defaultValue: false, description: "Enable automatic deletion of old episodes and their work products (transcripts, claims, audio clips). Runs during the data retention cron job.", ownedBy: "podcast-settings" },
  "episodes.aging.maxAgeDays": { type: "number",  defaultValue: 180,   description: "Episodes older than this many days become deletion candidates when aging is enabled. Their clips, transcripts, and pipeline data are also removed. Does not affect briefings already delivered to users.", ownedBy: "podcast-settings" },

  // ── Pipeline ──
  "pipeline.enabled":           { type: "boolean", defaultValue: true,  description: "Master pipeline toggle. When disabled, all queue consumers ACK messages without processing. Use this as an emergency stop for all AI processing." },
  "pipeline.logLevel":          { type: "string",  defaultValue: "info", description: "Pipeline log verbosity: 'error' (failures only), 'info' (normal operations), 'debug' (verbose tracing including prompts and responses). Debug generates significant log volume." },

  // ── Pipeline: Feed Refresh ── (owned by Podcast Settings page)
  "pipeline.contentPrefetch.fetchTimeoutMs":    { type: "number", defaultValue: 15000, description: "Timeout in milliseconds for content prefetch requests (transcript and audio validation). Increase if feeds on slow servers are timing out frequently.", ownedBy: "podcast-settings" },
  "pipeline.feedRefresh.maxEpisodesPerPodcast": { type: "number", defaultValue: 5,     description: "Maximum episodes to ingest per podcast during a feed refresh cycle. Limits how many new episodes enter the pipeline at once. Higher values catch up on backlogs faster but increase queue depth.", ownedBy: "podcast-settings" },
  "pipeline.feedRefresh.fetchTimeoutMs":        { type: "number", defaultValue: 10000, description: "Timeout in milliseconds for RSS feed HTTP requests. Feeds that don't respond within this window are retried on the next cycle.", ownedBy: "podcast-settings" },
  "pipeline.feedRefresh.batchConcurrency":      { type: "number", defaultValue: 10,    description: "Number of podcasts processed in parallel within a single queue message. Higher values increase throughput but also memory pressure per worker.", ownedBy: "podcast-settings" },
  "pipeline.feedRefresh.maxRetries":            { type: "number", defaultValue: 3,     description: "Maximum retry attempts when an RSS feed fetch fails with a retryable HTTP status (429, 5xx). Uses exponential backoff (1s, 2s, 4s). After exhausting retries the episode is skipped for this cycle.", ownedBy: "podcast-settings" },

  // ── Pipeline: Distillation ──
  "pipeline.distillation.rateLimitRetries": { type: "number", defaultValue: 3, description: "Retry attempts when the distillation AI provider returns a rate limit error (HTTP 429). Uses exponential backoff between attempts. If all retries fail, the message is retried by the queue." },

  // ── Geo Classification ── (owned by Podcast Settings page)
  "geoClassification.llmProviderId": { type: "string",  defaultValue: "",    description: "AiModelProvider ID for LLM-based geo classification (pass 2). Leave empty to use keyword-only classification.", ownedBy: "podcast-settings" },
  "geoClassification.batchSize":     { type: "number",  defaultValue: 500,   description: "Maximum podcasts to process per geo-tagging cron run across both keyword and LLM passes.", ownedBy: "podcast-settings" },
  "geoClassification.llmBatchSize":  { type: "number",  defaultValue: 10,    description: "Podcasts per LLM API call in geo classification. Larger batches reduce API calls but increase per-call latency and token usage.", ownedBy: "podcast-settings" },

  // ── Rate Limiting ──
  "rateLimit.api.maxRequests":              { type: "number", defaultValue: 120,       description: "Maximum API requests per window across all endpoints, per user. Identified by Clerk user ID or IP address. Set too low and power users hit walls; too high and a single user can saturate the worker." },
  "rateLimit.api.windowMs":                 { type: "number", defaultValue: 60_000,    description: "Time window in milliseconds for the general API rate limit. Requests are counted per window; the counter resets when the window rolls over." },
  "rateLimit.briefingGenerate.maxRequests":  { type: "number", defaultValue: 10,        description: "Maximum briefing generation requests per window. Each generation triggers AI transcription, distillation, narrative, and TTS — the most expensive operation in the system." },
  "rateLimit.briefingGenerate.windowMs":     { type: "number", defaultValue: 3_600_000, description: "Time window for the briefing generation rate limit (default: 1 hour). Users can generate up to maxRequests briefings within each window." },
  "rateLimit.voicePreview.maxRequests":      { type: "number", defaultValue: 20,        description: "Maximum voice preview requests per window. Each preview calls the TTS provider, so this limits cost exposure from users sampling voices." },
  "rateLimit.voicePreview.windowMs":         { type: "number", defaultValue: 60_000,    description: "Time window for voice preview rate limit (default: 1 minute)." },
  "rateLimit.subscribe.maxRequests":         { type: "number", defaultValue: 5,         description: "Maximum podcast subscribe requests per window. Prevents rapid-fire subscription spam that could trigger excessive feed refreshes." },
  "rateLimit.subscribe.windowMs":            { type: "number", defaultValue: 60_000,    description: "Time window for the subscribe rate limit (default: 1 minute)." },

  // ── Circuit Breaker ──
  "circuitBreaker.failureThreshold": { type: "number", defaultValue: 5,      description: "Consecutive AI provider failures within the counting window before the circuit opens. While open, all requests to that provider fail immediately and the system falls over to secondary/tertiary models. Lower = faster failover but more sensitive to transient errors." },
  "circuitBreaker.cooldownMs":       { type: "number", defaultValue: 30_000, description: "Milliseconds a tripped circuit breaker stays open before allowing a single test request (half-open state). If the test succeeds the circuit closes; if it fails the cooldown restarts. Too short = hammering a down provider; too long = slow recovery." },
  "circuitBreaker.windowMs":         { type: "number", defaultValue: 60_000, description: "Time window for counting failures. Failures older than this are forgotten. Should generally be >= cooldownMs to avoid counting stale failures after recovery." },

  // ── User Lifecycle ──
  "user.trialDays": { type: "number", defaultValue: 14, description: "Free trial duration in days from account creation. After expiry, users on the default (free) plan are flagged for lifecycle processing. Currently logged only; future: restrict premium features and trigger reminder emails." },

  // ── Audio ──
  "audio.wordsPerMinute":  { type: "number", defaultValue: 150,     description: "Assumed speaking rate (words per minute) for estimating briefing audio duration from narrative word count. Used in distillation word-budget allocation and TTS time fitting. Standard podcast pace is 130-170 WPM. Changing this affects how many claims fit into a given duration tier." },
  "audio.defaultVoice":    { type: "string", defaultValue: "coral",  description: "Default TTS voice ID when a user has no voice preference set. Must be a valid voice identifier supported by the active TTS provider (e.g. OpenAI voices: alloy, echo, fable, onyx, nova, shimmer, coral)." },

  // ── Topic Extraction ──
  "topicExtraction.maxTopics":      { type: "number", defaultValue: 20, description: "Maximum number of topics extracted from episode claims. More topics improve recommendation diversity but increase noise in similarity scoring. Topics are weighted by claim importance." },
  "topicExtraction.minTokenLength": { type: "number", defaultValue: 3,  description: "Minimum character length for topic tokens after normalization. Filters out short, meaningless fragments (e.g. 'it', 'an'). Values below 2 are not recommended." },

  // ── Recommendations ──
  "recommendations.enabled":                  { type: "boolean", defaultValue: true,  description: "Master toggle for the recommendation engine. When disabled, users see popular/recent episodes instead of personalized recommendations." },
  "recommendations.embeddings.enabled":       { type: "boolean", defaultValue: false, description: "Enable embedding-based semantic similarity in recommendation scoring. Requires embeddings to be computed and stored for podcast profiles. Adds the embedding weight dimension to scoring." },
  "recommendations.cache.maxResults":         { type: "number",  defaultValue: 20,    description: "Maximum recommendation results cached per user profile. Cached results are served until the profile is recomputed, avoiding repeated scoring on each request." },
  "recommendations.coldStart.minSubscriptions": { type: "number", defaultValue: 3,    description: "Minimum podcast subscriptions before a user gets personalized recommendations. Below this threshold, users see popular/editorial picks instead." },
  "recommendations.weights.category":         { type: "number",  defaultValue: 0.25,  description: "Scoring weight for category similarity between user profile and candidate podcast. All weights should sum to ~1.0 for interpretable scores." },
  "recommendations.weights.popularity":       { type: "number",  defaultValue: 0.20,  description: "Scoring weight for podcast popularity (subscriber count, listen frequency). Higher values favor mainstream content." },
  "recommendations.weights.freshness":        { type: "number",  defaultValue: 0.10,  description: "Scoring weight for content recency. Higher values favor podcasts with recently published episodes." },
  "recommendations.weights.subscriberOverlap": { type: "number", defaultValue: 0.15,  description: "Scoring weight for subscriber overlap (Jaccard similarity). Captures 'users who listen to X also listen to Y' signal." },
  "recommendations.weights.topic":            { type: "number",  defaultValue: 0.15,  description: "Scoring weight for topic-level similarity derived from extracted claims. Finer-grained than category matching." },
  "recommendations.weights.embedding":        { type: "number",  defaultValue: 0.15,  description: "Scoring weight for embedding-based semantic similarity. Only active when recommendations.embeddings.enabled is true; otherwise this weight is redistributed." },
  "recommendations.weights.explicitTopicBonus": { type: "number", defaultValue: 0.05, description: "Additive bonus applied to podcasts matching topics the user explicitly selected in onboarding. Stacks on top of the topic weight." },
  "recommendations.weights.localBoost":        { type: "number",  defaultValue: 0.10, description: "Scoring weight for local/regional content affinity. Boosts podcasts geo-tagged to the user's region in locally-biased categories (Sports, News, Politics)." },
  "recommendations.explicit.categoryBoost":   { type: "number",  defaultValue: 1.0,   description: "Multiplier applied per explicitly preferred category. Higher values make onboarding category choices more influential in scoring." },
  "recommendations.explicit.topicBoostFactor": { type: "number", defaultValue: 1.5,   description: "Factor above the maximum implicit topic weight for explicitly chosen topics. Ensures user-selected topics always outweigh organically discovered ones." },
  "recommendations.exclusion.topicPenalty":    { type: "number",  defaultValue: 0.3,   description: "Score penalty multiplier per excluded topic. Applied multiplicatively — a podcast matching 2 excluded topics gets penalized twice. Values closer to 0 are harsher penalties." },
  "recommendations.coldStart.explicitMinCategories": { type: "number", defaultValue: 2, description: "Minimum explicit category selections (from onboarding) to exit cold start. Users who skip onboarding need this many subscriptions instead." },
  "recommendations.coldStart.explicitMinTopics": { type: "number", defaultValue: 3,    description: "Minimum explicit topic selections (from onboarding) to exit cold start for topic-based recommendations." },
  "recommendations.profileBatchSize":          { type: "number",  defaultValue: 25,   description: "Podcasts scored per batch during recommendation profile recomputation. The cron job loops through batches until all podcasts are scored or the time budget is exhausted.", ownedBy: "podcast-settings" },
  "recommendations.timeBudgetMs":              { type: "number",  defaultValue: 25000, description: "Maximum milliseconds to spend recomputing recommendation profiles per cron run. Prevents long-running cron jobs from blocking other work. Remaining podcasts are picked up in the next run.", ownedBy: "podcast-settings" },
  "recommendations.diversify.maxPerPodcast":   { type: "number",  defaultValue: 2,    description: "Maximum episodes from the same podcast in a single recommendation response. Prevents one prolific podcast from dominating the feed. Lower values increase variety at the cost of potentially hiding strong matches." },
  "recommendations.diversify.limit":           { type: "number",  defaultValue: 15,   description: "Total episodes returned after diversification. This is the final recommendation list size the user sees. Larger values give more scroll depth but dilute relevance." },
  "recommendations.engagement.maxBoostPercent": { type: "number", defaultValue: 30,   description: "Maximum engagement boost applied to category affinity scores, as a percentage. Highly-engaged users (many listens) get up to this much uplift to their category signal, sharpening personalization." },
  "recommendations.engagement.maxBoostListens": { type: "number", defaultValue: 167,  description: "Number of total listens needed to reach the maximum engagement boost. Boost scales linearly from 0% at 0 listens to maxBoostPercent at this value. Set higher to require more engagement before personalization intensifies." },
  "recommendations.categoryAffinityThreshold": { type: "number",  defaultValue: 0.5,  description: "Minimum category affinity score (cosine similarity * engagement multiplier) to generate a 'matches your interest' reason string. Does not affect scoring — only the explanation shown to users." },

  // ── Requests ──
  "requests.archiving.enabled": { type: "boolean", defaultValue: false, description: "Enable archiving of fulfilled/rejected podcast requests during data retention. When enabled, old resolved requests are soft-deleted to reduce table size." },

  // ── Transcript ──
  "transcript.sources": { type: "string[]", defaultValue: ["rss-feed", "podcast-index"], description: "Ordered list of transcript source providers to try before falling back to STT. 'rss-feed' checks the RSS feed for embedded transcripts; 'podcast-index' queries the Podcast Index API. Sources are tried in order; STT runs only if all sources fail." },

  // ── Duration Tiers ── (owned by Plans page)
  "tiers.duration": { type: "json", defaultValue: null, description: "Available briefing duration tiers as a JSON array of {minutes, ...metadata} objects. Controls which duration options users can select.", ownedBy: "plans" },
};

/** Dynamic key patterns that match prefixed keys (e.g. cron.*.enabled). */
export const CONFIG_PATTERNS: { pattern: RegExp; type: ConfigEntry["type"]; description: string; ownedBy?: string }[] = [
  { pattern: /^cron\.\w[\w-]*\.enabled$/,          type: "boolean", description: "Enable/disable a cron job", ownedBy: "scheduled-jobs" },
  { pattern: /^cron\.\w[\w-]*\.intervalMinutes$/,   type: "number",  description: "Cron job run interval (minutes)", ownedBy: "scheduled-jobs" },
  { pattern: /^cron\.\w[\w-]*\.lastRunAt$/,         type: "string",  description: "Last run ISO timestamp", ownedBy: "scheduled-jobs" },
  { pattern: /^pipeline\.stage\.\w+\.enabled$/,     type: "boolean", description: "Enable/disable a pipeline stage", ownedBy: "stage-configuration" },
  { pattern: /^ai\.\w+\.model(\.secondary|\.tertiary)?$/, type: "json", description: "AI model config ({provider, model})", ownedBy: "stage-configuration" },
  { pattern: /^prompt\./,                           type: "string",  description: "Prompt template override", ownedBy: "prompt-management" },
  { pattern: /^feature\./,                          type: "boolean", description: "Feature flag", ownedBy: "feature-flags" },
];

/**
 * Keys that are "owned" by a dedicated admin page and should be hidden
 * from the generic System Settings view. Computed once from the registry.
 */
export function getOwnedKeys(): Set<string> {
  const owned = new Set<string>();
  for (const [key, entry] of Object.entries(CONFIG_REGISTRY)) {
    if (entry.ownedBy) owned.add(key);
  }
  return owned;
}

/**
 * Check if a dynamic key is owned by a dedicated admin page.
 */
export function isDynamicKeyOwned(key: string): boolean {
  for (const { pattern, ownedBy } of CONFIG_PATTERNS) {
    if (ownedBy && pattern.test(key)) return true;
  }
  return false;
}

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
