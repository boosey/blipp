import type { PrismaClient } from "./db";
import type { PipelineLogger } from "./logger";
import type { ApplePodcastsClient } from "./apple-podcasts";

/**
 * Best-effort enrichment: for each new episode, if Apple's iTunes Lookup
 * returns an entry whose `episodeGuid` matches the RSS GUID, store the
 * Apple `trackId` on the Episode row so the player can deeplink to it.
 *
 * Hard match only — no fuzzy matching, no fallback to title/date/duration.
 * Failure is silent (logged); episodes simply remain without a trackId
 * and the player resolves to the show-level Apple URL.
 */
export async function enrichNewEpisodesWithAppleTrackIds(args: {
  prisma: PrismaClient;
  podcast: { id: string; appleId: string | null };
  newEpisodeIds: string[];
  apple: ApplePodcastsClient;
  log: PipelineLogger;
}): Promise<void> {
  const { prisma, podcast, newEpisodeIds, apple, log } = args;

  if (!podcast.appleId || newEpisodeIds.length === 0) return;

  const newEpisodes = await prisma.episode.findMany({
    where: { id: { in: newEpisodeIds } },
    select: { id: true, guid: true },
  });

  const appleEntries = await apple.lookupEpisodes(podcast.appleId);

  const guidToTrackId = new Map<string, number>();
  for (const entry of appleEntries) {
    if (entry.episodeGuid) guidToTrackId.set(entry.episodeGuid, entry.trackId);
  }

  let matched = 0;
  for (const ep of newEpisodes) {
    const trackId = guidToTrackId.get(ep.guid);
    if (trackId == null) continue;
    await prisma.episode.update({
      where: { id: ep.id },
      data: { appleEpisodeTrackId: String(trackId) },
    });
    matched++;
  }

  log.info("apple_episode_enrichment", {
    podcastId: podcast.id,
    attempted: newEpisodes.length,
    matched,
  });
}
