/**
 * One-shot cleanup: remove keyword-sourced geo profiles so the LLM-primary
 * geo-tagging pipeline can re-evaluate all podcasts cleanly.
 *
 * Deletes all keyword-sourced PodcastGeoProfile records and resets
 * geoProcessedAt on affected podcasts so the cron re-processes them.
 * LLM-sourced profiles are kept as-is.
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
  const keywordCount = await client.query(
    `SELECT COUNT(*) FROM "PodcastGeoProfile" WHERE "source" = 'keyword'`
  );
  const affectedPodcasts = await client.query(
    `SELECT COUNT(DISTINCT "podcastId") FROM "PodcastGeoProfile" WHERE "source" = 'keyword'`
  );
  const llmKept = await client.query(
    `SELECT COUNT(*) FROM "PodcastGeoProfile" WHERE "source" = 'llm'`
  );

  console.log(`Keyword profiles to delete: ${keywordCount.rows[0].count}`);
  console.log(`Podcasts to re-process: ${affectedPodcasts.rows[0].count}`);
  console.log(`LLM profiles kept: ${llmKept.rows[0].count}`);

  if (!isExec) {
    console.log("\nPass --exec to execute. Exiting dry run.");
    process.exit(0);
  }

  // Find affected podcast IDs before deleting
  const podcastIds = await client.query(
    `SELECT DISTINCT "podcastId" FROM "PodcastGeoProfile" WHERE "source" = 'keyword'`
  );

  // Delete all keyword-sourced profiles
  const deleted = await client.query(
    `DELETE FROM "PodcastGeoProfile" WHERE "source" = 'keyword'`
  );
  console.log(`\nDeleted ${deleted.rowCount} keyword profiles`);

  // Reset geoProcessedAt so cron re-evaluates these podcasts via LLM
  const ids = podcastIds.rows.map((r: any) => r.podcastId);
  if (ids.length > 0) {
    const reset = await client.query(
      `UPDATE "Podcast" SET "geoProcessedAt" = NULL WHERE "id" = ANY($1)`,
      [ids]
    );
    console.log(`Reset geoProcessedAt on ${reset.rowCount} podcasts`);
  }

  console.log("\nDone. These podcasts will be re-processed by the LLM-primary geo-tagging cron.");
} finally {
  await client.end();
}
