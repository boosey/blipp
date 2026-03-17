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
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { checkCostThresholds } from "../lib/cost-alerts";
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
 * Cron trigger handler -- enqueues a feed refresh job if the pipeline is enabled
 * and the minimum interval has elapsed since the last auto run.
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
  const log = await createPipelineLogger({ stage: "scheduled", prisma });

  try {
    // Check if the pipeline is globally enabled
    const enabled = await getConfig(prisma, "pipeline.enabled", true);
    if (!enabled) {
      log.info("pipeline_disabled", {});
      return;
    }

    // Check minimum interval between auto runs
    const minIntervalMinutes = await getConfig(
      prisma,
      "pipeline.minIntervalMinutes",
      60
    );
    const lastAutoRunAt = await getConfig<string | null>(
      prisma,
      "pipeline.lastAutoRunAt",
      null
    );

    if (lastAutoRunAt) {
      const elapsedMs = Date.now() - new Date(lastAutoRunAt).getTime();
      const elapsedMinutes = elapsedMs / 60_000;
      if (elapsedMinutes < minIntervalMinutes) {
        log.debug("interval_skip", { elapsedMinutes: Math.round(elapsedMinutes), minIntervalMinutes });
        return;
      }
    }

    // Enqueue feed refresh
    await env.FEED_REFRESH_QUEUE.send({ type: "cron" });
    log.info("feed_refresh_enqueued", { trigger: "cron" });

    // Update lastAutoRunAt
    await prisma.platformConfig.upsert({
      where: { key: "pipeline.lastAutoRunAt" },
      update: { value: new Date().toISOString() },
      create: {
        key: "pipeline.lastAutoRunAt",
        value: new Date().toISOString(),
        description: "Timestamp of last automatic pipeline run",
      },
    });

    // Refresh AI model pricing once per day
    const lastPriceRefresh = await getConfig<string | null>(prisma, "pricing.lastRefreshedAt", null);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (!lastPriceRefresh || new Date(lastPriceRefresh) < oneDayAgo) {
      const { refreshPricing } = await import("../lib/pricing-updater");
      const { updated } = await refreshPricing(prisma);
      log.info("pricing_refreshed", { updated });
      await prisma.platformConfig.upsert({
        where: { key: "pricing.lastRefreshedAt" },
        update: { value: new Date().toISOString() },
        create: { key: "pricing.lastRefreshedAt", value: new Date().toISOString(), description: "Last pricing refresh timestamp" },
      });
    }

    // Trial expiration check
    try {
      const trialDaysAgo = new Date();
      trialDaysAgo.setDate(trialDaysAgo.getDate() - 14); // Default 14-day trial

      // Find users on default/free plan created more than trial period ago
      // who have never upgraded (no stripeCustomerId)
      const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
      if (defaultPlan) {
        const expiredTrialUsers = await prisma.user.findMany({
          where: {
            planId: defaultPlan.id,
            stripeCustomerId: null,
            createdAt: { lt: trialDaysAgo },
          },
          select: { id: true, email: true, createdAt: true },
          take: 100, // Process in batches
        });

        if (expiredTrialUsers.length > 0) {
          console.log(JSON.stringify({
            level: "info",
            action: "trial_expiration_check",
            expiredCount: expiredTrialUsers.length,
            ts: new Date().toISOString(),
          }));
          // For now, just log. Future: send reminder emails, restrict features
        }
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        action: "trial_check_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
    }

    // Check cost thresholds and persist alerts
    try {
      const costAlerts = await checkCostThresholds(prisma);
      if (costAlerts.length > 0) {
        await prisma.platformConfig.upsert({
          where: { key: "cost.alert.active" },
          update: { value: costAlerts as any },
          create: { key: "cost.alert.active", value: costAlerts as any, description: "Active cost threshold alerts" },
        });
        console.log(JSON.stringify({
          level: "warn",
          action: "cost_threshold_exceeded",
          alerts: costAlerts,
          ts: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        action: "cost_check_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
    }
    // Data retention: count aged episodes and stale podcasts
    try {
      const agingEnabled = await getConfig(prisma, "episodes.aging.enabled", false);
      if (agingEnabled) {
        const maxAgeDays = await getConfig(prisma, "episodes.aging.maxAgeDays", 180);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (maxAgeDays as number));

        const agingCount = await prisma.episode.count({
          where: {
            publishedAt: { lt: cutoff },
            feedItems: { none: { status: { in: ["PENDING", "PROCESSING"] } } },
          },
        });

        if (agingCount > 0) {
          await prisma.platformConfig.upsert({
            where: { key: "episodes.aging.candidateCount" },
            update: { value: agingCount },
            create: { key: "episodes.aging.candidateCount", value: agingCount, description: "Episodes eligible for aging deletion" },
          });
        }
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        action: "aging_check_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
    }
    // Catalog cleanup check
    try {
      const cleanupEnabled = await getConfig(prisma, "catalog.cleanup.enabled", false);
      if (cleanupEnabled) {
        const cleanupCount = await prisma.podcast.count({
          where: {
            status: { not: "archived" },
            subscriptions: { none: {} },
          },
        });

        if (cleanupCount > 0) {
          await prisma.platformConfig.upsert({
            where: { key: "catalog.cleanup.candidateCount" },
            update: { value: cleanupCount },
            create: { key: "catalog.cleanup.candidateCount", value: cleanupCount, description: "Podcasts eligible for cleanup" },
          });
        }
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        action: "cleanup_check_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }));
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
