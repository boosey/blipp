/**
 * Seed the Podcast table with the top 200 podcasts.
 *
 * Sources (merged, deduplicated by feedUrl):
 *   1. Apple Podcasts top 100 chart → resolved via Podcast Index search
 *   2. Podcast Index trending (fills remaining slots to reach 200)
 *
 * Usage: npx tsx scripts/seed-podcasts.ts
 */
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const PI_KEY = process.env.PODCAST_INDEX_KEY;
const PI_SECRET = process.env.PODCAST_INDEX_SECRET;

if (!DATABASE_URL || !PI_KEY || !PI_SECRET) {
  console.error(
    "Missing required env vars: DATABASE_URL, PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET"
  );
  process.exit(1);
}

// ── Types ──

interface PodcastRow {
  title: string;
  description: string | null;
  feedUrl: string;
  imageUrl: string | null;
  podcastIndexId: string | null;
  author: string | null;
  categories: string[];
}

// ── Apple Charts ──

interface AppleEntry {
  id: string;
  name: string;
  artistName: string;
  artworkUrl100: string;
  genres: { name: string }[];
}

async function fetchAppleTop100(): Promise<AppleEntry[]> {
  const url =
    "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/100/podcasts.json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple chart API ${res.status}`);
  const data = (await res.json()) as { feed: { results: AppleEntry[] } };
  return data.feed?.results ?? [];
}

// ── Podcast Index ──

const PI_API = "https://api.podcastindex.org/api/1.0";

function piHeaders(): Record<string, string> {
  const now = Math.floor(Date.now() / 1000).toString();
  const hash = crypto
    .createHash("sha1")
    .update(`${PI_KEY}${PI_SECRET}${now}`)
    .digest("hex");
  return {
    "X-Auth-Date": now,
    "X-Auth-Key": PI_KEY!,
    Authorization: hash,
    "User-Agent": "Blipp/1.0",
  };
}

interface PIFeed {
  id: number;
  title: string;
  url: string;
  description: string;
  author: string;
  image: string;
  categories: Record<string, string>;
}

async function piSearchByTerm(term: string): Promise<PIFeed[]> {
  const url = `${PI_API}/search/byterm?q=${encodeURIComponent(term)}&max=5`;
  const res = await fetch(url, { headers: piHeaders() });
  if (!res.ok) return [];
  const data = (await res.json()) as { feeds?: PIFeed[] };
  return data.feeds ?? [];
}

async function piFetchTrending(max: number): Promise<PIFeed[]> {
  const url = `${PI_API}/podcasts/trending?max=${max}&lang=en`;
  const res = await fetch(url, { headers: piHeaders() });
  if (!res.ok) throw new Error(`PI trending ${res.status}`);
  const data = (await res.json()) as { feeds: PIFeed[] };
  return data.feeds ?? [];
}

function piCategories(cats: Record<string, string> | null | undefined): string[] {
  if (!cats || typeof cats !== "object") return [];
  return Object.values(cats).filter(Boolean);
}

/** Fuzzy match: check if PI result title is close enough to the Apple chart name */
function isTitleMatch(piTitle: string, appleName: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = normalize(piTitle);
  const b = normalize(appleName);
  // Exact match after normalization, or one contains the other
  return a === b || a.includes(b) || b.includes(a);
}

function piToRow(feed: PIFeed, appleEntry?: AppleEntry): PodcastRow {
  return {
    title: appleEntry?.name || feed.title,
    description: feed.description || null,
    feedUrl: feed.url,
    imageUrl: feed.image || appleEntry?.artworkUrl100 || null,
    podcastIndexId: feed.id.toString(),
    author: feed.author || appleEntry?.artistName || null,
    categories:
      piCategories(feed.categories).length > 0
        ? piCategories(feed.categories)
        : appleEntry?.genres?.map((g) => g.name) ?? [],
  };
}

// ── Main ──

async function main() {
  const allPodcasts = new Map<string, PodcastRow>(); // keyed by feedUrl

  // ── Source 1: Apple top 100 → resolve via PI search ──
  console.log("1/3  Fetching Apple Podcasts top 100...");
  const chart = await fetchAppleTop100();
  console.log(`     Got ${chart.length} chart entries\n`);

  console.log("2/3  Resolving via Podcast Index search...");
  let resolved = 0;
  let missed = 0;
  const missedNames: string[] = [];

  for (let i = 0; i < chart.length; i++) {
    const entry = chart[i];
    const results = await piSearchByTerm(entry.name);

    // Find best match by title
    const match = results.find((r) => isTitleMatch(r.title, entry.name));

    if (match && match.url && !allPodcasts.has(match.url)) {
      allPodcasts.set(match.url, piToRow(match, entry));
      resolved++;
    } else {
      missed++;
      missedNames.push(entry.name);
    }

    // Progress every 25
    if ((i + 1) % 25 === 0) {
      console.log(`     ${i + 1}/100 processed (${resolved} resolved)`);
    }
  }

  console.log(
    `     Done: ${resolved} resolved, ${missed} missed`
  );
  if (missedNames.length > 0 && missedNames.length <= 20) {
    console.log(`     Missed: ${missedNames.join(", ")}`);
  }

  // ── Source 2: PI trending fill ──
  const remaining = 200 - allPodcasts.size;
  if (remaining > 0) {
    console.log(
      `\n3/3  Filling ${remaining} slots from Podcast Index trending...`
    );
    const trending = await piFetchTrending(200);
    let added = 0;
    for (const feed of trending) {
      if (allPodcasts.size >= 200) break;
      if (!feed.url || allPodcasts.has(feed.url)) continue;
      allPodcasts.set(feed.url, piToRow(feed));
      added++;
    }
    console.log(`     Added ${added} (total: ${allPodcasts.size})`);
  } else {
    console.log("\n3/3  Already at 200+, skipping PI trending fill");
  }

  // ── Upsert into DB ──
  console.log("\nUpserting into database...");
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`DELETE FROM "Podcast"`);

  let upserted = 0;
  for (const p of allPodcasts.values()) {
    await client.query(
      `INSERT INTO "Podcast" (id, title, description, "feedUrl", "imageUrl", "podcastIndexId", author, categories, "createdAt", "updatedAt")
       VALUES (
         gen_random_uuid()::text,
         $1, $2, $3, $4, $5, $6,
         $7::text[],
         now(), now()
       )
       ON CONFLICT ("feedUrl") DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         "imageUrl" = EXCLUDED."imageUrl",
         "podcastIndexId" = EXCLUDED."podcastIndexId",
         author = EXCLUDED.author,
         categories = EXCLUDED.categories,
         "updatedAt" = now()`,
      [
        p.title,
        p.description,
        p.feedUrl,
        p.imageUrl,
        p.podcastIndexId,
        p.author,
        p.categories,
      ]
    );
    upserted++;
  }

  const { rows } = await client.query(`SELECT COUNT(*) as count FROM "Podcast"`);
  console.log(`\nDone! Upserted ${upserted} podcasts. Total in DB: ${rows[0].count}`);

  // Sanity check
  const { rows: sample } = await client.query(
    `SELECT title FROM "Podcast" ORDER BY "createdAt" LIMIT 20`
  );
  console.log("\nFirst 20:");
  sample.forEach((r, i) => console.log(`  ${i + 1}. ${r.title}`));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
