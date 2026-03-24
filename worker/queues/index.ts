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
import { runRecommendationsJob } from "../lib/cron/recommendations";
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
 * Jobs: pipeline-trigger, monitoring, user-lifecycle, data-retention, recommendations
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
    // One-time idempotent migration: copy old lastRunAt keys to cron.* namespace
    await migrateLegacyConfigKeys(prisma);

    // Dispatch all jobs — each checks its own enabled flag and interval
    await Promise.allSettled([
      runJob({
        jobKey: "pipeline-trigger",
        prisma: prisma as any,
        defaultIntervalMinutes: 15,
        execute: (logger) => runPipelineTriggerJob(prisma as any, env, logger),
      }),
      runJob({
        jobKey: "monitoring",
        prisma: prisma as any,
        defaultIntervalMinutes: 60,
        execute: (logger) => runMonitoringJob(prisma as any, logger),
      }),
      runJob({
        jobKey: "user-lifecycle",
        prisma: prisma as any,
        defaultIntervalMinutes: 360,
        execute: (logger) => runUserLifecycleJob(prisma as any, logger),
      }),
      runJob({
        jobKey: "data-retention",
        prisma: prisma as any,
        defaultIntervalMinutes: 1440,
        execute: (logger) => runDataRetentionJob(prisma as any, logger),
      }),
      runJob({
        jobKey: "recommendations",
        prisma: prisma as any,
        defaultIntervalMinutes: 10080,
        execute: (logger) => runRecommendationsJob(prisma as any, logger, env),
      }),
    ]);
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}

/**
 * Migrates legacy PlatformConfig lastRunAt keys to the unified cron.* namespace.
 * Idempotent — skips if the new key already exists.
 */
async function migrateLegacyConfigKeys(prisma: {
  platformConfig: {
    findUnique: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
}) {
  const migrations = [
    { from: "pricing.lastRefreshedAt", to: "cron.monitoring.lastRunAt" },
    { from: "recommendations.lastProfileRefresh", to: "cron.recommendations.lastRunAt" },
  ];

  for (const { from, to } of migrations) {
    const exists = await prisma.platformConfig.findUnique({ where: { key: to } });
    if (exists) continue;
    const legacy = await prisma.platformConfig.findUnique({ where: { key: from } });
    if (!legacy) continue;
    await prisma.platformConfig.create({
      data: { key: to, value: legacy.value, description: `Migrated from ${from}` },
    });
  }
}
