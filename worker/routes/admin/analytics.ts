import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const STAGE_NAMES: Record<number, string> = {
  1: "Feed Refresh",
  2: "Transcription",
  3: "Distillation",
  4: "Clip Generation",
  5: "Briefing Assembly",
};

const analyticsRoutes = new Hono<{ Bindings: Env }>();

analyticsRoutes.get("/health", (c) => c.json({ status: "ok" }));

function parseDateRange(c: { req: { query: (key: string) => string | undefined } }) {
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /costs - Cost data grouped by day
analyticsRoutes.get("/costs", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    let jobs: { type: string; cost: number | null; createdAt: Date }[] = [];
    let prevJobs: { cost: number | null }[] = [];
    const { from, to } = parseDateRange(c);
    const days = daysBetween(from, to);

    try {
      jobs = await prisma.pipelineJob.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          cost: { not: null },
        },
        select: { type: true, cost: true, createdAt: true },
      });

      // Previous period comparison
      const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
      prevJobs = await prisma.pipelineJob.findMany({
        where: {
          createdAt: { gte: prevFrom, lt: from },
          cost: { not: null },
        },
        select: { cost: true },
      });
    } catch {
      // PipelineJob table may not exist
      return c.json({
        data: {
          totalCost: 0,
          comparison: { amount: 0, percentage: 0, direction: "up" },
          dailyCosts: [],
          metrics: { perEpisode: 0, dailyAvg: 0, projectedMonthly: 0, budgetStatus: "on_track" },
          efficiencyScore: 0,
        },
      });
    }

    const dailyCosts = days.map((day) => {
      const key = dateKey(day);
      const dayJobs = jobs.filter((j) => dateKey(j.createdAt) === key);

      const stt = dayJobs.filter((j) => j.type === "TRANSCRIPTION").reduce((s, j) => s + (j.cost ?? 0), 0);
      const distillation = dayJobs.filter((j) => j.type === "DISTILLATION").reduce((s, j) => s + (j.cost ?? 0), 0);
      const tts = dayJobs.filter((j) => j.type === "CLIP_GENERATION").reduce((s, j) => s + (j.cost ?? 0), 0);
      const infrastructure = dayJobs
        .filter((j) => j.type === "FEED_REFRESH" || j.type === "BRIEFING_ASSEMBLY")
        .reduce((s, j) => s + (j.cost ?? 0), 0);

      return { date: key, stt: round(stt), distillation: round(distillation), tts: round(tts), infrastructure: round(infrastructure) };
    });

    const totalCost = jobs.reduce((s, j) => s + (j.cost ?? 0), 0);
    const dayCount = days.length || 1;
    const dailyAvg = totalCost / dayCount;

    const prevTotal = prevJobs.reduce((s, j) => s + (j.cost ?? 0), 0);
    const comparisonAmount = totalCost - prevTotal;
    const comparisonPct = prevTotal > 0 ? Math.round((comparisonAmount / prevTotal) * 100) : 0;

    const episodeJobs = jobs.filter((j) => j.type === "TRANSCRIPTION" || j.type === "DISTILLATION" || j.type === "CLIP_GENERATION");
    const uniqueEpisodes = new Set(episodeJobs.map((j) => j.createdAt.toISOString().slice(0, 10)));
    const perEpisode = uniqueEpisodes.size > 0 ? round(totalCost / uniqueEpisodes.size) : 0;

    return c.json({
      data: {
        totalCost: round(totalCost),
        comparison: {
          amount: round(comparisonAmount),
          percentage: comparisonPct,
          direction: comparisonAmount >= 0 ? "up" : "down",
        },
        dailyCosts,
        metrics: {
          perEpisode,
          dailyAvg: round(dailyAvg),
          projectedMonthly: round(dailyAvg * 30),
          budgetStatus: "on_track",
        },
        efficiencyScore: 85, // placeholder
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /usage - Usage trends
analyticsRoutes.get("/usage", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const { from, to } = parseDateRange(c);
    const days = daysBetween(from, to);

    const [briefings, episodes, users, tierCounts] = await Promise.all([
      prisma.briefing.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, actualSeconds: true },
      }),
      prisma.episode.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      prisma.user.groupBy({
        by: ["tier"],
        _count: true,
      }),
    ]);

    const trends = days.map((day) => {
      const key = dateKey(day);
      return {
        date: key,
        briefings: briefings.filter((b) => dateKey(b.createdAt) === key).length,
        episodes: episodes.filter((e) => dateKey(e.createdAt) === key).length,
        users: users.filter((u) => dateKey(u.createdAt) === key).length,
      };
    });

    const totalUsers = tierCounts.reduce((s, t) => s + t._count, 0);
    const byTier = tierCounts.map((t) => ({
      tier: t.tier,
      count: t._count,
      percentage: totalUsers > 0 ? Math.round((t._count / totalUsers) * 100) : 0,
    }));

    const avgDuration = briefings.length > 0
      ? Math.round(briefings.reduce((s, b) => s + (b.actualSeconds ?? 0), 0) / briefings.length)
      : 0;

    // Peak times - hours with most briefings
    const hourCounts = new Map<number, number>();
    for (const b of briefings) {
      const hour = b.createdAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    const peakTimes = Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return c.json({
      data: {
        metrics: {
          briefings: briefings.length,
          episodes: episodes.length,
          users: users.length,
          avgDuration,
        },
        trends,
        byTier,
        peakTimes,
        topPodcasts: [], // Would need a more complex join
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /quality - Quality metrics
analyticsRoutes.get("/quality", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const { from, to } = parseDateRange(c);

    const [briefings, distillations, episodes] = await Promise.all([
      prisma.briefing.findMany({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
        select: { targetMinutes: true, actualSeconds: true, createdAt: true },
      }),
      prisma.distillation.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { status: true },
      }),
      prisma.episode.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { transcriptUrl: true },
      }),
    ]);

    // Time fitting accuracy
    const fitScores = briefings
      .filter((b) => b.actualSeconds && b.targetMinutes)
      .map((b) => Math.max(0, 100 - Math.abs((b.actualSeconds! - b.targetMinutes * 60) / (b.targetMinutes * 60)) * 100));
    const timeFitting = fitScores.length > 0 ? Math.round(fitScores.reduce((s, v) => s + v, 0) / fitScores.length) : 100;

    // Distillation success rate
    const totalDistillations = distillations.length;
    const completedDistillations = distillations.filter((d) => d.status === "COMPLETED").length;
    const claimCoverage = totalDistillations > 0 ? Math.round((completedDistillations / totalDistillations) * 100) : 100;

    // Transcription coverage
    const totalEpisodes = episodes.length;
    const withTranscript = episodes.filter((e) => e.transcriptUrl).length;
    const transcription = totalEpisodes > 0 ? Math.round((withTranscript / totalEpisodes) * 100) : 100;

    const overallScore = Math.round((timeFitting + claimCoverage + transcription) / 3);

    // Daily trend
    const days = daysBetween(from, to);
    const trend = days.map((day) => {
      const key = dateKey(day);
      const dayBriefings = briefings.filter((b) => dateKey(b.createdAt) === key && b.actualSeconds && b.targetMinutes);
      const dayScore = dayBriefings.length > 0
        ? Math.round(
            dayBriefings
              .map((b) => Math.max(0, 100 - Math.abs((b.actualSeconds! - b.targetMinutes * 60) / (b.targetMinutes * 60)) * 100))
              .reduce((s, v) => s + v, 0) / dayBriefings.length
          )
        : 100;
      return { date: key, score: dayScore };
    });

    // Recent issues
    const failedDistillations = distillations.filter((d) => d.status === "FAILED").length;
    const recentIssues: { type: string; count: number }[] = [];
    if (failedDistillations > 0) recentIssues.push({ type: "failed_distillation", count: failedDistillations });
    const poorFitBriefings = fitScores.filter((s) => s < 70).length;
    if (poorFitBriefings > 0) recentIssues.push({ type: "poor_time_fit", count: poorFitBriefings });

    return c.json({
      data: {
        overallScore,
        components: {
          timeFitting,
          claimCoverage,
          transcription,
          userSatisfaction: 85, // placeholder
        },
        trend,
        recentIssues,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// GET /pipeline - Pipeline performance
analyticsRoutes.get("/pipeline", async (c) => {
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const { from, to } = parseDateRange(c);

    let jobs: { stage: number; status: string; durationMs: number | null; createdAt: Date }[] = [];
    let prevJobCount = 0;

    try {
      jobs = await prisma.pipelineJob.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { stage: true, status: true, durationMs: true, createdAt: true },
      });

      // Previous period for trend
      const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
      prevJobCount = await prisma.pipelineJob.count({
        where: {
          createdAt: { gte: prevFrom, lt: from },
          status: "COMPLETED",
          stage: { in: [2, 3] },
        },
      });
    } catch {
      // PipelineJob table may not exist
      return c.json({
        data: {
          throughput: { episodesPerHour: 0, trend: 0 },
          successRates: [1, 2, 3, 4, 5].map((stage) => ({
            stage,
            name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
            rate: 100,
          })),
          processingSpeed: [],
          bottlenecks: [],
        },
      });
    }

    const days = daysBetween(from, to);
    const hours = Math.max(1, (to.getTime() - from.getTime()) / (60 * 60 * 1000));

    // Per-stage success rates
    const successRates = [1, 2, 3, 4, 5].map((stage) => {
      const stageJobs = jobs.filter((j) => j.stage === stage);
      const completed = stageJobs.filter((j) => j.status === "COMPLETED").length;
      return {
        stage,
        name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
        rate: stageJobs.length > 0 ? Math.round((completed / stageJobs.length) * 100) : 100,
      };
    });

    // Throughput
    const completedEpisodeJobs = jobs.filter(
      (j) => j.status === "COMPLETED" && (j.stage === 2 || j.stage === 3)
    ).length;
    const episodesPerHour = round(completedEpisodeJobs / hours);

    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const prevHours = Math.max(1, (from.getTime() - prevFrom.getTime()) / (60 * 60 * 1000));
    const prevRate = prevJobCount / prevHours;
    const throughputTrend = prevRate > 0 ? Math.round(((episodesPerHour - prevRate) / prevRate) * 100) : 0;

    // Processing speed over time
    const processingSpeed = days.map((day) => {
      const key = dateKey(day);
      const dayJobs = jobs.filter((j) => dateKey(j.createdAt) === key && j.durationMs);
      const avg = dayJobs.length > 0
        ? Math.round(dayJobs.reduce((s, j) => s + (j.durationMs ?? 0), 0) / dayJobs.length)
        : 0;
      return { date: key, avgMs: avg };
    });

    // Bottlenecks
    const bottlenecks: { stage: string; issue: string; recommendation: string }[] = [];
    for (const sr of successRates) {
      if (sr.rate < 90) {
        bottlenecks.push({
          stage: sr.name,
          issue: `Success rate is ${sr.rate}%`,
          recommendation: `Review failed ${sr.name.toLowerCase()} jobs for common error patterns`,
        });
      }
    }

    return c.json({
      data: {
        throughput: { episodesPerHour, trend: throughputTrend },
        successRates,
        processingSpeed,
        bottlenecks,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export { analyticsRoutes };
