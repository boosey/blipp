/**
 * Wipe and repopulate model registry + platform config on staging from production.
 *
 * Clears on staging:
 *   - AiModelProvider (FK child first)
 *   - AiModel
 *   - PlatformConfig rows where key LIKE 'ai.%' OR 'prompt.%'
 *
 * Then inserts fresh copies from prod.
 *
 * Usage: npx tsx scripts/sync-prod-to-staging.ts
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: "neon-config.env" });
config();

const prodUrl = process.env.PRODUCTION_DATABASE_URL;
const stagingUrl = process.env.DATABASE_URL;

if (!prodUrl) { console.error("Missing PRODUCTION_DATABASE_URL in neon-config.env"); process.exit(1); }
if (!stagingUrl) { console.error("Missing DATABASE_URL in .env"); process.exit(1); }

const prod = new pg.Client({ connectionString: prodUrl });
const staging = new pg.Client({ connectionString: stagingUrl });

await prod.connect();
await staging.connect();
console.log("Connected.\n");

try {
  // ── Read from prod ──────────────────────────────────────────────────────
  const { rows: models } = await prod.query(
    `SELECT "id","stages","modelId","label","developer","notes","isActive","createdAt" FROM "AiModel"`
  );
  const { rows: providers } = await prod.query(
    `SELECT "id","aiModelId","provider","providerModelId","providerLabel",
            "pricePerMinute","priceInputPerMToken","priceOutputPerMToken","pricePerKChars",
            "isDefault","isAvailable","priceUpdatedAt","limits","createdAt","updatedAt"
     FROM "AiModelProvider"`
  );
  const { rows: configs } = await prod.query(
    `SELECT "id","key","value","description","updatedAt","updatedBy"
     FROM "PlatformConfig"
     WHERE ("key" LIKE 'ai.%' OR "key" LIKE 'prompt.%') AND "value" IS NOT NULL`
  );

  const validConfigs = configs.filter(cfg => cfg.value !== null && cfg.value !== undefined);
  console.log(`Fetched from prod: ${models.length} models, ${providers.length} providers, ${validConfigs.length} config keys (${configs.length - validConfigs.length} null-value skipped).\n`);

  // ── Wipe staging ────────────────────────────────────────────────────────
  console.log("Wiping staging...");
  await staging.query(`DELETE FROM "AiModelProvider"`);
  console.log("  ✓ AiModelProvider cleared");
  await staging.query(`DELETE FROM "AiModel"`);
  console.log("  ✓ AiModel cleared");
  await staging.query(`DELETE FROM "PlatformConfig" WHERE "key" LIKE 'ai.%' OR "key" LIKE 'prompt.%'`);
  console.log("  ✓ PlatformConfig (ai.* / prompt.*) cleared\n");

  // ── Insert AiModel ──────────────────────────────────────────────────────
  console.log("Inserting AiModel...");
  for (const m of models) {
    await staging.query(
      `INSERT INTO "AiModel" ("id","stages","modelId","label","developer","notes","isActive","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, m.stages, m.modelId, m.label, m.developer, m.notes, m.isActive, m.createdAt]
    );
    const stagesStr = Array.isArray(m.stages) ? m.stages.join(",") : String(m.stages).replace(/[{}]/g, "");
    console.log(`  ${m.isActive ? "✓" : "✗"} [${stagesStr}] ${m.label}`);
  }
  console.log(`  → ${models.length} rows inserted.\n`);

  // ── Insert AiModelProvider ───────────────────────────────────────────────
  console.log("Inserting AiModelProvider...");
  for (const p of providers) {
    await staging.query(
      `INSERT INTO "AiModelProvider"
         ("id","aiModelId","provider","providerModelId","providerLabel",
          "pricePerMinute","priceInputPerMToken","priceOutputPerMToken","pricePerKChars",
          "isDefault","isAvailable","priceUpdatedAt","limits","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        p.id, p.aiModelId, p.provider, p.providerModelId, p.providerLabel,
        p.pricePerMinute, p.priceInputPerMToken, p.priceOutputPerMToken, p.pricePerKChars,
        p.isDefault, p.isAvailable, p.priceUpdatedAt,
        p.limits ? JSON.stringify(p.limits) : null,
        p.createdAt, p.updatedAt,
      ]
    );
    console.log(`  ✓ ${p.provider} / ${p.providerModelId ?? "(default)"}`);
  }
  console.log(`  → ${providers.length} rows inserted.\n`);

  // ── Insert PlatformConfig ────────────────────────────────────────────────
  console.log("Inserting PlatformConfig...");
  for (const cfg of validConfigs) {
    await staging.query(
      `INSERT INTO "PlatformConfig" ("id","key","value","description","updatedAt","updatedBy")
       VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
      [cfg.id, cfg.key, JSON.stringify(cfg.value), cfg.description, cfg.updatedAt, cfg.updatedBy]
    );
    console.log(`  ✓ ${cfg.key}`);
  }
  console.log(`  → ${validConfigs.length} rows inserted.\n`);

  console.log("Done. Staging now matches prod for model registry and ai/prompt config.");
} finally {
  await prod.end();
  await staging.end();
}
