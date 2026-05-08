import { getConfig } from "./config";

/**
 * Settings driving the episode-length filter. `enabled=false` means no
 * filter is applied anywhere — short episodes and short-heavy podcasts
 * are all visible.
 */
export interface MinLengthSettings {
  enabled: boolean;
  minSeconds: number;
  rejectionPercent: number;
}

export async function getMinLengthSettings(prisma: any): Promise<MinLengthSettings> {
  const [enabled, minutes, rejectionPercent] = await Promise.all([
    getConfig(prisma, "episodes.minLength.enabled", true) as Promise<boolean>,
    getConfig(prisma, "episodes.minLength.minutes", 10) as Promise<number>,
    getConfig(prisma, "episodes.minLength.podcastRejectionPercent", 75) as Promise<number>,
  ]);
  return {
    enabled: !!enabled,
    minSeconds: Math.max(0, Number(minutes) || 0) * 60,
    rejectionPercent: Math.max(0, Math.min(100, Number(rejectionPercent) || 0)),
  };
}

/**
 * Returns a Prisma `where` fragment that excludes episodes shorter than the
 * configured minimum. Episodes with a null `durationSeconds` pass through —
 * we can't enforce a length we don't know.
 *
 * Returns `{}` when the filter is disabled, so callers can spread it
 * unconditionally.
 */
export function buildEpisodeLengthWhere(settings: MinLengthSettings): Record<string, unknown> {
  if (!settings.enabled) return {};
  return {
    OR: [
      { durationSeconds: null },
      { durationSeconds: { gte: settings.minSeconds } },
    ],
  };
}

/**
 * Returns a Prisma `where` fragment that excludes podcasts flagged with
 * too many short episodes. Returns `{}` when the filter is disabled.
 */
export function buildPodcastLengthWhere(settings: MinLengthSettings): Record<string, unknown> {
  if (!settings.enabled) return {};
  return { tooManyShortEpisodes: false };
}

/**
 * Recompute the `tooManyShortEpisodes` flag for one podcast based on the
 * current settings. No-op when settings are disabled (and clears any
 * previously-set flag so the podcast becomes visible again).
 *
 * Counts only deliverable episodes (`contentStatus != NOT_DELIVERABLE`).
 * Episodes with null `durationSeconds` are treated as "not short" — same
 * permissive treatment used in `buildEpisodeLengthWhere`.
 */
export async function recomputeTooManyShortEpisodes(
  prisma: any,
  podcastId: string,
  currentFlag: boolean,
  settings?: MinLengthSettings,
): Promise<boolean> {
  const s = settings ?? (await getMinLengthSettings(prisma));

  if (!s.enabled) {
    if (currentFlag) {
      await prisma.podcast.update({
        where: { id: podcastId },
        data: { tooManyShortEpisodes: false },
      });
    }
    return false;
  }

  const total = await prisma.episode.count({
    where: {
      podcastId,
      contentStatus: { not: "NOT_DELIVERABLE" },
      durationSeconds: { not: null },
    },
  });

  let tooMany = false;
  if (total > 0) {
    const short = await prisma.episode.count({
      where: {
        podcastId,
        contentStatus: { not: "NOT_DELIVERABLE" },
        durationSeconds: { lt: s.minSeconds },
      },
    });
    const pct = (short / total) * 100;
    tooMany = pct >= s.rejectionPercent;
  }

  if (tooMany !== currentFlag) {
    await prisma.podcast.update({
      where: { id: podcastId },
      data: { tooManyShortEpisodes: tooMany },
    });
  }
  return tooMany;
}
