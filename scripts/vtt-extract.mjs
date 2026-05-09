// Strip WEBVTT timestamps & speaker tags. Output: open=first N words, close=last M words.
import { readFileSync } from "node:fs";
const [, , file, openWords = "1500", closeWords = "600"] = process.argv;
const raw = readFileSync(file, "utf8");
const lines = raw.split(/\r?\n/);
const text = [];
for (const line of lines) {
  if (!line) continue;
  if (line === "WEBVTT") continue;
  if (/^\d+$/.test(line)) continue;
  if (/-->/.test(line)) continue;
  // strip <v Speaker N> tags
  let cleaned = line.replace(/<v [^>]+>/g, "").replace(/<\/v>/g, "").trim();
  if (cleaned) text.push(cleaned);
}
const all = text.join(" ").replace(/\s+/g, " ");
const words = all.split(" ");
const N = parseInt(openWords);
const M = parseInt(closeWords);
const open = words.slice(0, N).join(" ");
const close = words.length > N + M ? words.slice(-M).join(" ") : "";
process.stdout.write(`=== OPENING (${N} words) ===\n${open}\n`);
if (close) process.stdout.write(`\n=== CLOSING (${M} words) ===\n${close}\n`);
process.stderr.write(`(total ${words.length} words)\n`);
