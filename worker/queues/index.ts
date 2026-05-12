import { handleFeedRefresh } from "./feed-refresh";
import { handleTranscription } from "./transcription";
import { handleDistillation } from "./distillation";
import { handleNarrativeGeneration } from "./narrative-generation";
import { handleAudioGeneration } from "./audio-generation";
import { handleBriefingAssembly } from "./briefing-assembly";
import { handleOrchestrator } from "./orchestrator";
import { handleCatalogRefresh } from "./catalog-refresh";
import { handleContentPrefetch } from "./content-prefetch";
import type { ContentPrefetchMessage } from "./content-prefetch";
import { handleWelcomeEmail } from "./welcome-email";
import { handleSubscriptionPauseEmail } from "./subscription-pause-email";
import { createPrismaClient } from "../lib/db";
import { runJob } from "../lib/cron/runner";
import { ensureCronJobsRegistered } from "../lib/cron/registry";
import { runEpisodeRefreshJob } from "../lib/cron/episode-refresh";
import { runMonitoringJob } from "../lib/cron/monitoring";
import { runUserLifecycleJob } from "../lib/cron/user-lifecycle";
import { runSubscriptionEngagementJob } from "../lib/cron/subscription-engagement";
import { runDataRetentionJob } from "../lib/cron/data-retention";
import { runStaleJobReaperJob } from "../lib/cron/stale-job-reaper";
import { runRecommendationsJob } from "../lib/cron/recommendations";
import { runAppleDiscoveryJob, runPodcastIndexDiscoveryJob } from "../lib/cron/podcast-discovery";
import { runListenOriginalAggregationJob } from "../lib/cron/listen-original-aggregation";
import { runGeoTaggingJob } from "../lib/cron/geo-tagging";
import { runCatalogPregenJob } from "../lib/cron/catalog-pregen";
import { runManualGrantExpiryJob } from "../lib/cron/manual-grant-expiry";
import { runPulseGenerate } from "./pulse-generate";
import type {
  TranscriptionMessage,
  DistillationMessage,
  NarrativeGenerationMessage,
  AudioGenerationMessage,
  BriefingAssemblyMessage,
  OrchestratorMessage,
  FeedRefreshMessage,
  CatalogRefreshMessage,
  WelcomeEmailMessage,
  SubscriptionPauseEmailMessage,
} from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Dispatches queue messages to the appropriate consumer based on queue name.
 *
 * @param batch - Cloudflare Queue message batch
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleQueue(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
) {
  // Strip environment suffix (e.g. "orchestrator-staging" → "orchestrator")
  const queue = batch.queue.replace(/-(staging|production)$/, "");

  console.log(JSON.stringify({
    level: "info",
    action: "queue_dispatch",
    rawQueue: batch.queue,
    normalizedQueue: queue,
    messageCount: batch.messages.length,
    ts: new Date().toISOString(),
  }));

  try {
  switch (queue) {
    case "feed-refresh":
    case "feed-refresh-retry":
      return handleFeedRefresh(batch as MessageBatch<FeedRefreshMessage>, env, ctx);
    case "transcription":
      return handleTranscription(
        batch as MessageBatch<TranscriptionMessage>,
        env,
        ctx
      );
    case "distillation":
      return handleDistillation(
        batch as MessageBatch<DistillationMessage>,
        env,
        ctx
      );
    case "narrative-generation":
      return handleNarrativeGeneration(
        batch as MessageBatch<NarrativeGenerationMessage>,
        env,
        ctx
      );
    case "clip-generation":
      return handleAudioGeneration(
        batch as MessageBatch<AudioGenerationMessage>,
        env,
        ctx
      );
    case "briefing-assembly":
      return handleBriefingAssembly(
        batch as MessageBatch<BriefingAssemblyMessage>,
        env,
        ctx
      );
    case "orchestrator":
      return handleOrchestrator(
        batch as MessageBatch<OrchestratorMessage>,
        env,
        ctx
      );
    case "catalog-refresh":
      return handleCatalogRefresh(
        batch as MessageBatch<CatalogRefreshMessage>,
        env,
        ctx
      );
    case "content-prefetch":
      return handleContentPrefetch(
        batch as MessageBatch<ContentPrefetchMessage>,
        env,
        ctx
      );
    case "welcome-email":
      return handleWelcomeEmail(
        batch as MessageBatch<WelcomeEmailMessage>,
        env,
        ctx
      );
    case "subscription-pause-email":
      return handleSubscriptionPauseEmail(
        batch as MessageBatch<SubscriptionPauseEmailMessage>,
        env,
        ctx
      );
    case "dead-letter":
      for (const msg of batch.messages) {
        const body = msg.body as Record<string, unknown>;
        console.error(JSON.stringify({
          level: "error",
          action: "dead_letter_received",
          rawQueue: batch.queue,
          jobId: body.jobId ?? body.requestId ?? undefined,
          episodeId: body.episodeId ?? undefined,
          messageBody: JSON.stringify(body).slice(0, 500),
          ts: new Date().toISOString(),
        }));
        msg.ack();
      }
      return;
    default:
      console.error(JSON.stringify({
        level: "error",
        action: "unknown_queue",
        queue: batch.queue,
        normalized: queue,
        messageCount: batch.messages.length,
        ts: new Date().toISOString(),
      }));
  }
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      action: "queue_handler_error",
      rawQueue: batch.queue,
      normalizedQueue: queue,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      ts: new Date().toISOString(),
    }));
    throw err; // re-throw so CF retries the batch
  }
}

/**
 * Cron handler — dispatches by `event.cron`.
 *
 * - `*&#47;5 * * * *` (heartbeat): runs all per-job dispatchers; each manages
 *   its own enable toggle + interval via the CronJob table.
 * - `0 14 * * SUN` (Sunday 14:00 UTC): runs the Pulse digest generator (Phase 4
 *   / Task 8). The handler self-gates per Phase 4.0 Rule 6 — no-op until ≥6
 *   PulsePosts published AND ≥4 of those have mode=HUMAN.
 *
 * Heartbeat jobs: apple-discovery, podcast-index-discovery, episode-refresh,
 * monitoring, user-lifecycle, data-retention, recommendations,
 * listen-original-aggregation, stale-job-reaper, geo-tagging, catalog-pregen,
 * manual-grant-expiry.
 *
 * @param event - Cloudflare scheduled event
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
) {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    // Auto-register CronJob rows for any job declared in code but missing from DB.
    // Without this, a code-only add (forgot to re-seed staging/prod) silently
    // no-ops in runJob — which is how subscription-engagement & pulse-generate
    // failed to fire for weeks. Idempotent; admin-set enabled/interval preserved.
    await ensureCronJobsRegistered(prisma as any).catch((err) => {
      console.error(JSON.stringify({
        level: "error",
        action: "cron_registry_sync_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
    });

    // Sunday Pulse digest — runs only on the weekly cron expression.
    if (event.cron === "0 14 * * SUN") {
      await runJob({
        jobKey: "pulse-generate",
        prisma: prisma as any,
        execute: (logger) => runPulseGenerate(prisma as any, env, logger) as Promise<Record<string, unknown>>,
      }).catch((err) => {
        console.error(JSON.stringify({
          level: "error",
          action: "cron_job_failed",
          jobKey: "pulse-generate",
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }));
      });
      return;
    }

    // Job registry: jobKey → execute function
    const jobExecutors: Record<string, (logger: any) => Promise<Record<string, unknown>>> = {
      "apple-discovery": (logger) => runAppleDiscoveryJob(prisma as any, logger, env),
      "podcast-index-discovery": (logger) => runPodcastIndexDiscoveryJob(prisma as any, logger, env),
      "episode-refresh": (logger) => runEpisodeRefreshJob(prisma as any, env, logger),
      "monitoring": (logger) => runMonitoringJob(prisma as any, logger),
      "user-lifecycle": (logger) => runUserLifecycleJob(prisma as any, logger),
      "subscription-engagement": (logger) => runSubscriptionEngagementJob(prisma as any, logger, env),
      "data-retention": (logger) => runDataRetentionJob(prisma as any, logger),
      "recommendations": (logger) => runRecommendationsJob(prisma as any, logger, env),
      "listen-original-aggregation": (logger) => runListenOriginalAggregationJob(prisma as any, logger),
      "stale-job-reaper": (logger) => runStaleJobReaperJob(prisma as any, logger),
      "geo-tagging": (logger) => runGeoTaggingJob(prisma as any, logger, env),
      "catalog-pregen": (logger) => runCatalogPregenJob(prisma as any, logger, env),
      "manual-grant-expiry": (logger) => runManualGrantExpiryJob(prisma as any, logger),
    };

    // Dispatch all registered jobs — each checks its own enabled flag and interval via CronJob table
    const jobKeys = Object.keys(jobExecutors);
    const results = await Promise.allSettled(
      jobKeys.map((jobKey) =>
        runJob({
          jobKey,
          prisma: prisma as any,
          execute: jobExecutors[jobKey],
        })
      )
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "rejected") {
        const err = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
        console.error(JSON.stringify({
          level: "error",
          action: "cron_job_failed",
          jobKey: jobKeys[i],
          error: err.message,
          ts: new Date().toISOString(),
        }));
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

