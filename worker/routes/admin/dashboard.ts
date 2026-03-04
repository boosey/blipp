import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const STAGE_NAMES: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip Generation",
};

const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - System health overview
dashboardRoutes.get("/", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let failedJobs = 0;
    let stageStats: { currentStage: string; status: string; _count: number }[] = [];
    try {
      [failedJobs, stageStats] = await Promise.all([
        prisma.pipelineJob.count({
          where: { status: "FAILED", createdAt: { gte: twentyFourHoursAgo } },
        }),
        prisma.pipelineJob.groupBy({
          by: ["currentStage", "status"],
          where: { createdAt: { gte: twentyFourHoursAgo } },
          _count: true,
        }),
      ]);
    } catch {
      // PipelineJob table may not exist yet
    }

    // Build per-stage health
    const stageMap = new Map<string, { total: number; completed: number; failed: number; active: number }>();
    for (const row of stageStats) {
      if (!stageMap.has(row.currentStage)) {
        stageMap.set(row.currentStage, { total: 0, completed: 0, failed: 0, active: 0 });
      }
      const s = stageMap.get(row.currentStage)!;
      s.total += row._count;
      if (row.status === "COMPLETED") s.completed += row._count;
      else if (row.status === "FAILED") s.failed += row._count;
      else if (row.status === "IN_PROGRESS") s.active += row._count;
    }

    const stageKeys = ["TRANSCRIPTION", "DISTILLATION", "CLIP_GENERATION"] as const;
    const stages = stageKeys.map((stage) => {
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
        name: STAGE_NAMES[stage] ?? stage,
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
    let jobs: Awaited<ReturnType<typeof prisma.pipelineJob.findMany<{ include: { episode: { select: { title: true; podcast: { select: { title: true } } } } } }>>> = [];
    try {
      jobs = await prisma.pipelineJob.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          episode: {
            select: { title: true, podcast: { select: { title: true } } },
          },
        },
      });
    } catch {
      return c.json({ data: [] });
    }

    const data = jobs.map((job) => ({
      id: job.id,
      timestamp: job.createdAt.toISOString(),
      stage: job.currentStage,
      stageName: STAGE_NAMES[job.currentStage] ?? job.currentStage,
      episodeTitle: job.episode?.title,
      podcastName: job.episode?.podcast?.title,
      status: job.status.toLowerCase().replace("_", "-") as string,
      type: job.currentStage,
    }));

    return c.json({ data });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /costs - Cost summary for today/yesterday (queries PipelineStep)
dashboardRoutes.get("/costs", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    let todaySteps: { stage: string; cost: number | null }[] = [];
    let yesterdaySteps: { stage: string; cost: number | null }[] = [];
    try {
      [todaySteps, yesterdaySteps] = await Promise.all([
        prisma.pipelineStep.findMany({
          where: { createdAt: { gte: todayStart }, cost: { not: null } },
          select: { stage: true, cost: true },
        }),
        prisma.pipelineStep.findMany({
          where: { createdAt: { gte: yesterdayStart, lt: todayStart }, cost: { not: null } },
          select: { stage: true, cost: true },
        }),
      ]);
    } catch {
      // PipelineStep table may not exist yet
    }

    const todaySpend = todaySteps.reduce((sum, s) => sum + (s.cost ?? 0), 0);
    const yesterdaySpend = yesterdaySteps.reduce((sum, s) => sum + (s.cost ?? 0), 0);
    const trend = yesterdaySpend > 0 ? Math.round(((todaySpend - yesterdaySpend) / yesterdaySpend) * 100) : 0;

    // Breakdown by stage
    const byStage = new Map<string, number>();
    for (const s of todaySteps) {
      byStage.set(s.stage, (byStage.get(s.stage) ?? 0) + (s.cost ?? 0));
    }
    const breakdown = Array.from(byStage.entries()).map(([category, amount]) => ({
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

const STAGE_LABELS: Record<string, string> = {
  TRANSCRIPTION: "Transcription",
  DISTILLATION: "Distillation",
  CLIP_GENERATION: "Clip generation",
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
        const label = STAGE_LABELS[job.currentStage] ?? job.currentStage;
        const { description, rawError } = humanizeError(job.errorMessage);
        return {
          id: job.id,
          severity: "critical" as const,
          title: `${label} job failed`,
          description,
          rawError,
          entityId: job.episodeId,
          entityType: "episode",
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

// GET /feed-refresh-summary - Feed refresh status for FeedRefreshCard
dashboardRoutes.get("/feed-refresh-summary", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    // Get the most recent lastFetchedAt across all podcasts
    const latestPodcast = await prisma.podcast.findFirst({
      where: { lastFetchedAt: { not: null } },
      orderBy: { lastFetchedAt: "desc" },
      select: { lastFetchedAt: true },
    });

    const lastRunAt = latestPodcast?.lastFetchedAt ?? null;

    // Count podcasts refreshed in the last run window (within 10 min of lastRunAt)
    let podcastsRefreshed = 0;
    if (lastRunAt) {
      const windowStart = new Date(lastRunAt.getTime() - 10 * 60 * 1000);
      podcastsRefreshed = await prisma.podcast.count({
        where: {
          lastFetchedAt: { gte: windowStart, lte: lastRunAt },
        },
      });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalPodcasts, recentEpisodes, feedErrors] = await Promise.all([
      prisma.podcast.count({ where: { status: "active" } }),
      prisma.episode.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.podcast.count({ where: { feedError: { not: null }, status: "active" } }),
    ]);

    return c.json({
      data: {
        lastRunAt: lastRunAt?.toISOString() ?? null,
        podcastsRefreshed,
        totalPodcasts,
        recentEpisodes,
        feedErrors,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { dashboardRoutes };
