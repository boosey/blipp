/**
 * Backfill slugs for existing Podcast, Episode, and Category records.
 * Run: npx tsx prisma/backfill-slugs.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import { slugify, uniqueSlug } from "../worker/lib/slugify";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function backfillPodcastSlugs() {
  const podcasts = await prisma.podcast.findMany({
    where: { slug: null },
    select: { id: true, title: true },
  });
  const existing = new Set(
    (
      await prisma.podcast.findMany({
        where: { slug: { not: null } },
        select: { slug: true },
      })
    ).map((p) => p.slug!)
  );

  let count = 0;
  for (const p of podcasts) {
    const slug = uniqueSlug(p.title, existing);
    existing.add(slug);
    await prisma.podcast.update({ where: { id: p.id }, data: { slug } });
    count++;
  }
  console.log(`Backfilled ${count} podcast slugs`);
}

async function backfillEpisodeSlugs() {
  const episodes = await prisma.episode.findMany({
    where: { slug: null },
    select: { id: true, title: true, podcastId: true },
    orderBy: { publishedAt: "asc" },
  });

  // Group by podcast for uniqueness scoping
  const byPodcast = new Map<string, typeof episodes>();
  for (const ep of episodes) {
    const list = byPodcast.get(ep.podcastId) || [];
    list.push(ep);
    byPodcast.set(ep.podcastId, list);
  }

  let count = 0;
  for (const [podcastId, eps] of byPodcast) {
    const existing = new Set(
      (
        await prisma.episode.findMany({
          where: { podcastId, slug: { not: null } },
          select: { slug: true },
        })
      ).map((e) => e.slug!)
    );

    for (const ep of eps) {
      const slug = uniqueSlug(ep.title, existing);
      existing.add(slug);
      await prisma.episode.update({ where: { id: ep.id }, data: { slug } });
      count++;
    }
  }
  console.log(`Backfilled ${count} episode slugs`);
}

async function backfillCategorySlugs() {
  const categories = await prisma.category.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });
  const existing = new Set(
    (
      await prisma.category.findMany({
        where: { slug: { not: null } },
        select: { slug: true },
      })
    ).map((c) => c.slug!)
  );

  let count = 0;
  for (const cat of categories) {
    const slug = uniqueSlug(cat.name, existing);
    existing.add(slug);
    await prisma.category.update({ where: { id: cat.id }, data: { slug } });
    count++;
  }
  console.log(`Backfilled ${count} category slugs`);
}

async function main() {
  console.log("Starting slug backfill...");
  await backfillPodcastSlugs();
  await backfillEpisodeSlugs();
  await backfillCategorySlugs();
  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
