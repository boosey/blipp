import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const requestsRoutes = new Hono<{ Bindings: Env }>();

// GET / — Paginated list of BriefingRequests
requestsRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const page = parseInt(c.req.query("page") ?? "1");
    const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
    const skip = (page - 1) * pageSize;
    const status = c.req.query("status");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.briefingRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.briefingRequest.count({ where }),
    ]);

    const data = requests.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name,
      userEmail: r.user?.email,
      status: r.status,
      targetMinutes: r.targetMinutes,
      podcastIds: r.podcastIds,
      isTest: r.isTest,
      briefingId: r.briefingId,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return c.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /:id — Request detail with episode progress
requestsRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const request = await prisma.briefingRequest.findUnique({
      where: { id: c.req.param("id") },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!request) return c.json({ error: "Request not found" }, 404);

    const episodeProgress = [];
    for (const podcastId of request.podcastIds) {
      const episode = await prisma.episode.findFirst({
        where: { podcastId },
        orderBy: { publishedAt: "desc" },
        include: {
          distillation: true,
          clips: { where: { status: "COMPLETED" } },
          podcast: { select: { title: true } },
        },
      });
      if (!episode) continue;

      const dist = episode.distillation;
      episodeProgress.push({
        episodeId: episode.id,
        episodeTitle: episode.title,
        podcastTitle: episode.podcast.title,
        transcription: getStageStatus(dist, "transcription"),
        distillation: getStageStatus(dist, "distillation"),
        clipGeneration: {
          status: episode.clips.length > 0 ? ("COMPLETED" as const) : ("WAITING" as const),
        },
      });
    }

    return c.json({
      data: {
        id: request.id,
        userId: request.userId,
        userName: (request as any).user?.name,
        userEmail: (request as any).user?.email,
        status: request.status,
        targetMinutes: request.targetMinutes,
        podcastIds: request.podcastIds,
        isTest: request.isTest,
        briefingId: request.briefingId,
        errorMessage: request.errorMessage,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        episodeProgress,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

function getStageStatus(dist: any, stage: "transcription" | "distillation") {
  if (!dist) return { status: "WAITING" as const };
  if (stage === "transcription") {
    if (dist.status === "PENDING") return { status: "WAITING" as const };
    if (dist.status === "FETCHING_TRANSCRIPT") return { status: "IN_PROGRESS" as const };
    if (dist.status === "FAILED") return { status: "FAILED" as const, errorMessage: dist.errorMessage };
    return { status: "COMPLETED" as const };
  }
  if (["PENDING", "FETCHING_TRANSCRIPT", "TRANSCRIPT_READY"].includes(dist.status)) return { status: "WAITING" as const };
  if (dist.status === "EXTRACTING_CLAIMS") return { status: "IN_PROGRESS" as const };
  if (dist.status === "COMPLETED") return { status: "COMPLETED" as const };
  return { status: "FAILED" as const, errorMessage: dist.errorMessage };
}

// POST /test-briefing — Create admin test briefing request
requestsRoutes.post("/test-briefing", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{ podcastIds: string[]; targetMinutes: number }>();
    if (!body.podcastIds?.length) return c.json({ error: "podcastIds required" }, 400);

    const auth = getAuth(c);
    const user = await prisma.user.findUnique({ where: { clerkId: auth!.userId! } });
    if (!user) return c.json({ error: "User not found" }, 404);

    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes: body.targetMinutes || 5,
        podcastIds: body.podcastIds,
        isTest: true,
        status: "PENDING",
      },
    });

    await c.env.ORCHESTRATOR_QUEUE.send({ requestId: request.id, action: "evaluate" });
    return c.json({ data: request }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { requestsRoutes };
