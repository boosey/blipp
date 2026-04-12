/**
 * One-off: decode HTML entities (&amp; &lt; etc.) in podcast and episode
 * title, description, and author fields.
 *
 * Usage:
 *   npx tsx scripts/fix-html-entities.ts              # staging (default)
 *   npx tsx scripts/fix-html-entities.ts production    # production
 *   npx tsx scripts/fix-html-entities.ts --dry-run     # preview only
 */
import pg from "pg";
import { config } from "dotenv";
import { decodeHtmlEntities } from "../worker/lib/html-entities";

config({ path: "neon-config.env" });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const isProd = args.includes("production");

const url = isProd
  ? process.env.PRODUCTION_DATABASE_URL
  : process.env.STAGING_DATABASE_URL;

if (!url) {
  console.error(
    `Missing ${isProd ? "PRODUCTION" : "STAGING"}_DATABASE_URL in neon-config.env`
  );
  process.exit(1);
}

const BATCH = 500;

async function fixTable(
  client: pg.Client,
  table: string,
  columns: string[]
): Promise<number> {
  // Find rows where any column contains an HTML entity
  const entityPattern = "&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|bull|hellip|copy|reg|trade|#[0-9]+|#x[0-9a-fA-F]+);";
  const whereClauses = columns.map((col) => `"${col}" ~ '${entityPattern}'`);
  const where = whereClauses.join(" OR ");

  const countResult = await client.query(
    `SELECT COUNT(*) as cnt FROM "${table}" WHERE ${where}`
  );
  const total = parseInt(countResult.rows[0].cnt, 10);
  console.log(`[${table}] ${total} rows with HTML entities in ${columns.join(", ")}`);

  if (total === 0 || dryRun) return total;

  let updated = 0;
  let offset = 0;

  while (offset < total + BATCH) {
    // Fetch a batch of affected rows
    const rows = await client.query(
      `SELECT "id", ${columns.map((c) => `"${c}"`).join(", ")}
       FROM "${table}"
       WHERE ${where}
       LIMIT ${BATCH}`
    );

    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      const updates: string[] = [];
      const values: string[] = [row.id];
      let paramIdx = 2;

      for (const col of columns) {
        if (!row[col]) continue;
        const decoded = decodeHtmlEntities(row[col]);
        if (decoded !== row[col]) {
          updates.push(`"${col}" = $${paramIdx}`);
          values.push(decoded);
          paramIdx++;
        }
      }

      if (updates.length > 0) {
        await client.query(
          `UPDATE "${table}" SET ${updates.join(", ")} WHERE "id" = $1`,
          values
        );
        updated++;
      }
    }

    offset += rows.rows.length;
    console.log(`[${table}] ${updated} rows updated so far...`);
  }

  console.log(`[${table}] Done. ${updated} rows updated.`);
  return updated;
}

async function main() {
  console.log(`Target: ${isProd ? "PRODUCTION" : "STAGING"}${dryRun ? " (DRY RUN)" : ""}`);

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const podcastCount = await fixTable(client, "Podcast", ["title", "description", "author"]);
    const episodeCount = await fixTable(client, "Episode", ["title", "description"]);

    console.log("\n=== Summary ===");
    console.log(`Podcasts: ${podcastCount} rows affected`);
    console.log(`Episodes: ${episodeCount} rows affected`);
    if (dryRun) console.log("(Dry run — no changes written)");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
