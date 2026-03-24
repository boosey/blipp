import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import type { BriefingRequestItem } from "../../../src/types/admin";
import { parsePagination, paginatedResponse, getCurrentUser } from "../../lib/admin-helpers";
import { writeAuditLog } from "../../lib/audit-log";

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
          orderBy: { createdAt: "asc" },
          include: {
            episode: { select: { title: true, podcast: { select: { title: true } } } },
            steps: { select: { cost: true } },
          },
        },
      },
    }),
    prisma.briefingRequest.count({ where }),
  ]);

  const data = requests.map((r: any) => {
    const firstJob = r.jobs?.[0];
    const totalCost = r.jobs?.reduce((sum: number, job: any) =>
      sum + (job.steps?.reduce((s: number, step: any) => s + (step.cost ?? 0), 0) ?? 0), 0) ?? 0;
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
      totalCost: totalCost > 0 ? totalCost : undefined,
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
      episode: { select: { title: true, durationSeconds: true, podcast: { select: { title: true } } } },
      steps: {
        orderBy: { createdAt: "asc" },
        include: {
          workProduct: {
            select: { id: true, type: true, r2Key: true, sizeBytes: true, metadata: true, createdAt: true },
          },
          events: {
            orderBy: { createdAt: "asc" },
            select: { id: true, level: true, message: true, data: true, createdAt: true },
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
    NARRATIVE_GENERATION: ["NARRATIVE"],
    AUDIO_GENERATION: ["AUDIO_CLIP"],
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
    episodeDurationSeconds: job.episode.durationSeconds ?? undefined,
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
        model: s.model ?? undefined,
        inputTokens: s.inputTokens ?? undefined,
        outputTokens: s.outputTokens ?? undefined,
        errorMessage: s.errorMessage,
        workProducts: matched.length > 0 ? matched : undefined,
        events: s.events?.length > 0
          ? s.events.map((e: any) => ({
              id: e.id,
              level: e.level,
              message: e.message,
              data: e.data ?? undefined,
              createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
            }))
          : undefined,
      };
    }),
  }));

  // Compute total cost across all steps
  const totalCost = jobs.reduce((sum: number, job: any) =>
    sum + job.steps.reduce((s: number, step: any) => s + (step.cost ?? 0), 0), 0);

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
      totalCost: totalCost > 0 ? totalCost : undefined,
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

// GET /episode/:id/source-audio — Proxy episode source audio from podcast CDN
requestsRoutes.get("/episode/:id/source-audio", async (c) => {
  const prisma = c.get("prisma") as any;
  const episode = await prisma.episode.findUnique({
    where: { id: c.req.param("id") },
    select: { audioUrl: true },
  });
  if (!episode?.audioUrl) return c.json({ error: "Episode not found or no audio URL" }, 404);

  const audioRes = await fetch(episode.audioUrl);
  if (!audioRes.ok) return c.json({ error: `Source audio unavailable: ${audioRes.status}` }, 502);

  return new Response(audioRes.body, {
    headers: {
      "Content-Type": audioRes.headers.get("content-type") || "audio/mpeg",
      ...(audioRes.headers.get("content-length") ? { "Content-Length": audioRes.headers.get("content-length")! } : {}),
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

// ── Delete helpers ──

/**
 * Walk the reference graph from a BriefingRequest to find all related entities.
 * Returns the full set of request IDs to delete and the orphaned entities to GC.
 */
async function computeDeleteImpact(prisma: any, subjectId: string) {
  // 1. Find all WorkProduct IDs referenced by the subject's steps
  const subjectWpLinks = await prisma.pipelineStep.findMany({
    where: { job: { requestId: subjectId }, workProductId: { not: null } },
    select: { workProductId: true },
  });
  const wpIds = [...new Set<string>(subjectWpLinks.map((s: any) => s.workProductId as string))];

  // 2. Find all OTHER BriefingRequests whose steps reference those same WorkProducts
  let relatedRequestIds: string[] = [];
  if (wpIds.length > 0) {
    const relatedSteps = await prisma.pipelineStep.findMany({
      where: { workProductId: { in: wpIds } },
      select: { job: { select: { requestId: true } } },
    });
    relatedRequestIds = [...new Set<string>(relatedSteps.map((s: any) => s.job.requestId as string))];
  }
  // Always include the subject
  const allRequestIds = [...new Set([subjectId, ...relatedRequestIds])];

  // 3. Load request details for the modal
  const requests = await prisma.briefingRequest.findMany({
    where: { id: { in: allRequestIds } },
    include: {
      user: { select: { name: true, email: true } },
      jobs: {
        select: {
          id: true,
          episode: { select: { title: true, podcast: { select: { title: true } } } },
          steps: { select: { id: true } },
        },
      },
    },
  });

  // 4. Count jobs and steps that will cascade-delete
  const jobCount = requests.reduce((n: number, r: any) => n + r.jobs.length, 0);
  const stepIds: string[] = requests.flatMap((r: any) => r.jobs.flatMap((j: any) => j.steps.map((s: any) => s.id)));

  // 5. Find FeedItems referencing any of these requests
  const feedItems = await prisma.feedItem.findMany({
    where: { requestId: { in: allRequestIds } },
    select: { id: true, briefingId: true },
  });

  // 6. Find Briefings that would be orphaned (no FeedItems left after deletion)
  const briefingIds = [...new Set(feedItems.map((f: any) => f.briefingId).filter(Boolean))] as string[];
  let orphanedBriefingIds: string[] = [];
  let orphanedClipIds: string[] = [];
  const clipR2Keys: string[] = [];

  if (briefingIds.length > 0) {
    const feedItemIds = feedItems.map((f: any) => f.id);
    // For each briefing, check if ALL its feed items are in our delete set
    for (const bid of briefingIds) {
      const remaining = await prisma.feedItem.count({
        where: { briefingId: bid, id: { notIn: feedItemIds } },
      });
      if (remaining === 0) orphanedBriefingIds.push(bid);
    }

    // 7. Find Clips that would be orphaned (no Briefings left)
    if (orphanedBriefingIds.length > 0) {
      const briefings = await prisma.briefing.findMany({
        where: { id: { in: orphanedBriefingIds } },
        select: { clipId: true },
      });
      const clipIds = [...new Set<string>(briefings.map((b: any) => b.clipId as string))];
      for (const cid of clipIds) {
        const remaining = await prisma.briefing.count({
          where: { clipId: cid, id: { notIn: orphanedBriefingIds } },
        });
        if (remaining === 0) {
          orphanedClipIds.push(cid);
          const clip = await prisma.clip.findUnique({ where: { id: cid }, select: { audioKey: true } });
          if (clip?.audioKey) clipR2Keys.push(clip.audioKey);
        }
      }
    }
  }

  // 8. Find WorkProducts that would be orphaned (no PipelineSteps left)
  let orphanedWpIds: string[] = [];
  const wpR2Keys: string[] = [];
  if (wpIds.length > 0) {
    for (const wpId of wpIds) {
      const remaining = await prisma.pipelineStep.count({
        where: { workProductId: wpId, id: { notIn: stepIds } },
      });
      if (remaining === 0) {
        orphanedWpIds.push(wpId);
        const wp = await prisma.workProduct.findUnique({ where: { id: wpId }, select: { r2Key: true } });
        if (wp?.r2Key) wpR2Keys.push(wp.r2Key);
      }
    }
  }

  return {
    allRequestIds,
    requests,
    jobCount,
    feedItems,
    orphanedBriefingIds,
    orphanedClipIds,
    clipR2Keys,
    orphanedWpIds,
    wpR2Keys,
  };
}

// GET /:id/delete-preview — Impact analysis before deletion
requestsRoutes.get("/:id/delete-preview", async (c) => {
  const prisma = c.get("prisma") as any;
  const subjectId = c.req.param("id");

  const subject = await prisma.briefingRequest.findUnique({ where: { id: subjectId } });
  if (!subject) return c.json({ error: "Request not found" }, 404);

  const impact = await computeDeleteImpact(prisma, subjectId);

  return c.json({
    data: {
      subjectRequest: {
        id: subject.id,
        status: subject.status,
        createdAt: subject.createdAt.toISOString(),
      },
      relatedRequests: impact.requests
        .filter((r: any) => r.id !== subjectId)
        .map((r: any) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          userName: r.user?.name ?? r.user?.email ?? "Unknown",
          episodeTitle: r.jobs?.[0]?.episode?.title ?? null,
          podcastTitle: r.jobs?.[0]?.episode?.podcast?.title ?? null,
        })),
      impactSummary: {
        requestCount: impact.allRequestIds.length,
        jobCount: impact.jobCount,
        feedItemCount: impact.feedItems.length,
        briefingCount: impact.orphanedBriefingIds.length,
        workProductCount: impact.orphanedWpIds.length,
        clipCount: impact.orphanedClipIds.length,
        r2ObjectCount: impact.wpR2Keys.length + impact.clipR2Keys.length,
      },
    },
  });
});

// DELETE /:id — Delete request + cascade + garbage-collect orphans
requestsRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const subjectId = c.req.param("id");

  const subject = await prisma.briefingRequest.findUnique({ where: { id: subjectId } });
  if (!subject) return c.json({ error: "Request not found" }, 404);

  const impact = await computeDeleteImpact(prisma, subjectId);

  // Execute deletions in a transaction
  await prisma.$transaction(async (tx: any) => {
    // 1. Delete FeedItems referencing these requests
    if (impact.feedItems.length > 0) {
      await tx.feedItem.deleteMany({
        where: { id: { in: impact.feedItems.map((f: any) => f.id) } },
      });
    }

    // 2. Delete all BriefingRequests (cascade: Jobs → Steps → Events)
    await tx.briefingRequest.deleteMany({
      where: { id: { in: impact.allRequestIds } },
    });

    // 3. Delete orphaned Briefings
    if (impact.orphanedBriefingIds.length > 0) {
      await tx.briefing.deleteMany({
        where: { id: { in: impact.orphanedBriefingIds } },
      });
    }

    // 4. Delete orphaned Clips
    if (impact.orphanedClipIds.length > 0) {
      await tx.clip.deleteMany({
        where: { id: { in: impact.orphanedClipIds } },
      });
    }

    // 5. Delete orphaned WorkProducts
    if (impact.orphanedWpIds.length > 0) {
      await tx.workProduct.deleteMany({
        where: { id: { in: impact.orphanedWpIds } },
      });
    }
  });

  // 6. Delete R2 objects (outside transaction — best effort)
  const r2Keys = [...impact.wpR2Keys, ...impact.clipR2Keys];
  if (r2Keys.length > 0) {
    await Promise.allSettled(r2Keys.map((key) => c.env.R2.delete(key)));
  }

  // 7. Audit log
  const user = await getCurrentUser(c, prisma).catch(() => null);
  await writeAuditLog(prisma, {
    actorId: user?.id ?? "unknown",
    actorEmail: user?.email ?? undefined,
    action: "delete_briefing_request",
    entityType: "BriefingRequest",
    entityId: subjectId,
    metadata: {
      deletedRequestIds: impact.allRequestIds,
      deletedJobCount: impact.jobCount,
      deletedFeedItemCount: impact.feedItems.length,
      deletedBriefingCount: impact.orphanedBriefingIds.length,
      deletedClipCount: impact.orphanedClipIds.length,
      deletedWorkProductCount: impact.orphanedWpIds.length,
      deletedR2ObjectCount: r2Keys.length,
    },
  });

  return c.json({
    data: {
      deleted: {
        requests: impact.allRequestIds.length,
        jobs: impact.jobCount,
        feedItems: impact.feedItems.length,
        briefings: impact.orphanedBriefingIds.length,
        clips: impact.orphanedClipIds.length,
        workProducts: impact.orphanedWpIds.length,
        r2Objects: r2Keys.length,
      },
    },
  });
});

export { requestsRoutes };
