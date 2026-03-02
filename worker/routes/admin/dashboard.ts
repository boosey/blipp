import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - System health overview
dashboardRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let failedJobs = 0;
    let stageStats: { stage: number; status: string; _count: number }[] = [];
    try {
      [failedJobs, stageStats] = await Promise.all([
        prisma.pipelineJob.count({
          where: { status: "FAILED", createdAt: { gte: twentyFourHoursAgo } },
        }),
        prisma.pipelineJob.groupBy({
          by: ["stage", "status"],
          where: { createdAt: { gte: twentyFourHoursAgo } },
          _count: true,
        }),
      ]);
    } catch {
      // PipelineJob table may not exist yet
    }

    // Build per-stage health
    const stageMap = new Map<number, { total: number; completed: number; failed: number; active: number }>();
    for (const row of stageStats) {
      if (!stageMap.has(row.stage)) {
        stageMap.set(row.stage, { total: 0, completed: 0, failed: 0, active: 0 });
      }
      const s = stageMap.get(row.stage)!;
      s.total += row._count;
      if (row.status === "COMPLETED") s.completed += row._count;
      else if (row.status === "FAILED") s.failed += row._count;
      else if (row.status === "IN_PROGRESS") s.active += row._count;
    }

    const stages = [1, 2, 3, 4, 5].map((stage) => {
      const s = stageMap.get(stage) ?? { total: 0, completed: 0, failed: 0, active: 0 };
      const completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 100;
      let status: "healthy" | "warning" | "critical" = "healthy";
      if (s.failed > 0 && s.total > 0) {
        const failRate = s.failed / s.total;
        if (failRate > 0.2) status = "critical";
        else if (failRate > 0.05) status = "warning";
      }
      return {
        stage,
        name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
        completionRate,
        activeJobs: s.active,
        status,
      };
    });

    const hasCritical = stages.some((s) => s.status === "critical");
    const hasWarning = stages.some((s) => s.status === "warning");
    const overall = hasCritical ? "critical" : hasWarning ? "degraded" : "operational";

    return c.json({
      data: { overall, stages, activeIssuesCount: failedJobs },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /stats - Dashboard stat cards
dashboardRoutes.get("/stats", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const results = await Promise.allSettled([
      prisma.podcast.count({ where: { status: { not: "archived" } } }),
      prisma.podcast.count({ where: { createdAt: { gte: sevenDaysAgo }, status: { not: "archived" } } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.episode.count(),
      prisma.episode.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.briefing.count(),
      prisma.briefing.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const v = results.map((r) => (r.status === "fulfilled" ? r.value : 0));

    return c.json({
      data: {
        podcasts: { total: v[0], trend: v[1] },
        users: { total: v[2], trend: v[3] },
        episodes: { total: v[4], trend: v[5] },
        briefings: { total: v[6], trend: v[7] },
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /activity - Recent pipeline activity
dashboardRoutes.get("/activity", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let jobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany>> = [];
    try {
      jobs = await prisma.pipelineJob.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
      });
    } catch {
      return c.json({ data: [] });
    }

    // Resolve entity names for episode/podcast jobs
    const episodeIds = jobs.filter((j) => j.entityType === "episode").map((j) => j.entityId);
    const podcastIds = jobs.filter((j) => j.entityType === "podcast").map((j) => j.entityId);

    const [episodes, podcasts] = await Promise.all([
      episodeIds.length > 0
        ? prisma.episode.findMany({
            where: { id: { in: episodeIds } },
            select: { id: true, title: true, podcast: { select: { title: true } } },
          })
        : [],
      podcastIds.length > 0
        ? prisma.podcast.findMany({
            where: { id: { in: podcastIds } },
            select: { id: true, title: true },
          })
        : [],
    ]);

    const episodeMap = new Map(episodes.map((e) => [e.id, e]));
    const podcastMap = new Map(podcasts.map((p) => [p.id, p]));

    const data = jobs.map((job) => {
      let episodeTitle: string | undefined;
      let podcastName: string | undefined;

      if (job.entityType === "episode") {
        const ep = episodeMap.get(job.entityId);
        episodeTitle = ep?.title;
        podcastName = ep?.podcast?.title;
      } else if (job.entityType === "podcast") {
        podcastName = podcastMap.get(job.entityId)?.title;
      }

      return {
        id: job.id,
        timestamp: job.createdAt.toISOString(),
        stage: job.stage,
        stageName: STAGE_NAMES[job.stage] ?? `Stage ${job.stage}`,
        episodeTitle,
        podcastName,
        status: job.status.toLowerCase().replace("_", "-") as string,
        processingTime: job.durationMs ?? undefined,
        type: job.type,
      };
    });

    return c.json({ data });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /costs - Cost summary for today/yesterday
dashboardRoutes.get("/costs", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    let todayJobs: { type: string; cost: number | null }[] = [];
    let yesterdayJobs: { type: string; cost: number | null }[] = [];
    try {
      [todayJobs, yesterdayJobs] = await Promise.all([
        prisma.pipelineJob.findMany({
          where: { createdAt: { gte: todayStart }, cost: { not: null } },
          select: { type: true, cost: true },
        }),
        prisma.pipelineJob.findMany({
          where: { createdAt: { gte: yesterdayStart, lt: todayStart }, cost: { not: null } },
          select: { type: true, cost: true },
        }),
      ]);
    } catch {
      // PipelineJob table may not exist yet
    }

    const todaySpend = todayJobs.reduce((sum, j) => sum + (j.cost ?? 0), 0);
    const yesterdaySpend = yesterdayJobs.reduce((sum, j) => sum + (j.cost ?? 0), 0);
    const trend = yesterdaySpend > 0 ? Math.round(((todaySpend - yesterdaySpend) / yesterdaySpend) * 100) : 0;

    // Breakdown by type
    const byType = new Map<string, number>();
    for (const j of todayJobs) {
      byType.set(j.type, (byType.get(j.type) ?? 0) + (j.cost ?? 0));
    }
    const breakdown = Array.from(byType.entries()).map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: todaySpend > 0 ? Math.round((amount / todaySpend) * 100) : 0,
    }));

    return c.json({
      data: {
        todaySpend: Math.round(todaySpend * 100) / 100,
        yesterdaySpend: Math.round(yesterdaySpend * 100) / 100,
        trend,
        breakdown,
        budgetUsed: 0, // placeholder - no budget config yet
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/** Try to extract a human-readable message from a raw error string that may be JSON. */
function humanizeError(raw: string | null | undefined): { description: string; rawError?: string } {
  if (!raw) return { description: "Unknown error" };
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);

  // Try to parse JSON and extract a readable message
  let parsed: unknown = null;
  try { parsed = JSON.parse(str); } catch { /* not JSON */ }
  if (!parsed) {
    // Try finding JSON embedded after a prefix like "Error: {..."
    const idx = str.indexOf("{");
    if (idx > 0) {
      try { parsed = JSON.parse(str.slice(idx)); } catch { /* ignore */ }
    }
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    for (const key of ["message", "msg", "reason", "detail", "details", "error", "statusText"]) {
      const val = o[key];
      if (typeof val === "string" && val.length > 0) {
        return { description: val, rawError: str };
      }
      if (val && typeof val === "object" && "message" in (val as Record<string, unknown>)) {
        const nested = (val as Record<string, unknown>).message;
        if (typeof nested === "string") return { description: nested, rawError: str };
      }
    }
    return { description: "Error occurred (see raw details)", rawError: str };
  }

  // Plain string — return as-is, no raw needed
  return { description: str };
}

const JOB_TYPE_LABELS: Record<string, string> = {
  FEED_REFRESH: "Feed refresh",
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip generation",
  BRIEFING_ASSEMBLY: "Briefing assembly",
};

// GET /issues - Active issues
dashboardRoutes.get("/issues", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    let failedJobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany>> = [];
    let brokenPodcasts: { id: string; title: string; feedHealth: string | null; feedError: string | null; updatedAt: Date }[] = [];
    try {
      [failedJobs, brokenPodcasts] = await Promise.all([
        prisma.pipelineJob.findMany({
          where: { status: "FAILED", createdAt: { gte: fortyEightHoursAgo } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.podcast.findMany({
          where: { feedHealth: { in: ["broken", "poor"] }, status: { not: "archived" } },
          select: { id: true, title: true, feedHealth: true, feedError: true, updatedAt: true },
        }),
      ]);
    } catch {
      // Tables may not exist yet
    }

    const issues = [
      ...failedJobs.map((job) => {
        const label = JOB_TYPE_LABELS[job.type] ?? job.type;
        const { description, rawError } = humanizeError(job.errorMessage);
        return {
          id: job.id,
          severity: "critical" as const,
          title: `${label} job failed`,
          description,
          rawError,
          entityId: job.entityId,
          entityType: job.entityType,
          createdAt: job.createdAt.toISOString(),
          actionable: true,
        };
      }),
      ...brokenPodcasts.map((p) => {
        const { description, rawError } = humanizeError(p.feedError);
        return {
          id: p.id,
          severity: (p.feedHealth === "broken" ? "critical" : "warning") as "critical" | "warning",
          title: `Feed ${p.feedHealth}: ${p.title}`,
          description: p.feedError ? description : `Feed health is ${p.feedHealth}`,
          rawError,
          entityId: p.id,
          entityType: "podcast",
          createdAt: p.updatedAt.toISOString(),
          actionable: true,
        };
      }),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ data: issues });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { dashboardRoutes };
