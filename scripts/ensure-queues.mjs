#!/usr/bin/env node
/**
 * Ensures every Cloudflare Queue referenced in wrangler.jsonc exists on the
 * Cloudflare account. Idempotent — "already exists" responses are treated as
 * success. Run this before `wrangler deploy` so a newly added queue binding
 * never fails the deploy with `Queue "X" does not exist`.
 *
 * Usage:
 *   node scripts/ensure-queues.mjs staging              # create missing staging queues
 *   node scripts/ensure-queues.mjs production           # create missing production queues
 *   node scripts/ensure-queues.mjs <env> --dry-run      # list without creating
 *
 * Auth: uses CLOUDFLARE_API_TOKEN env var (CI) or an existing `wrangler login` (local).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const env = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!env || !["staging", "production"].includes(env)) {
  console.error("Usage: node scripts/ensure-queues.mjs <staging|production> [--dry-run]");
  process.exit(1);
}

function stripJsonc(src) {
  let out = "", i = 0, inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === "\\") { out += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '"') inStr = false;
      out += src[i++];
    } else if (src[i] === '"') {
      inStr = true; out += src[i++];
    } else if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += src[i++];
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

const config = JSON.parse(stripJsonc(readFileSync("wrangler.jsonc", "utf8")));
const queuesBlock = env === "staging" ? config.queues : config.env?.production?.queues;

if (!queuesBlock) {
  console.error(`No queues block for env=${env}`);
  process.exit(1);
}

const names = new Set();
for (const p of queuesBlock.producers ?? []) if (p.queue) names.add(p.queue);
for (const c of queuesBlock.consumers ?? []) {
  if (c.queue) names.add(c.queue);
  if (c.dead_letter_queue) names.add(c.dead_letter_queue);
}

const sorted = [...names].sort();
console.log(`Found ${sorted.length} queue(s) referenced in wrangler.jsonc (env=${env}):`);
for (const n of sorted) console.log(`  - ${n}`);

if (dryRun) {
  console.log("\n[dry-run] Skipping creation.");
  process.exit(0);
}

let failures = 0;
let created = 0;
let existed = 0;

for (const name of sorted) {
  process.stdout.write(`Ensuring queue: ${name} ... `);
  const result = spawnSync("npx", ["wrangler", "queues", "create", name], {
    encoding: "utf8",
    shell: true,
  });
  const combined = (result.stdout || "") + (result.stderr || "");
  if (result.status === 0) {
    console.log("created");
    created++;
  } else if (/code:\s*11009|is already taken|already exists/i.test(combined)) {
    console.log("exists");
    existed++;
  } else {
    console.log("FAILED");
    console.error(combined);
    failures++;
  }
}

console.log(`\nSummary: ${created} created, ${existed} already existed, ${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
