import { createPrismaClient, type PrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger, type PipelineLogger } from "../lib/logger";
import { parseRssFeed, type ParsedEpisode, type ParsedFeed } from "../lib/rss-parser";
import type { FeedRefreshMessage } from "../lib/queue-messages";
import { isRefreshJobActive, tryCompleteRefreshJob } from "../lib/queue-helpers";
import { safeFetch } from "../lib/url-validation";
import { slugify, uniqueSlug } from "../lib/slugify";
import { PodcastIndexClient } from "../lib/podcast-index";
import { decodeHtmlEntities } from "../lib/html-entities";
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
 * Fetch and parse a podcast's RSS feed directly.
 * Returns null with the HTTP status on non-retryable failure (e.g. 403).
 */
async function fetchRssDirect(
  feedUrl: string,
  maxEpisodes: number,
  fetchTimeoutMs: number,
  log: PipelineLogger,
  podcastId: string,
  maxRetries = 3,
): Promise<{ feed: ParsedFeed } | { status: number; statusText: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await safeFetch(feedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Blipp/1.0 (+https://blipp.fm; podcast fetcher)",
          "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        },
      });
      if (response.ok || !RETRY_STATUSES.has(response.status) || attempt === maxRetries) break;
      const backoffMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      log.info("feed_fetch_retry", {
        podcastId,
        status: response.status,
        attempt: attempt + 1,
        backoffMs,
      });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
    if (!response!.ok) {
      return { status: response!.status, statusText: response!.statusText };
    }
    const xml = await response!.text();
    const feed = parseRssFeed(xml, maxEpisodes * 3);
    return { feed };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      log.error("feed_fetch_timeout", {
        podcastId,
        feedUrl,
        timeoutMs: fetchTimeoutMs,
      });
      throw new Error(`RSS fetch timed out after ${fetchTimeoutMs}ms: ${feedUrl}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fallback: fetch episodes from the Podcast Index API when direct RSS is blocked.
 * Returns a synthetic ParsedFeed constructed from PI episode data.
 */
async function fetchViaPodcastIndex(
  feedUrl: string,
  maxEpisodes: number,
  env: Env,
  log: PipelineLogger,
  podcastId: string,
): Promise<ParsedFeed> {
  const pi = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
  const episodes = await pi.episodesByFeedUrl(feedUrl, maxEpisodes);

  if (!episodes.length) {
    throw new Error(`Podcast Index returned no episodes for: ${feedUrl}`);
  }

  log.info("podcast_index_fallback_success", {
    podcastId,
    feedUrl,
    episodeCount: episodes.length,
  });

  return {
    title: "",
    description: "",
    imageUrl: null,
    author: null,
    episodes: episodes.map((ep) => ({
      title: decodeHtmlEntities(ep.title),
      description: decodeHtmlEntities(ep.description),
      audioUrl: ep.enclosureUrl,
      publishedAt: ep.datePublished
        ? new Date(ep.datePublished * 1000).toISOString()
        : null,
      durationSeconds: ep.duration || null,
      guid: ep.guid,
      transcriptUrl: ep.transcriptUrl ?? null,
    })),
  };
}

/**
 * Process a single podcast: fetch RSS, parse, upsert episodes, notify subscribers.
 */
async function processPodcast(
  podcast: any,
  prisma: PrismaClient,
  env: Env,
  log: PipelineLogger,
  maxEpisodes: number,
  fetchTimeoutMs: number,
  refreshJobId?: string,
  maxRetries = 3,
): Promise<void> {
  // Try direct RSS fetch first
  const directResult = await fetchRssDirect(
    podcast.feedUrl, maxEpisodes, fetchTimeoutMs, log, podcast.id, maxRetries,
  );

  let feed: ParsedFeed;

  if ("feed" in directResult) {
    feed = directResult.feed;
  } else if (directResult.status === 403) {
    // Direct fetch blocked — fall back to Podcast Index API
    log.info("feed_fetch_403_fallback", {
      podcastId: podcast.id,
      title: podcast.title,
      feedUrl: podcast.feedUrl,
    });
    feed = await fetchViaPodcastIndex(
      podcast.feedUrl, maxEpisodes, env, log, podcast.id,
    );
  } else {
    throw new Error(
      `RSS feed returned HTTP ${directResult.status} ${directResult.statusText}: ${podcast.feedUrl}`
    );
  }

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
      return;
    }
  }

  // Ensure podcast has a slug for public SEO pages
  if (!podcast.slug) {
    const existingPodcastSlugs = await prisma.podcast.findMany({
      where: { slug: { not: null } },
      select: { slug: true },
    });
    const podcastSlugSet = new Set(existingPodcastSlugs.map((p: any) => p.slug as string));
    const newSlug = uniqueSlug(podcast.title, podcastSlugSet, podcast.id);
    await prisma.podcast.update({
      where: { id: podcast.id },
      data: { slug: newSlug },
    });
    podcast.slug = newSlug;
  }

  const recent = latestEpisodes(feed.episodes, maxEpisodes);
  const newEpisodeIds: string[] = [];

  // Collect existing GUIDs and slugs for this podcast to detect truly new episodes
  const existingEpisodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id },
    select: { guid: true, slug: true },
  });
  const existingGuids = new Set(existingEpisodes.map((e: any) => e.guid));
  const existingEpSlugs = new Set(existingEpisodes.map((e: any) => e.slug).filter(Boolean) as string[]);

  for (const ep of recent) {
    // Belt-and-suspenders: parser already filters these, but guard against malformed input
    if (!ep.guid || !ep.audioUrl) continue;

    const epSlug = uniqueSlug(ep.title, existingEpSlugs, ep.guid);
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
        slug: epSlug,
      },
    });
    existingEpSlugs.add(epSlug);

    // New episode = GUID wasn't in the database before this refresh
    if (!existingGuids.has(ep.guid)) {
      newEpisodeIds.push(episode.id);
    }
  }

  // Track new episodes for refresh job
  if (refreshJobId && newEpisodeIds.length > 0) {
    await prisma.episodeRefreshJob.update({
      where: { id: refreshJobId },
      data: {
        podcastsWithNewEpisodes: { increment: 1 },
        episodesDiscovered: { increment: newEpisodeIds.length },
        prefetchTotal: { increment: newEpisodeIds.length },
      },
    }).catch((e: unknown) => {
      log.error("refresh_job_tracking_failed", { refreshJobId, newEpisodes: newEpisodeIds.length }, e);
    });
  }

  // Queue content prefetch for new episodes (runs slowly at concurrency=1)
  if (newEpisodeIds.length > 0) {
    await env.CONTENT_PREFETCH_QUEUE.sendBatch(
      newEpisodeIds.map((id) => ({
        body: {
          episodeId: id,
          ...(refreshJobId && { refreshJobId }),
        },
      }))
    );
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
}

/**
 * Queue consumer for feed-refresh jobs.
 *
 * Processes podcasts in parallel using Promise.allSettled.
 * Supports both single podcastId (backward compat) and batched podcastIds messages.
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

    // Collect podcast IDs from all messages (supports both singular and plural)
    const podcastIds = new Set<string>();
    let fetchAll = false;
    let refreshJobId: string | undefined;
    for (const msg of batch.messages) {
      const body = msg.body;
      if (body.podcastIds) {
        for (const id of body.podcastIds) podcastIds.add(id);
      } else if (body.podcastId) {
        podcastIds.add(body.podcastId);
      } else {
        fetchAll = true;
      }
      if (body.refreshJobId) refreshJobId = body.refreshJobId;
    }

    log.debug("podcast_filter", { fetchAll, podcastIdCount: podcastIds.size });

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
    const fetchTimeoutMs = (await getConfig(prisma, "pipeline.feedRefresh.fetchTimeoutMs", 10000)) as number;
    const maxRetries = (await getConfig(prisma, "pipeline.feedRefresh.maxRetries", 3)) as number;

    // Process all podcasts in parallel
    await Promise.allSettled(
      podcasts.map(async (podcast: any) => {
        // Cooperative pause/cancel: skip if refresh job is no longer active
        let processed = false;
        if (refreshJobId) {
          const active = await isRefreshJobActive(prisma, refreshJobId);
          if (!active) {
            log.info("refresh_job_inactive", { podcastId: podcast.id, refreshJobId });
            return;
          }
          processed = true;
        }

        try {
          await processPodcast(podcast, prisma, env, log, maxEpisodes, fetchTimeoutMs, refreshJobId, maxRetries);
        } catch (err) {
          // Log and continue — don't let one failed feed block others
          log.error("podcast_error", { podcastId: podcast.id }, err);

          // Record error for episode refresh job
          if (refreshJobId) {
            await prisma.episodeRefreshError.create({
              data: {
                jobId: refreshJobId,
                phase: "feed_scan",
                message: err instanceof Error ? err.message : String(err),
                podcastId: podcast.id,
              },
            }).catch(() => {});
          }
        } finally {
          if (refreshJobId && processed) {
            await prisma.episodeRefreshJob.update({
              where: { id: refreshJobId },
              data: { podcastsCompleted: { increment: 1 } },
            }).catch((e: unknown) => {
              log.error("podcasts_completed_increment_failed", { podcastId: podcast.id, refreshJobId }, e);
            });
          }
        }
      })
    );

    log.info("batch_complete", { podcastCount: podcasts.length });

    // Proactive completion: if all podcasts are scanned and no episodes were
    // discovered (prefetchTotal=0), the job is done now. Otherwise content-prefetch
    // will mark it complete when the last prefetch message is processed.
    if (refreshJobId) {
      await tryCompleteRefreshJob(prisma, refreshJobId).catch(() => {});
    }

    // Ack all messages in the batch
    for (const msg of batch.messages) {
      msg.ack();
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
