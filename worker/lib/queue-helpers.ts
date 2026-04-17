import { getConfig } from "./config";
import type { FeedRefreshMessage } from "./queue-messages";

/**
 * Check if a pipeline stage is enabled. Returns true if enabled or if any
 * message in the batch is manual (manual messages bypass the check).
 */
export async function checkStageEnabled(
  prisma: any,
  batch: MessageBatch,
  stageName: string,
  log: { info: (action: string, data: Record<string, unknown>) => void }
): Promise<boolean> {
  const hasManual = batch.messages.some(
    (m) => (m.body as any)?.type === "manual"
  );
  if (hasManual) return true;

  // Global kill switch
  const pipelineEnabled = await getConfig(prisma, "pipeline.enabled", true);
  if (!pipelineEnabled) {
    log.info("pipeline_disabled", { stage: stageName });
    for (const msg of batch.messages) msg.ack();
    return false;
  }

  const enabled = await getConfig(
    prisma,
    `pipeline.stage.${stageName}.enabled`,
    true
  );
  if (!enabled) {
    log.info("stage_disabled", { stage: stageName });
    for (const msg of batch.messages) msg.ack();
    return false;
  }
  return true;
}

/**
 * Cascading completion check for EpisodeRefreshJob.
 *
 * A job is complete when:
 * 1. Feed scan stage is done (podcastsCompleted >= podcastsTotal)
 * 2. Prefetch stage is done (prefetchCompleted >= prefetchTotal)
 *
 * The prefetch stage can only be "done" once the feed scan is done,
 * because the feed scan is what produces prefetch messages.
 * If no episodes were discovered, the job completes as soon as the feed scan finishes.
 *
 * Returns true if the job was marked complete.
 */
export async function tryCompleteRefreshJob(prisma: any, refreshJobId: string): Promise<boolean> {
  const job = await prisma.episodeRefreshJob.findUnique({
    where: { id: refreshJobId },
    select: {
      status: true,
      podcastsTotal: true,
      podcastsCompleted: true,
      prefetchTotal: true,
      prefetchCompleted: true,
    },
  });

  if (!job || job.status !== "refreshing") return false;
  if (job.podcastsTotal <= 0) return false;

  const feedScanDone = job.podcastsCompleted >= job.podcastsTotal;
  if (!feedScanDone) return false;

  const prefetchDone = job.prefetchCompleted >= job.prefetchTotal;
  if (!prefetchDone) return false;

  await prisma.episodeRefreshJob.update({
    where: { id: refreshJobId },
    data: { status: "complete", completedAt: new Date() },
  });

  return true;
}

/** Acknowledge all messages in a batch. */
export function ackAll(
  messages: readonly { ack(): void }[]
): void {
  for (const msg of messages) msg.ack();
}

/**
 * Check if an episode refresh job is still in an active (processable) state.
 * Queue consumers call this before processing each message to support
 * cooperative pause/cancel.
 */
export async function isRefreshJobActive(prisma: any, refreshJobId: string): Promise<boolean> {
  const job = await prisma.episodeRefreshJob.findUnique({
    where: { id: refreshJobId },
    select: { status: true },
  });
  if (!job) return false;
  return !["paused", "cancelled", "complete", "failed"].includes(job.status);
}

/**
 * Chunks podcast IDs by batchConcurrency and sends one queue message per chunk.
 * Each message body contains `podcastIds: string[]`.
 * CF sendBatch limit is 100 messages per call.
 */
export async function sendBatchedFeedRefresh(
  queue: { sendBatch(messages: { body: FeedRefreshMessage }[]): Promise<unknown> },
  podcastIds: string[],
  batchConcurrency: number,
  extra?: Omit<FeedRefreshMessage, "podcastId" | "podcastIds">
): Promise<void> {
  if (podcastIds.length === 0) return;

  const messages: { body: FeedRefreshMessage }[] = [];
  for (let i = 0; i < podcastIds.length; i += batchConcurrency) {
    const chunk = podcastIds.slice(i, i + batchConcurrency);
    messages.push({
      body: { podcastIds: chunk, ...extra },
    });
  }

  const CF_SEND_BATCH_LIMIT = 100;
  for (let i = 0; i < messages.length; i += CF_SEND_BATCH_LIMIT) {
    await queue.sendBatch(messages.slice(i, i + CF_SEND_BATCH_LIMIT));
  }
}
