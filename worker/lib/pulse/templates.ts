/**
 * SSR templates for the Pulse blog (Phase 4).
 *
 * Modeled after `worker/lib/html-templates.ts` (the /p/* SSR templates):
 * vanilla template strings, no React, JSON-LD emitted inline. The shared
 * `pulseLayout` matches the Blipp dark visual treatment so /pulse/* and
 * /p/* feel like one site.
 */

import { renderMarkdown } from "./markdown";

const SITE_URL = "https://podblipp.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function pulseLayout(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object;
  body: string;
  adsScript?: string;
  /** Pulse pages are indexable by default. Set true to add noindex. */
  noindex?: boolean;
}) {
  const canonical = `${SITE_URL}${opts.canonicalPath}`;
  const ogImage = opts.ogImage || DEFAULT_OG_IMAGE;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" href="/blipp-icon-transparent-192.png">
${opts.noindex ? '<meta name="robots" content="noindex, follow">' : ""}
<meta property="og:type" content="${opts.ogType || "article"}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:site_name" content="Blipp Pulse">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(opts.description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>` : ""}
${opts.adsScript ?? ""}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#09090b;color:#fafafa;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:760px;margin:0 auto;padding:2rem 1.5rem}
.container--wide{max-width:960px}
header{border-bottom:1px solid #27272a;padding:1rem 1.5rem}
header .inner{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem}
header a.logo{color:#fafafa;font-weight:700;font-size:1.125rem}
header a.logo:hover{text-decoration:none}
header .pulse-tag{color:#a1a1aa;font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;margin-left:.5rem}
.cta-btn{display:inline-block;background:#818cf8;color:#fff;padding:.625rem 1.5rem;border-radius:.5rem;font-weight:600;font-size:.875rem;transition:background .15s}
.cta-btn:hover{background:#6366f1;text-decoration:none}
footer{border-top:1px solid #27272a;padding:2rem 1.5rem;text-align:center;color:#71717a;font-size:.8125rem;margin-top:4rem}
h1{font-size:2.25rem;font-weight:700;line-height:1.15;margin-bottom:.75rem}
h2{font-size:1.375rem;font-weight:600;margin:2rem 0 .75rem;color:#e4e4e7}
h3{font-size:1.125rem;font-weight:600;margin:1.5rem 0 .5rem;color:#e4e4e7}
p{font-size:1.0625rem;line-height:1.85;color:#d4d4d8;margin-bottom:1.25rem}
p:last-child{margin-bottom:0}
ul,ol{margin:0 0 1.25rem 1.5rem;color:#d4d4d8}
li{margin-bottom:.375rem;line-height:1.7}
blockquote{border-left:3px solid #3f3f46;padding-left:1rem;margin:1.25rem 0;color:#a1a1aa;font-style:italic}
blockquote p{font-size:1rem;margin-bottom:.5rem}
hr{border:0;border-top:1px solid #27272a;margin:2rem 0}
code{background:#18181b;color:#e4e4e7;padding:.1rem .35rem;border-radius:.25rem;font-family:ui-monospace,monospace;font-size:.875em}
.subtitle{color:#a1a1aa;font-size:1.125rem;line-height:1.5;margin-bottom:1.5rem}
.byline{display:flex;align-items:center;gap:.75rem;margin-bottom:2rem;color:#a1a1aa;font-size:.875rem}
.byline img{width:32px;height:32px;border-radius:9999px;object-fit:cover}
.byline a{color:#e4e4e7;font-weight:500}
.tag{display:inline-block;background:#27272a;color:#a1a1aa;padding:.25rem .75rem;border-radius:9999px;font-size:.75rem;margin:.25rem .25rem .25rem 0}
.hero-image{width:100%;border-radius:.75rem;margin-bottom:1.5rem}
.sources{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #27272a}
.sources h2{margin-top:0}
.sources ul{margin-left:0;list-style:none}
.sources li{margin-bottom:.75rem;padding-left:0}
.post-card{display:block;background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1.5rem;transition:border-color .15s;margin-bottom:1rem}
.post-card:hover{border-color:#3f3f46;text-decoration:none}
.post-card h3{margin:0 0 .375rem;color:#fafafa}
.post-card p{font-size:.9375rem;color:#a1a1aa;margin:0}
.post-card .post-meta{font-size:.75rem;color:#71717a;margin-top:.75rem}
.editor-card{display:flex;gap:1rem;align-items:center;background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1.25rem;margin-bottom:2rem}
.editor-card img{width:64px;height:64px;border-radius:9999px;object-fit:cover}
.editor-card h2{margin:0 0 .25rem;font-size:1.125rem}
.editor-card p{font-size:.875rem;margin:0;color:#a1a1aa}
.breadcrumb{font-size:.8125rem;color:#71717a;margin-bottom:1.5rem}
.breadcrumb a{color:#71717a}.breadcrumb a:hover{color:#a1a1aa}
.empty-state{text-align:center;padding:4rem 1rem;color:#71717a}
</style>
</head>
<body>
<header><div class="inner"><a href="/" class="logo">Blipp<span class="pulse-tag">Pulse</span></a><a href="/sign-up" class="cta-btn">Try Blipp Free</a></div></header>
${opts.body}
<footer><div class="container">&copy; ${new Date().getFullYear()} Blipp Pulse · <a href="/">Home</a> · <a href="/pulse">All posts</a> · <a href="/p">Blipp catalog</a></div></footer>
</body>
</html>`;
}

// ── Editor display helper ─────────────────────────────────────────────

interface EditorRef {
  slug: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  twitterHandle?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
}

function editorByline(e: EditorRef): string {
  const handleHtml = e.twitterHandle
    ? ` · <a href="https://twitter.com/${escapeHtml(e.twitterHandle)}" rel="noopener">@${escapeHtml(e.twitterHandle)}</a>`
    : "";
  return `<div class="byline">
${e.avatarUrl ? `<img src="${escapeHtml(e.avatarUrl)}" alt="${escapeHtml(e.name)}" />` : ""}
<div>By <a href="/pulse/by/${escapeHtml(e.slug)}">${escapeHtml(e.name)}</a>${handleHtml}</div>
</div>`;
}

// ── Pulse post page ───────────────────────────────────────────────────

export interface PulsePostPageData {
  slug: string;
  title: string;
  subtitle?: string | null;
  body: string;
  /** Required at publish time; routes return 500 when absent for a PUBLISHED post. */
  sourcesMarkdown: string;
  topicTags?: string[];
  heroImageUrl?: string | null;
  publishedAt: Date | null;
  editor: EditorRef;
  wordCount?: number | null;
  /** Cited episodes used in JSON-LD `mentions[]`. */
  citedEpisodes?: { showSlug: string; episodeSlug: string; title: string; showTitle: string }[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  adsScript?: string;
}

export function renderPulsePost(data: PulsePostPageData): string {
  const title = data.seoTitle || data.title;
  // Description: explicit SEO override > subtitle > first paragraph excerpt > generic
  const fallbackDescription =
    data.subtitle ||
    data.body
      .replace(/^#+ .*$/gm, "")
      .replace(/[*_`>-]/g, "")
      .trim()
      .slice(0, 200);
  const description = data.seoDescription || fallbackDescription;
  const canonicalPath = `/pulse/${data.slug}`;
  const ogImage = data.heroImageUrl || DEFAULT_OG_IMAGE;
  const datePublished = data.publishedAt
    ? new Date(data.publishedAt).toISOString()
    : null;

  // ── JSON-LD ──
  const editorPersonNode: Record<string, unknown> = {
    "@type": "Person",
    name: data.editor.name,
    url: `${SITE_URL}/pulse/by/${data.editor.slug}`,
  };
  const sameAs: string[] = [];
  if (data.editor.twitterHandle) {
    sameAs.push(`https://twitter.com/${data.editor.twitterHandle}`);
  }
  if (data.editor.linkedinUrl) sameAs.push(data.editor.linkedinUrl);
  if (data.editor.websiteUrl) sameAs.push(data.editor.websiteUrl);
  if (sameAs.length > 0) editorPersonNode.sameAs = sameAs;

  const blogPostingNode: Record<string, unknown> = {
    "@type": "BlogPosting",
    headline: data.title,
    description,
    author: editorPersonNode,
    publisher: {
      "@type": "Organization",
      name: "Blipp Pulse",
      url: `${SITE_URL}/pulse`,
    },
    mainEntityOfPage: `${SITE_URL}${canonicalPath}`,
    image: ogImage,
  };
  if (datePublished) {
    blogPostingNode.datePublished = datePublished;
    blogPostingNode.dateModified = datePublished;
  }
  if (data.topicTags?.length) {
    blogPostingNode.keywords = data.topicTags.join(", ");
    blogPostingNode.articleSection = data.topicTags[0];
  }
  if (data.wordCount) blogPostingNode.wordCount = data.wordCount;
  if (data.citedEpisodes?.length) {
    blogPostingNode.mentions = data.citedEpisodes.map((ep) => ({
      "@type": "PodcastEpisode",
      name: ep.title,
      url: `${SITE_URL}/p/${ep.showSlug}/${ep.episodeSlug}`,
      partOfSeries: {
        "@type": "PodcastSeries",
        name: ep.showTitle,
        url: `${SITE_URL}/p/${ep.showSlug}`,
      },
    }));
  }

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Pulse", item: `${SITE_URL}/pulse` },
      { "@type": "ListItem", position: 3, name: data.title, item: `${SITE_URL}${canonicalPath}` },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [blogPostingNode, breadcrumb],
  };

  // ── Body sections ──
  const bodyHtml = renderMarkdown(data.body);
  const sourcesHtml = `<section class="sources">
<h2>Sources</h2>
${renderMarkdown(data.sourcesMarkdown)}
</section>`;

  const tagsHtml = data.topicTags?.length
    ? `<div style="margin-bottom:1.5rem">${data.topicTags
        .slice(0, 8)
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("")}</div>`
    : "";

  const breadcrumbNav = `<nav class="breadcrumb"><a href="/">Home</a> / <a href="/pulse">Pulse</a> / ${escapeHtml(data.title)}</nav>`;

  return pulseLayout({
    title,
    description: description.slice(0, 160),
    canonicalPath,
    ogImage,
    jsonLd,
    adsScript: data.adsScript,
    body: `<main class="container">
${breadcrumbNav}
<h1>${escapeHtml(data.title)}</h1>
${data.subtitle ? `<p class="subtitle">${escapeHtml(data.subtitle)}</p>` : ""}
${editorByline(data.editor)}
${data.heroImageUrl ? `<img src="${escapeHtml(data.heroImageUrl)}" alt="" class="hero-image" />` : ""}
${tagsHtml}
${data.publishedAt ? `<div class="byline" style="margin-top:-1rem">Published ${formatDate(data.publishedAt)}</div>` : ""}
<article>${bodyHtml}</article>
${sourcesHtml}
</main>`,
  });
}

// ── Pulse index page ──────────────────────────────────────────────────

interface PulseIndexEntry {
  slug: string;
  title: string;
  subtitle?: string | null;
  publishedAt: Date | null;
  editor: { slug: string; name: string };
  topicTags?: string[];
  wordCount?: number | null;
}

export interface PulseIndexPageData {
  posts: PulseIndexEntry[];
  page: number;
  totalPages: number;
  adsScript?: string;
}

function renderPostCard(p: PulseIndexEntry): string {
  const date = formatDate(p.publishedAt);
  const readingMinutes = p.wordCount ? Math.max(1, Math.round(p.wordCount / 220)) : null;
  const meta = [date, `By ${p.editor.name}`, readingMinutes ? `${readingMinutes} min read` : null]
    .filter(Boolean)
    .join(" · ");
  return `<a href="/pulse/${escapeHtml(p.slug)}" class="post-card">
<h3>${escapeHtml(p.title)}</h3>
${p.subtitle ? `<p>${escapeHtml(p.subtitle)}</p>` : ""}
<div class="post-meta">${escapeHtml(meta)}</div>
</a>`;
}

export function renderPulseIndex(data: PulseIndexPageData): string {
  const description =
    "Pulse is Blipp's editorial — synthesis and commentary across the podcasts we summarize. Long-form analysis, never auto-published.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blipp Pulse",
    url: `${SITE_URL}/pulse`,
    description,
    blogPost: data.posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/pulse/${p.slug}`,
      datePublished: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined,
      author: { "@type": "Person", name: p.editor.name },
    })),
  };

  const cards =
    data.posts.length > 0
      ? data.posts.map(renderPostCard).join("\n")
      : `<div class="empty-state"><p>No posts yet — check back soon.</p></div>`;

  const pagination =
    data.totalPages > 1
      ? `<nav style="text-align:center;margin-top:2rem;color:#a1a1aa;font-size:.875rem">
${data.page > 1 ? `<a href="/pulse?page=${data.page - 1}" style="margin-right:1rem">← Newer</a>` : ""}
Page ${data.page} of ${data.totalPages}
${data.page < data.totalPages ? `<a href="/pulse?page=${data.page + 1}" style="margin-left:1rem">Older →</a>` : ""}
</nav>`
      : "";

  return pulseLayout({
    title: "Pulse — Blipp's editorial blog",
    description,
    canonicalPath: "/pulse",
    ogType: "website",
    jsonLd,
    adsScript: data.adsScript,
    body: `<main class="container container--wide">
<nav class="breadcrumb"><a href="/">Home</a> / Pulse</nav>
<h1>Pulse</h1>
<p class="subtitle">Editorial commentary and cross-episode analysis from the Blipp catalog.</p>
${cards}
${pagination}
</main>`,
  });
}

// ── Editor archive page ───────────────────────────────────────────────

export interface PulseEditorPageData {
  editor: EditorRef & { expertiseAreas?: string[] };
  posts: PulseIndexEntry[];
  adsScript?: string;
}

export function renderPulseEditor(data: PulseEditorPageData): string {
  const e = data.editor;
  const description =
    e.bio ||
    `Posts by ${e.name} on Blipp Pulse${
      e.expertiseAreas?.length ? `, covering ${e.expertiseAreas.join(", ")}` : ""
    }.`;

  const sameAs: string[] = [];
  if (e.twitterHandle) sameAs.push(`https://twitter.com/${e.twitterHandle}`);
  if (e.linkedinUrl) sameAs.push(e.linkedinUrl);
  if (e.websiteUrl) sameAs.push(e.websiteUrl);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: e.name,
    url: `${SITE_URL}/pulse/by/${e.slug}`,
    description: e.bio || undefined,
    image: e.avatarUrl || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };

  return pulseLayout({
    title: `${e.name} — Blipp Pulse`,
    description: description.slice(0, 160),
    canonicalPath: `/pulse/by/${e.slug}`,
    ogImage: e.avatarUrl || undefined,
    ogType: "profile",
    jsonLd,
    adsScript: data.adsScript,
    body: `<main class="container container--wide">
<nav class="breadcrumb"><a href="/">Home</a> / <a href="/pulse">Pulse</a> / ${escapeHtml(e.name)}</nav>
<div class="editor-card">
${e.avatarUrl ? `<img src="${escapeHtml(e.avatarUrl)}" alt="${escapeHtml(e.name)}" />` : ""}
<div>
<h2>${escapeHtml(e.name)}</h2>
${e.bio ? `<p>${escapeHtml(e.bio.slice(0, 280))}</p>` : ""}
${
  sameAs.length
    ? `<p style="margin-top:.5rem">${sameAs
        .map(
          (u) =>
            `<a href="${escapeHtml(u)}" rel="noopener" style="margin-right:.75rem">${escapeHtml(
              u.replace(/^https?:\/\//, "")
            )}</a>`
        )
        .join("")}</p>`
    : ""
}
</div>
</div>
<h2>Posts</h2>
${
  data.posts.length > 0
    ? data.posts.map(renderPostCard).join("\n")
    : `<div class="empty-state"><p>No posts yet.</p></div>`
}
</main>`,
  });
}

// ── Topic archive page ────────────────────────────────────────────────

export interface PulseTopicPageData {
  topicSlug: string;
  topicLabel: string;
  posts: PulseIndexEntry[];
  adsScript?: string;
}

export function renderPulseTopic(data: PulseTopicPageData): string {
  const description = `Pulse posts tagged "${data.topicLabel}". Cross-episode synthesis and commentary from Blipp.`;
  return pulseLayout({
    title: `${data.topicLabel} — Pulse`,
    description,
    canonicalPath: `/pulse/topic/${data.topicSlug}`,
    ogType: "website",
    adsScript: data.adsScript,
    body: `<main class="container container--wide">
<nav class="breadcrumb"><a href="/">Home</a> / <a href="/pulse">Pulse</a> / ${escapeHtml(data.topicLabel)}</nav>
<h1>${escapeHtml(data.topicLabel)}</h1>
<p class="subtitle">${data.posts.length} post${data.posts.length === 1 ? "" : "s"}.</p>
${
  data.posts.length > 0
    ? data.posts.map(renderPostCard).join("\n")
    : `<div class="empty-state"><p>No posts yet.</p></div>`
}
</main>`,
  });
}
