/**
 * Run a raw SQL query against staging or production.
 * Usage: npx tsx scripts/db-query.ts [--prod] "SELECT ..."
 *
 * Staging: uses DATABASE_URL from .env (default)
 * Production: uses PRODUCTION_DATABASE_URL from neon-config.env
 */
import pg from "pg";
import { config } from "dotenv";

const isProd = process.argv.includes("--prod");
const sql = process.argv.filter((a) => a !== "--prod").slice(2).join(" ");

if (!sql) {
  console.error('Usage: npx tsx scripts/db-query.ts [--prod] "SELECT ..."');
  process.exit(1);
}

let url: string | undefined;
if (isProd) {
  config({ path: "neon-config.env" });
  url = process.env.PRODUCTION_DATABASE_URL;
  if (!url) {
    console.error("Missing PRODUCTION_DATABASE_URL in neon-config.env");
    console.error("Copy scripts/templates/neon-config.env.template to neon-config.env and fill in the production URL.");
    process.exit(1);
  }
} else {
  config(); // loads .env
  url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }
}

console.error(`[${isProd ? "PRODUCTION" : "STAGING"}]`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query(sql);
  if (result.rows.length === 0) {
    console.log("(0 rows)");
  } else {
    console.table(result.rows);
    console.log(`(${result.rowCount} rows)`);
  }
} catch (err: any) {
  console.error("Query error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
