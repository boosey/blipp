/**
 * Prune Podcast Index-sourced podcasts that have no user activity.
 *
 * Keeps:
 *   - All Apple-sourced podcasts
 *   - PI podcasts with subscriptions, favorites, or completed clips (blipps)
 *
 * All FK constraints are ON DELETE CASCADE, so deleting a Podcast row
 * automatically removes Episodes, Clips, Distillations, PipelineJobs,
 * FeedItems, Briefings, PipelineSteps, PipelineEvents, etc.
 *
 * Usage:
 *   npx tsx scripts/prune-pi-podcasts.ts          # dry run (default)
 *   npx tsx scripts/prune-pi-podcasts.ts --live    # actually delete
 *   npx tsx scripts/prune-pi-podcasts.ts --prod    # target production (dry run)
 *   npx tsx scripts/prune-pi-podcasts.ts --prod --live  # delete from production
 */
import pg from "pg";
import { config } from "dotenv";

const isProd = process.argv.includes("--prod");
const isLive = process.argv.includes("--live");

let url: string | undefined;
if (isProd) {
  config({ path: "neon-config.env" });
  url = process.env.PRODUCTION_DATABASE_URL;
  if (!url) {
    console.error("Missing PRODUCTION_DATABASE_URL in neon-config.env");
    process.exit(1);
  }
} else {
  config();
  url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }
}

const env = isProd ? "PRODUCTION" : "STAGING";
console.log(`[${env}] ${isLive ? "🔴 LIVE MODE" : "🟡 DRY RUN"}\n`);

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  // Identify podcasts to protect (PI-sourced with user activity)
  const protectedQuery = `
    SELECT p."id", p."title"
    FROM "Podcast" p
    WHERE p."source" = 'podcast-index'
      AND (
        EXISTS (SELECT 1 FROM "Subscription" s WHERE s."podcastId" = p."id")
        OR EXISTS (SELECT 1 FROM "PodcastFavorite" f WHERE f."podcastId" = p."id")
        OR EXISTS (
          SELECT 1 FROM "Episode" e
          JOIN "Clip" cl ON cl."episodeId" = e."id"
          WHERE e."podcastId" = p."id" AND cl."status" = 'COMPLETED'
        )
      )
    ORDER BY p."title"
  `;
  const protected_ = await client.query(protectedQuery);
  console.log(`Protected PI podcasts (have user activity): ${protected_.rowCount}`);
  for (const row of protected_.rows) {
    console.log(`  ✓ ${row.title}`);
  }

  const protectedIds = protected_.rows.map((r: any) => r.id);

  // Count what will be deleted
  const countQuery = `
    SELECT COUNT(*) as cnt
    FROM "Podcast"
    WHERE "source" = 'podcast-index'
      ${protectedIds.length > 0 ? `AND "id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}
  `;
  const countResult = await client.query(countQuery);
  const deleteCount = parseInt(countResult.rows[0].cnt);

  // Count related data that will cascade
  const cascadeQuery = `
    SELECT
      (SELECT COUNT(*) FROM "Episode" e JOIN "Podcast" p ON e."podcastId" = p."id"
       WHERE p."source" = 'podcast-index'
       ${protectedIds.length > 0 ? `AND p."id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}) as episodes,
      (SELECT COUNT(*) FROM "Clip" cl JOIN "Episode" e ON cl."episodeId" = e."id" JOIN "Podcast" p ON e."podcastId" = p."id"
       WHERE p."source" = 'podcast-index'
       ${protectedIds.length > 0 ? `AND p."id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}) as clips,
      (SELECT COUNT(*) FROM "Distillation" d JOIN "Episode" e ON d."episodeId" = e."id" JOIN "Podcast" p ON e."podcastId" = p."id"
       WHERE p."source" = 'podcast-index'
       ${protectedIds.length > 0 ? `AND p."id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}) as distillations,
      (SELECT COUNT(*) FROM "PipelineJob" pj JOIN "Episode" e ON pj."episodeId" = e."id" JOIN "Podcast" p ON e."podcastId" = p."id"
       WHERE p."source" = 'podcast-index'
       ${protectedIds.length > 0 ? `AND p."id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}) as pipeline_jobs
  `;
  const cascadeResult = await client.query(cascadeQuery);
  const cascade = cascadeResult.rows[0];

  console.log(`\nWill delete:`);
  console.log(`  Podcasts:      ${deleteCount}`);
  console.log(`  Episodes:      ${cascade.episodes}`);
  console.log(`  Clips:         ${cascade.clips}`);
  console.log(`  Distillations: ${cascade.distillations}`);
  console.log(`  PipelineJobs:  ${cascade.pipeline_jobs}`);
  console.log(`  (+ PodcastCategories, FeedItems, PipelineSteps, PipelineEvents, etc. via CASCADE)`);

  // Remaining after delete
  const remainQuery = `SELECT COUNT(*) as cnt FROM "Podcast" WHERE "source" = 'apple' OR ("source" = 'podcast-index' AND "id" IN (${protectedIds.length > 0 ? protectedIds.map((id: string) => `'${id}'`).join(",") : "'none'"}))`;
  const remainResult = await client.query(remainQuery);
  console.log(`\nWill remain: ${remainResult.rows[0].cnt} podcasts`);

  if (!isLive) {
    console.log(`\n⚠️  DRY RUN — no changes made. Re-run with --live to execute.`);
  } else {
    console.log(`\nDeleting ${deleteCount} podcasts...`);
    const deleteQuery = `
      DELETE FROM "Podcast"
      WHERE "source" = 'podcast-index'
        ${protectedIds.length > 0 ? `AND "id" NOT IN (${protectedIds.map((id: string) => `'${id}'`).join(",")})` : ""}
    `;
    const deleteResult = await client.query(deleteQuery);
    console.log(`✅ Deleted ${deleteResult.rowCount} podcasts (and all cascaded data).`);

    const finalCount = await client.query(`SELECT COUNT(*) as cnt FROM "Podcast"`);
    console.log(`Final podcast count: ${finalCount.rows[0].cnt}`);
  }
} catch (err: any) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
