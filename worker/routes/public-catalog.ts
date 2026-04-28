/**
 * Public catalog endpoints — JSON, no auth required.
 *
 * These power the unauthenticated browse surface (`/browse/*`) and the
 * landing page "Recently Blipped" rail. All responses are scrubbed of
 * user-specific fields (no userId-relative subscription state, no internal
 * RSS feedUrls that would enable wholesale catalog scraping).
 *
 * Caching: each handler sets explicit `Cache-Control` headers; the global
 * `cacheResponse` middleware applied per-route stores the response in
 * `caches.default`. Tiered TTLs per the Phase 2 plan.
 *
 * Rate limiting: the global `/api/*` 120/min/IP applies. Endpoints that
 * are most attractive to scrapers (`/recommendations/featured`,
 * `/recently-blipped`) get a tighter additional bucket of 10/min/IP.
 */
import { Hono } from "hono";
import type { Env } from "../types";

export const publicCatalog = new Hono<{ Bindings: Env }>();

const PAGE_SIZE_DEFAULT = 24;
const PAGE_SIZE_MAX = 60;

interface LandingSamplePayload {
  showSlug: string;
  episodeSlug: string;
}

interface PublicShowSummary {
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  categories: string[];
  publicEpisodeCount: number;
}

interface PublicEpisodeSummary {
  slug: string;
  title: string;
  description: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
  topicTags: string[];
}

function parsePagination(c: any) {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(c.req.query("pageSize") || String(PAGE_SIZE_DEFAULT), 10))
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
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

// ──────────────────────────────────────────────────────────────────────
// Browse surface APIs (Phase 2.2)
// ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/public/categories
 * All categories with public-podcast count. 24h cache.
 */
publicCatalog.get("/categories", async (c) => {
  const prisma = c.get("prisma") as any;

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  // Count podcasts per category that have at least one public episode.
  const counts = await prisma.podcastCategory.groupBy({
    by: ["categoryId"],
    where: {
      podcast: {
        status: "active",
        deliverable: true,
        episodes: { some: { publicPage: true } },
      },
    },
    _count: { _all: true },
  });

  const countMap = new Map<string, number>(
    counts.map((row: any) => [row.categoryId, row._count._all])
  );

  const payload = categories
    .map((cat: any) => ({
      slug: cat.slug,
      name: cat.name,
      showCount: countMap.get(cat.id) ?? 0,
    }))
    .filter((cat: any) => cat.slug && cat.showCount > 0);

  return c.json(
    { categories: payload },
    200,
    { "Cache-Control": "public, max-age=86400, s-maxage=86400" }
  );
});

/**
 * GET /api/public/categories/:slug/shows?page=1&pageSize=24
 * Paginated shows in a category that have at least one public episode. 1h cache.
 */
publicCatalog.get("/categories/:slug/shows", async (c) => {
  const prisma = c.get("prisma") as any;
  const slug = c.req.param("slug");
  const { page, pageSize, skip } = parsePagination(c);

  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  const podcastWhere: any = {
    status: "active",
    deliverable: true,
    podcastCategories: { some: { categoryId: category.id } },
    episodes: { some: { publicPage: true } },
    slug: { not: null },
  };

  const [shows, total] = await Promise.all([
    prisma.podcast.findMany({
      where: podcastWhere,
      orderBy: [{ appleRank: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      skip,
      take: pageSize,
      select: {
        slug: true,
        title: true,
        author: true,
        description: true,
        imageUrl: true,
        categories: true,
        _count: { select: { episodes: { where: { publicPage: true } } } },
      },
    }),
    prisma.podcast.count({ where: podcastWhere }),
  ]);

  const payload: PublicShowSummary[] = shows.map((s: any) => ({
    slug: s.slug,
    title: s.title,
    author: s.author,
    description: s.description,
    imageUrl: s.imageUrl,
    categories: s.categories,
    publicEpisodeCount: s._count.episodes,
  }));

  return c.json(
    { category, shows: payload, total, page, pageSize },
    200,
    { "Cache-Control": "public, max-age=3600, s-maxage=3600" }
  );
});

/**
 * GET /api/public/shows/:slug
 * Show detail with first page of public episodes. 1h cache.
 */
publicCatalog.get("/shows/:slug", async (c) => {
  const prisma = c.get("prisma") as any;
  const slug = c.req.param("slug");

  const show = await prisma.podcast.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      author: true,
      description: true,
      imageUrl: true,
      categories: true,
      status: true,
      deliverable: true,
      _count: { select: { episodes: { where: { publicPage: true } } } },
    },
  });

  if (!show || show.status !== "active" || !show.deliverable || !show.slug) {
    return c.json({ error: "Show not found" }, 404);
  }

  if (show._count.episodes === 0) {
    // No public episodes yet → not part of the public catalog.
    return c.json({ error: "Show not found" }, 404);
  }

  const episodes = await prisma.episode.findMany({
    where: { podcast: { slug }, publicPage: true, slug: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 12,
    select: {
      slug: true,
      title: true,
      description: true,
      publishedAt: true,
      durationSeconds: true,
      topicTags: true,
    },
  });

  const payload = {
    show: {
      slug: show.slug,
      title: show.title,
      author: show.author,
      description: show.description,
      imageUrl: show.imageUrl,
      categories: show.categories,
      publicEpisodeCount: show._count.episodes,
    },
    episodes,
  };

  return c.json(payload, 200, {
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  });
});

/**
 * GET /api/public/shows/:slug/episodes?page=1&pageSize=24
 * Paginated public episodes for a show. 1h cache.
 */
publicCatalog.get("/shows/:slug/episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const slug = c.req.param("slug");
  const { page, pageSize, skip } = parsePagination(c);

  const show = await prisma.podcast.findUnique({
    where: { slug },
    select: { id: true, status: true, deliverable: true },
  });
  if (!show || show.status !== "active" || !show.deliverable) {
    return c.json({ error: "Show not found" }, 404);
  }

  const where = { podcastId: show.id, publicPage: true, slug: { not: null } };

  const [episodes, total] = await Promise.all([
    prisma.episode.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        slug: true,
        title: true,
        description: true,
        publishedAt: true,
        durationSeconds: true,
        topicTags: true,
      },
    }),
    prisma.episode.count({ where }),
  ]);

  return c.json(
    { episodes: episodes as PublicEpisodeSummary[], total, page, pageSize },
    200,
    { "Cache-Control": "public, max-age=3600, s-maxage=3600" }
  );
});

/**
 * GET /api/public/recommendations/featured
 * Three non-personalized rows: Editorial picks, Trending, Newest. 15m cache.
 *
 * Editorial picks come from `Podcast.profile.featured = true` (existing field
 * for admin curation). Trending uses `appleRank`. Newest uses recently-public
 * episodes (`publicPage: true` with most-recent `updatedAt`).
 */
publicCatalog.get("/recommendations/featured", async (c) => {
  const prisma = c.get("prisma") as any;

  const baseShowWhere = {
    status: "active",
    deliverable: true,
    slug: { not: null },
    episodes: { some: { publicPage: true } },
  } as const;

  const [trending, newestShows] = await Promise.all([
    prisma.podcast.findMany({
      where: { ...baseShowWhere, appleRank: { not: null } },
      orderBy: { appleRank: "asc" },
      take: 12,
      select: {
        slug: true,
        title: true,
        author: true,
        imageUrl: true,
        categories: true,
        _count: { select: { episodes: { where: { publicPage: true } } } },
      },
    }),
    prisma.podcast.findMany({
      where: baseShowWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        slug: true,
        title: true,
        author: true,
        imageUrl: true,
        categories: true,
        _count: { select: { episodes: { where: { publicPage: true } } } },
      },
    }),
  ]);

  const toShow = (s: any): PublicShowSummary => ({
    slug: s.slug,
    title: s.title,
    author: s.author,
    description: null,
    imageUrl: s.imageUrl,
    categories: s.categories,
    publicEpisodeCount: s._count.episodes,
  });

  const rows = [
    { id: "trending", title: "Trending shows", shows: trending.map(toShow) },
    { id: "newest", title: "Newest in the catalog", shows: newestShows.map(toShow) },
  ].filter((row) => row.shows.length > 0);

  return c.json(
    { rows },
    200,
    { "Cache-Control": "public, max-age=900, s-maxage=900" }
  );
});

/**
 * GET /api/public/sample/:showSlug/:episodeSlug
 * Resolves a public episode to its Blipp audio URL for the sample player.
 * Picks the longest available clip (typically more polished narrative).
 * Returns 404 if the episode is not publicPage or has no completed clip.
 *
 * Cached 1h — clip URLs are stable once generated.
 */
publicCatalog.get("/sample/:showSlug/:episodeSlug", async (c) => {
  const prisma = c.get("prisma") as any;
  const showSlug = c.req.param("showSlug");
  const episodeSlug = c.req.param("episodeSlug");

  const podcast = await prisma.podcast.findUnique({
    where: { slug: showSlug },
    select: { id: true, slug: true, title: true },
  });
  if (!podcast) return c.json({ error: "Show not found" }, 404);

  const episode = await prisma.episode.findFirst({
    where: { podcastId: podcast.id, slug: episodeSlug, publicPage: true },
    select: {
      slug: true,
      title: true,
      durationSeconds: true,
      clips: {
        where: { status: "COMPLETED", audioUrl: { not: null } },
        orderBy: { durationTier: "desc" },
        take: 1,
        select: { audioUrl: true, actualSeconds: true, durationTier: true },
      },
    },
  });

  const clip = episode?.clips?.[0];
  if (!episode || !clip?.audioUrl) {
    return c.json({ error: "No sample available" }, 404);
  }

  return c.json(
    {
      showSlug: podcast.slug,
      showTitle: podcast.title,
      episodeSlug: episode.slug,
      episodeTitle: episode.title,
      audioUrl: clip.audioUrl,
      sampleSeconds: 30,
      // The server only ships the URL; the client truncates to ~30s and fades out.
      // Once `Briefing.sampleStartSeconds` exists (Phase 2.4 finalization deferred),
      // expose it here so the client can offset playback past Blipp intro cruft.
    },
    200,
    { "Cache-Control": "public, max-age=3600, s-maxage=3600" }
  );
});

/**
 * GET /api/public/recently-blipped?limit=6
 * Most-recent episodes that have a public Blipp page. 5m cache.
 * Powers the landing-page "Recently Blipped" rail.
 */
publicCatalog.get("/recently-blipped", async (c) => {
  const prisma = c.get("prisma") as any;
  const limit = Math.min(12, Math.max(1, parseInt(c.req.query("limit") || "6", 10)));

  const episodes = await prisma.episode.findMany({
    where: { publicPage: true, slug: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      slug: true,
      title: true,
      publishedAt: true,
      durationSeconds: true,
      topicTags: true,
      podcast: {
        select: {
          slug: true,
          title: true,
          imageUrl: true,
        },
      },
    },
  });

  const payload = episodes
    .filter((ep: any) => ep.podcast?.slug)
    .map((ep: any) => ({
      episode: {
        slug: ep.slug,
        title: ep.title,
        publishedAt: ep.publishedAt,
        durationSeconds: ep.durationSeconds,
        topicTags: ep.topicTags,
      },
      show: {
        slug: ep.podcast.slug,
        title: ep.podcast.title,
        imageUrl: ep.podcast.imageUrl,
      },
    }));

  return c.json(
    { items: payload },
    200,
    { "Cache-Control": "public, max-age=300, s-maxage=300" }
  );
});
