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
  const status = c.req.query("status");
  const orderBy = parseSort(c);

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;

  const [briefings, total] = await Promise.all([
    prisma.briefing.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        user: { select: { email: true, tier: true } },
        _count: { select: { segments: true } },
        segments: {
          select: { clipId: true },
        },
      },
    }),
    prisma.briefing.count({ where }),
  ]);

  // Collect unique clipIds to find podcast diversity
  const allClipIds = briefings.flatMap((b: any) => b.segments.map((s: any) => s.clipId));
  const clips = allClipIds.length > 0
    ? await prisma.clip.findMany({
        where: { id: { in: allClipIds } },
        select: { id: true, episode: { select: { podcastId: true } } },
      })
    : [];
  const clipPodcastMap = new Map(clips.map((cl: any) => [cl.id, cl.episode.podcastId]));

  const data = briefings.map((b: any) => {
    const podcastIds = new Set(b.segments.map((s: any) => clipPodcastMap.get(s.clipId)).filter(Boolean));
    const fitAccuracy = b.actualSeconds && b.targetMinutes
      ? Math.round((1 - Math.abs(b.actualSeconds - b.targetMinutes * 60) / (b.targetMinutes * 60)) * 100)
      : undefined;

    return {
      id: b.id,
      userId: b.userId,
      userEmail: b.user.email,
      userTier: b.user.tier,
      status: b.status,
      targetMinutes: b.targetMinutes,
      actualSeconds: b.actualSeconds,
      audioUrl: b.audioUrl,
      errorMessage: b.errorMessage,
      segmentCount: b._count.segments,
      podcastCount: podcastIds.size,
      fitAccuracy: fitAccuracy !== undefined ? Math.max(0, fitAccuracy) : undefined,
      createdAt: b.createdAt.toISOString(),
    };
  });

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id - Briefing detail
briefingsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const briefing = await prisma.briefing.findUnique({
    where: { id: c.req.param("id") },
    include: {
      user: { select: { email: true, tier: true } },
      segments: {
        orderBy: { orderIndex: "asc" },
      },
      _count: { select: { segments: true } },
    },
  });

  if (!briefing) return c.json({ error: "Briefing not found" }, 404);

  // Resolve clip -> episode -> podcast for each segment
  const clipIds = briefing.segments.map((s: any) => s.clipId);
  const clips = clipIds.length > 0
    ? await prisma.clip.findMany({
        where: { id: { in: clipIds } },
        include: {
          episode: {
            include: { podcast: { select: { title: true, imageUrl: true } } },
          },
        },
      })
    : [];
  const clipMap = new Map(clips.map((cl: any) => [cl.id, cl]));

  const segments = briefing.segments.map((seg: any) => {
    const clip = clipMap.get(seg.clipId);
    return {
      id: seg.id,
      orderIndex: seg.orderIndex,
      podcastTitle: clip?.episode?.podcast?.title ?? "Unknown",
      podcastImageUrl: clip?.episode?.podcast?.imageUrl ?? undefined,
      episodeTitle: clip?.episode?.title ?? "Unknown",
      clipDuration: clip?.actualSeconds ?? clip?.durationTier ?? 0,
      transitionText: seg.transitionText,
    };
  });

  // Quality metrics
  const fitAccuracy = briefing.actualSeconds && briefing.targetMinutes
    ? Math.max(0, Math.round((1 - Math.abs(briefing.actualSeconds - briefing.targetMinutes * 60) / (briefing.targetMinutes * 60)) * 100))
    : 0;

  const podcastCounts = new Map<string, number>();
  for (const seg of segments) {
    podcastCounts.set(seg.podcastTitle, (podcastCounts.get(seg.podcastTitle) ?? 0) + 1);
  }
  const segmentBalance = Array.from(podcastCounts.entries()).map(([podcast, count]) => ({
    podcast,
    percentage: segments.length > 0 ? Math.round((count / segments.length) * 100) : 0,
  }));

  const podcastIds = new Set(clips.map((cl: any) => cl.episode?.podcastId).filter(Boolean));

  return c.json({
    data: {
      id: briefing.id,
      userId: briefing.userId,
      userEmail: briefing.user.email,
      userTier: briefing.user.tier,
      status: briefing.status,
      targetMinutes: briefing.targetMinutes,
      actualSeconds: briefing.actualSeconds,
      audioUrl: briefing.audioUrl,
      errorMessage: briefing.errorMessage,
      segmentCount: briefing._count.segments,
      podcastCount: podcastIds.size,
      fitAccuracy,
      createdAt: briefing.createdAt.toISOString(),
      segments,
      qualityMetrics: {
        fitAccuracy,
        contentCoverage: segments.length > 0 ? 100 : 0,
        segmentBalance,
        transitionQuality: segments.length > 0 ? "good" : "needs_review",
      },
    },
  });
});

export { briefingsRoutes };
