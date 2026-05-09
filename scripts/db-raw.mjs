import pg from "pg";
import { config } from "dotenv";

const isProd = process.argv.includes("--prod");
const sql = process.argv.filter((a) => a !== "--prod").slice(2).join(" ");
if (!sql) {
  console.error('Usage: node scripts/db-raw.mjs [--prod] "SELECT ..."');
  process.exit(1);
}

config({ path: isProd ? "neon-config.env" : ".env" });
const url = isProd ? process.env.PRODUCTION_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DB URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query(sql);
  for (const row of result.rows) {
    const vals = Object.values(row).map((v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim()));
    process.stdout.write(vals.join("\t") + "\n");
  }
  process.stderr.write(`(${result.rowCount} rows)\n`);
} finally {
  await client.end();
}
