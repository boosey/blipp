/**
 * Single source of truth for cron-job metadata.
 *
 * Adding a new cron job:
 *   1. Append an entry to CRON_JOB_REGISTRY below.
 *   2. Wire the executor in worker/queues/index.ts.
 *   3. (Optional) re-seed locally. Staging/prod auto-register on the next
 *      scheduled tick — no manual DB step required.
 *
 * Consumers:
 *   - prisma/seed.ts (initial dev/test seeding; also upserts label/description)
 *   - worker/queues/index.ts → ensureCronJobsRegistered (auto-creates missing
 *     rows so a code-only add never silently no-ops in prod again)
 */

export interface CronJobMeta {
  jobKey: string;
  label: string;
  description: string;
  /** Initial value for both intervalMinutes and defaultIntervalMinutes. */
  defaultIntervalMinutes: number;
  /** Optional 0-23 UTC hour gate. */
  runAtHour?: number;
}

export const CRON_JOB_REGISTRY: readonly CronJobMeta[] = [
  { jobKey: "apple-discovery",             label: "Apple Discovery",                 description: "Discovers new podcasts from Apple Podcasts and adds them to the library",                                                                                                              defaultIntervalMinutes: 10080 },
  { jobKey: "podcast-index-discovery",     label: "Podcast Index Discovery",         description: "Discovers new podcasts from Podcast Index and adds them to the library",                                                                                                              defaultIntervalMinutes: 10080 },
  { jobKey: "episode-refresh",             label: "Fetch New Episodes",              description: "Checks all podcast feeds for new episodes and enqueues them for processing",                                                                                                          defaultIntervalMinutes: 15 },
  { jobKey: "monitoring",                  label: "Update AI Models",                description: "Refreshes AI model pricing and checks cost threshold alerts",                                                                                                                         defaultIntervalMinutes: 60 },
  { jobKey: "user-lifecycle",              label: "Promotion Aging",                 description: "Checks for users whose free trial has expired",                                                                                                                                       defaultIntervalMinutes: 360 },
  { jobKey: "subscription-engagement",     label: "Subscription Engagement",         description: "Auto-pauses podcast subscriptions when the user has not listened to the last N delivered episodes",                                                                                   defaultIntervalMinutes: 1440 },
  { jobKey: "data-retention",              label: "Data Pruning",                    description: "Counts/deletes aged episodes, stale podcasts, and old requests",                                                                                                                      defaultIntervalMinutes: 1440 },
  { jobKey: "recommendations",             label: "Compute Recommendations",         description: "Rebuilds podcast recommendation profiles for all users",                                                                                                                              defaultIntervalMinutes: 10080 },
  { jobKey: "listen-original-aggregation", label: "Listen-to-Original Aggregation",  description: "Aggregates listen-to-original conversion events into daily publisher report batches",                                                                                                defaultIntervalMinutes: 1440 },
  { jobKey: "stale-job-reaper",            label: "Stale Job Reaper",                description: "Marks stalled PipelineJobs, FeedItems, and EpisodeRefreshJobs as failed",                                                                                                             defaultIntervalMinutes: 30 },
  { jobKey: "geo-tagging",                 label: "Podcast Geo-Tagging",             description: "Tags podcasts with geographic profiles using keyword matching and LLM classification",                                                                                                defaultIntervalMinutes: 10080 },
  { jobKey: "catalog-pregen",              label: "Catalog Pre-generation",          description: "Pre-generates 5-min briefings for all Apple-ranked podcasts so new users get instant content",                                                                                       defaultIntervalMinutes: 60 },
  { jobKey: "manual-grant-expiry",         label: "Manual Grant Expiry",             description: "Expires admin-granted plan access once the grant window closes and recomputes entitlement",                                                                                          defaultIntervalMinutes: 60 },
  { jobKey: "pulse-generate",              label: "Pulse Digest Generator",          description: "Sunday weekly digest cron — clusters last 7 days of distillation embeddings and drafts an AI_ASSISTED PulsePost. Self-gates on Phase 4.0 Rule 6 (>=6 published, >=4 human).",         defaultIntervalMinutes: 360 },
];

type PrismaLike = {
  cronJob: {
    upsert: (args: {
      where: { jobKey: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

/**
 * Ensures a CronJob row exists for every entry in CRON_JOB_REGISTRY. Idempotent.
 *
 * `update: {}` — admin edits to enabled / intervalMinutes survive. Auto-register
 * only ever *creates* missing rows, never overwrites existing config.
 */
export async function ensureCronJobsRegistered(prisma: PrismaLike): Promise<void> {
  for (const meta of CRON_JOB_REGISTRY) {
    await prisma.cronJob.upsert({
      where: { jobKey: meta.jobKey },
      create: {
        jobKey: meta.jobKey,
        label: meta.label,
        description: meta.description,
        intervalMinutes: meta.defaultIntervalMinutes,
        defaultIntervalMinutes: meta.defaultIntervalMinutes,
        runAtHour: meta.runAtHour ?? null,
      },
      update: {},
    });
  }
}
