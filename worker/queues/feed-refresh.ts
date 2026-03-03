import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { parseRssFeed, type ParsedEpisode } from "../lib/rss-parser";
import type { Env } from "../types";

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
 * Supports per-podcast filtering: if a message body contains a `podcastId`,
 * only that podcast is refreshed. Messages with `type: "manual"` bypass the
 * stage-enabled check.
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
    const log = await createPipelineLogger({ stage: "feed-refresh", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if stage 1 (feed refresh) is enabled — manual messages bypass this
    const hasManual = batch.messages.some(
      (m) => (m.body as any)?.type === "manual"
    );
    if (!hasManual) {
      const stageEnabled = await getConfig(
        prisma,
        "pipeline.stage.1.enabled",
        true
      );
      if (!stageEnabled) {
        log.info("stage_disabled", { stage: 1 });
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    // Collect specific podcast IDs from messages, if any
    const podcastIds = new Set<string>();
    let fetchAll = false;
    for (const msg of batch.messages) {
      const body = msg.body as any;
      if (body?.podcastId) {
        podcastIds.add(body.podcastId);
      } else {
        fetchAll = true;
      }
    }

    log.debug("podcast_filter", { fetchAll, podcastIds: [...podcastIds] });

    // Fetch podcasts — either all or just the requested subset
    const podcasts = fetchAll
      ? await prisma.podcast.findMany()
      : await prisma.podcast.findMany({
          where: { id: { in: [...podcastIds] } },
        });

    log.debug("podcasts_loaded", { count: podcasts.length });

    const maxEpisodes = (await getConfig(prisma, "pipeline.feedRefresh.maxEpisodesPerPodcast", 5)) as number;

    for (const podcast of podcasts) {
      try {
        const response = await fetch(podcast.feedUrl);
        const xml = await response.text();
        const feed = parseRssFeed(xml);

        const recent = latestEpisodes(feed.episodes, maxEpisodes);

        for (const ep of recent) {
          if (!ep.guid || !ep.audioUrl) continue;

          // Upsert episode — skip if already exists (idempotent)
          await prisma.episode.upsert({
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
        }

        log.info("podcast_refreshed", { podcastId: podcast.id, episodesProcessed: recent.length });

        // Update last fetched timestamp
        await prisma.podcast.update({
          where: { id: podcast.id },
          data: { lastFetchedAt: new Date() },
        });
      } catch (err) {
        // Log and continue — don't let one failed feed block others
        log.error("podcast_error", { podcastId: podcast.id }, err);
      }
    }

    log.info("batch_complete", { podcastCount: podcasts.length });

    // Ack all messages in the batch
    for (const msg of batch.messages) {
      msg.ack();
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
