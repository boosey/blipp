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
import { createPrismaClient } from "../lib/db";
import { runJob } from "../lib/cron/runner";
import { runPipelineTriggerJob } from "../lib/cron/pipeline-trigger";
import { runMonitoringJob } from "../lib/cron/monitoring";
import { runUserLifecycleJob } from "../lib/cron/user-lifecycle";
import { runDataRetentionJob } from "../lib/cron/data-retention";
import { runStaleJobReaperJob } from "../lib/cron/stale-job-reaper";
import { runRecommendationsJob } from "../lib/cron/recommendations";
import { runAppleDiscoveryJob, runPodcastIndexDiscoveryJob } from "../lib/cron/podcast-discovery";
import { runListenOriginalAggregationJob } from "../lib/cron/listen-original-aggregation";
import { runGeoTaggingJob } from "../lib/cron/geo-tagging";
import { runCatalogPregenJob } from "../lib/cron/catalog-pregen";
import type {
  TranscriptionMessage,
  DistillationMessage,
  NarrativeGenerationMessage,
  AudioGenerationMessage,
  BriefingAssemblyMessage,
  OrchestratorMessage,
  FeedRefreshMessage,
  CatalogRefreshMessage,
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
 * Cron heartbeat handler — fires every 5 minutes and dispatches all named jobs.
 * Each job manages its own enable toggle and run interval via PlatformConfig.
 *
 * Jobs: apple-discovery, podcast-index-discovery, pipeline-trigger, monitoring, user-lifecycle, data-retention, recommendations, listen-original-aggregation, stale-job-reaper
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
    // Job registry: jobKey → execute function
    const jobExecutors: Record<string, (logger: any) => Promise<Record<string, unknown>>> = {
      "apple-discovery": (logger) => runAppleDiscoveryJob(prisma as any, logger, env),
      "podcast-index-discovery": (logger) => runPodcastIndexDiscoveryJob(prisma as any, logger, env),
      "pipeline-trigger": (logger) => runPipelineTriggerJob(prisma as any, env, logger),
      "monitoring": (logger) => runMonitoringJob(prisma as any, logger),
      "user-lifecycle": (logger) => runUserLifecycleJob(prisma as any, logger),
      "data-retention": (logger) => runDataRetentionJob(prisma as any, logger),
      "recommendations": (logger) => runRecommendationsJob(prisma as any, logger, env),
      "listen-original-aggregation": (logger) => runListenOriginalAggregationJob(prisma as any, logger),
      "stale-job-reaper": (logger) => runStaleJobReaperJob(prisma as any, logger),
      "geo-tagging": (logger) => runGeoTaggingJob(prisma as any, logger, env),
      "catalog-pregen": (logger) => runCatalogPregenJob(prisma as any, logger, env),
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

