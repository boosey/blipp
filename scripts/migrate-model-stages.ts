/**
 * Data migration: AiModel.stage (single) → AiModel.stages (array)
 *
 * 1. Add "stages" column as AiStage[]
 * 2. Populate stages = ARRAY[stage] for each row
 * 3. For duplicate modelIds across stages, merge into one row
 * 4. Remap AiModelProvider foreign keys and deduplicate
 * 5. Drop old stage column + unique constraint, add new modelId unique
 *
 * Usage:
 *   npx tsx scripts/migrate-model-stages.ts           # staging (default)
 *   npx tsx scripts/migrate-model-stages.ts --prod     # production
 *
 * Safe to re-run: checks column existence before acting.
 */
import pg from "pg";
import { config } from "dotenv";

const isProd = process.argv.includes("--prod");

if (isProd) {
  config({ path: "neon-config.env" });
} else {
  config();
}

const url = isProd ? process.env.PRODUCTION_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(`Missing ${isProd ? "PRODUCTION_DATABASE_URL" : "DATABASE_URL"}`);
  process.exit(1);
}

const db = new pg.Client({ connectionString: url });
await db.connect();
console.log(`Connected to ${isProd ? "PRODUCTION" : "STAGING"}.\n`);

try {
  // Check if migration already done (stages column exists and stage column gone)
  const { rows: cols } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'AiModel' AND column_name IN ('stage', 'stages')`
  );
  const colNames = cols.map((c: any) => c.column_name);
  const hasStage = colNames.includes("stage");
  const hasStages = colNames.includes("stages");

  if (hasStages && !hasStage) {
    console.log("Migration already complete (stages column exists, stage column gone). Nothing to do.");
    process.exit(0);
  }

  // Step 1: Add stages column if not exists
  if (!hasStages) {
    console.log("Step 1: Adding stages column...");
    await db.query(`ALTER TABLE "AiModel" ADD COLUMN "stages" "AiStage"[] NOT NULL DEFAULT '{}'`);
    console.log("  ✓ Added stages column.\n");
  } else {
    console.log("Step 1: stages column already exists.\n");
  }

  // Step 2: Populate stages from existing stage field
  if (hasStage) {
    console.log("Step 2: Populating stages from stage...");
    await db.query(`UPDATE "AiModel" SET "stages" = ARRAY["stage"] WHERE "stages" = '{}'`);
    console.log("  ✓ Populated stages.\n");
  }

  // Step 3: Find and merge duplicate modelIds
  console.log("Step 3: Merging duplicate modelIds...");
  const { rows: dupes } = await db.query(`
    SELECT "modelId", COUNT(*) as cnt,
           array_agg("id" ORDER BY "createdAt") as ids,
           array_agg(DISTINCT "stage") as all_stages
    FROM "AiModel"
    GROUP BY "modelId"
    HAVING COUNT(*) > 1
  `);

  if (dupes.length === 0) {
    console.log("  No duplicates found.\n");
  } else {
    for (const dup of dupes) {
      const ids = Array.isArray(dup.ids) ? dup.ids : String(dup.ids).replace(/[{}]/g, "").split(",");
      const keepId = ids[0]; // keep the earliest row
      const deleteIds = ids.slice(1);
      const allStages = Array.isArray(dup.all_stages) ? dup.all_stages : String(dup.all_stages).replace(/[{}]/g, "").split(",");
      const mergedStages = `{${allStages.join(",")}}`;

      console.log(`  Merging ${dup.modelId}: keeping ${keepId}, removing ${deleteIds.join(", ")}`);
      console.log(`    Merged stages: ${allStages.join(", ")}`);

      // Update the kept row with merged stages
      await db.query(`UPDATE "AiModel" SET "stages" = $1::"AiStage"[] WHERE "id" = $2`, [mergedStages, keepId]);

      // Remap providers from deleted rows to kept row
      for (const oldId of deleteIds) {
        // Get providers from the row being deleted
        const { rows: oldProviders } = await db.query(
          `SELECT "id", "provider" FROM "AiModelProvider" WHERE "aiModelId" = $1`, [oldId]
        );

        for (const prov of oldProviders) {
          // Check if kept row already has this provider
          const { rows: existing } = await db.query(
            `SELECT "id" FROM "AiModelProvider" WHERE "aiModelId" = $1 AND "provider" = $2`,
            [keepId, prov.provider]
          );

          if (existing.length > 0) {
            // Duplicate provider — delete the one from the row being removed
            await db.query(`DELETE FROM "AiModelProvider" WHERE "id" = $1`, [prov.id]);
            console.log(`    Deduped provider ${prov.provider} (kept existing)`);
          } else {
            // Remap to kept row
            await db.query(`UPDATE "AiModelProvider" SET "aiModelId" = $1 WHERE "id" = $2`, [keepId, prov.id]);
            console.log(`    Remapped provider ${prov.provider} → ${keepId}`);
          }
        }

        // Delete the duplicate AiModel row
        await db.query(`DELETE FROM "AiModel" WHERE "id" = $1`, [oldId]);
        console.log(`    Deleted duplicate row ${oldId}`);
      }
    }
    console.log();
  }

  // Step 4: Drop old stage column and constraints
  if (hasStage) {
    console.log("Step 4: Dropping old stage column and constraints...");

    // Drop old unique constraint
    await db.query(`ALTER TABLE "AiModel" DROP CONSTRAINT IF EXISTS "AiModel_stage_modelId_key"`);
    console.log("  ✓ Dropped AiModel_stage_modelId_key constraint.");

    // Drop old stage column
    await db.query(`ALTER TABLE "AiModel" DROP COLUMN "stage"`);
    console.log("  ✓ Dropped stage column.");

    // Add new unique constraint on modelId (if not already there from Prisma)
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiModel_modelId_key') THEN
          ALTER TABLE "AiModel" ADD CONSTRAINT "AiModel_modelId_key" UNIQUE ("modelId");
        END IF;
      END $$;
    `);
    console.log("  ✓ Added AiModel_modelId_key constraint.\n");
  }

  // Step 5: Remove default from stages column
  await db.query(`ALTER TABLE "AiModel" ALTER COLUMN "stages" DROP DEFAULT`);

  // Summary
  const { rows: summary } = await db.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE array_length("stages", 1) > 1) as multi_stage
    FROM "AiModel"
  `);
  const provCount = await db.query(`SELECT COUNT(*) as total FROM "AiModelProvider"`);

  console.log("Migration complete!");
  console.log(`  Models: ${summary[0].total} (${summary[0].multi_stage} multi-stage)`);
  console.log(`  Providers: ${provCount.rows[0].total}`);
} finally {
  await db.end();
}
