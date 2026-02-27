/**
 * Dev server wrapper — reads DATABASE_URL from .dev.vars and exports it as
 * CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE so the Cloudflare
 * Vite plugin can emulate Hyperdrive locally. Then starts vite dev.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const devvars = readFileSync(".dev.vars", "utf8");
const match = devvars.match(/^DATABASE_URL=(.+)$/m);

if (match) {
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE =
    match[1];
}

execFileSync("npx", ["vite", "dev"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
