#!/usr/bin/env node
/**
 * Patches the Vite-generated wrangler.json with environment-specific values
 * from wrangler.jsonc. Needed because the Cloudflare Vite plugin always
 * generates a flat config from the top-level (staging) settings, ignoring
 * wrangler environments entirely.
 *
 * Usage: node scripts/patch-wrangler-env.mjs production
 */
import { readFileSync, writeFileSync } from "node:fs";

const env = process.argv[2];
if (!env) {
  console.error("Usage: node scripts/patch-wrangler-env.mjs <environment>");
  process.exit(1);
}

// Parse JSONC: strip comments (respecting strings) + trailing commas
function stripJsonc(src) {
  let out = "", i = 0, inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === "\\" ) { out += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '"') inStr = false;
      out += src[i++];
    } else if (src[i] === '"') {
      inStr = true; out += src[i++];
    } else if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += src[i++];
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

const raw = readFileSync("wrangler.jsonc", "utf8");
const wranglerConfig = JSON.parse(stripJsonc(raw));

const envConfig = wranglerConfig.env?.[env];
if (!envConfig) {
  console.error(`No "env.${env}" found in wrangler.jsonc`);
  process.exit(1);
}

// Read the Vite-generated config
const generatedPath = "dist/blipp_staging/wrangler.json";
const generated = JSON.parse(readFileSync(generatedPath, "utf8"));

// Patch with environment values
if (envConfig.name) generated.name = envConfig.name;
if (envConfig.vars) generated.vars = envConfig.vars;
if (envConfig.hyperdrive) generated.hyperdrive = envConfig.hyperdrive;
if (envConfig.r2_buckets) generated.r2_buckets = envConfig.r2_buckets;
if (envConfig.queues) generated.queues = envConfig.queues;
if (envConfig.ai) generated.ai = envConfig.ai;
if (envConfig.routes) generated.routes = envConfig.routes;
if (envConfig.triggers) generated.triggers = envConfig.triggers;

writeFileSync(generatedPath, JSON.stringify(generated, null, 2));
console.log(`Patched ${generatedPath} with env.${env} config (name: ${generated.name})`);
