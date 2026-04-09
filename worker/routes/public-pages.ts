/**
 * Public Blipp pages — server-rendered HTML for SEO.
 * No auth required. Served at /p/* paths.
 */
import { Hono } from "hono";
import { prismaMiddleware } from "../middleware/prisma";
import {
  renderEpisodePage,
  renderShowPage,
  renderCategoryPage,
} from "../lib/html-templates";
import type { Env } from "../types";

const publicPages = new Hono<{ Bindings: Env }>();

// Prisma middleware for DB access
publicPages.use("/*", prismaMiddleware);

// ── Episode Blipp page ──
publicPages.get("/:showSlug/:episodeSlug", async (c) => {
  const { showSlug, episodeSlug } = c.req.param();
  const prisma = c.get("prisma") as any;

  const podcast = await prisma.podcast.findUnique({
    where: { slug: showSlug },
    select: { id: true, title: true, slug: true, imageUrl: true, description: true },
  });
  if (!podcast) return c.notFound();

  const episode = await prisma.episode.findFirst({
    where: { podcastId: podcast.id, slug: episodeSlug, publicPage: true },
    select: {
      title: true,
      slug: true,
      publishedAt: true,
      durationSeconds: true,
      topicTags: true,
      clips: {
        where: { status: "COMPLETED", narrativeText: { not: null } },
        orderBy: { durationTier: "desc" },
        take: 1,
        select: { narrativeText: true },
      },
    },
  });
  if (!episode || !episode.clips[0]?.narrativeText) return c.notFound();

  // Find first category for this podcast
  const podcastCategory = await prisma.podcastCategory.findFirst({
    where: { podcastId: podcast.id },
    select: { category: { select: { name: true, slug: true } } },
  });

  const html = renderEpisodePage({
    episodeTitle: episode.title,
    episodeSlug: episode.slug!,
    podcastTitle: podcast.title,
    podcastSlug: podcast.slug!,
    podcastImageUrl: podcast.imageUrl,
    publishedAt: episode.publishedAt,
    durationSeconds: episode.durationSeconds,
    narrativeText: episode.clips[0].narrativeText!,
    topicTags: episode.topicTags,
    categoryName: podcastCategory?.category?.name,
    categorySlug: podcastCategory?.category?.slug,
  });

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
  });
});

// ── Show page ──
publicPages.get("/:showSlug", async (c) => {
  const { showSlug } = c.req.param();
  const prisma = c.get("prisma") as any;

  const podcast = await prisma.podcast.findUnique({
    where: { slug: showSlug },
    select: { id: true, title: true, slug: true, description: true, imageUrl: true, episodeCount: true },
  });
  if (!podcast) return c.notFound();

  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id, publicPage: true, slug: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { title: true, slug: true, publishedAt: true },
  });

  if (episodes.length === 0) return c.notFound();

  const podcastCategory = await prisma.podcastCategory.findFirst({
    where: { podcastId: podcast.id },
    select: { category: { select: { name: true, slug: true } } },
  });

  const html = renderShowPage({
    podcastTitle: podcast.title,
    podcastSlug: podcast.slug!,
    podcastDescription: podcast.description,
    podcastImageUrl: podcast.imageUrl,
    episodeCount: episodes.length,
    episodes,
    categoryName: podcastCategory?.category?.name,
    categorySlug: podcastCategory?.category?.slug,
  });

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=1800",
  });
});

// ── Category page ──
publicPages.get("/category/:categorySlug", async (c) => {
  const { categorySlug } = c.req.param();
  const prisma = c.get("prisma") as any;

  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    select: { id: true, name: true, slug: true },
  });
  if (!category) return c.notFound();

  // Get podcasts in this category that have public pages
  const podcastCategories = await prisma.podcastCategory.findMany({
    where: { categoryId: category.id },
    select: {
      podcast: {
        select: {
          title: true,
          slug: true,
          description: true,
          imageUrl: true,
          _count: { select: { episodes: { where: { publicPage: true } } } },
        },
      },
    },
  });

  const podcasts = podcastCategories
    .map((pc: any) => ({
      title: pc.podcast.title,
      slug: pc.podcast.slug,
      description: pc.podcast.description,
      imageUrl: pc.podcast.imageUrl,
      episodeCount: pc.podcast._count.episodes,
    }))
    .filter((p: any) => p.slug && p.episodeCount > 0)
    .sort((a: any, b: any) => b.episodeCount - a.episodeCount);

  if (podcasts.length === 0) return c.notFound();

  const html = renderCategoryPage({
    categoryName: category.name,
    categorySlug: category.slug!,
    podcasts,
  });

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=1800",
  });
});

export { publicPages };
