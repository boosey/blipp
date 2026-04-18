#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error("usage: npm run db:migrate:new <snake_case_name>");
  console.error("name must match /^[a-z0-9_]+$/");
  process.exit(1);
}

const configPath = "neon-config.env";
if (!existsSync(configPath)) {
  console.error(`missing ${configPath} — need STAGING_DATABASE_URL to diff against`);
  process.exit(1);
}
const envText = readFileSync(configPath, "utf8");
const stagingMatch = envText.match(/^STAGING_DATABASE_URL=(.+)$/m);
if (!stagingMatch) {
  console.error("STAGING_DATABASE_URL not found in neon-config.env");
  process.exit(1);
}
const stagingUrl = stagingMatch[1].trim();

const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = join("prisma", "migrations", `${ts}_${name}`);
if (existsSync(dir)) {
  console.error(`already exists: ${dir}`);
  process.exit(1);
}

console.log("diffing staging DB → schema.prisma (staging is treated as the last-applied state)");
console.log("if other unapplied migrations exist locally, apply them to staging first via `npm run db:migrate:deploy:staging`\n");

const sql = execSync(
  "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
  { encoding: "utf8", env: { ...process.env, DATABASE_URL: stagingUrl } },
);

if (!sql.trim() || /^-- This is an empty migration\.?\s*$/m.test(sql.trim())) {
  console.error("no schema changes detected vs staging — nothing to migrate");
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "migration.sql"), sql);
console.log(`created ${dir}/migration.sql`);
console.log("review the SQL, then apply with: npm run db:migrate:deploy:staging");
