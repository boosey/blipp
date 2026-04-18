import pg from "pg";
import dotenvx from "@dotenvx/dotenvx";

const isProd = process.argv.includes("--prod");
if (isProd) {
  dotenvx.config({ path: "neon-config.env", quiet: true });
} else {
  dotenvx.config({ quiet: true });
}

const connStr = isProd ? process.env.PRODUCTION_DATABASE_URL : process.env.DATABASE_URL;
if (!connStr) { console.error("No connection string"); process.exit(1); }

console.log(`[${isProd ? "PRODUCTION" : "STAGING"}]`);

const client = new pg.Client({ connectionString: connStr });
await client.connect();

const keys = [
  { id: "geo_cfg_batch", key: "geoClassification.batchSize", value: 2000, desc: "Max podcasts to geo-tag per cron run" },
  { id: "geo_cfg_llmbatch", key: "geoClassification.llmBatchSize", value: 10, desc: "Podcasts per LLM classification call" },
];

for (const k of keys) {
  const res = await client.query(
    `INSERT INTO "PlatformConfig" ("id", "key", "value", "description", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ("key") DO NOTHING`,
    [k.id, k.key, JSON.stringify(k.value), k.desc]
  );
  console.log(`${k.key}: ${res.rowCount ? "inserted" : "already exists"}`);
}

// Also update description on existing llmProviderId if missing
await client.query(
  `UPDATE "PlatformConfig" SET "description" = $1 WHERE "key" = $2 AND "description" IS NULL`,
  ["AiModelProvider ID for LLM geo classification", "geoClassification.llmProviderId"]
);

const all = await client.query(
  `SELECT "key", "value", "description" FROM "PlatformConfig" WHERE "key" LIKE 'geoClassification%' ORDER BY "key"`
);
console.table(all.rows);

await client.end();
