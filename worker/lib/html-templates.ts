/**
 * Server-rendered HTML templates for public Blipp pages (SEO).
 * No React — plain template strings for minimal overhead.
 */

const SITE_URL = "https://podblipp.com";

// ── Shared layout ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string;
  jsonLd?: object;
  body: string;
}) {
  const canonical = `${SITE_URL}${opts.canonicalPath}`;
  const ogImage = opts.ogImage || `${SITE_URL}/og-default.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" href="/blipp_icon_clean_128.png">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:site_name" content="Blipp">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(opts.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>` : ""}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#09090b;color:#fafafa;line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:768px;margin:0 auto;padding:2rem 1.5rem}
header{border-bottom:1px solid #27272a;padding:1rem 1.5rem}
header .inner{max-width:768px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
header a.logo{color:#fafafa;font-weight:700;font-size:1.25rem}
header a.logo:hover{text-decoration:none}
.cta-btn{display:inline-block;background:#818cf8;color:#fff;padding:.625rem 1.5rem;border-radius:.5rem;font-weight:600;font-size:.875rem;transition:background .15s}
.cta-btn:hover{background:#6366f1;text-decoration:none}
footer{border-top:1px solid #27272a;padding:2rem 1.5rem;text-align:center;color:#71717a;font-size:.8125rem;margin-top:4rem}
h1{font-size:2rem;font-weight:700;line-height:1.2;margin-bottom:.5rem}
h2{font-size:1.25rem;font-weight:600;margin:2rem 0 .75rem;color:#e4e4e7}
.meta{color:#a1a1aa;font-size:.875rem;margin-bottom:1.5rem}
.tag{display:inline-block;background:#27272a;color:#a1a1aa;padding:.25rem .75rem;border-radius:9999px;font-size:.75rem;margin:.25rem .25rem .25rem 0}
.narrative{font-size:1.0625rem;line-height:1.85;color:#d4d4d8}
.narrative p{margin-bottom:1.25rem}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;margin-top:1.5rem}
.card{background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1.25rem;transition:border-color .15s}
.card:hover{border-color:#3f3f46;text-decoration:none}
.card h3{font-size:1rem;font-weight:600;color:#fafafa;margin-bottom:.375rem}
.card p{font-size:.8125rem;color:#a1a1aa;line-height:1.5}
.breadcrumb{font-size:.8125rem;color:#71717a;margin-bottom:1.5rem}
.breadcrumb a{color:#71717a}.breadcrumb a:hover{color:#a1a1aa}
</style>
</head>
<body>
<header><div class="inner"><a href="/" class="logo">Blipp</a><a href="/sign-up" class="cta-btn">Try Blipp Free</a></div></header>
${opts.body}
<footer><div class="container">&copy; ${new Date().getFullYear()} Blipp &mdash; All Your Podcasts in a Blipp. <a href="/">Home</a> · <a href="/p">Browse</a></div></footer>
</body>
</html>`;
}

// ── Episode page ──

export interface EpisodePageData {
  episodeTitle: string;
  episodeSlug: string;
  podcastTitle: string;
  podcastSlug: string;
  podcastImageUrl?: string | null;
  publishedAt?: Date | null;
  durationSeconds?: number | null;
  narrativeText: string;
  topicTags?: string[];
  categoryName?: string | null;
  categorySlug?: string | null;
}

export function renderEpisodePage(data: EpisodePageData): string {
  const published = data.publishedAt
    ? new Date(data.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const duration = data.durationSeconds
    ? `${Math.round(data.durationSeconds / 60)} min`
    : null;

  const description = data.narrativeText.slice(0, 160).replace(/\n/g, " ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: data.episodeTitle,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: data.podcastTitle,
      url: `${SITE_URL}/p/${data.podcastSlug}`,
    },
    ...(published && { datePublished: data.publishedAt!.toISOString().split("T")[0] }),
    description,
    ...(duration && { timeRequired: `PT${Math.round(data.durationSeconds! / 60)}M` }),
  };

  // Convert narrative text paragraphs to HTML
  const narrativeHtml = data.narrativeText
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("\n");

  const tags = (data.topicTags || [])
    .slice(0, 10)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  const breadcrumb = `<nav class="breadcrumb"><a href="/">Home</a> / <a href="/p/${escapeHtml(data.podcastSlug)}">${escapeHtml(data.podcastTitle)}</a> / ${escapeHtml(data.episodeTitle)}</nav>`;

  return layout({
    title: `${data.episodeTitle} — ${data.podcastTitle} | Blipp Summary`,
    description,
    canonicalPath: `/p/${data.podcastSlug}/${data.episodeSlug}`,
    ogImage: data.podcastImageUrl || undefined,
    jsonLd,
    body: `<main class="container">
${breadcrumb}
<h1>${escapeHtml(data.episodeTitle)}</h1>
<div class="meta">${escapeHtml(data.podcastTitle)}${published ? ` · ${published}` : ""}${duration ? ` · ${duration} episode` : ""}</div>
${tags ? `<div style="margin-bottom:1.5rem">${tags}</div>` : ""}
<div class="narrative">${narrativeHtml}</div>
<div style="margin-top:2.5rem;padding:1.5rem;background:#18181b;border-radius:.75rem;text-align:center">
<p style="color:#e4e4e7;margin-bottom:.75rem;font-weight:500">Listen to the AI-narrated summary on Blipp</p>
<a href="/sign-up" class="cta-btn">Get Blipp Free</a>
</div>
</main>`,
  });
}

// ── Show page ──

export interface ShowPageData {
  podcastTitle: string;
  podcastSlug: string;
  podcastDescription?: string | null;
  podcastImageUrl?: string | null;
  episodeCount: number;
  episodes: { title: string; slug: string; publishedAt?: Date | null }[];
  categoryName?: string | null;
  categorySlug?: string | null;
}

export function renderShowPage(data: ShowPageData): string {
  const description =
    data.podcastDescription?.slice(0, 160) ||
    `${data.podcastTitle} podcast summaries on Blipp — ${data.episodeCount} episodes available.`;

  const episodeCards = data.episodes
    .map((ep) => {
      const date = ep.publishedAt
        ? new Date(ep.publishedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
      return `<a href="/p/${escapeHtml(data.podcastSlug)}/${escapeHtml(ep.slug)}" class="card"><h3>${escapeHtml(ep.title)}</h3><p>${date}</p></a>`;
    })
    .join("\n");

  const breadcrumb = `<nav class="breadcrumb"><a href="/">Home</a>${data.categorySlug ? ` / <a href="/p/category/${escapeHtml(data.categorySlug)}">${escapeHtml(data.categoryName || "Category")}</a>` : ""} / ${escapeHtml(data.podcastTitle)}</nav>`;

  return layout({
    title: `${data.podcastTitle} — Podcast Summaries | Blipp`,
    description,
    canonicalPath: `/p/${data.podcastSlug}`,
    ogImage: data.podcastImageUrl || undefined,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "PodcastSeries",
      name: data.podcastTitle,
      description,
      url: `${SITE_URL}/p/${data.podcastSlug}`,
    },
    body: `<main class="container">
${breadcrumb}
<h1>${escapeHtml(data.podcastTitle)}</h1>
<div class="meta">${data.episodeCount} episode summaries</div>
${data.podcastDescription ? `<p style="color:#a1a1aa;margin-bottom:1.5rem">${escapeHtml(data.podcastDescription.slice(0, 500))}</p>` : ""}
<h2>Episodes</h2>
<div class="card-grid">${episodeCards}</div>
<div style="margin-top:2.5rem;text-align:center"><a href="/sign-up" class="cta-btn">Listen on Blipp</a></div>
</main>`,
  });
}

// ── Category page ──

export interface CategoryPageData {
  categoryName: string;
  categorySlug: string;
  podcasts: {
    title: string;
    slug: string;
    description?: string | null;
    imageUrl?: string | null;
    episodeCount: number;
  }[];
}

export function renderCategoryPage(data: CategoryPageData): string {
  const description = `Browse ${data.categoryName} podcast summaries on Blipp. ${data.podcasts.length} shows available.`;

  const podcastCards = data.podcasts
    .map(
      (p) =>
        `<a href="/p/${escapeHtml(p.slug)}" class="card"><h3>${escapeHtml(p.title)}</h3><p>${p.episodeCount} summaries${p.description ? ` · ${escapeHtml(p.description.slice(0, 80))}` : ""}</p></a>`
    )
    .join("\n");

  return layout({
    title: `${data.categoryName} Podcasts — Summaries | Blipp`,
    description,
    canonicalPath: `/p/category/${data.categorySlug}`,
    body: `<main class="container">
<nav class="breadcrumb"><a href="/">Home</a> / <a href="/p">Browse</a> / ${escapeHtml(data.categoryName)}</nav>
<h1>${escapeHtml(data.categoryName)} Podcasts</h1>
<div class="meta">${data.podcasts.length} shows</div>
<div class="card-grid">${podcastCards}</div>
<div style="margin-top:2.5rem;text-align:center"><a href="/sign-up" class="cta-btn">Try Blipp Free</a></div>
</main>`,
  });
}
