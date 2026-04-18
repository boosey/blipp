#!/usr/bin/env node
// Generate a new Prisma migration by diffing migration history against schema.prisma
// using the shadow database (configured in prisma.config.ts via SHADOW_DATABASE_URL
// in neon-config.env). This is the canonical Prisma flow — it works regardless of
// what state staging/production happen to be in.
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
  console.error(`missing ${configPath} — need SHADOW_DATABASE_URL to diff against`);
  process.exit(1);
}
const envText = readFileSync(configPath, "utf8");
const shadowMatch = envText.match(/^SHADOW_DATABASE_URL=(.+)$/m);
if (!shadowMatch) {
  console.error("SHADOW_DATABASE_URL not found in neon-config.env");
  console.error("provision a throwaway Neon branch and paste its URL there");
  process.exit(1);
}

const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = join("prisma", "migrations", `${ts}_${name}`);
if (existsSync(dir)) {
  console.error(`already exists: ${dir}`);
  process.exit(1);
}

console.log("diffing migration history → schema.prisma via shadow DB");
console.log("if the shadow DB has stale state, run: npm run db:shadow:reset\n");

const sql = execSync(
  "npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script",
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (!sql.trim() || /^-- This is an empty migration\.?\s*$/m.test(sql.trim())) {
  console.error("\nno schema changes detected — nothing to migrate");
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "migration.sql"), sql);
console.log(`created ${dir}/migration.sql`);
console.log("review the SQL, then commit. CI will run migrate deploy on push.");
