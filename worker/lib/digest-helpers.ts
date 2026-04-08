/**
 * Shared helpers for the digest pipeline.
 *
 * - getLocalHour(): timezone-aware hour calculation
 * - collectDigestEpisodes(): gathers episodes from subs/favs/recommended
 * - determineEntryStage(): checks cached work products to find optimal start
 * - checkDigestProgress(): bridge from existing pipeline → digest stages
 */

import { wpKey, getWorkProduct } from "./work-products";
import type { Env } from "../types";

// ── Timezone ──

/**
 * Returns the current local hour (0-23) for the given IANA timezone.
 * If timezone is null/invalid, returns the UTC hour.
 */
export function getLocalHour(utcHour: number, timezone: string | null): number {
  if (!timezone) return utcHour;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return utcHour; // invalid timezone → treat as UTC
  }
}

// ── Episode collection ──

export interface DigestEpisodeCandidate {
  episodeId: string;
  podcastId: string;
  sourceType: "subscribed" | "favorited" | "recommended";
}

/**
 * Collects digest-eligible episodes for a user based on their preferences.
 * Episodes must have been published in the last 48 hours.
 * Deduplicates across sources and caps at 20.
 */
export async function collectDigestEpisodes(
  prisma: any,
  userId: string,
  prefs: {
    includeSubscriptions: boolean;
    includeFavorites: boolean;
    includeRecommended: boolean;
  }
): Promise<DigestEpisodeCandidate[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const seen = new Set<string>();
  const results: DigestEpisodeCandidate[] = [];

  // Subscriptions: latest episode per subscribed podcast
  if (prefs.includeSubscriptions) {
    const subs = await prisma.subscription.findMany({
      where: { userId },
      select: { podcastId: true },
    });
    if (subs.length > 0) {
      const episodes = await prisma.episode.findMany({
        where: {
          podcastId: { in: subs.map((s: any) => s.podcastId) },
          publishedAt: { gte: cutoff },
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true, podcastId: true },
      });
      // Keep only the latest per podcast
      const byPodcast = new Map<string, string>();
      for (const ep of episodes) {
        if (!byPodcast.has(ep.podcastId)) byPodcast.set(ep.podcastId, ep.id);
      }
      for (const [podcastId, episodeId] of byPodcast) {
        if (!seen.has(episodeId)) {
          seen.add(episodeId);
          results.push({ episodeId, podcastId, sourceType: "subscribed" });
        }
      }
    }
  }

  // Favorites: latest episode per favorited podcast (dedup against subs)
  if (prefs.includeFavorites) {
    const favs = await prisma.podcastFavorite.findMany({
      where: { userId },
      select: { podcastId: true },
    });
    if (favs.length > 0) {
      const episodes = await prisma.episode.findMany({
        where: {
          podcastId: { in: favs.map((f: any) => f.podcastId) },
          publishedAt: { gte: cutoff },
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true, podcastId: true },
      });
      const byPodcast = new Map<string, string>();
      for (const ep of episodes) {
        if (!byPodcast.has(ep.podcastId)) byPodcast.set(ep.podcastId, ep.id);
      }
      for (const [podcastId, episodeId] of byPodcast) {
        if (!seen.has(episodeId)) {
          seen.add(episodeId);
          results.push({ episodeId, podcastId, sourceType: "favorited" });
        }
      }
    }
  }

  // Recommended: 1 episode from top-scored recommended podcast
  if (prefs.includeRecommended) {
    const recCache = await prisma.recommendationCache.findUnique({
      where: { userId },
      select: { podcasts: true },
    });
    if (recCache?.podcasts) {
      const recs = recCache.podcasts as Array<{ podcastId: string; score: number }>;
      // Sort by score descending
      const sorted = [...recs].sort((a, b) => b.score - a.score);
      for (const rec of sorted) {
        const ep = await prisma.episode.findFirst({
          where: {
            podcastId: rec.podcastId,
            publishedAt: { gte: cutoff },
          },
          orderBy: { publishedAt: "desc" },
          select: { id: true, podcastId: true },
        });
        if (ep && !seen.has(ep.id)) {
          seen.add(ep.id);
          results.push({ episodeId: ep.id, podcastId: ep.podcastId, sourceType: "recommended" });
          break; // only 1 recommended
        }
      }
    }
  }

  return results.slice(0, 20);
}

// ── Entry stage determination ──

export type DigestEntryStage =
  | "DIGEST_CLIP_DONE"     // clip already exists → mark episode READY
  | "DIGEST_CLIP"          // narrative exists → TTS
  | "DIGEST_NARRATIVE"     // 10-min narrative exists → condense
  | "NARRATIVE_GENERATION" // claims exist → generate 10-min narrative
  | "DISTILLATION"         // transcript exists → extract claims
  | "TRANSCRIPTION";       // nothing exists → start from scratch

/**
 * Determines the optimal entry stage for a digest episode by checking
 * what work products already exist.
 */
export async function determineEntryStage(
  prisma: any,
  episodeId: string,
  voice: string
): Promise<DigestEntryStage> {
  // Check from most-complete to least-complete
  const existingProducts = await prisma.workProduct.findMany({
    where: {
      episodeId,
      type: {
        in: ["DIGEST_CLIP", "DIGEST_NARRATIVE", "NARRATIVE", "CLAIMS", "TRANSCRIPT"],
      },
    },
    select: { type: true, voice: true, durationTier: true },
  });

  const types = new Set(existingProducts.map((p: any) => p.type));

  // Digest clip exists for this voice
  if (existingProducts.some((p: any) => p.type === "DIGEST_CLIP" && (p.voice ?? "default") === voice)) {
    return "DIGEST_CLIP_DONE";
  }

  // Digest narrative exists
  if (types.has("DIGEST_NARRATIVE")) return "DIGEST_CLIP";

  // 10-min narrative exists (any duration tier — we just need the longest)
  if (types.has("NARRATIVE")) return "DIGEST_NARRATIVE";

  // Claims exist
  if (types.has("CLAIMS")) return "NARRATIVE_GENERATION";

  // Transcript exists
  if (types.has("TRANSCRIPT")) return "DISTILLATION";

  return "TRANSCRIPTION";
}

// ── Bridge: existing pipeline → digest pipeline ──

/**
 * Called from the existing orchestrator when a pipeline stage completes.
 * Checks if the episode is part of any PROCESSING DigestDelivery, and if so,
 * dispatches the next digest-specific step.
 */
export async function checkDigestProgress(
  prisma: any,
  episodeId: string,
  env: Env
): Promise<void> {
  // Find any PENDING DigestDeliveryEpisodes for this episode
  const pending = await prisma.digestDeliveryEpisode.findMany({
    where: { episodeId, status: "PENDING" },
    include: {
      delivery: { select: { id: true, status: true, userId: true } },
    },
  });

  if (pending.length === 0) return;

  // Filter to only those in PROCESSING deliveries
  const active = pending.filter((p: any) => p.delivery.status === "PROCESSING");
  if (active.length === 0) return;

  // Check what's now available for this episode
  const voice = "default"; // digest always uses default voice for now
  const stage = await determineEntryStage(prisma, episodeId, voice);

  // Dispatch based on what's available now
  for (const dde of active) {
    const deliveryId = dde.delivery.id;

    if (stage === "DIGEST_CLIP_DONE") {
      // Episode is fully done — mark READY and check for assembly
      await prisma.digestDeliveryEpisode.update({
        where: { id: dde.id },
        data: { status: "READY" },
      });
      await incrementAndCheckAssembly(prisma, deliveryId, env);
    } else if (stage === "DIGEST_CLIP") {
      await prisma.digestDeliveryEpisode.update({
        where: { id: dde.id },
        data: { status: "PROCESSING" },
      });
      await env.DIGEST_CLIP_QUEUE.send({
        episodeId,
        deliveryId,
      });
    } else if (stage === "DIGEST_NARRATIVE") {
      await prisma.digestDeliveryEpisode.update({
        where: { id: dde.id },
        data: { status: "PROCESSING" },
      });
      await env.DIGEST_NARRATIVE_QUEUE.send({
        episodeId,
        deliveryId,
      });
    }
    // If stage is still in the existing pipeline (NARRATIVE_GENERATION, etc.),
    // the existing orchestrator will advance it further and we'll be called again.
  }
}

/**
 * Atomically increments completedEpisodes on a delivery and dispatches
 * assembly if all episodes are done.
 */
export async function incrementAndCheckAssembly(
  prisma: any,
  deliveryId: string,
  env: Env
): Promise<void> {
  // Atomic increment
  const updated = await prisma.digestDelivery.update({
    where: { id: deliveryId },
    data: { completedEpisodes: { increment: 1 } },
    select: { completedEpisodes: true, totalEpisodes: true },
  });

  if (updated.completedEpisodes >= updated.totalEpisodes) {
    await env.DIGEST_ASSEMBLY_QUEUE.send({ deliveryId });
  }
}
