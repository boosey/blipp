import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import type { BriefingRequestItem } from "../../../src/types/admin";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const requestsRoutes = new Hono<{ Bindings: Env }>();

// GET / — Paginated list of BriefingRequests
requestsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const status = c.req.query("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [requests, total] = await Promise.all([
    prisma.briefingRequest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        jobs: {
          take: 1,
          orderBy: { createdAt: "asc" },
          include: { episode: { select: { title: true, podcast: { select: { title: true } } } } },
        },
      },
    }),
    prisma.briefingRequest.count({ where }),
  ]);

  const data = requests.map((r: any) => {
    const firstJob = r.jobs?.[0];
    return {
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
      podcastTitle: firstJob?.episode?.podcast?.title ?? null,
      episodeTitle: firstJob?.episode?.title ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// GET /:id — Request detail with job/step progress
requestsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
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

  // Stage → WorkProduct type mapping (some stages produce multiple types)
  const STAGE_WP_TYPES: Record<string, string[]> = {
    TRANSCRIPTION: ["TRANSCRIPT"],
    DISTILLATION: ["CLAIMS"],
    CLIP_GENERATION: ["NARRATIVE", "AUDIO_CLIP"],
    BRIEFING_ASSEMBLY: ["BRIEFING_AUDIO"],
  };

  // Batch-load all WorkProducts for episodes in this request
  const episodeIds = [...new Set(jobs.map((j: any) => j.episodeId))];
  const allWps = episodeIds.length > 0
    ? await prisma.workProduct.findMany({
        where: { episodeId: { in: episodeIds } },
        select: { id: true, type: true, r2Key: true, sizeBytes: true, metadata: true, createdAt: true, episodeId: true, durationTier: true, userId: true },
      })
    : [];

  // Also load BRIEFING_AUDIO work products (keyed by userId, not episodeId)
  const briefingWps = await prisma.workProduct.findMany({
    where: { type: "BRIEFING_AUDIO", userId: request.userId },
    select: { id: true, type: true, r2Key: true, sizeBytes: true, metadata: true, createdAt: true, episodeId: true, durationTier: true, userId: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const wpPool = [...allWps, ...briefingWps];

  const jobProgress = jobs.map((job: any) => ({
    jobId: job.id,
    episodeId: job.episodeId,
    episodeTitle: job.episode.title,
    podcastTitle: job.episode.podcast.title,
    durationTier: job.durationTier,
    status: job.status,
    currentStage: job.currentStage,
    steps: job.steps.map((s: any) => {
      const wpTypes = STAGE_WP_TYPES[s.stage] ?? [];
      // Find work products matching this step's stage types + episode + durationTier
      const matched = wpPool
        .filter((wp: any) => {
          if (!wpTypes.includes(wp.type)) return false;
          if (wp.type === "BRIEFING_AUDIO") return wp.userId === request.userId;
          if (wp.episodeId !== job.episodeId) return false;
          // For types that vary by durationTier, match it
          if ((wp.type === "NARRATIVE" || wp.type === "AUDIO_CLIP") && wp.durationTier !== job.durationTier) return false;
          return true;
        })
        .map((wp: any) => ({
          id: wp.id,
          type: wp.type,
          r2Key: wp.r2Key,
          sizeBytes: wp.sizeBytes,
          metadata: wp.metadata,
          createdAt: wp.createdAt?.toISOString?.() ?? wp.createdAt,
        }));

      // Also include the directly linked workProduct if not already in matched
      if (s.workProduct && !matched.some((m: any) => m.id === s.workProduct.id)) {
        matched.push({
          id: s.workProduct.id,
          type: s.workProduct.type,
          r2Key: s.workProduct.r2Key,
          sizeBytes: s.workProduct.sizeBytes,
          metadata: s.workProduct.metadata,
          createdAt: s.workProduct.createdAt?.toISOString?.() ?? s.workProduct.createdAt,
        });
      }

      return {
        stage: s.stage,
        status: s.status,
        cached: s.cached,
        durationMs: s.durationMs,
        cost: s.cost,
        errorMessage: s.errorMessage,
        workProducts: matched.length > 0 ? matched : undefined,
      };
    }),
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
});

// GET /work-product/:id/preview — Fetch work product content from R2
requestsRoutes.get("/work-product/:id/preview", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

// GET /work-product/:id/audio — Stream audio work product from R2
requestsRoutes.get("/work-product/:id/audio", async (c) => {
  const prisma = c.get("prisma") as any;
  const wp = await prisma.workProduct.findUnique({
    where: { id: c.req.param("id") },
  });
  if (!wp) return c.json({ error: "Work product not found" }, 404);

  const isAudio = wp.type === "AUDIO_CLIP" || wp.type === "BRIEFING_AUDIO";
  if (!isAudio) return c.json({ error: "Not an audio work product" }, 400);

  const obj = await c.env.R2.get(wp.r2Key);
  if (!obj) return c.json({ error: "Audio not found in R2" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(obj.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
});

// POST /test-briefing — Create admin test briefing request
requestsRoutes.post("/test-briefing", async (c) => {
  const prisma = c.get("prisma") as any;
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
});

export { requestsRoutes };
