import type { PrismaClient } from "./db";

/**
 * Sentinel FeedItem.errorMessage used to tell the UI a feed was flagged as music.
 * friendlyError() in src/components/feed-item.tsx matches this prefix.
 */
export const MUSIC_FEED_ITEM_ERROR = "NOT_A_PODCAST:music";

/** Reasons recorded on Podcast.invalidationReason. */
export type InvalidationReason =
  | "music_host"           // Feed host is a known music-only provider (e.g. SoundCloud user feed)
  | "music_category"       // Admin-driven: only-category is "Music"
  | "song_lyrics_detected" // Distillation flagged the transcript as song lyrics
  | "admin";               // Manual admin action

/**
 * Feed URL patterns for hosts that almost exclusively publish music / DJ mixes,
 * not talk podcasts. Matches are soft — callers decide whether to reject at ingest
 * or just invalidate on detection.
 */
const MUSIC_ONLY_HOST_PATTERNS: RegExp[] = [
  // SoundCloud user RSS — every known example is DJ mixes / songs, not podcasts
  /^https?:\/\/feeds\.soundcloud\.com\/users\//i,
];

/** True when a feed URL points to a host that only publishes music. */
export function isMusicOnlyFeed(feedUrl: string | null | undefined): boolean {
  if (!feedUrl) return false;
  return MUSIC_ONLY_HOST_PATTERNS.some((re) => re.test(feedUrl));
}

/**
 * Detects LLM output that indicates the transcript isn't a podcast — usually
 * an empty claims array paired with prose explaining the content is song
 * lyrics / music. Runs on both raw LLM text and the downstream error message
 * extractClaims() wraps around it.
 */
export function looksLikeSongLyricsOutput(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.toLowerCase();
  // Primary: LLM explicitly says song lyrics / music / not a podcast
  if (s.includes("song lyrics")) return true;
  if (s.includes("music lyrics")) return true;
  if (s.includes("not a podcast")) return true;
  if (s.includes("not a podcast episode")) return true;
  // Weaker signal paired with empty-array output
  const emptyArray = /(^|\s|:)\[\s*\]/.test(s);
  if (emptyArray && (s.includes("nonsensical") || s.includes("no coherent") || s.includes("no substantive"))) {
    return true;
  }
  return false;
}

/**
 * Error thrown from extractClaims when the LLM tells us the transcript isn't
 * a real podcast. The distillation queue catches this and invalidates the podcast.
 */
export class NotAPodcastError extends Error {
  rawOutput: string;
  constructor(rawOutput: string, message?: string) {
    super(message ?? "Transcript is not a podcast (likely music / song lyrics)");
    this.name = "NotAPodcastError";
    this.rawOutput = rawOutput;
  }
}

/**
 * Marks a podcast as "music" and nukes user-visible state for it:
 *  - Flips status=music, deliverable=false, records reason + timestamp
 *  - Deletes Subscription / PodcastFavorite / PodcastVote rows
 *  - Cancels in-flight BriefingRequests + PipelineJobs targeting any of its episodes
 *  - Cancels open FeedItems with a sentinel errorMessage the UI recognizes
 *
 * Idempotent: calling twice is a no-op on the second call.
 */
export async function invalidatePodcastAsMusic(
  prisma: PrismaClient,
  podcastId: string,
  reason: InvalidationReason,
): Promise<{
  alreadyInvalid: boolean;
  subscriptionsRemoved: number;
  favoritesRemoved: number;
  votesRemoved: number;
  feedItemsCancelled: number;
  requestsCancelled: number;
  jobsCancelled: number;
}> {
  const existing = await prisma.podcast.findUnique({
    where: { id: podcastId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new Error(`Podcast ${podcastId} not found`);
  }
  if (existing.status === "music") {
    return {
      alreadyInvalid: true,
      subscriptionsRemoved: 0,
      favoritesRemoved: 0,
      votesRemoved: 0,
      feedItemsCancelled: 0,
      requestsCancelled: 0,
      jobsCancelled: 0,
    };
  }

  const episodes = await prisma.episode.findMany({
    where: { podcastId },
    select: { id: true },
  });
  const episodeIds = episodes.map((e) => e.id);

  // In-flight PipelineJobs on episodes of this podcast → collect their requestIds
  // so we can cancel the parent BriefingRequests too.
  const inFlightJobs = episodeIds.length > 0
    ? await prisma.pipelineJob.findMany({
        where: {
          episodeId: { in: episodeIds },
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        select: { id: true, requestId: true },
      })
    : [];
  const requestIds = Array.from(new Set(inFlightJobs.map((j) => j.requestId).filter(Boolean))) as string[];

  const [
    _podcast,
    subsResult,
    favsResult,
    votesResult,
    feedItemsResult,
    requestsResult,
    jobsResult,
  ] = await prisma.$transaction([
    prisma.podcast.update({
      where: { id: podcastId },
      data: {
        status: "music",
        deliverable: false,
        invalidationReason: reason,
        invalidatedAt: new Date(),
      },
    }),
    prisma.subscription.deleteMany({ where: { podcastId } }),
    prisma.podcastFavorite.deleteMany({ where: { podcastId } }),
    prisma.podcastVote.deleteMany({ where: { podcastId } }),
    prisma.feedItem.updateMany({
      where: {
        podcastId,
        status: { in: ["PENDING", "PROCESSING", "READY", "FAILED"] },
      },
      data: { status: "CANCELLED", errorMessage: MUSIC_FEED_ITEM_ERROR },
    }),
    requestIds.length > 0
      ? prisma.briefingRequest.updateMany({
          where: { id: { in: requestIds }, status: { in: ["PENDING", "PROCESSING"] } },
          data: { status: "CANCELLED", cancelledAt: new Date(), errorMessage: MUSIC_FEED_ITEM_ERROR },
        })
      : prisma.briefingRequest.updateMany({ where: { id: "__noop__" }, data: {} }),
    episodeIds.length > 0
      ? prisma.pipelineJob.updateMany({
          where: {
            episodeId: { in: episodeIds },
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: { status: "CANCELLED", errorMessage: MUSIC_FEED_ITEM_ERROR, completedAt: new Date() },
        })
      : prisma.pipelineJob.updateMany({ where: { id: "__noop__" }, data: {} }),
  ]);

  console.log(JSON.stringify({
    level: "info",
    action: "podcast_invalidated_as_music",
    podcastId,
    reason,
    subscriptionsRemoved: subsResult.count,
    favoritesRemoved: favsResult.count,
    votesRemoved: votesResult.count,
    feedItemsCancelled: feedItemsResult.count,
    requestsCancelled: requestsResult.count,
    jobsCancelled: jobsResult.count,
    ts: new Date().toISOString(),
  }));

  return {
    alreadyInvalid: false,
    subscriptionsRemoved: subsResult.count,
    favoritesRemoved: favsResult.count,
    votesRemoved: votesResult.count,
    feedItemsCancelled: feedItemsResult.count,
    requestsCancelled: requestsResult.count,
    jobsCancelled: jobsResult.count,
  };
}
