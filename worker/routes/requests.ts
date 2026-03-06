import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";

export const requests = new Hono<{ Bindings: Env }>();

requests.use("*", requireAuth);

/**
 * GET / — List the user's briefing requests with status and podcast info.
 * Returns the 50 most recent requests, newest first.
 */
requests.get("/", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const rawRequests = await prisma.briefingRequest.findMany({
      where: { userId: user.id, isTest: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        jobs: {
          take: 1,
          include: {
            episode: {
              include: { podcast: { select: { title: true, imageUrl: true } } },
            },
          },
        },
      },
    });

    const requests = rawRequests.map((r: any) => {
      const firstJob = r.jobs[0];
      return {
        id: r.id,
        status: r.status,
        targetMinutes: r.targetMinutes,
        createdAt: r.createdAt,
        briefingId: r.briefingId,
        podcastTitle: firstJob?.episode?.podcast?.title ?? null,
        podcastImageUrl: firstJob?.episode?.podcast?.imageUrl ?? null,
        episodeTitle: firstJob?.episode?.title ?? null,
      };
    });

    return c.json({ requests });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /:id — Get a single briefing request with briefing detail.
 */
requests.get("/:id", async (c) => {
  const userId = getAuth(c)!.userId!;
  const requestId = c.req.param("id");
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const request = await prisma.briefingRequest.findFirst({
      where: { id: requestId, userId: user.id },
      include: {
        briefing: {
          select: { id: true, audioUrl: true, actualSeconds: true },
        },
        jobs: {
          include: {
            episode: {
              include: { podcast: { select: { title: true, imageUrl: true } } },
            },
          },
        },
      },
    });

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    const firstJob = request.jobs[0];
    return c.json({
      request: {
        id: request.id,
        status: request.status,
        targetMinutes: request.targetMinutes,
        createdAt: request.createdAt,
        briefingId: request.briefingId,
        podcastTitle: firstJob?.episode?.podcast?.title ?? null,
        podcastImageUrl: firstJob?.episode?.podcast?.imageUrl ?? null,
        episodeTitle: firstJob?.episode?.title ?? null,
        briefing: request.briefing,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
