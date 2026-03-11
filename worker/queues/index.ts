import { handleFeedRefresh } from "./feed-refresh";
import { handleTranscription } from "./transcription";
import { handleDistillation } from "./distillation";
import { handleNarrativeGeneration } from "./narrative-generation";
import { handleAudioGeneration } from "./audio-generation";
import { handleBriefingAssembly } from "./briefing-assembly";
import { handleOrchestrator } from "./orchestrator";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
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
  switch (batch.queue) {
    case "feed-refresh":
      return handleFeedRefresh(batch, env, ctx);
    case "transcription":
      return handleTranscription(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "distillation":
      return handleDistillation(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "narrative-generation":
      return handleNarrativeGeneration(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "clip-generation":
      return handleAudioGeneration(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "briefing-assembly":
      return handleBriefingAssembly(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "orchestrator":
      return handleOrchestrator(
        batch as MessageBatch<any>,
        env,
        ctx
      );
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
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
