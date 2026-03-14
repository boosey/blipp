import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { parseRssFeed, type ParsedEpisode } from "../lib/rss-parser";
import type { FeedRefreshMessage } from "../lib/queue-messages";
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
 * Fetches podcasts from the database, polls each RSS feed for new episodes,
 * creates episode records, and auto-creates FeedItems + BriefingRequests
 * for subscribers when new episodes are detected.
 *
 * When fetchAll is true, only refreshes podcasts with at least one subscriber.
 * Per-podcast messages refresh that specific podcast regardless of subscribers.
 *
 * @param batch - Cloudflare Queue message batch
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleFeedRefresh(
  batch: MessageBatch<FeedRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "feed-refresh", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Collect specific podcast IDs from messages, if any
    const podcastIds = new Set<string>();
    let fetchAll = false;
    for (const msg of batch.messages) {
      const body = msg.body;
      if (body.podcastId) {
        podcastIds.add(body.podcastId);
      } else {
        fetchAll = true;
      }
    }

    log.debug("podcast_filter", { fetchAll, podcastIds: [...podcastIds] });

    // Fetch podcasts — only those with subscribers when fetchAll (unless config overrides)
    let podcasts;
    if (fetchAll) {
      const refreshAll = await getConfig(prisma, "catalog.refreshAllPodcasts", false);
      if (refreshAll) {
        // Refresh all non-archived podcasts
        podcasts = await prisma.podcast.findMany({
          where: { status: { not: "archived" } },
        });
      } else {
        // Only refresh podcasts that have at least one subscriber
        const subscribedPodcastIds = await prisma.subscription.findMany({
          select: { podcastId: true },
          distinct: ["podcastId"],
        });
        const ids = subscribedPodcastIds.map((s: any) => s.podcastId);
        podcasts = ids.length > 0
          ? await prisma.podcast.findMany({ where: { id: { in: ids } } })
          : [];
      }
    } else {
      podcasts = await prisma.podcast.findMany({
        where: { id: { in: [...podcastIds] } },
      });
    }

    log.debug("podcasts_loaded", { count: podcasts.length });

    const maxEpisodes = (await getConfig(prisma, "pipeline.feedRefresh.maxEpisodesPerPodcast", 5)) as number;

    for (const podcast of podcasts) {
      try {
        const response = await fetch(podcast.feedUrl);
        const xml = await response.text();
        const feed = parseRssFeed(xml);

        const recent = latestEpisodes(feed.episodes, maxEpisodes);
        const newEpisodeIds: string[] = [];

        // Collect existing GUIDs for this podcast to detect truly new episodes
        const existingEpisodes = await prisma.episode.findMany({
          where: { podcastId: podcast.id },
          select: { guid: true },
        });
        const existingGuids = new Set(existingEpisodes.map((e: any) => e.guid));

        for (const ep of recent) {
          // Belt-and-suspenders: parser already filters these, but guard against malformed input
          if (!ep.guid || !ep.audioUrl) continue;

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

          // New episode = GUID wasn't in the database before this refresh
          if (!existingGuids.has(ep.guid)) {
            newEpisodeIds.push(episode.id);
          }
        }

        log.info("podcast_refreshed", {
          podcastId: podcast.id,
          episodesProcessed: recent.length,
          newEpisodes: newEpisodeIds.length,
        });

        // Auto-create FeedItems for subscribers of new episodes
        if (newEpisodeIds.length > 0) {
          const subscriptions = await prisma.subscription.findMany({
            where: { podcastId: podcast.id },
          });

          if (subscriptions.length > 0) {
            // Group subscribers by durationTier for efficient pipeline requests
            const tierGroups = new Map<number, string[]>();
            for (const sub of subscriptions) {
              const tier = sub.durationTier;
              if (!tierGroups.has(tier)) tierGroups.set(tier, []);
              tierGroups.get(tier)!.push(sub.userId);
            }

            for (const episodeId of newEpisodeIds) {
              for (const [durationTier, userIds] of tierGroups) {
                // Create FeedItems for all subscribers at this tier
                for (const userId of userIds) {
                  await prisma.feedItem.upsert({
                    where: {
                      userId_episodeId_durationTier: {
                        userId,
                        episodeId,
                        durationTier,
                      },
                    },
                    create: {
                      userId,
                      episodeId,
                      podcastId: podcast.id,
                      durationTier,
                      source: "SUBSCRIPTION",
                      status: "PENDING",
                    },
                    update: {},
                  });
                }

                // Create one BriefingRequest per (episode, tier) — the clip is shared
                const request = await prisma.briefingRequest.create({
                  data: {
                    userId: userIds[0], // Anchor to first subscriber
                    targetMinutes: durationTier,
                    items: [{
                      podcastId: podcast.id,
                      episodeId,
                      durationTier,
                      useLatest: false,
                    }],
                    isTest: false,
                    status: "PENDING",
                  },
                });

                // Link all FeedItems at this tier to the request
                await prisma.feedItem.updateMany({
                  where: {
                    episodeId,
                    durationTier,
                    status: "PENDING",
                    requestId: null,
                  },
                  data: {
                    requestId: request.id,
                    status: "PROCESSING",
                  },
                });

                await env.ORCHESTRATOR_QUEUE.send({
                  requestId: request.id,
                  action: "evaluate",
                });

                log.info("subscriber_pipeline_dispatched", {
                  podcastId: podcast.id,
                  episodeId,
                  durationTier,
                  subscriberCount: userIds.length,
                  requestId: request.id,
                });
              }
            }
          }
        }

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
