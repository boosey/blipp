#!/usr/bin/env node
/**
 * Cleans all user-generated and pipeline data: feed items, briefings,
 * subscriptions, requests, jobs, steps, work products, clips,
 * distillations, and their R2 objects.
 *
 * Uses raw `pg` (not Prisma) to avoid runtime/adapter issues.
 * Uses `wrangler r2 object delete` for R2 cleanup.
 *
 * Usage:  node scripts/clean-pipeline.mjs [--dry-run]
 * Env:    DATABASE_URL from .dev.vars
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";

// ── Config ──

const dryRun = process.argv.includes("--dry-run");
const BUCKET = "blipp-audio";
const R2_PREFIXES = ["wp/", "clips/", "briefings/"];

// ── DB connection ──

function getDatabaseUrl() {
  try {
    const devvars = readFileSync(".dev.vars", "utf8");
    const match = devvars.match(/^DATABASE_URL=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  console.error("ERROR: No DATABASE_URL found in .dev.vars or environment");
  process.exit(1);
}

// ── R2 cleanup ──

function listR2Objects(prefix) {
  try {
    const output = execFileSync(
      "npx",
      ["wrangler", "r2", "object", "list", BUCKET, `--prefix=${prefix}`],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: true }
    );
    const parsed = JSON.parse(output);
    return parsed.map((obj) => obj.key);
  } catch {
    return [];
  }
}

function deleteR2Object(key) {
  try {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "delete", `${BUCKET}/${key}`],
      { stdio: ["pipe", "pipe", "pipe"], shell: true }
    );
    return true;
  } catch {
    return false;
  }
}

// ── Main ──

async function main() {
  console.log(dryRun ? "\n=== DRY RUN ===" : "\n=== CLEANING PIPELINE DATA ===");

  // ── 1. Database cleanup ──

  const url = getDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  console.log("Connected to database\n");

  // Delete order respects FK constraints (children first)
  const tables = [
    ["FeedItem", '"FeedItem"'],
    ["Briefing", '"Briefing"'],
    ["PipelineStep", '"PipelineStep"'],
    ["WorkProduct", '"WorkProduct"'],
    ["PipelineJob", '"PipelineJob"'],
    ["BriefingRequest", '"BriefingRequest"'],
    ["Clip", '"Clip"'],
    ["Distillation", '"Distillation"'],
    ["Subscription", '"Subscription"'],
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
  console.log("\nDatabase cleanup done\n");

  // ── 2. R2 cleanup ──

  console.log("Scanning R2 objects...");
  let totalR2 = 0;
  let deletedR2 = 0;

  for (const prefix of R2_PREFIXES) {
    const keys = listR2Objects(prefix);
    totalR2 += keys.length;

    if (keys.length === 0) {
      console.log(`  ${prefix}* — no objects`);
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] Would delete ${keys.length} objects under ${prefix}*`);
      continue;
    }

    console.log(`  Deleting ${keys.length} objects under ${prefix}*`);
    for (const key of keys) {
      if (deleteR2Object(key)) {
        deletedR2++;
      } else {
        console.log(`    WARN: failed to delete ${key}`);
      }
    }
  }

  console.log(`\nR2 cleanup done (${dryRun ? `${totalR2} would be deleted` : `${deletedR2}/${totalR2} deleted`})`);
  console.log("\n=== DONE ===\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
