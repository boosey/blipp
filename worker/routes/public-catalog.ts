/**
 * Public catalog endpoints — JSON, no auth.
 *
 * Phase 1 only exposes `/landing-sample` (used by the landing-page hero
 * "Hear a sample" CTA). Future phases add public catalog browsing.
 */
import { Hono } from "hono";
import type { Env } from "../types";

export const publicCatalog = new Hono<{ Bindings: Env }>();

interface LandingSamplePayload {
  showSlug: string;
  episodeSlug: string;
}

/**
 * Returns the show + episode slug pair to use for the landing page sample.
 *
 * Resolution order:
 *  1. `LANDING_SAMPLE_SHOW_SLUG` + `LANDING_SAMPLE_EPISODE_SLUG` env vars,
 *     **only if** that episode is still `publicPage: true` and the show is
 *     reachable. Configured in `wrangler.jsonc` `[vars]` (and per-env).
 *  2. Otherwise fall back to the most-recent public episode in the catalog.
 *
 * Returns 404 if neither resolves (e.g., empty catalog).
 */
publicCatalog.get("/landing-sample", async (c) => {
  const prisma = c.get("prisma") as any;
  const configuredShow = c.env.LANDING_SAMPLE_SHOW_SLUG;
  const configuredEpisode = c.env.LANDING_SAMPLE_EPISODE_SLUG;

  if (configuredShow && configuredEpisode) {
    const podcast = await prisma.podcast.findUnique({
      where: { slug: configuredShow },
      select: { id: true, slug: true },
    });
    if (podcast) {
      const ep = await prisma.episode.findFirst({
        where: {
          podcastId: podcast.id,
          slug: configuredEpisode,
          publicPage: true,
        },
        select: { slug: true },
      });
      if (ep?.slug) {
        const payload: LandingSamplePayload = {
          showSlug: podcast.slug!,
          episodeSlug: ep.slug,
        };
        return c.json(payload, 200, {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        });
      }
    }
  }

  // Fallback: latest public episode.
  const fallback = await prisma.episode.findFirst({
    where: { publicPage: true, slug: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      podcast: { select: { slug: true } },
    },
  });

  if (!fallback?.slug || !fallback.podcast?.slug) {
    return c.json({ error: "No public sample available" }, 404);
  }

  const payload: LandingSamplePayload = {
    showSlug: fallback.podcast.slug,
    episodeSlug: fallback.slug,
  };
  return c.json(payload, 200, {
    "Cache-Control": "public, max-age=300, s-maxage=300",
  });
});
