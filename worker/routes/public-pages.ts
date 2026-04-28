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
import { scoreClaim } from "../lib/distillation";
import type { Env } from "../types";

const publicPages = new Hono<{ Bindings: Env }>();

// Prisma middleware for DB access
publicPages.use("/*", prismaMiddleware);

/** Pick the top N claims from a raw `claimsJson` blob, ranked by `scoreClaim`. */
function pickTopClaims(
  claimsJson: unknown,
  n: number
): { text: string; topic?: string }[] {
  if (!Array.isArray(claimsJson)) return [];

  const validated = claimsJson
    .map((raw: any, idx: number) => {
      if (!raw || typeof raw !== "object") return null;
      const text =
        typeof raw.claim === "string"
          ? raw.claim
          : typeof raw.text === "string"
          ? raw.text
          : "";
      if (!text) return null;
      const importance = typeof raw.importance === "number" ? raw.importance : null;
      const novelty = typeof raw.novelty === "number" ? raw.novelty : null;
      return {
        text,
        topic: typeof raw.topic === "string" ? raw.topic : undefined,
        importance,
        novelty,
        idx,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (validated.length === 0) return [];

  // Score where both importance and novelty are present; otherwise fall back
  // to position order (claim 0 first, etc.) for that claim.
  const sorted = [...validated].sort((a, b) => {
    const aHasScore = a.importance !== null && a.novelty !== null;
    const bHasScore = b.importance !== null && b.novelty !== null;
    if (aHasScore && bHasScore) {
      return (
        scoreClaim({ importance: b.importance!, novelty: b.novelty! }) -
        scoreClaim({ importance: a.importance!, novelty: a.novelty! })
      );
    }
    if (aHasScore) return -1;
    if (bHasScore) return 1;
    return a.idx - b.idx;
  });

  return sorted.slice(0, n).map((c) => ({ text: c.text, topic: c.topic }));
}

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
      description: true,
      publishedAt: true,
      durationSeconds: true,
      topicTags: true,
      clips: {
        where: { status: "COMPLETED", narrativeText: { not: null } },
        orderBy: { durationTier: "desc" },
        take: 1,
        select: { narrativeText: true, audioUrl: true },
      },
      distillation: {
        select: { claimsJson: true, status: true },
      },
    },
  });
  if (!episode) return c.notFound();

  // Phase 2.3: pass the longest available clip's audio URL through to the
  // SSR template so the page can render an inline tap-to-play sample.
  const sampleAudioUrl = episode.clips[0]?.audioUrl ?? null;

  // Use clip narrative if available, else summarize distillation claims, else episode description
  let pageText = episode.clips[0]?.narrativeText;
  if (!pageText && episode.distillation?.status === "COMPLETED" && episode.distillation.claimsJson) {
    const claims = episode.distillation.claimsJson as any[];
    pageText = claims
      .slice(0, 20)
      .map((claim: any) => typeof claim === "string" ? claim : claim.text || claim.claim || "")
      .filter(Boolean)
      .join("\n\n");
  }
  if (!pageText) pageText = episode.description || "";
  if (!pageText) return c.notFound();

  // Top-3 claims for the "Top takeaways" section. Only when distillation
  // produced structured claims — fallback paths (description-only) get no claims.
  const topClaims =
    episode.distillation?.status === "COMPLETED"
      ? pickTopClaims(episode.distillation.claimsJson, 3)
      : [];

  // Find first category for this podcast
  const podcastCategory = await prisma.podcastCategory.findFirst({
    where: { podcastId: podcast.id },
    select: { category: { select: { id: true, name: true, slug: true } } },
  });

  // "More from this show" — up to 5 most-recent siblings
  const moreFromShow = await prisma.episode.findMany({
    where: {
      podcastId: podcast.id,
      publicPage: true,
      slug: { not: episode.slug },
    },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, slug: true, publishedAt: true },
  });

  // "Related in [category]" — up to 3 other shows in the same category
  // that have at least one public episode.
  let relatedInCategory: { title: string; slug: string; imageUrl?: string | null }[] = [];
  if (podcastCategory?.category?.id) {
    const related = await prisma.podcastCategory.findMany({
      where: {
        categoryId: podcastCategory.category.id,
        podcastId: { not: podcast.id },
      },
      select: {
        podcast: {
          select: {
            title: true,
            slug: true,
            imageUrl: true,
            _count: { select: { episodes: { where: { publicPage: true } } } },
          },
        },
      },
      take: 30,
    });
    relatedInCategory = related
      .map((pc: any) => pc.podcast)
      .filter((p: any) => p?.slug && p?._count?.episodes > 0)
      .slice(0, 3)
      .map((p: any) => ({
        title: p.title,
        slug: p.slug,
        imageUrl: p.imageUrl,
      }));
  }

  const signupNextPath = `/p/${podcast.slug}/${episode.slug}`;

  const html = renderEpisodePage({
    episodeTitle: episode.title,
    episodeSlug: episode.slug!,
    podcastTitle: podcast.title,
    podcastSlug: podcast.slug!,
    podcastImageUrl: podcast.imageUrl,
    publishedAt: episode.publishedAt,
    durationSeconds: episode.durationSeconds,
    narrativeText: pageText,
    topicTags: episode.topicTags,
    categoryName: podcastCategory?.category?.name,
    categorySlug: podcastCategory?.category?.slug,
    topClaims,
    moreFromShow: moreFromShow.map((ep: any) => ({
      title: ep.title,
      slug: ep.slug,
      publishedAt: ep.publishedAt,
    })),
    relatedInCategory,
    signupNextPath,
    sampleAudioUrl,
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
