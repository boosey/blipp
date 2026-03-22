import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { parseRssFeed, type ParsedEpisode } from "../lib/rss-parser";
import type { FeedRefreshMessage } from "../lib/queue-messages";
import { isSeedJobActive } from "../lib/queue-helpers";
import type { Env } from "../types";

/**
 * Returns the most recent episodes from a parsed feed, sorted newest-first.
 * RSS feeds usually list newest first, but not always — this guarantees it.
 */
function latestEpisodes(episodes: ParsedEpisode[], max: number): ParsedEpisode[] {
  return [...episodes]
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    })
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
    let seedJobId: string | undefined;
    for (const msg of batch.messages) {
      const body = msg.body;
      if (body.podcastId) {
        podcastIds.add(body.podcastId);
      } else {
        fetchAll = true;
      }
      if (body.seedJobId) seedJobId = body.seedJobId;
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
      let processed = false;
      try {
        // Cooperative pause/cancel: skip processing if seed job is no longer active
        if (seedJobId) {
          const active = await isSeedJobActive(prisma, seedJobId);
          if (!active) {
            log.info("seed_job_inactive", { podcastId: podcast.id, seedJobId });
            continue; // Skip this podcast — don't increment feedsCompleted
          }
          processed = true; // Mark here so non-English skips still count toward feedsCompleted
        }

        console.log(`[feed-refresh] GET RSS feed: ${podcast.feedUrl} (podcast: ${podcast.title})`);
        const response = await fetch(podcast.feedUrl);
        console.log(`[feed-refresh] RSS response: ${response.status} ${response.statusText} (${podcast.title})`);
        const xml = await response.text();
        const feed = parseRssFeed(xml);
        console.log(`[feed-refresh] Parsed ${feed.episodes.length} episodes from ${podcast.title}`);

        // Write the RSS language tag to the podcast record
        if (feed.language) {
          await prisma.podcast.update({
            where: { id: podcast.id },
            data: { language: feed.language },
          });

          // Mark non-English podcasts as pending_deletion
          const lang = feed.language.toLowerCase();
          if (!lang.startsWith("en")) {
            await prisma.podcast.update({
              where: { id: podcast.id },
              data: { status: "pending_deletion" },
            });
            log.info("non_english_podcast", {
              podcastId: podcast.id,
              language: feed.language,
              title: podcast.title,
            });
            continue; // Skip episode processing
          }
        }

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
              publishedAt: ep.publishedAt ? new Date(ep.publishedAt) : null,
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

        // Queue content prefetch for new episodes (runs slowly at concurrency=1)
        if (newEpisodeIds.length > 0) {
          await env.CONTENT_PREFETCH_QUEUE.sendBatch(
            newEpisodeIds.map((id) => ({ body: { episodeId: id, ...(seedJobId && { seedJobId }) } }))
          );
          if (seedJobId) {
            await prisma.catalogSeedJob.update({
              where: { id: seedJobId },
              data: { prefetchTotal: { increment: newEpisodeIds.length } },
            });
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
            include: { user: { select: { defaultVoicePresetId: true } } },
          });

          if (subscriptions.length > 0) {
            // Group subscribers by (durationTier, resolvedVoicePresetId)
            // voicePresetId: subscription-level > user default > null
            const groupKey = (tier: number, vpId: string | null) => `${tier}:${vpId ?? ""}`;
            const tierVoiceGroups = new Map<string, { durationTier: number; voicePresetId: string | null; userIds: string[] }>();

            for (const sub of subscriptions) {
              const resolvedVoicePresetId = sub.voicePresetId ?? sub.user?.defaultVoicePresetId ?? null;
              const key = groupKey(sub.durationTier, resolvedVoicePresetId);
              if (!tierVoiceGroups.has(key)) {
                tierVoiceGroups.set(key, {
                  durationTier: sub.durationTier,
                  voicePresetId: resolvedVoicePresetId,
                  userIds: [],
                });
              }
              tierVoiceGroups.get(key)!.userIds.push(sub.userId);
            }

            for (const episodeId of newEpisodeIds) {
              for (const [, group] of tierVoiceGroups) {
                const { durationTier, voicePresetId, userIds } = group;

                // Create FeedItems for all subscribers in this group
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

                // Create one BriefingRequest per (episode, tier, voice) — the clip is shared
                const request = await prisma.briefingRequest.create({
                  data: {
                    userId: userIds[0], // Anchor to first subscriber
                    targetMinutes: durationTier,
                    items: [{
                      podcastId: podcast.id,
                      episodeId,
                      durationTier,
                      voicePresetId: voicePresetId ?? undefined,
                      useLatest: false,
                    }],
                    isTest: false,
                    status: "PENDING",
                  },
                });

                // Link all FeedItems in this group to the request
                await prisma.feedItem.updateMany({
                  where: {
                    episodeId,
                    durationTier,
                    userId: { in: userIds },
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
                  voicePresetId,
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

        // Record error to CatalogJobError if this is part of a seed job
        if (seedJobId) {
          await prisma.catalogJobError.create({
            data: {
              jobId: seedJobId,
              phase: "feed_refresh",
              message: err instanceof Error ? err.message : String(err),
              podcastId: podcast.id,
            },
          }).catch(() => {});
        }
      } finally {
        if (seedJobId && processed) {
          await prisma.catalogSeedJob.update({
            where: { id: seedJobId },
            data: { feedsCompleted: { increment: 1 } },
          }).catch(() => {});
        }
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
