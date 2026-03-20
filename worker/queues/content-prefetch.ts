import { createPrismaClient } from "../lib/db";
import { prefetchEpisodeContent } from "../lib/content-prefetch";
import type { Env } from "../types";

export interface ContentPrefetchMessage {
  episodeId: string;
  seedJobId?: string;
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

        msg.ack();
      } catch (err) {
        console.error(JSON.stringify({
          level: "error",
          action: "content_prefetch_error",
          episodeId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }));
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
