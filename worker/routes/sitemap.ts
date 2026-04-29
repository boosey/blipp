import { Hono } from "hono";
import { prismaMiddleware } from "../middleware/prisma";
import type { Env } from "../types";

const sitemap = new Hono<{ Bindings: Env }>();

sitemap.get("/sitemap.xml", prismaMiddleware, async (c) => {
  const prisma = c.get("prisma");
  const SITE = "https://podblipp.com";

  // Static pages
  const staticUrls = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/about", priority: "0.7", changefreq: "monthly" },
    { loc: "/pricing", priority: "0.8", changefreq: "monthly" },
    { loc: "/contact", priority: "0.5", changefreq: "monthly" },
    { loc: "/support", priority: "0.5", changefreq: "monthly" },
    { loc: "/how-it-works", priority: "0.8", changefreq: "monthly" },
  ];

  // Public episode pages
  const episodes = await prisma.episode.findMany({
    where: { publicPage: true, slug: { not: null } },
    select: { slug: true, updatedAt: true, podcast: { select: { slug: true } } },
  });

  // Show pages (podcasts with at least one public episode)
  const podcastSlugs = [...new Set(episodes.map((e: any) => e.podcast.slug).filter(Boolean))];

  // Category pages
  const categories = await prisma.category.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });

  // Pulse blog (Phase 4): index + published posts + editor archives.
  const pulsePosts = await prisma.pulsePost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
  });
  const pulseEditors = await prisma.pulseEditor.findMany({
    where: { status: "READY" },
    select: { slug: true },
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const s of staticUrls) {
    xml += `<url><loc>${SITE}${s.loc}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>\n`;
  }
  for (const slug of podcastSlugs) {
    xml += `<url><loc>${SITE}/p/${slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  }
  for (const ep of episodes) {
    if (!ep.podcast.slug) continue;
    const lastmod = ep.updatedAt ? new Date(ep.updatedAt).toISOString().split("T")[0] : "";
    xml += `<url><loc>${SITE}/p/${ep.podcast.slug}/${ep.slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>0.6</priority></url>\n`;
  }
  for (const cat of categories) {
    xml += `<url><loc>${SITE}/p/category/${cat.slug}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n`;
  }
  if (pulsePosts.length > 0) {
    xml += `<url><loc>${SITE}/pulse</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
  }
  for (const post of pulsePosts) {
    const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString().split("T")[0] : "";
    xml += `<url><loc>${SITE}/pulse/${post.slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>0.7</priority></url>\n`;
  }
  for (const editor of pulseEditors) {
    xml += `<url><loc>${SITE}/pulse/by/${editor.slug}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>\n`;
  }
  xml += `</urlset>`;

  return c.text(xml, 200, {
    "Content-Type": "application/xml",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  });
});

export default sitemap;
