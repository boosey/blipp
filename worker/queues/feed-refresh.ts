import { createPrismaClient } from "../lib/db";
import { parseRssFeed, type ParsedEpisode } from "../lib/rss-parser";
import type { Env } from "../types";

/** Max new episodes to ingest per podcast per refresh. */
const MAX_NEW_EPISODES = 5;

/**
 * Returns the most recent episodes from a parsed feed, sorted newest-first.
 * RSS feeds usually list newest first, but not always — this guarantees it.
 */
function latestEpisodes(episodes: ParsedEpisode[], max: number): ParsedEpisode[] {
  return [...episodes]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, max);
}

/**
 * Queue consumer for feed-refresh jobs.
 *
 * Fetches all podcasts from the database, polls each RSS feed for new episodes,
 * creates episode records, and queues distillation for episodes with transcripts.
 * Only ingests the most recent episodes that aren't already in the DB.
 *
 * @param batch - Cloudflare Queue message batch
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleFeedRefresh(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const podcasts = await prisma.podcast.findMany();

    for (const podcast of podcasts) {
      try {
        const response = await fetch(podcast.feedUrl);
        const xml = await response.text();
        const feed = parseRssFeed(xml);

        const recent = latestEpisodes(feed.episodes, MAX_NEW_EPISODES);

        for (const ep of recent) {
          if (!ep.guid || !ep.audioUrl) continue;

          // Upsert episode — skip if already exists (idempotent)
          const episode = await prisma.episode.upsert({
            where: {
              podcastId_guid: {
                podcastId: podcast.id,
                guid: ep.guid,
              },
            },
            update: {},
            create: {
              podcastId: podcast.id,
              title: ep.title,
              description: ep.description,
              audioUrl: ep.audioUrl,
              publishedAt: new Date(ep.publishedAt),
              durationSeconds: ep.durationSeconds,
              guid: ep.guid,
              transcriptUrl: ep.transcriptUrl,
            },
          });

          // Queue distillation for episodes that have transcript URLs
          if (ep.transcriptUrl) {
            await env.DISTILLATION_QUEUE.send({
              episodeId: episode.id,
              transcriptUrl: ep.transcriptUrl,
            });
          }
        }

        // Update last fetched timestamp
        await prisma.podcast.update({
          where: { id: podcast.id },
          data: { lastFetchedAt: new Date() },
        });
      } catch (err) {
        // Log and continue — don't let one failed feed block others
        console.error(
          `Feed refresh failed for podcast ${podcast.id}:`,
          err
        );
      }
    }

    // Ack all messages in the batch
    for (const msg of batch.messages) {
      msg.ack();
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
