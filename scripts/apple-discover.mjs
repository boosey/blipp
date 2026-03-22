#!/usr/bin/env node
/**
 * Apple Podcasts Discovery Script
 * ================================
 *
 * WHY THIS RUNS LOCALLY (not in Cloudflare Workers):
 * Apple's iTunes Lookup API (itunes.apple.com/lookup) returns 403 Forbidden
 * when called from Cloudflare Workers IP ranges. Apple blocks known cloud/bot
 * IPs from this endpoint. The RSS chart feed works fine from Workers, but
 * without the lookup we can't resolve Apple IDs to RSS feed URLs.
 *
 * Running locally avoids the IP block since requests come from a residential IP.
 *
 * WHAT IT DOES:
 * 1. Fetches the Apple Podcasts top 200 chart (RSS feed — always works)
 * 2. Batch-resolves Apple IDs to feed URLs via iTunes Lookup API (10 per request)
 * 3. Upserts discovered podcasts into the database with source="apple"
 * 4. Creates/updates category associations
 * 5. Calls the Worker's /internal/clean/bulk-refresh endpoint to queue
 *    feed refresh for all upserted podcasts (unless --no-refresh)
 * 6. Workers then process: feed refresh → content prefetch automatically
 *
 * WHAT IT DOES NOT DO:
 * - Feed refresh (fetching episodes) — triggered via Worker queue by step 5
 * - Content prefetch (transcripts/audio) — triggered automatically after feed refresh
 * - Podcast Index discovery — handled separately by Workers catalog-refresh queue
 *
 * Usage:
 *   npm run apple:discover                             # staging (default)
 *   npm run apple:discover:production                  # production
 *   npm run apple:discover:dry                         # preview only, no DB writes
 *   node scripts/apple-discover.mjs --country=gb       # UK chart instead of US
 *   node scripts/apple-discover.mjs --limit=100        # top 100 instead of 200
 *   node scripts/apple-discover.mjs --no-refresh       # upsert only, skip feed refresh queue
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

// ── Config ──

const production = process.argv.includes("--production");
const dryRun = process.argv.includes("--dry-run");
const countryArg = process.argv.find((a) => a.startsWith("--country="));
const country = countryArg ? countryArg.split("=")[1] : "us";
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const chartLimit = limitArg ? parseInt(limitArg.split("=")[1]) : 200;

const noRefresh = process.argv.includes("--no-refresh");
const env = production ? "production" : "staging";
const envKey = production ? "PRODUCTION_DATABASE_URL" : "STAGING_DATABASE_URL";

const APP_ORIGINS = {
  production: "https://podblipp.com",
  staging: "https://blipp-staging.boosey-boudreaux.workers.dev",
};

// ── Database ──

function getDatabaseUrl() {
  const lines = readFileSync("neon-config.env", "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(new RegExp(`^${envKey}=(.+)$`));
    if (match) return match[1].trim();
  }
  throw new Error(`${envKey} not found in neon-config.env`);
}

function getClerkSecret() {
  const lines = readFileSync(".dev.vars", "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^CLERK_SECRET_KEY=(.+)$/);
    if (match) return match[1].trim();
  }
  throw new Error("CLERK_SECRET_KEY not found in .dev.vars");
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

  console.log(`\n${discovered.length} podcasts with feed URLs ready for upsert`);

  if (dryRun) {
    console.log("\n-- DRY RUN -- No database changes made.\n");
    console.log("Top 10 discovered:");
    for (const p of discovered.slice(0, 10)) {
      console.log(`  ${p.title} (${p.author}) — ${p.feedUrl.slice(0, 60)}`);
    }
    process.exit(0);
  }

  // Step 4: Connect to database and upsert
  const dbUrl = getDatabaseUrl();
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log(`\nConnected to ${env} database`);

  try {
    // Upsert categories
    console.log("Upserting categories...");
    const genreMap = new Map();
    for (const p of discovered) {
      for (const cat of p.categories) {
        if (cat.genreId && cat.genreId !== "26") {
          genreMap.set(cat.genreId, cat.name);
        }
      }
    }

    const categoryIdMap = new Map();
    for (const [genreId, name] of genreMap) {
      const res = await client.query(
        `INSERT INTO "Category" (id, name, "appleGenreId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, now(), now())
         ON CONFLICT ("appleGenreId") DO UPDATE SET name = $1, "updatedAt" = now()
         RETURNING id`,
        [name, genreId]
      );
      categoryIdMap.set(genreId, res.rows[0].id);
    }
    console.log(`  ${categoryIdMap.size} categories`);

    // Upsert podcasts
    console.log("Upserting podcasts...");
    let created = 0, updated = 0, failed = 0;
    const upsertedIds = [];

    for (const podcast of discovered) {
      try {
        const categoryNames = podcast.categories
          .filter((c) => c.genreId !== "26")
          .map((c) => c.name);

        // Check if exists
        const existing = await client.query(
          `SELECT id, source FROM "Podcast" WHERE "feedUrl" = $1`,
          [podcast.feedUrl]
        );

        let podcastId;

        if (existing.rows.length > 0) {
          podcastId = existing.rows[0].id;
          // Update — Apple is authoritative
          await client.query(
            `UPDATE "Podcast" SET
              title = $1, "imageUrl" = $2, author = $3, "appleId" = $4,
              categories = $5, source = 'apple', status = 'active', "updatedAt" = now()
             WHERE id = $6`,
            [podcast.title, podcast.imageUrl, podcast.author, podcast.appleId, categoryNames, podcastId]
          );
          upsertedIds.push(podcastId);
          updated++;
        } else {
          // Insert new
          const res = await client.query(
            `INSERT INTO "Podcast" (id, title, "feedUrl", "imageUrl", author, "appleId", categories, source, status, language, "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'apple', 'active', 'en', now(), now())
             RETURNING id`,
            [podcast.title, podcast.feedUrl, podcast.imageUrl, podcast.author, podcast.appleId, categoryNames]
          );
          podcastId = res.rows[0].id;
          upsertedIds.push(podcastId);
          created++;
        }

        // Upsert category joins
        for (const cat of podcast.categories) {
          if (cat.genreId === "26") continue;
          const categoryId = categoryIdMap.get(cat.genreId);
          if (categoryId) {
            await client.query(
              `INSERT INTO "PodcastCategory" ("podcastId", "categoryId")
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [podcastId, categoryId]
            );
          }
        }
      } catch (err) {
        console.log(`  FAILED: ${podcast.title} — ${err.message}`);
        failed++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Chart entries:  ${chartEntries.length}`);
    console.log(`Feed URLs:      ${discovered.length} (${chartEntries.length - discovered.length} unresolved)`);
    console.log(`Created:        ${created}`);
    console.log(`Updated:        ${updated}`);
    console.log(`Failed:         ${failed}`);
    console.log(`Categories:     ${categoryIdMap.size}`);

    // Step 5: Trigger feed refresh via Worker bulk-refresh endpoint
    if (upsertedIds.length > 0 && !noRefresh) {
      console.log(`\nTriggering feed refresh for ${upsertedIds.length} podcasts...`);
      const origin = APP_ORIGINS[env];
      const clerkSecret = getClerkSecret();
      try {
        const res = await fetch(`${origin}/api/internal/clean/bulk-refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clerkSecret}`,
          },
          body: JSON.stringify({ podcastIds: upsertedIds }),
        });
        const result = await res.json();
        if (res.ok) {
          console.log(`  Queued ${result.data?.queued ?? 0} feed refreshes`);
        } else {
          console.log(`  Failed to queue: ${result.error ?? res.status}`);
          console.log("  You can manually trigger from admin UI or re-run without --no-refresh");
        }
      } catch (err) {
        console.log(`  Failed to reach Worker: ${err.message}`);
        console.log("  Podcasts are in the DB — trigger feed refresh from admin UI");
      }
    } else if (noRefresh) {
      console.log(`\nSkipped feed refresh (--no-refresh). Trigger from admin UI when ready.`);
    }

    console.log(`\nDone.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
