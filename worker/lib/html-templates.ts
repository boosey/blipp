/**
 * Server-rendered HTML templates for public Blipp pages (SEO).
 * No React — plain template strings for minimal overhead.
 */

const SITE_URL = "https://podblipp.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

// ── Shared layout ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Truncate text to ~150-200 words at the nearest sentence boundary, ending
 * with `…`. If no sentence boundary fits within the range, hard-cuts at 200.
 *
 * Note: the sentence-split heuristic mis-splits on abbreviations
 * ("Dr. Smith", "U.S."). Acceptable for podcast narratives — keep as is.
 */
export function truncateToWords(
  text: string,
  minWords = 150,
  maxWords = 200
): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const totalWords = cleaned.split(" ").length;
  if (totalWords <= maxWords) return cleaned;

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [cleaned];
  let out = "";
  let count = 0;

  for (const s of sentences) {
    const w = s.trim().split(/\s+/).length;
    if (count + w > maxWords) break;
    out += s;
    count += w;
    if (count >= minWords) break;
  }

  if (count < 1) {
    // No sentence fit — hard cut at maxWords
    out = cleaned.split(" ").slice(0, maxWords).join(" ");
  }

  return out.trim().replace(/[.!?]*$/, "") + "…";
}

function layout(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string;
  jsonLd?: object;
  body: string;
  /**
   * Optional AdSense script tag (already-rendered HTML string). The caller
   * computes whether ads are allowed for the path via `lib/ads.ts`; the
   * template just splats the result into <head>. Empty string = no ads.
   */
  adsScript?: string;
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
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:site_name" content="Blipp">
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
.takeaways{margin:1rem 0 0;padding-left:1.25rem;color:#d4d4d8}
.takeaways li{margin:.5rem 0;line-height:1.6}
.takeaways .takeaway-topic{display:inline-block;color:#a1a1aa;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;margin-right:.5rem}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;margin-top:1.5rem}
.card{background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1.25rem;transition:border-color .15s}
.card:hover{border-color:#3f3f46;text-decoration:none}
.card h3{font-size:1rem;font-weight:600;color:#fafafa;margin-bottom:.375rem}
.card p{font-size:.8125rem;color:#a1a1aa;line-height:1.5}
.breadcrumb{font-size:.8125rem;color:#71717a;margin-bottom:1.5rem}
.breadcrumb a{color:#71717a}.breadcrumb a:hover{color:#a1a1aa}
.signup-cta{margin-top:2.5rem;padding:1.5rem;background:#18181b;border:1px solid #27272a;border-radius:.75rem;text-align:center}
.signup-cta p{color:#e4e4e7;margin-bottom:.75rem;font-weight:500}
.sample-player{margin:1.5rem 0;padding:1rem;background:#18181b;border:1px solid #27272a;border-radius:.75rem}
.sample-player__row{display:flex;align-items:center;gap:.875rem}
.sample-player__play{flex-shrink:0;width:2.75rem;height:2.75rem;border-radius:9999px;background:#fafafa;color:#000;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:opacity .15s}
.sample-player__play:hover{opacity:.9}
.sample-player__play[data-state="loading"]{opacity:.6;cursor:progress}
.sample-player__icon{font-weight:700;line-height:1}
.sample-player__meta{flex:1;min-width:0}
.sample-player__label{color:#a1a1aa;font-size:.8125rem;margin-bottom:.5rem}
.sample-player__bar{width:100%;height:.25rem;background:#27272a;border-radius:9999px;overflow:hidden}
.sample-player__bar-fill{width:0%;height:100%;background:#fafafa;transition:width .2s linear}
.sample-player__cta{margin-top:.875rem;padding-top:.875rem;border-top:1px solid #27272a;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem}
.sample-player__cta p{color:#e4e4e7;font-size:.875rem;margin:0;flex:1;min-width:200px}
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
  /** The full narrative source — the template truncates this to ~150-200 words. */
  narrativeText: string;
  topicTags?: string[];
  categoryName?: string | null;
  categorySlug?: string | null;
  /** Top 3 claims ranked by `scoreClaim`. Empty array hides the takeaways section. */
  topClaims?: { text: string; topic?: string }[];
  /** Up to 5 most-recent sibling episodes from this show. */
  moreFromShow?: { title: string; slug: string; publishedAt?: Date | null }[];
  /** Up to 3 other shows in the same category that have public episodes. */
  relatedInCategory?: { title: string; slug: string; imageUrl?: string | null }[];
  /** Path used as `?next=` after sign-up (defaults to canonical). */
  signupNextPath?: string;
  /**
   * Audio URL for the click-to-play sample. When present, renders a sample
   * player section above the narrative. Phase 2.3: visitors arriving from
   * search have no gesture, so playback always requires a tap (no autoplay).
   */
  sampleAudioUrl?: string | null;
  /** Sample length in seconds (default 30). */
  sampleSeconds?: number;
  /** AdSense script tag computed by the route handler via `lib/ads.ts`.
   * Empty/undefined = ads off for this path. */
  adsScript?: string;
  /**
   * Pulse posts that cite this episode. Up to 3 most-recent published posts
   * are rendered as a "Featured in" section under the takeaways block.
   * Phase 4 / Task 10 — activates the placeholder previously dropped in
   * Phase 1.4. Empty/undefined = section is hidden.
   */
  featuredInPosts?: { title: string; slug: string; publishedAt?: Date | null }[];
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

  // Single truncation pass — feeds body, meta description, OG description.
  const narrativeExcerpt = truncateToWords(data.narrativeText, 150, 200);
  const description = narrativeExcerpt.slice(0, 160).replace(/\n/g, " ");
  const canonicalPath = `/p/${data.podcastSlug}/${data.episodeSlug}`;
  const canonical = `${SITE_URL}${canonicalPath}`;
  const signupNext = data.signupNextPath ?? canonicalPath;
  const ogImage = data.podcastImageUrl || DEFAULT_OG_IMAGE;

  // ── JSON-LD: PodcastEpisode + Article + BreadcrumbList in @graph ──
  const episodeId = `${canonical}#podcast-episode`;
  const podcastEpisodeNode: Record<string, unknown> = {
    "@type": "PodcastEpisode",
    "@id": episodeId,
    name: data.episodeTitle,
    url: canonical,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: data.podcastTitle,
      url: `${SITE_URL}/p/${data.podcastSlug}`,
    },
    description,
  };
  if (data.publishedAt) {
    podcastEpisodeNode.datePublished = new Date(data.publishedAt)
      .toISOString()
      .split("T")[0];
  }
  if (duration) {
    podcastEpisodeNode.timeRequired = `PT${Math.round(data.durationSeconds! / 60)}M`;
  }

  const articleNode: Record<string, unknown> = {
    "@type": "Article",
    headline: data.episodeTitle,
    description,
    author: { "@type": "Organization", name: "Blipp" },
    publisher: {
      "@type": "Organization",
      name: "Blipp",
      url: SITE_URL,
    },
    mainEntityOfPage: canonical,
    mentions: { "@id": episodeId },
    image: ogImage,
  };
  if (data.publishedAt) {
    articleNode.datePublished = new Date(data.publishedAt)
      .toISOString()
      .split("T")[0];
  }

  const breadcrumbItems: { "@type": "ListItem"; position: number; name: string; item: string }[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
  ];
  let pos = 2;
  if (data.categoryName && data.categorySlug) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: pos++,
      name: data.categoryName,
      item: `${SITE_URL}/p/category/${data.categorySlug}`,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: pos++,
    name: data.podcastTitle,
    item: `${SITE_URL}/p/${data.podcastSlug}`,
  });
  breadcrumbItems.push({
    "@type": "ListItem",
    position: pos++,
    name: data.episodeTitle,
    item: canonical,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      podcastEpisodeNode,
      articleNode,
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
    ],
  };

  // ── Body sections ──
  const narrativeHtml = narrativeExcerpt
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("\n");

  const tags = (data.topicTags || [])
    .slice(0, 10)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  const takeawaysHtml =
    data.topClaims && data.topClaims.length > 0
      ? `<h2>Top takeaways</h2>
<ol class="takeaways">${data.topClaims
          .map((c) => {
            const topic = c.topic
              ? `<span class="takeaway-topic">${escapeHtml(c.topic)}</span>`
              : "";
            return `<li>${topic}${escapeHtml(c.text)}</li>`;
          })
          .join("")}</ol>`
      : "";

  const moreFromShowHtml =
    data.moreFromShow && data.moreFromShow.length > 0
      ? `<h2>More from ${escapeHtml(data.podcastTitle)}</h2>
<div class="card-grid">${data.moreFromShow
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
          .join("")}</div>`
      : "";

  const relatedHtml =
    data.relatedInCategory && data.relatedInCategory.length > 0
      ? `<h2>Related${data.categoryName ? ` in ${escapeHtml(data.categoryName)}` : ""}</h2>
<div class="card-grid">${data.relatedInCategory
          .map(
            (s) =>
              `<a href="/p/${escapeHtml(s.slug)}" class="card"><h3>${escapeHtml(s.title)}</h3></a>`
          )
          .join("")}</div>`
      : "";

  // Phase 4 / Task 10: bidirectional linking. The Pulse cron + admin both
  // populate EpisodePulsePost, and the route handler queries the join + the
  // post's PUBLISHED status before passing the (max-3) array here.
  const featuredInHtml =
    data.featuredInPosts && data.featuredInPosts.length > 0
      ? `<section data-pulse-featured-in><h2>Featured in</h2>
<ul class="featured-in-list">${data.featuredInPosts
          .map((p) => {
            const dateLabel = p.publishedAt
              ? new Date(p.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "";
            return `<li><a href="/pulse/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a>${dateLabel ? ` <span class="featured-in-date">· ${dateLabel}</span>` : ""}</li>`;
          })
          .join("")}</ul></section>`
      : "";

  const signupHref = `/sign-up?next=${encodeURIComponent(signupNext)}`;

  const breadcrumb = `<nav class="breadcrumb"><a href="/">Home</a>${
    data.categoryName && data.categorySlug
      ? ` / <a href="/p/category/${escapeHtml(data.categorySlug)}">${escapeHtml(data.categoryName)}</a>`
      : ""
  } / <a href="/p/${escapeHtml(data.podcastSlug)}">${escapeHtml(data.podcastTitle)}</a> / ${escapeHtml(data.episodeTitle)}</nav>`;

  // Sample player block — vanilla JS so we don't pull React into the SSR bundle.
  // The click handler creates AudioContext + GainNode in the user gesture
  // (required by iOS Safari) and runs a linear fade-out over the last 2s.
  const sampleSec = data.sampleSeconds ?? 30;
  const sampleHtml = data.sampleAudioUrl
    ? `<section class="sample-player" id="sample">
<div class="sample-player__row">
  <button id="sample-btn" class="sample-player__play" aria-label="Play sample" data-state="idle">
    <span class="sample-player__icon" aria-hidden="true">▶</span>
  </button>
  <div class="sample-player__meta">
    <p class="sample-player__label">${sampleSec}-second sample of this Blipp</p>
    <div class="sample-player__bar"><div id="sample-bar" class="sample-player__bar-fill"></div></div>
  </div>
</div>
<div id="sample-cta" class="sample-player__cta" hidden>
  <p>That's the sample. Sign up to hear the full Blipp.</p>
  <a href="${signupHref}" class="cta-btn">Sign up free</a>
</div>
</section>
<script>
(function(){
  var url = ${JSON.stringify(data.sampleAudioUrl)};
  var TOTAL = ${sampleSec};
  var FADE = 2;
  var btn = document.getElementById("sample-btn");
  var bar = document.getElementById("sample-bar");
  var cta = document.getElementById("sample-cta");
  if (!btn || !bar || !cta) return;
  var audio = null, ctx = null, gain = null, source = null, timer = null, ticker = null;
  function setIcon(s){ btn.setAttribute("data-state", s); btn.querySelector(".sample-player__icon").textContent = s === "playing" ? "❚❚" : (s === "loading" ? "…" : "▶"); }
  function reset(){
    if (timer) { clearTimeout(timer); timer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (audio) { try { audio.pause(); } catch(e){} }
  }
  function start(){
    setIcon("loading");
    var ACtor = window.AudioContext || window.webkitAudioContext;
    if (!audio) { audio = new Audio(); audio.crossOrigin = "anonymous"; audio.preload = "auto"; }
    audio.src = url;
    if (ACtor && !ctx) { ctx = new ACtor(); }
    if (ctx && ctx.state === "suspended") { ctx.resume(); }
    if (ctx && !source) {
      try {
        source = ctx.createMediaElementSource(audio);
        gain = ctx.createGain();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(ctx.destination);
      } catch (e) { /* fallback to plain audio */ }
    }
    var p = audio.play();
    var ok = function(){
      setIcon("playing");
      if (gain && ctx) {
        var now = ctx.currentTime;
        gain.gain.setValueAtTime(1, now + (TOTAL - FADE));
        gain.gain.linearRampToValueAtTime(0.0001, now + TOTAL);
      }
      ticker = setInterval(function(){
        var pct = Math.min(100, (audio.currentTime / TOTAL) * 100);
        bar.style.width = pct + "%";
      }, 200);
      timer = setTimeout(function(){
        reset();
        bar.style.width = "100%";
        cta.hidden = false;
        setIcon("idle");
      }, TOTAL * 1000);
    };
    if (p && typeof p.then === "function") { p.then(ok).catch(function(){ setIcon("idle"); }); } else { ok(); }
  }
  function pause(){ reset(); setIcon("idle"); }
  btn.addEventListener("click", function(){
    if (btn.getAttribute("data-state") === "playing") { pause(); } else { start(); }
  });
})();
</script>`
    : "";

  return layout({
    title: `${data.episodeTitle} — ${data.podcastTitle} | Blipp Summary`,
    description,
    canonicalPath,
    ogImage,
    jsonLd,
    adsScript: data.adsScript,
    body: `<main class="container">
${breadcrumb}
<h1>${escapeHtml(data.episodeTitle)}</h1>
<div class="meta">${escapeHtml(data.podcastTitle)}${published ? ` · ${published}` : ""}${duration ? ` · ${duration} episode` : ""}</div>
${tags ? `<div style="margin-bottom:1.5rem">${tags}</div>` : ""}
${sampleHtml}
<div class="narrative">${narrativeHtml}</div>
${takeawaysHtml}
<div class="signup-cta">
<p>Sign up to read or listen to the full Blipp</p>
<a href="${signupHref}" class="cta-btn">Get Blipp Free</a>
</div>
${moreFromShowHtml}
${relatedHtml}
${featuredInHtml}
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
  adsScript?: string;
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

  const breadcrumbItems: { "@type": "ListItem"; position: number; name: string; item: string }[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
  ];
  let pos = 2;
  if (data.categoryName && data.categorySlug) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: pos++,
      name: data.categoryName,
      item: `${SITE_URL}/p/category/${data.categorySlug}`,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: pos++,
    name: data.podcastTitle,
    item: `${SITE_URL}/p/${data.podcastSlug}`,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "PodcastSeries",
        name: data.podcastTitle,
        description,
        url: `${SITE_URL}/p/${data.podcastSlug}`,
      },
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
    ],
  };

  return layout({
    title: `${data.podcastTitle} — Podcast Summaries | Blipp`,
    description,
    canonicalPath: `/p/${data.podcastSlug}`,
    ogImage: data.podcastImageUrl || undefined,
    jsonLd,
    adsScript: data.adsScript,
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
  adsScript?: string;
}

export function renderCategoryPage(data: CategoryPageData): string {
  const description = `Browse ${data.categoryName} podcast summaries on Blipp. ${data.podcasts.length} shows available.`;
  const canonicalPath = `/p/category/${data.categorySlug}`;

  const podcastCards = data.podcasts
    .map(
      (p) =>
        `<a href="/p/${escapeHtml(p.slug)}" class="card"><h3>${escapeHtml(p.title)}</h3><p>${p.episodeCount} summaries${p.description ? ` · ${escapeHtml(p.description.slice(0, 80))}` : ""}</p></a>`
    )
    .join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${data.categoryName} Podcasts`,
        description,
        url: `${SITE_URL}${canonicalPath}`,
        about: data.categoryName,
        hasPart: data.podcasts.slice(0, 20).map((p) => ({
          "@type": "PodcastSeries",
          name: p.title,
          url: `${SITE_URL}/p/${p.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Browse", item: `${SITE_URL}/p` },
          {
            "@type": "ListItem",
            position: 3,
            name: data.categoryName,
            item: `${SITE_URL}${canonicalPath}`,
          },
        ],
      },
    ],
  };

  return layout({
    title: `${data.categoryName} Podcasts — Summaries | Blipp`,
    description,
    canonicalPath,
    jsonLd,
    adsScript: data.adsScript,
    body: `<main class="container">
<nav class="breadcrumb"><a href="/">Home</a> / <a href="/p">Browse</a> / ${escapeHtml(data.categoryName)}</nav>
<h1>${escapeHtml(data.categoryName)} Podcasts</h1>
<div class="meta">${data.podcasts.length} shows</div>
<div class="card-grid">${podcastCards}</div>
<div style="margin-top:2.5rem;text-align:center"><a href="/sign-up" class="cta-btn">Try Blipp Free</a></div>
</main>`,
  });
}
