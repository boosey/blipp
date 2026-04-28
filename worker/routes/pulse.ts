/**
 * Public Pulse blog (Phase 4) — server-rendered HTML at `/pulse/*`.
 *
 * Hard editorial rules from Phase 4.0 enforced at the route layer:
 *   - Only `PUBLISHED` posts are surfaced. Anything DRAFT/REVIEW/SCHEDULED/
 *     ARCHIVED is invisible to the public.
 *   - A PUBLISHED post must have a non-empty `sourcesMarkdown` (Sources
 *     footer is required). Misconfigured rows respond with 500, which is
 *     louder than silently dropping the section.
 *   - The author is always a real `PulseEditor` (FK NOT NULL); we surface
 *     their `sameAs` links in JSON-LD for E-E-A-T.
 *
 * No auth needed. SSR via Hono + the `lib/pulse/templates.ts` helpers.
 */
import { Hono } from "hono";
import { prismaMiddleware } from "../middleware/prisma";
import {
  renderPulseIndex,
  renderPulsePost,
  renderPulseEditor,
  renderPulseTopic,
} from "../lib/pulse/templates";
import { adsScriptTag } from "../lib/ads";
import type { Env } from "../types";

const pulse = new Hono<{ Bindings: Env }>();

pulse.use("/*", prismaMiddleware);

const PAGE_SIZE = 10;

interface IndexRow {
  slug: string;
  title: string;
  subtitle: string | null;
  publishedAt: Date | null;
  wordCount: number | null;
  topicTags: string[];
  editor: { slug: string; name: string };
}

function rowToIndexEntry(row: any): IndexRow {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? null,
    publishedAt: row.publishedAt ?? null,
    wordCount: row.wordCount ?? null,
    topicTags: row.topicTags ?? [],
    editor: { slug: row.editor.slug, name: row.editor.name },
  };
}

// ── /pulse — index ────────────────────────────────────────────────────
pulse.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [posts, total] = await Promise.all([
    prisma.pulsePost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        slug: true,
        title: true,
        subtitle: true,
        publishedAt: true,
        wordCount: true,
        topicTags: true,
        editor: { select: { slug: true, name: true } },
      },
    }),
    prisma.pulsePost.count({ where: { status: "PUBLISHED" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const html = renderPulseIndex({
    posts: posts.map(rowToIndexEntry),
    page,
    totalPages,
    adsScript: adsScriptTag(c.env, c.req.path),
  });
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600",
  });
});

// ── /pulse/by/:editorSlug — author archive ────────────────────────────
//
// Defined BEFORE the catch-all `/:slug` so /pulse/by/foo doesn't get
// interpreted as a post titled "by".
pulse.get("/by/:editorSlug", async (c) => {
  const prisma = c.get("prisma") as any;
  const editorSlug = c.req.param("editorSlug");

  const editor = await prisma.pulseEditor.findUnique({
    where: { slug: editorSlug },
    select: {
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
      twitterHandle: true,
      linkedinUrl: true,
      websiteUrl: true,
      expertiseAreas: true,
      status: true,
    },
  });
  // Don't reveal NOT_READY editor profiles publicly. Only READY/RETIRED.
  if (!editor || editor.status === "NOT_READY") return c.notFound();

  const posts = await prisma.pulsePost.findMany({
    where: { editor: { slug: editorSlug }, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      subtitle: true,
      publishedAt: true,
      wordCount: true,
      topicTags: true,
      editor: { select: { slug: true, name: true } },
    },
  });

  const html = renderPulseEditor({
    editor: {
      slug: editor.slug,
      name: editor.name,
      bio: editor.bio,
      avatarUrl: editor.avatarUrl,
      twitterHandle: editor.twitterHandle,
      linkedinUrl: editor.linkedinUrl,
      websiteUrl: editor.websiteUrl,
      expertiseAreas: editor.expertiseAreas,
    },
    posts: posts.map(rowToIndexEntry),
    adsScript: adsScriptTag(c.env, c.req.path),
  });
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600",
  });
});

// ── /pulse/topic/:topicSlug — topic archive ───────────────────────────
//
// Topic tags are stored as free-form strings on PulsePost.topicTags. The
// `:topicSlug` URL segment is the tag value lowercased and dash-joined;
// we slugify the stored tag at compare time (no migration needed).
pulse.get("/topic/:topicSlug", async (c) => {
  const prisma = c.get("prisma") as any;
  const topicSlug = c.req.param("topicSlug").toLowerCase();

  // Pull all published posts and filter in-memory by slugified tag match.
  // At Pulse v1 traffic this is fine; if it becomes a hotspot, move to a
  // normalized topic table.
  const posts = await prisma.pulsePost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: {
      slug: true,
      title: true,
      subtitle: true,
      publishedAt: true,
      wordCount: true,
      topicTags: true,
      editor: { select: { slug: true, name: true } },
    },
  });

  const slugify = (t: string) =>
    t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const matched = posts.filter((p: any) =>
    (p.topicTags ?? []).some((t: string) => slugify(t) === topicSlug)
  );

  if (matched.length === 0) return c.notFound();

  // Use the first matched post's actual tag spelling for the page title.
  const topicLabel =
    (matched[0].topicTags ?? []).find((t: string) => slugify(t) === topicSlug) ??
    topicSlug;

  const html = renderPulseTopic({
    topicSlug,
    topicLabel,
    posts: matched.map(rowToIndexEntry),
    adsScript: adsScriptTag(c.env, c.req.path),
  });
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600",
  });
});

// ── /pulse/:slug — single post ────────────────────────────────────────
pulse.get("/:slug", async (c) => {
  const prisma = c.get("prisma") as any;
  const slug = c.req.param("slug");

  const post = await prisma.pulsePost.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      subtitle: true,
      body: true,
      sourcesMarkdown: true,
      status: true,
      heroImageUrl: true,
      topicTags: true,
      wordCount: true,
      publishedAt: true,
      seoTitle: true,
      seoDescription: true,
      editor: {
        select: {
          slug: true,
          name: true,
          bio: true,
          avatarUrl: true,
          twitterHandle: true,
          linkedinUrl: true,
          websiteUrl: true,
          status: true,
        },
      },
      episodes: {
        orderBy: { displayOrder: "asc" },
        select: {
          episode: {
            select: {
              slug: true,
              title: true,
              podcast: { select: { slug: true, title: true } },
            },
          },
        },
      },
    },
  });

  if (!post || post.status !== "PUBLISHED") return c.notFound();

  // Phase 4.0 enforcement: PUBLISHED posts MUST have a Sources footer
  // and MUST be authored by a READY editor. Misconfigured rows are a
  // server bug, not a user-visible 404.
  if (!post.sourcesMarkdown?.trim()) {
    throw new Error(`Pulse post ${slug} is PUBLISHED with empty sourcesMarkdown`);
  }
  if (post.editor.status === "NOT_READY") {
    throw new Error(`Pulse post ${slug} authored by NOT_READY editor`);
  }

  const citedEpisodes = (post.episodes ?? [])
    .filter((link: any) => link.episode?.podcast?.slug && link.episode?.slug)
    .map((link: any) => ({
      showSlug: link.episode.podcast.slug,
      episodeSlug: link.episode.slug,
      title: link.episode.title,
      showTitle: link.episode.podcast.title,
    }));

  const html = renderPulsePost({
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle,
    body: post.body,
    sourcesMarkdown: post.sourcesMarkdown,
    topicTags: post.topicTags,
    heroImageUrl: post.heroImageUrl,
    publishedAt: post.publishedAt,
    wordCount: post.wordCount,
    editor: {
      slug: post.editor.slug,
      name: post.editor.name,
      bio: post.editor.bio,
      avatarUrl: post.editor.avatarUrl,
      twitterHandle: post.editor.twitterHandle,
      linkedinUrl: post.editor.linkedinUrl,
      websiteUrl: post.editor.websiteUrl,
    },
    citedEpisodes,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    adsScript: adsScriptTag(c.env, c.req.path),
  });
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
  });
});

export { pulse };
