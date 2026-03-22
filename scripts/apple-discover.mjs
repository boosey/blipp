#!/usr/bin/env node
/**
 * Apple Podcasts Discovery Script
 * ================================
 *
 * WHY THIS RUNS LOCALLY / IN CI (not in Cloudflare Workers):
 * Apple's iTunes Lookup API (itunes.apple.com/lookup) returns 403 Forbidden
 * when called from Cloudflare Workers IP ranges. Apple blocks known cloud/bot
 * IPs from this endpoint. The RSS chart feed works fine from Workers, but
 * without the lookup we can't resolve Apple IDs to RSS feed URLs.
 *
 * Running locally or in GitHub Actions avoids the IP block since requests
 * come from a residential/runner IP.
 *
 * WHAT IT DOES:
 * 1. Fetches the Apple Podcasts top chart (RSS feed — always works)
 * 2. Batch-resolves Apple IDs to feed URLs via iTunes Lookup API (10 per request)
 * 3. POSTs discovered podcasts to the catalog-seed API endpoints
 * 4. The server handles DB upserts, category creation, and feed refresh queuing
 *
 * Usage:
 *   npm run apple:discover                             # staging (default)
 *   npm run apple:discover:production                  # production
 *   npm run apple:discover:dry                         # preview only, no API calls
 *   node scripts/apple-discover.mjs --country=gb       # UK chart instead of US
 *   node scripts/apple-discover.mjs --limit=100        # top 100 instead of 200
 */
import { readFileSync } from "node:fs";

// ── Config ──

const production = process.argv.includes("--production");
const dryRun = process.argv.includes("--dry-run");
const countryArg = process.argv.find((a) => a.startsWith("--country="));
const country = countryArg ? countryArg.split("=")[1] : "us";
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const chartLimit = limitArg ? parseInt(limitArg.split("=")[1]) : 200;

const env = production ? "production" : "staging";

const APP_ORIGINS = {
  production: "https://podblipp.com",
  staging: "https://blipp-staging.boosey-boudreaux.workers.dev",
};

// ── Environment / Auth ──

function getConfig() {
  // In CI (GitHub Actions), read from environment variables
  if (process.env.GITHUB_ACTIONS) {
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    const appOrigin = process.env.APP_ORIGIN;
    if (!clerkSecret) throw new Error("CLERK_SECRET_KEY env var not set");
    if (!appOrigin) throw new Error("APP_ORIGIN env var not set");
    return { clerkSecret, appOrigin };
  }

  // Locally, read from files
  const clerkSecret = readEnvFile(".dev.vars", "CLERK_SECRET_KEY");
  const appOrigin = APP_ORIGINS[env];
  return { clerkSecret, appOrigin };
}

function readEnvFile(filePath, key) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}=(.+)$`));
    if (match) return match[1].trim();
  }
  throw new Error(`${key} not found in ${filePath}`);
}

// ── Apple API helpers ──

const ITUNES_BASE = "https://itunes.apple.com";
const LOOKUP_BATCH_SIZE = 10;
const INTER_BATCH_DELAY_MS = 500;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Top-level Apple genre mapping (subgenres -> parent)
const SUBGENRE_TO_PARENT = {
  "1301": "1301", "1321": "1301", "1302": "1302", "1303": "1303",
  "1304": "1304", "1323": "1304", "1305": "1305", "1307": "1307",
  "1325": "1307", "1309": "1309", "1310": "1310", "1311": "1311",
  "1314": "1314", "1315": "1315", "1316": "1316", "1318": "1318",
  "1324": "1318", "1320": "1320", "1322": "1322", "1326": "1326",
  "1401": "1301", "1402": "1302", "1403": "1303", "1404": "1304",
  "1405": "1305", "1406": "1307", "1407": "1309", "1408": "1310",
  "1409": "1311", "1410": "1314", "1411": "1315", "1412": "1316",
  "1413": "1318", "1414": "1320", "1415": "1322", "1416": "1326",
};

const GENRE_NAMES = {
  "1301": "Arts", "1302": "Comedy", "1303": "Education", "1304": "Fiction",
  "1305": "Government", "1307": "Health & Fitness", "1309": "History",
  "1310": "Kids & Family", "1311": "Leisure", "1314": "Music",
  "1315": "News", "1316": "Religion & Spirituality", "1318": "Science",
  "1320": "Society & Culture", "1321": "Design", "1322": "Sports",
  "1323": "Drama", "1324": "Alternative Health", "1325": "Fitness",
  "1326": "Technology",
};

function resolveGenre(rawId) {
  const parentId = SUBGENRE_TO_PARENT[rawId] ?? rawId;
  const name = GENRE_NAMES[parentId];
  if (name) return { genreId: parentId, name };
  return null;
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return res;
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < retries) {
        const backoff = 1000 * Math.pow(2, attempt);
        console.log(`  Retry ${attempt + 1}/${retries} after ${res.status} (waiting ${backoff}ms)`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = 1000 * Math.pow(2, attempt);
      console.log(`  Retry ${attempt + 1}/${retries} after error (waiting ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

async function fetchTop200(country, limit) {
  const url = `${ITUNES_BASE}/${country}/rss/toppodcasts/limit=${limit}/json`;
  console.log(`Fetching Apple chart: ${url}`);
  const res = await fetchWithRetry(url);
  const data = await res.json();
  const entries = data.feed?.entry ?? [];
  console.log(`  Got ${entries.length} chart entries`);

  return entries.map((e) => {
    const images = e["im:image"] ?? [];
    const largestImage = images[images.length - 1]?.label ?? "";
    const rawGenreId = e.category?.attributes?.["im:id"];
    const genre = rawGenreId ? resolveGenre(rawGenreId) : null;

    return {
      id: e.id?.attributes?.["im:id"] ?? "",
      name: e["im:name"]?.label ?? "",
      artistName: e["im:artist"]?.label ?? "",
      artworkUrl100: largestImage,
      genres: genre ? [genre] : [],
    };
  });
}

async function lookupBatch(appleIds) {
  const results = [];

  for (let i = 0; i < appleIds.length; i += LOOKUP_BATCH_SIZE) {
    const chunk = appleIds.slice(i, i + LOOKUP_BATCH_SIZE);
    const csvIds = chunk.join(",");
    const url = `${ITUNES_BASE}/lookup?id=${csvIds}&entity=podcast`;
    const batchNum = Math.floor(i / LOOKUP_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(appleIds.length / LOOKUP_BATCH_SIZE);

    process.stdout.write(`  Lookup batch ${batchNum}/${totalBatches} (${chunk.length} IDs)...`);

    try {
      const res = await fetchWithRetry(url);
      const data = await res.json();
      const podcasts = (data.results ?? []).filter(
        (r) => r.wrapperType === "track" && r.kind === "podcast" && r.feedUrl
      );
      results.push(...podcasts);
      console.log(` ${podcasts.length} resolved`);
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
    }

    // Rate limit between batches
    if (i + LOOKUP_BATCH_SIZE < appleIds.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return results;
}

// ── API helpers ──

const INGEST_CHUNK_SIZE = 50;

async function apiPost(url, body, clerkSecret) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${clerkSecret}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

// ── Main ──

async function main() {
  console.log(`\nApple Podcasts Discovery`);
  console.log(`========================`);
  console.log(`Environment: ${env}`);
  console.log(`Country:     ${country}`);
  console.log(`Chart limit: ${chartLimit}`);
  console.log(`Dry run:     ${dryRun}\n`);

  // Step 1: Fetch chart
  const chartEntries = await fetchTop200(country, chartLimit);
  if (chartEntries.length === 0) {
    console.log("No chart entries found. Exiting.");
    process.exit(1);
  }

  // Step 2: Resolve feed URLs via iTunes Lookup
  console.log(`\nResolving feed URLs for ${chartEntries.length} podcasts...`);
  const appleIds = chartEntries.map((e) => Number(e.id)).filter(Boolean);
  const lookupResults = await lookupBatch(appleIds);
  const lookupMap = new Map(lookupResults.map((r) => [String(r.collectionId), r]));
  console.log(`\nResolved ${lookupMap.size}/${chartEntries.length} chart entries`);

  // Step 3: Build discovered list
  const discovered = [];
  for (const entry of chartEntries) {
    const lookup = lookupMap.get(entry.id);
    if (!lookup?.feedUrl) continue;

    discovered.push({
      feedUrl: lookup.feedUrl,
      title: lookup.collectionName || entry.name,
      imageUrl: lookup.artworkUrl600 || entry.artworkUrl100,
      author: lookup.artistName || entry.artistName,
      appleId: entry.id,
      categories: entry.genres,
    });
  }

  console.log(`\n${discovered.length} podcasts with feed URLs ready for ingest`);

  if (dryRun) {
    console.log("\n-- DRY RUN -- No API calls made.\n");
    console.log("Top 10 discovered:");
    for (const p of discovered.slice(0, 10)) {
      console.log(`  ${p.title} (${p.author}) — ${p.feedUrl.slice(0, 60)}`);
    }
    process.exit(0);
  }

  // Step 4: Create catalog seed job via API
  const { clerkSecret, appOrigin } = getConfig();
  console.log(`\nCreating catalog seed job at ${appOrigin}...`);

  const jobResult = await apiPost(`${appOrigin}/api/admin/catalog-seed`, {
    confirm: true,
    source: "apple",
    trigger: "script",
    mode: "additive",
  }, clerkSecret);

  const jobId = jobResult.jobId;
  if (!jobId) {
    console.error("Failed to create seed job — no jobId returned:", jobResult);
    process.exit(1);
  }
  console.log(`  Created job: ${jobId}`);

  // Step 5: Send discovered podcasts in chunks
  console.log(`\nIngesting ${discovered.length} podcasts in chunks of ${INGEST_CHUNK_SIZE}...`);
  const totalChunks = Math.ceil(discovered.length / INGEST_CHUNK_SIZE);
  let totalIngested = 0;

  for (let i = 0; i < discovered.length; i += INGEST_CHUNK_SIZE) {
    const chunk = discovered.slice(i, i + INGEST_CHUNK_SIZE);
    const chunkNum = Math.floor(i / INGEST_CHUNK_SIZE) + 1;
    const isLast = i + INGEST_CHUNK_SIZE >= discovered.length;

    process.stdout.write(`  Chunk ${chunkNum}/${totalChunks} (${chunk.length} podcasts, final=${isLast})...`);

    try {
      const result = await apiPost(
        `${appOrigin}/api/admin/catalog-seed/${jobId}/ingest`,
        { podcasts: chunk, final: isLast },
        clerkSecret
      );
      totalIngested += chunk.length;
      console.log(` OK (created=${result.created ?? 0}, updated=${result.updated ?? 0})`);
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      console.error(`\nFatal: ingest failed at chunk ${chunkNum}. Job ${jobId} may be incomplete.`);
      process.exit(1);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Chart entries:  ${chartEntries.length}`);
  console.log(`Feed URLs:      ${discovered.length} (${chartEntries.length - discovered.length} unresolved)`);
  console.log(`Ingested:       ${totalIngested}`);
  console.log(`Job ID:         ${jobId}`);
  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
