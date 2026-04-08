import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const digestsRoutes = new Hono<{ Bindings: Env }>();

// GET / — Paginated list of DigestDeliveries with status filtering
digestsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const status = c.req.query("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [deliveries, total] = await Promise.all([
    prisma.digestDelivery.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.digestDelivery.count({ where }),
  ]);

  const data = deliveries.map((d: any) => ({
    id: d.id,
    userId: d.userId,
    userName: d.user?.name,
    userEmail: d.user?.email,
    date: d.date,
    status: d.status,
    episodeCount: d.episodeCount,
    totalEpisodes: d.totalEpisodes,
    completedEpisodes: d.completedEpisodes,
    actualSeconds: d.actualSeconds,
    createdAt: d.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id — Detail view with episode breakdown
digestsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const delivery = await prisma.digestDelivery.findUnique({
    where: { id: c.req.param("id") },
    include: {
      user: { select: { name: true, email: true } },
      episodes: {
        include: {
          episode: {
            select: {
              id: true,
              title: true,
              podcast: { select: { title: true, imageUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!delivery) return c.json({ error: "Digest not found" }, 404);

  return c.json({
    data: {
      id: delivery.id,
      userId: delivery.userId,
      userName: delivery.user?.name,
      userEmail: delivery.user?.email,
      date: delivery.date,
      status: delivery.status,
      episodeCount: delivery.episodeCount,
      totalEpisodes: delivery.totalEpisodes,
      completedEpisodes: delivery.completedEpisodes,
      actualSeconds: delivery.actualSeconds,
      errorMessage: delivery.errorMessage,
      createdAt: delivery.createdAt.toISOString(),
      episodes: delivery.episodes.map((de: any) => ({
        episodeId: de.episodeId,
        episodeTitle: de.episode?.title ?? "Unknown",
        podcastTitle: de.episode?.podcast?.title ?? "Unknown",
        podcastImageUrl: de.episode?.podcast?.imageUrl ?? null,
        sourceType: de.sourceType,
        status: de.status,
        entryStage: de.entryStage,
      })),
    },
  });
});

// POST /trigger — Admin manual trigger: generate digest for a specific user (by email)
digestsRoutes.post("/trigger", async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email) return c.json({ error: "email required" }, 400);

  const prisma = c.get("prisma") as any;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) return c.json({ error: `No user found with email: ${body.email}` }, 404);

  const today = new Date().toISOString().slice(0, 10);

  await c.env.DIGEST_ORCHESTRATOR_QUEUE.send({
    userId: user.id,
    date: today,
  });

  return c.json({ data: { userId: user.id, email: user.email, date: today, enqueued: true } }, 201);
});

export { digestsRoutes };
