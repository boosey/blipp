import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { prefetchEpisodeContent } from "../lib/content-prefetch";
import { isRefreshJobActive } from "../lib/queue-helpers";
import type { Env } from "../types";

export interface ContentPrefetchMessage {
  episodeId: string;
  refreshJobId?: string;
}

/**
 * Process a single episode: check transcript/audio availability, update contentStatus.
 */
async function processEpisode(
  episodeId: string,
  refreshJobId: string | undefined,
  prisma: any,
  env: Env,
  fetchTimeoutMs: number
): Promise<void> {
  // Cooperative pause/cancel
  if (refreshJobId) {
    const active = await isRefreshJobActive(prisma, refreshJobId);
    if (!active) return;
  }

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { podcast: { select: { title: true, feedUrl: true, podcastIndexId: true } } },
  });

  if (!episode) return;

  // Skip if already processed
  if (episode.contentStatus !== "PENDING") return;

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
    env.R2,
    fetchTimeoutMs
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

  if (refreshJobId) {
    await prisma.episodeRefreshJob.update({
      where: { id: refreshJobId },
      data: { prefetchCompleted: { increment: 1 } },
    }).catch(() => {});
  }
}

/**
 * Queue consumer for content-prefetch jobs.
 *
 * Processes all episodes in the batch in parallel using Promise.allSettled.
 * Each fetch has a configurable timeout (pipeline.contentPrefetch.fetchTimeoutMs).
 */
export async function handleContentPrefetch(
  batch: MessageBatch<ContentPrefetchMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const fetchTimeoutMs = (await getConfig(prisma, "pipeline.contentPrefetch.fetchTimeoutMs", 15000)) as number;

    await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const { episodeId } = msg.body;

        try {
          await processEpisode(episodeId, msg.body.refreshJobId, prisma, env, fetchTimeoutMs);
          msg.ack();
        } catch (err) {
          console.error(JSON.stringify({
            level: "error",
            action: "content_prefetch_error",
            episodeId,
            error: err instanceof Error ? err.message : String(err),
            ts: new Date().toISOString(),
          }));

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
      })
    );
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
