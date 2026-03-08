import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

const briefingsRoutes = new Hono<{ Bindings: Env }>();

briefingsRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - Paginated briefing list
briefingsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const userId = c.req.query("userId");
  const orderBy = parseSort(c);

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;

  const [briefings, total] = await Promise.all([
    prisma.briefing.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        user: { select: { email: true, tier: true } },
        clip: {
          select: {
            id: true,
            durationTier: true,
            status: true,
            actualSeconds: true,
            audioUrl: true,
            episode: {
              select: {
                title: true,
                podcast: { select: { title: true, imageUrl: true } },
              },
            },
          },
        },
        _count: { select: { feedItems: true } },
      },
    }),
    prisma.briefing.count({ where }),
  ]);

  const data = briefings.map((b: any) => ({
    id: b.id,
    userId: b.userId,
    userEmail: b.user.email,
    userTier: b.user.tier,
    clipId: b.clipId,
    durationTier: b.clip.durationTier,
    clipStatus: b.clip.status,
    actualSeconds: b.clip.actualSeconds,
    audioUrl: b.clip.audioUrl,
    adAudioUrl: b.adAudioUrl,
    episodeTitle: b.clip.episode?.title,
    podcastTitle: b.clip.episode?.podcast?.title,
    podcastImageUrl: b.clip.episode?.podcast?.imageUrl,
    feedItemCount: b._count.feedItems,
    createdAt: b.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id - Briefing detail
briefingsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const briefing = await prisma.briefing.findUnique({
    where: { id: c.req.param("id") },
    include: {
      user: { select: { email: true, tier: true } },
      clip: {
        include: {
          episode: {
            include: { podcast: { select: { id: true, title: true, imageUrl: true } } },
          },
        },
      },
      feedItems: {
        select: { id: true, status: true, listened: true, source: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!briefing) return c.json({ error: "Briefing not found" }, 404);

  return c.json({
    data: {
      id: briefing.id,
      userId: briefing.userId,
      userEmail: briefing.user.email,
      userTier: briefing.user.tier,
      clipId: briefing.clipId,
      adAudioUrl: briefing.adAudioUrl,
      adAudioKey: briefing.adAudioKey,
      createdAt: briefing.createdAt.toISOString(),
      clip: {
        id: briefing.clip.id,
        durationTier: briefing.clip.durationTier,
        status: briefing.clip.status,
        actualSeconds: briefing.clip.actualSeconds,
        audioUrl: briefing.clip.audioUrl,
        wordCount: briefing.clip.wordCount,
        episodeTitle: briefing.clip.episode?.title,
        podcastTitle: briefing.clip.episode?.podcast?.title,
        podcastId: briefing.clip.episode?.podcast?.id,
        podcastImageUrl: briefing.clip.episode?.podcast?.imageUrl,
      },
      feedItems: briefing.feedItems,
    },
  });
});

export { briefingsRoutes };
