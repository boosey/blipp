// Drops and recreates the public schema in the shadow DB.
// Used when the shadow DB has leftover state Prisma can't reset itself
// (e.g. a Neon branch provisioned from a non-empty source).
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: "neon-config.env" });

const url = process.env.SHADOW_DATABASE_URL;
if (!url) {
  console.error("SHADOW_DATABASE_URL not set in neon-config.env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
  await client.query("CREATE SCHEMA public;");
  await client.query("GRANT ALL ON SCHEMA public TO public;");
  console.log("shadow DB reset: public schema dropped + recreated");
} finally {
  await client.end();
}
