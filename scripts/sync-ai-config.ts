/**
 * Sync AI configuration from production to staging.
 * Copies: AiModel, AiModelProvider, stage config (PlatformConfig ai.*), and PromptVersion.
 *
 * Usage: npx tsx scripts/sync-ai-config.ts
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";

// Load connection strings
dotenv.config({ path: ".env" }); // staging
const stagingUrl = process.env.DATABASE_URL;

const neonConfig = fs.existsSync("neon-config.env")
  ? dotenv.parse(fs.readFileSync("neon-config.env"))
  : {};
const prodUrl = neonConfig.PRODUCTION_DATABASE_URL || neonConfig.DATABASE_URL;

if (!stagingUrl || !prodUrl) {
  console.error("Missing DATABASE_URL in .env (staging) or neon-config.env (production)");
  process.exit(1);
}

async function main() {
  const prod = new pg.Client({ connectionString: prodUrl });
  const staging = new pg.Client({ connectionString: stagingUrl });

  await prod.connect();
  await staging.connect();
  console.log("Connected to both databases.");

  try {
    // 1. Sync AiModel
    console.log("\n=== Syncing AiModel ===");
    const { rows: prodModels } = await prod.query('SELECT * FROM "AiModel"');
    console.log(`Production has ${prodModels.length} models`);

    // Clear staging and insert
    await staging.query('DELETE FROM "AiModelProvider"'); // FK dependency
    await staging.query('DELETE FROM "AiModel"');
    for (const m of prodModels) {
      await staging.query(
        `INSERT INTO "AiModel" ("id", "modelId", "label", "developer", "notes", "isActive", "createdAt", "stages")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [m.id, m.modelId, m.label, m.developer, m.notes, m.isActive, m.createdAt, m.stages]
      );
    }
    console.log(`Inserted ${prodModels.length} models into staging`);

    // 2. Sync AiModelProvider
    console.log("\n=== Syncing AiModelProvider ===");
    const { rows: prodProviders } = await prod.query('SELECT * FROM "AiModelProvider"');
    console.log(`Production has ${prodProviders.length} providers`);

    for (const p of prodProviders) {
      await staging.query(
        `INSERT INTO "AiModelProvider" ("id", "aiModelId", "provider", "providerModelId", "providerLabel",
         "pricePerMinute", "priceInputPerMToken", "priceOutputPerMToken", "pricePerKChars",
         "isDefault", "isAvailable", "priceUpdatedAt", "createdAt", "updatedAt", "limits")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          p.id, p.aiModelId, p.provider, p.providerModelId, p.providerLabel,
          p.pricePerMinute, p.priceInputPerMToken, p.priceOutputPerMToken, p.pricePerKChars,
          p.isDefault, p.isAvailable, p.priceUpdatedAt, p.createdAt, p.updatedAt,
          p.limits ? JSON.stringify(p.limits) : null,
        ]
      );
    }
    console.log(`Inserted ${prodProviders.length} providers into staging`);

    // 3. Sync PlatformConfig for ai.* and prompt.* keys
    console.log("\n=== Syncing PlatformConfig (ai.* and prompt.*) ===");
    const { rows: prodConfigs } = await prod.query(
      `SELECT * FROM "PlatformConfig" WHERE "key" LIKE 'ai.%' OR "key" LIKE 'prompt.%'`
    );
    console.log(`Production has ${prodConfigs.length} ai/prompt config entries`);

    // Delete staging entries for these keys
    await staging.query(
      `DELETE FROM "PlatformConfig" WHERE "key" LIKE 'ai.%' OR "key" LIKE 'prompt.%'`
    );
    for (const c of prodConfigs) {
      await staging.query(
        `INSERT INTO "PlatformConfig" ("id", "key", "value", "description", "updatedAt", "updatedBy")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.id, c.key, JSON.stringify(c.value), c.description, c.updatedAt, c.updatedBy]
      );
    }
    console.log(`Inserted ${prodConfigs.length} config entries into staging`);

    // 4. Sync PromptVersion
    console.log("\n=== Syncing PromptVersion ===");
    const { rows: prodPrompts } = await prod.query('SELECT * FROM "PromptVersion"');
    console.log(`Production has ${prodPrompts.length} prompt versions`);

    await staging.query('DELETE FROM "PromptVersion"');
    for (const p of prodPrompts) {
      const cols = Object.keys(p);
      const vals = Object.values(p).map((v) =>
        v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v
      );
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const quotedCols = cols.map((c) => `"${c}"`).join(", ");
      await staging.query(
        `INSERT INTO "PromptVersion" (${quotedCols}) VALUES (${placeholders})`,
        vals
      );
    }
    console.log(`Inserted ${prodPrompts.length} prompt versions into staging`);

    console.log("\n✅ Sync complete!");
  } finally {
    await prod.end();
    await staging.end();
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
