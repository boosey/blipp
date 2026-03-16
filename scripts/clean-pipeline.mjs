#!/usr/bin/env node
/**
 * Cleans all pipeline data from DB and R2.
 *
 * DB: cleaned directly via pg.
 * R2: cleaned via the worker's internal API using CLERK_SECRET_KEY as auth.
 *
 * Usage:
 *   npm run clean:pipeline:staging
 *   npm run clean:pipeline:staging:dry
 *   npm run clean:pipeline:staging -- --db-only
 */
import { readFileSync } from "node:fs";
import pg from "pg";

// ── Config ──

const dryRun = process.argv.includes("--dry-run");
const staging = process.argv.includes("--staging");
const dbOnly = process.argv.includes("--db-only");

const APP_ORIGINS = {
  staging: "https://blipp-staging.boosey-boudreaux.workers.dev",
  local: "http://localhost:8787",
};

// ── Helpers ──

function readEnvVar(file, key) {
  try {
    const content = readFileSync(file, "utf8");
    const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
  return null;
}

function getDatabaseUrl() {
  if (staging) {
    const url =
      readEnvVar("neon-config.env", "STAGING_DATABASE_URL") ||
      process.env.DATABASE_URL;
    if (url) return url;
    console.error("ERROR: No STAGING_DATABASE_URL in neon-config.env or DATABASE_URL in environment");
    process.exit(1);
  }
  const url =
    readEnvVar(".dev.vars", "DATABASE_URL") ||
    process.env.DATABASE_URL;
  if (url) return url;
  console.error("ERROR: No DATABASE_URL found in .dev.vars or environment");
  process.exit(1);
}

function getClerkSecretKey() {
  return (
    readEnvVar("secrets-staging.env", "CLERK_SECRET_KEY") ||
    readEnvVar(".dev.vars", "CLERK_SECRET_KEY") ||
    process.env.CLERK_SECRET_KEY
  );
}

// ── Main ──

async function main() {
  const env = staging ? "STAGING" : "LOCAL";
  const label = dryRun ? `DRY RUN (${env})` : `CLEANING PIPELINE DATA (${env})`;
  console.log(`\n=== ${label} ===\n`);

  // ── 1. R2 cleanup (no token expiry — uses server secret) ──

  if (dbOnly) {
    console.log("  Skipping R2 cleanup (--db-only)\n");
  } else {
    const origin = staging ? APP_ORIGINS.staging : APP_ORIGINS.local;
    const endpoint = `${origin}/api/internal/clean/work-products`;
    const secret = getClerkSecretKey();

    if (!secret) {
      console.log("  WARN: No CLERK_SECRET_KEY found — skipping R2 cleanup");
    } else if (dryRun) {
      console.log(`  [dry-run] Would call DELETE ${endpoint}`);
    } else {
      console.log("  Cleaning R2 work products...");
      try {
        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secret}` },
        });
        if (!res.ok) {
          const body = await res.text();
          console.log(`  WARN: R2 cleanup failed (${res.status}): ${body}`);
        } else {
          const data = await res.json();
          console.log(`  R2 cleanup done: ${data.data.deleted} objects deleted`);
        }
      } catch (err) {
        console.log(`  WARN: R2 cleanup failed: ${err.message}`);
      }
    }
  }

  // ── 2. Database cleanup ──

  const url = getDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  console.log("\n  Connected to database\n");

  const tables = [
    ["FeedItem", '"FeedItem"'],
    ["Briefing", '"Briefing"'],
    ["PipelineEvent", '"PipelineEvent"'],
    ["PipelineStep", '"PipelineStep"'],
    ["WorkProduct", '"WorkProduct"'],
    ["PipelineJob", '"PipelineJob"'],
    ["BriefingRequest", '"BriefingRequest"'],
    ["Clip", '"Clip"'],
    ["Distillation", '"Distillation"'],
    ["Subscription", '"Subscription"'],
    ["AiServiceError", '"AiServiceError"'],
  ];

  for (const [label, table] of tables) {
    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    const count = parseInt(countResult.rows[0].count);
    if (dryRun) {
      console.log(`  [dry-run] Would delete ${count} rows from ${label}`);
    } else {
      await client.query(`DELETE FROM ${table}`);
      console.log(`  Deleted ${count} rows from ${label}`);
    }
  }

  await client.end();
  console.log("\n  Database cleanup done");

  console.log("\n=== DONE ===\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
