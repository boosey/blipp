/**
 * One-off: backfill podcast + episode slugs on production via a direct
 * Postgres connection with bounded concurrency. Much faster than the
 * sequential Worker endpoint for the ~255k-episode backfill.
 *
 * Usage: npx tsx scripts/backfill-slugs-prod.ts
 */
import pg from "pg";
import { config } from "dotenv";
import { slugify } from "../worker/lib/slugify";

// Local replacement for uniqueSlug that uses a stable id-based fallback
// instead of Date.now() (which collides under rapid generation).
function uniqueSlugSafe(title: string, id: string, existing: Set<string>): string {
  const base = slugify(title || "");
  if (base) {
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
  let slug = `item-${id.slice(-10)}`;
  let i = 2;
  while (existing.has(slug)) slug = `item-${id.slice(-10)}-${i++}`;
  return slug;
}

config({ path: "neon-config.env" });
const url = process.env.PRODUCTION_DATABASE_URL;
if (!url) {
  console.error("Missing PRODUCTION_DATABASE_URL in neon-config.env");
  process.exit(1);
}

const CONCURRENCY = 25;

async function runPool<T>(
  items: T[],
  worker: (item: T, i: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  // Use a Pool so CONCURRENCY workers actually run in parallel.
  // A single pg.Client serializes queries on one wire — kills throughput.
  const pool = new pg.Pool({ connectionString: url, max: CONCURRENCY });
  const client = pool;
  console.log("[PRODUCTION] connected");

  // --- Podcasts ---
  console.log("Fetching podcasts...");
  const pNull = await client.query<{ id: string; title: string }>(
    `SELECT "id", "title" FROM "Podcast" WHERE "slug" IS NULL`
  );
  const pExisting = await client.query<{ slug: string }>(
    `SELECT "slug" FROM "Podcast" WHERE "slug" IS NOT NULL`
  );
  const podcastSlugs = new Set<string>(pExisting.rows.map((r) => r.slug));
  console.log(`Podcasts: ${pNull.rowCount} to backfill (${pExisting.rowCount} already slugged)`);

  let pDone = 0;
  const pStart = Date.now();
  // Generate unique slugs serially (the set mutation isn't thread-safe),
  // then apply the writes with a worker pool.
  const podcastWrites: { id: string; slug: string }[] = [];
  for (const row of pNull.rows) {
    const slug = uniqueSlugSafe(row.title || "", row.id, podcastSlugs);
    podcastSlugs.add(slug);
    podcastWrites.push({ id: row.id, slug });
  }
  await runPool(podcastWrites, async ({ id, slug }) => {
    await client.query(`UPDATE "Podcast" SET "slug" = $1 WHERE "id" = $2`, [slug, id]);
    pDone++;
    if (pDone % 100 === 0) {
      const rate = pDone / ((Date.now() - pStart) / 1000);
      console.log(`  podcasts: ${pDone}/${podcastWrites.length} (${rate.toFixed(0)}/s)`);
    }
  });
  console.log(`Podcasts done: ${pDone} in ${((Date.now() - pStart) / 1000).toFixed(1)}s`);

  // --- Episodes (scoped per podcast) ---
  console.log("Fetching episodes...");
  // Slugs are generated for every episode on ingest (feed-refresh.ts).
  // publicPage is the SEO gate, not slug presence — so backfill all nulls.
  const eNull = await client.query<{ id: string; title: string; podcastId: string }>(
    `SELECT "id", "title", "podcastId" FROM "Episode" WHERE "slug" IS NULL ORDER BY "publishedAt" ASC NULLS LAST`
  );
  const eExisting = await client.query<{ podcastId: string; slug: string }>(
    `SELECT "podcastId", "slug" FROM "Episode" WHERE "slug" IS NOT NULL`
  );
  console.log(`Episodes: ${eNull.rowCount} to backfill (${eExisting.rowCount} already slugged)`);

  const byPodcast = new Map<string, Set<string>>();
  for (const r of eExisting.rows) {
    let set = byPodcast.get(r.podcastId);
    if (!set) { set = new Set<string>(); byPodcast.set(r.podcastId, set); }
    set.add(r.slug);
  }

  const episodeWrites: { id: string; slug: string }[] = [];
  for (const row of eNull.rows) {
    let set = byPodcast.get(row.podcastId);
    if (!set) { set = new Set<string>(); byPodcast.set(row.podcastId, set); }
    const slug = uniqueSlugSafe(row.title || "", row.id, set);
    set.add(slug);
    episodeWrites.push({ id: row.id, slug });
  }

  let eDone = 0;
  const eStart = Date.now();
  await runPool(episodeWrites, async ({ id, slug }) => {
    await client.query(`UPDATE "Episode" SET "slug" = $1 WHERE "id" = $2`, [slug, id]);
    eDone++;
    if (eDone % 1000 === 0) {
      const rate = eDone / ((Date.now() - eStart) / 1000);
      const etaSec = (episodeWrites.length - eDone) / rate;
      console.log(`  episodes: ${eDone}/${episodeWrites.length} (${rate.toFixed(0)}/s, ETA ${(etaSec / 60).toFixed(1)} min)`);
    }
  });
  console.log(`Episodes done: ${eDone} in ${((Date.now() - eStart) / 1000).toFixed(1)}s`);

  // --- Step 3: flip publicPage=true for eligible episodes ---
  console.log("Enabling public pages...");
  const pp = await client.query(
    `UPDATE "Episode" e
        SET "publicPage" = true
       FROM "Podcast" p
      WHERE e."podcastId" = p."id"
        AND e."publicPage" = false
        AND e."slug" IS NOT NULL
        AND p."slug" IS NOT NULL
        AND p."deliverable" = true
        AND (EXISTS (SELECT 1 FROM "Distillation" d WHERE d."episodeId" = e."id" AND d."status" = 'COMPLETED')
          OR EXISTS (SELECT 1 FROM "Clip" c WHERE c."episodeId" = e."id" AND c."status" = 'COMPLETED'))`
  );
  console.log(`publicPage enabled on ${pp.rowCount} episodes`);

  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
