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

// Stale-lock TTL: workers older than this are presumed crashed and may be displaced.
// 10 minutes comfortably exceeds worst-case healthy completion (Whisper ~2-3 min, distillation LLM ~30s).
export const STALE_LOCK_MS = 10 * 60 * 1000;

// Re-queue delay when another worker holds the upstream lock.
export const LOCK_RETRY_DELAY_S = 30;

export type EpisodeStageLockField = "transcriptionStartedAt" | "distillationStartedAt";
export type EpisodeStageRequiredStatus = "PENDING" | "TRANSCRIPT_READY";
export type EpisodeStageInProgressStatus = "FETCHING_TRANSCRIPT" | "EXTRACTING_CLAIMS";

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; reason: "held" | "completed" };

/**
 * Atomically claim an upstream pipeline stage for an episode using
 * compare-and-set on the Distillation row. The claim succeeds when:
 *   1. status matches `requiredStatus` AND lock field is null or stale, OR
 *   2. `inProgressStatus` is given, status matches it, AND lock is stale
 *      (crash recovery — the previous worker advanced status before dying).
 *
 * In case 2 the row's status is reset to `requiredStatus` so the caller's
 * normal flow can re-advance it.
 *
 * Callers must ensure a Distillation row exists for the episode (via upsert)
 * before calling this.
 */
export async function claimEpisodeStage(args: {
  prisma: any;
  episodeId: string;
  lockField: EpisodeStageLockField;
  requiredStatus: EpisodeStageRequiredStatus;
  inProgressStatus?: EpisodeStageInProgressStatus;
  staleMs?: number;
}): Promise<ClaimResult> {
  const staleAt = new Date(Date.now() - (args.staleMs ?? STALE_LOCK_MS));

  const result = await args.prisma.distillation.updateMany({
    where: {
      episodeId: args.episodeId,
      OR: [
        { status: args.requiredStatus, [args.lockField]: null },
        { status: args.requiredStatus, [args.lockField]: { lt: staleAt } },
        ...(args.inProgressStatus
          ? [{ status: args.inProgressStatus, [args.lockField]: { lt: staleAt } }]
          : []),
      ],
    },
    data: {
      status: args.requiredStatus,
      [args.lockField]: new Date(),
    },
  });

  if (result.count === 1) return { claimed: true };

  const row = await args.prisma.distillation.findUnique({
    where: { episodeId: args.episodeId },
    select: { status: true, [args.lockField]: true },
  });

  if (row && row.status !== args.requiredStatus && row.status !== args.inProgressStatus) {
    return { claimed: false, reason: "completed" };
  }
  return { claimed: false, reason: "held" };
}

/**
 * Release a previously-acquired stage lock. Errors are swallowed — best-effort
 * cleanup; stale recovery handles orphaned locks if this fails.
 */
export async function releaseEpisodeStage(args: {
  prisma: any;
  episodeId: string;
  lockField: EpisodeStageLockField;
}): Promise<void> {
  try {
    await args.prisma.distillation.updateMany({
      where: { episodeId: args.episodeId },
      data: { [args.lockField]: null },
    });
  } catch {
    // best-effort
  }
}
