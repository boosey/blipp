/**
 * Build-time prerender for marketing routes.
 *
 * Run order (see package.json `build` script):
 *   1. `vite build`                              → dist/        (client + worker)
 *   2. `vite build --ssr src/entry-server.tsx --outDir .ssr-build`
 *      → .ssr-build/entry-server.js              (Node-runnable SSR bundle)
 *   3. `node scripts/prerender.mjs`              ← this file
 *
 * For each route in MARKETING_ROUTES it:
 *   • imports the SSR `render(url)` from .ssr-build/
 *   • reads dist/index.html as the template
 *   • injects the rendered React tree into <div id="root">
 *   • rewrites <title>, <meta description>, canonical, and OG tags
 *   • writes dist/<route>/index.html (or dist/index.html for apex)
 *
 * Cloudflare's static-asset binding then serves the right file per
 * URL via the default html_handling: auto-trailing-slash behavior.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SSR_BUILD = path.join(ROOT, ".ssr-build");

function escapeHtmlAttr(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function applySeoMeta(template, route) {
  let html = template;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtmlAttr(route.title)}</title>`
  );
  html = html.replace(
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" content="${escapeHtmlAttr(route.description)}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${escapeHtmlAttr(route.canonical)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"[^>]*>/,
    `<meta property="og:url" content="${escapeHtmlAttr(route.canonical)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"[^>]*>/,
    `<meta property="og:title" content="${escapeHtmlAttr(route.title)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"[^>]*>/,
    `<meta property="og:description" content="${escapeHtmlAttr(route.description)}" />`
  );
  return html;
}

function injectAppHtml(template, appHtml) {
  // Replace either an empty <div id="root"></div> OR a populated skeleton.
  // The lookahead pulls everything up to the next <script type="module">.
  const re = /<div id="root">[\s\S]*?<\/div>(?=\s*<script type="module")/;
  if (!re.test(template)) {
    throw new Error(
      "prerender: could not locate <div id=\"root\">…</div> ahead of <script type=\"module\"> in dist/index.html"
    );
  }
  return template.replace(re, `<div id="root">${appHtml}</div>`);
}

async function main() {
  const ssrEntry = pathToFileURL(path.join(SSR_BUILD, "entry-server.js")).href;
  const { render, MARKETING_ROUTES } = await import(ssrEntry);

  const template = await readFile(path.join(DIST, "index.html"), "utf-8");
  console.log(`prerender: ${MARKETING_ROUTES.length} route(s)`);

  for (const route of MARKETING_ROUTES) {
    const appHtml = render(route.path);
    let html = injectAppHtml(template, appHtml);
    html = applySeoMeta(html, route);

    const outDir =
      route.path === "/"
        ? DIST
        : path.join(DIST, route.path.replace(/^\//, ""));
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "index.html");
    await writeFile(outPath, html, "utf-8");
    console.log(`  ${route.path.padEnd(15)} → ${path.relative(ROOT, outPath)}`);
  }

  // Clean up the SSR build artifacts — not shipped.
  await rm(SSR_BUILD, { recursive: true, force: true });

  console.log(`prerender: ✓ wrote ${MARKETING_ROUTES.length} route(s)`);
}

main().catch((err) => {
  console.error("prerender failed:", err);
  process.exit(1);
});
