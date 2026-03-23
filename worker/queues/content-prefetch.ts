import { createPrismaClient } from "../lib/db";
import { prefetchEpisodeContent } from "../lib/content-prefetch";
import { isSeedJobActive, isRefreshJobActive } from "../lib/queue-helpers";
import type { Env } from "../types";

export interface ContentPrefetchMessage {
  episodeId: string;
  seedJobId?: string;
  refreshJobId?: string;
}

/**
 * Slow content-prefetch queue consumer.
 * Processes one episode at a time (max_concurrency=1).
 * Checks transcript availability, then audio, marks contentStatus.
 */
export async function handleContentPrefetch(
  batch: MessageBatch<ContentPrefetchMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { episodeId } = msg.body;

      try {
        // Cooperative pause/cancel: skip if seed job is no longer active
        if (msg.body.seedJobId) {
          const active = await isSeedJobActive(prisma, msg.body.seedJobId);
          if (!active) {
            msg.ack();
            continue;
          }
        }

        // Cooperative pause/cancel: skip if refresh job is no longer active
        if (msg.body.refreshJobId) {
          const active = await isRefreshJobActive(prisma, msg.body.refreshJobId);
          if (!active) {
            msg.ack();
            continue;
          }
        }

        const episode = await prisma.episode.findUnique({
          where: { id: episodeId },
          include: { podcast: { select: { title: true, feedUrl: true, podcastIndexId: true } } },
        });

        if (!episode) {
          msg.ack();
          continue;
        }

        // Skip if already processed
        if (episode.contentStatus !== "PENDING") {
          msg.ack();
          continue;
        }

        const result = await prefetchEpisodeContent(
          {
            id: episode.id,
            guid: episode.guid,
            title: episode.title,
            audioUrl: episode.audioUrl,
            transcriptUrl: episode.transcriptUrl,
          },
          {
            title: episode.podcast.title,
            feedUrl: episode.podcast.feedUrl,
            podcastIndexId: episode.podcast.podcastIndexId,
          },
          env,
          env.R2
        );

        await prisma.episode.update({
          where: { id: episodeId },
          data: {
            contentStatus: result.contentStatus,
            transcriptR2Key: result.transcriptR2Key,
          },
        });

        console.log(JSON.stringify({
          level: "info",
          action: "content_prefetch",
          episodeId,
          contentStatus: result.contentStatus,
          ts: new Date().toISOString(),
        }));

        if (msg.body.seedJobId) {
          await prisma.catalogSeedJob.update({
            where: { id: msg.body.seedJobId },
            data: { prefetchCompleted: { increment: 1 } },
          }).catch(() => {});
        }

        if (msg.body.refreshJobId) {
          await prisma.episodeRefreshJob.update({
            where: { id: msg.body.refreshJobId },
            data: { prefetchCompleted: { increment: 1 } },
          }).catch(() => {});
        }

        msg.ack();
      } catch (err) {
        console.error(JSON.stringify({
          level: "error",
          action: "content_prefetch_error",
          episodeId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }));

        // Record error to CatalogJobError if this is part of a seed job
        if (msg.body.seedJobId) {
          await prisma.catalogJobError.create({
            data: {
              jobId: msg.body.seedJobId,
              phase: "prefetch",
              message: err instanceof Error ? err.message : String(err),
              episodeId,
            },
          }).catch(() => {});
        }

        // Record error for episode refresh job
        if (msg.body.refreshJobId) {
          await prisma.episodeRefreshError.create({
            data: {
              jobId: msg.body.refreshJobId,
              phase: "prefetch",
              message: err instanceof Error ? err.message : String(err),
              episodeId,
            },
          }).catch(() => {});
        }

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
