import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";
import { PodcastIndexClient } from "../lib/podcast-index";

/**
 * Podcast discovery and subscription routes.
 * Search and trending are public-ish; subscribe/unsubscribe/list require auth.
 */
export const podcasts = new Hono<{ Bindings: Env }>();

// All podcast routes require authentication
podcasts.use("*", requireAuth);

/**
 * GET /search?q=... — Search podcasts via Podcast Index.
 *
 * @param q - Search query string (required)
 * @returns Array of matching podcast feeds
 * @throws 400 if `q` parameter is missing
 */
podcasts.get("/search", async (c) => {
  const q = c.req.query("q");
  if (!q) {
    return c.json({ error: "Missing search query parameter: q" }, 400);
  }

  const client = new PodcastIndexClient(
    c.env.PODCAST_INDEX_KEY,
    c.env.PODCAST_INDEX_SECRET
  );

  const feeds = await client.searchByTerm(q);
  return c.json({ feeds });
});

/**
 * GET /trending — Fetch trending podcasts from Podcast Index.
 *
 * @returns Array of trending podcast feeds
 */
podcasts.get("/trending", async (c) => {
  const client = new PodcastIndexClient(
    c.env.PODCAST_INDEX_KEY,
    c.env.PODCAST_INDEX_SECRET
  );

  const feeds = await client.trending();
  return c.json({ feeds });
});

/**
 * POST /subscribe — Subscribe to a podcast.
 * Upserts the podcast record and creates a subscription link.
 *
 * Body: `{ feedUrl, title, description?, imageUrl?, podcastIndexId?, author? }`
 * @returns The created subscription with podcast data
 */
podcasts.post("/subscribe", async (c) => {
  const auth = getAuth(c)!;
  const body = await c.req.json<{
    feedUrl: string;
    title: string;
    description?: string;
    imageUrl?: string;
    podcastIndexId?: string;
    author?: string;
  }>();

  if (!body.feedUrl || !body.title) {
    return c.json({ error: "feedUrl and title are required" }, 400);
  }

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: auth.userId },
    });

    // Upsert podcast — create if new, update metadata if exists
    const podcast = await prisma.podcast.upsert({
      where: { feedUrl: body.feedUrl },
      create: {
        feedUrl: body.feedUrl,
        title: body.title,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        podcastIndexId: body.podcastIndexId ?? null,
        author: body.author ?? null,
      },
      update: {
        title: body.title,
        description: body.description ?? undefined,
        imageUrl: body.imageUrl ?? undefined,
        author: body.author ?? undefined,
      },
    });

    // Create subscription (idempotent via unique constraint)
    const subscription = await prisma.subscription.upsert({
      where: {
        userId_podcastId: {
          userId: user.id,
          podcastId: podcast.id,
        },
      },
      create: {
        userId: user.id,
        podcastId: podcast.id,
      },
      update: {},
    });

    return c.json({ subscription: { ...subscription, podcast } }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * DELETE /subscribe/:podcastId — Unsubscribe from a podcast.
 *
 * @param podcastId - The podcast's database ID
 * @returns Success confirmation
 */
podcasts.delete("/subscribe/:podcastId", async (c) => {
  const auth = getAuth(c)!;
  const podcastId = c.req.param("podcastId");

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: auth.userId },
    });

    await prisma.subscription.delete({
      where: {
        userId_podcastId: {
          userId: user.id,
          podcastId,
        },
      },
    });

    return c.json({ success: true });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /subscriptions — List the authenticated user's podcast subscriptions.
 *
 * @returns Array of subscriptions with nested podcast data
 */
podcasts.get("/subscriptions", async (c) => {
  const auth = getAuth(c)!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: auth.userId },
    });

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      include: { podcast: true },
    });

    return c.json({ subscriptions });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
