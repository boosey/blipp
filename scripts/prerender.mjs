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
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Cloudflare's vite plugin emits client assets into dist/client/. The
// generated dist/blipp_*/wrangler.json points its `assets.directory` here.
// Worker bundle lives in dist/blipp_<env>/ — left untouched.
const ASSETS = path.join(ROOT, "dist", "client");
const SSR_BUILD = path.join(ROOT, ".ssr-build");

// Accept --mode <staging|production> so .env / .env.production load correctly.
const args = process.argv.slice(2);
const modeIdx = args.indexOf("--mode");
const mode = modeIdx >= 0 ? args[modeIdx + 1] : null;
const modeFlag = mode ? `--mode ${mode}` : "";

function escapeHtmlAttr(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const ADSENSE_PUBLISHER_ID = "pub-3171642877259040";
const ADS_SCRIPT_TAG = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${ADSENSE_PUBLISHER_ID}" crossorigin="anonymous"></script>`;

function injectAdsScript(html, route) {
  if (!route.adsScript) return html;
  // Insert the script tag immediately after the verification meta tag,
  // mirroring the placement that used to be in index.html.
  return html.replace(
    /(<meta\s+name="google-adsense-account"[^>]*>)/,
    `$1\n    ${ADS_SCRIPT_TAG}`
  );
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
  // index.html has explicit `<!-- prerender:start -->` … `<!-- prerender:end -->`
  // markers inside the #root div. Replace between them with the SSR'd
  // React tree. Keeping the markers makes the regex robust to whatever
  // Vite does with surrounding scripts/styles.
  const re = /<!-- prerender:start -->[\s\S]*?<!-- prerender:end -->/;
  if (!re.test(template)) {
    throw new Error(
      "prerender: could not find prerender:start/prerender:end markers in dist/client/index.html"
    );
  }
  return template.replace(
    re,
    `<!-- prerender:start -->${appHtml}<!-- prerender:end -->`
  );
}

async function main() {
  console.log(`prerender: building SSR bundle${mode ? ` (mode: ${mode})` : ""}…`);
  // Invoke vite via its node entrypoint directly — npx isn't on PATH when
  // this script is run outside an `npm run` context. Using vite.ssr.config.ts
  // bypasses the Cloudflare plugin from the main config, which would
  // otherwise rewrite the SSR output structure.
  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  execSync(
    `node "${viteBin}" build --config vite.ssr.config.ts ${modeFlag}`.trim(),
    { stdio: "inherit", cwd: ROOT }
  );

  const ssrEntry = pathToFileURL(path.join(SSR_BUILD, "entry-server.js")).href;
  const { render, MARKETING_ROUTES } = await import(ssrEntry);

  const template = await readFile(path.join(ASSETS, "index.html"), "utf-8");
  console.log(`prerender: ${MARKETING_ROUTES.length} route(s)`);

  for (const route of MARKETING_ROUTES) {
    const appHtml = render(route.path);
    let html = injectAppHtml(template, appHtml);
    html = applySeoMeta(html, route);
    html = injectAdsScript(html, route);

    const outDir =
      route.path === "/"
        ? ASSETS
        : path.join(ASSETS, route.path.replace(/^\//, ""));
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
