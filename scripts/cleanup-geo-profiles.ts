/**
 * One-shot cleanup: remove low-quality geo profiles created by overly broad
 * "the South"/"the Midwest" regional matching and weak state-level matches.
 *
 * Deletes:
 *   1. All "regional" scope profiles (from removed "the South"/"the Midwest" phrases)
 *   2. All "state" scope profiles with confidence < 0.7 (description-only state mentions)
 *
 * Then resets geoProcessedAt on affected podcasts so the geo-tagging cron
 * re-evaluates them with the tighter rules.
 *
 * Usage:
 *   npx tsx scripts/cleanup-geo-profiles.ts          # staging (dry run)
 *   npx tsx scripts/cleanup-geo-profiles.ts --prod    # production (dry run)
 *   npx tsx scripts/cleanup-geo-profiles.ts --exec    # staging (execute)
 *   npx tsx scripts/cleanup-geo-profiles.ts --prod --exec  # production (execute)
 */

import pg from "pg";
import dotenvx from "@dotenvx/dotenvx";

const isProd = process.argv.includes("--prod");
const isExec = process.argv.includes("--exec");

if (isProd) {
  dotenvx.config({ path: "neon-config.env", quiet: true });
} else {
  dotenvx.config({ quiet: true });
}

const connStr = isProd
  ? process.env.PRODUCTION_DATABASE_URL
  : process.env.DATABASE_URL;

if (!connStr) {
  console.error(`Missing ${isProd ? "PRODUCTION_DATABASE_URL" : "DATABASE_URL"}`);
  process.exit(1);
}

const env = isProd ? "PRODUCTION" : "STAGING";
console.log(`[${env}] ${isExec ? "EXECUTING" : "DRY RUN"}\n`);

const client = new pg.Client({ connectionString: connStr });
await client.connect();

try {
  // Count what we're about to delete
  const regionalCount = await client.query(
    `SELECT COUNT(*) FROM "PodcastGeoProfile" WHERE "scope" = 'regional'`
  );
  const stateCount = await client.query(
    `SELECT COUNT(*) FROM "PodcastGeoProfile" WHERE "scope" = 'state' AND "confidence" < 0.7`
  );

  console.log(`Regional profiles to delete: ${regionalCount.rows[0].count}`);
  console.log(`Low-confidence state profiles to delete: ${stateCount.rows[0].count}`);

  // Find affected podcast IDs before deleting
  const affectedPodcasts = await client.query(`
    SELECT DISTINCT "podcastId" FROM "PodcastGeoProfile"
    WHERE "scope" = 'regional'
       OR ("scope" = 'state' AND "confidence" < 0.7)
  `);
  console.log(`Podcasts to re-process: ${affectedPodcasts.rows.length}\n`);

  if (!isExec) {
    console.log("Pass --exec to execute. Exiting dry run.");
    process.exit(0);
  }

  // Delete junk profiles
  const delRegional = await client.query(
    `DELETE FROM "PodcastGeoProfile" WHERE "scope" = 'regional'`
  );
  console.log(`Deleted ${delRegional.rowCount} regional profiles`);

  const delState = await client.query(
    `DELETE FROM "PodcastGeoProfile" WHERE "scope" = 'state' AND "confidence" < 0.7`
  );
  console.log(`Deleted ${delState.rowCount} low-confidence state profiles`);

  // Reset geoProcessedAt so cron re-evaluates these podcasts
  const podcastIds = affectedPodcasts.rows.map((r: any) => r.podcastId);
  if (podcastIds.length > 0) {
    const reset = await client.query(
      `UPDATE "Podcast" SET "geoProcessedAt" = NULL WHERE "id" = ANY($1)`,
      [podcastIds]
    );
    console.log(`Reset geoProcessedAt on ${reset.rowCount} podcasts`);
  }

  console.log("\nDone.");
} finally {
  await client.end();
}
