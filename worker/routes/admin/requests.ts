import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import type { BriefingRequestItem } from "../../../src/types/admin";

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
      items: r.items as unknown as BriefingRequestItem[],
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

// GET /:id — Request detail with job/step progress
requestsRoutes.get("/:id", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const request = await prisma.briefingRequest.findUnique({
      where: { id: c.req.param("id") },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!request) return c.json({ error: "Request not found" }, 404);

    const jobs = await prisma.pipelineJob.findMany({
      where: { requestId: request.id },
      include: {
        episode: { select: { title: true, podcast: { select: { title: true } } } },
        steps: {
          orderBy: { createdAt: "asc" },
          include: {
            workProduct: {
              select: { id: true, type: true, r2Key: true, sizeBytes: true, metadata: true, createdAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const jobProgress = jobs.map((job: any) => ({
      jobId: job.id,
      episodeId: job.episodeId,
      episodeTitle: job.episode.title,
      podcastTitle: job.episode.podcast.title,
      durationTier: job.durationTier,
      status: job.status,
      currentStage: job.currentStage,
      steps: job.steps.map((s: any) => ({
        stage: s.stage,
        status: s.status,
        cached: s.cached,
        durationMs: s.durationMs,
        cost: s.cost,
        errorMessage: s.errorMessage,
        workProduct: s.workProduct
          ? {
              id: s.workProduct.id,
              type: s.workProduct.type,
              r2Key: s.workProduct.r2Key,
              sizeBytes: s.workProduct.sizeBytes,
              metadata: s.workProduct.metadata,
              createdAt: s.workProduct.createdAt?.toISOString?.() ?? s.workProduct.createdAt,
            }
          : undefined,
      })),
    }));

    return c.json({
      data: {
        id: request.id,
        userId: request.userId,
        userName: (request as any).user?.name,
        userEmail: (request as any).user?.email,
        status: request.status,
        targetMinutes: request.targetMinutes,
        items: request.items as unknown as BriefingRequestItem[],
        isTest: request.isTest,
        briefingId: request.briefingId,
        errorMessage: request.errorMessage,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        jobProgress,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /work-product/:id/preview — Fetch work product content from R2
requestsRoutes.get("/work-product/:id/preview", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const wp = await prisma.workProduct.findUnique({
      where: { id: c.req.param("id") },
    });
    if (!wp) return c.json({ error: "Work product not found" }, 404);

    const obj = await c.env.R2.get(wp.r2Key);
    if (!obj) {
      return c.json({ data: { id: wp.id, type: wp.type, r2Key: wp.r2Key, content: null, message: "Object not found in R2" } });
    }

    const isAudio = wp.type === "AUDIO_CLIP" || wp.type === "BRIEFING_AUDIO";
    if (isAudio) {
      // For audio, return metadata only (no inline content)
      return c.json({
        data: {
          id: wp.id,
          type: wp.type,
          r2Key: wp.r2Key,
          sizeBytes: wp.sizeBytes,
          metadata: wp.metadata,
          contentType: "audio",
          content: null,
        },
      });
    }

    // For text content (TRANSCRIPT, CLAIMS, NARRATIVE), return up to 50KB
    const text = await obj.text();
    const maxPreview = 50_000;
    const truncated = text.length > maxPreview;
    const content = truncated ? text.slice(0, maxPreview) : text;

    return c.json({
      data: {
        id: wp.id,
        type: wp.type,
        r2Key: wp.r2Key,
        sizeBytes: wp.sizeBytes,
        metadata: wp.metadata,
        contentType: wp.type === "CLAIMS" ? "json" : "text",
        content,
        truncated,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// POST /test-briefing — Create admin test briefing request
requestsRoutes.post("/test-briefing", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const body = await c.req.json<{
      items: BriefingRequestItem[];
      targetMinutes: number;
    }>();
    if (!body.items?.length) return c.json({ error: "items required" }, 400);

    const auth = getAuth(c);
    const user = await prisma.user.findUnique({ where: { clerkId: auth!.userId! } });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Resolve useLatest items to actual episodeIds
    const resolvedItems = await Promise.all(
      body.items.map(async (item) => {
        if (!item.useLatest || item.episodeId) return item;
        const latest = await prisma.episode.findFirst({
          where: { podcastId: item.podcastId },
          orderBy: { publishedAt: "desc" },
          select: { id: true },
        });
        return { ...item, episodeId: latest?.id ?? null };
      })
    );

    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes: body.targetMinutes || 5,
        items: resolvedItems as any,
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
