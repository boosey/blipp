import { Hono } from "hono";
import type { Env } from "../../types";
import { PIPELINE_STAGE_NAMES } from "../../lib/constants";

const analyticsRoutes = new Hono<{ Bindings: Env }>();

analyticsRoutes.get("/health", (c) => c.json({ status: "ok" }));

function parseDateRange(c: { req: { query: (key: string) => string | undefined } }) {
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// GET /costs - Cost data grouped by day via SQL aggregation
analyticsRoutes.get("/costs", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);

  try {
    // Daily costs by stage — single SQL query
    const dailyRows: { day: string; stage: string; total_cost: number }[] =
      await prisma.$queryRawUnsafe(
        `SELECT DATE("createdAt") as day, stage, COALESCE(SUM(cost), 0)::float as total_cost
         FROM "PipelineStep"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND model IS NOT NULL
         GROUP BY DATE("createdAt"), stage
         ORDER BY day`,
        from, to,
      );

    // Total cost for current period
    const [totals]: [{ total_cost: number; unique_days: number }] =
      await prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(cost), 0)::float as total_cost,
                COUNT(DISTINCT DATE("createdAt"))::int as unique_days
         FROM "PipelineStep"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND model IS NOT NULL`,
        from, to,
      );

    // Previous period total for comparison
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const [prevTotals]: [{ total_cost: number }] =
      await prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(cost), 0)::float as total_cost
         FROM "PipelineStep"
         WHERE "createdAt" >= $1 AND "createdAt" < $2 AND model IS NOT NULL`,
        prevFrom, from,
      );

    // Build daily costs map
    const dayMap = new Map<string, { stt: number; distillation: number; tts: number }>();
    for (const row of dailyRows) {
      const key = row.day;
      const entry = dayMap.get(key) ?? { stt: 0, distillation: 0, tts: 0 };
      if (row.stage === "TRANSCRIPTION") entry.stt = Number(row.total_cost);
      else if (row.stage === "DISTILLATION") entry.distillation = Number(row.total_cost);
      else if (row.stage === "AUDIO_GENERATION") entry.tts = Number(row.total_cost);
      dayMap.set(key, entry);
    }

    const dailyCosts = Array.from(dayMap.entries()).map(([date, costs]) => ({
      date,
      stt: round(costs.stt),
      distillation: round(costs.distillation),
      tts: round(costs.tts),
      infrastructure: 0,
    }));

    const totalCost = Number(totals.total_cost);
    const dayCount = Math.max(1, Math.ceil(periodMs / (24 * 60 * 60 * 1000)));
    const dailyAvg = totalCost / dayCount;
    const prevTotal = Number(prevTotals.total_cost);
    const comparisonAmount = totalCost - prevTotal;
    const comparisonPct = prevTotal > 0 ? Math.round((comparisonAmount / prevTotal) * 100) : 0;
    const perEpisode = Number(totals.unique_days) > 0 ? round(totalCost / Number(totals.unique_days)) : 0;

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
        },
      },
    });
  } catch {
    return c.json({
      data: {
        totalCost: 0,
        comparison: { amount: 0, percentage: 0, direction: "up" },
        dailyCosts: [],
        metrics: { perEpisode: 0, dailyAvg: 0, projectedMonthly: 0 },
      },
    });
  }
});

// GET /costs/by-model - Cost breakdown by model and stage (Prisma groupBy)
analyticsRoutes.get("/costs/by-model", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);

  try {
    const [byModel, byStage] = await Promise.all([
      prisma.pipelineStep.groupBy({
        by: ["model"],
        where: { createdAt: { gte: from, lte: to }, model: { not: null } },
        _sum: { cost: true, inputTokens: true, outputTokens: true },
        _count: true,
      }),
      prisma.pipelineStep.groupBy({
        by: ["stage"],
        where: { createdAt: { gte: from, lte: to }, model: { not: null } },
        _sum: { cost: true, inputTokens: true, outputTokens: true },
        _count: true,
      }),
    ]);

    const models = byModel.map((r: any) => ({
      model: r.model,
      totalCost: round(r._sum.cost ?? 0),
      totalInputTokens: r._sum.inputTokens ?? 0,
      totalOutputTokens: r._sum.outputTokens ?? 0,
      callCount: r._count,
    }));

    const stages = byStage.map((r: any) => ({
      stage: r.stage,
      stageName: PIPELINE_STAGE_NAMES[r.stage] ?? r.stage,
      totalCost: round(r._sum.cost ?? 0),
      totalInputTokens: r._sum.inputTokens ?? 0,
      totalOutputTokens: r._sum.outputTokens ?? 0,
      callCount: r._count,
    }));

    return c.json({ data: { models, byStage: stages } });
  } catch {
    return c.json({ data: { models: [], byStage: [] } });
  }
});

// GET /usage - Usage trends via SQL aggregation
analyticsRoutes.get("/usage", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);

  const [feedTrends, episodeTrends, userTrends, planCounts, feedAgg, peakRows] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT DATE("createdAt") as day, COUNT(*)::int as count
       FROM "FeedItem" WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY DATE("createdAt") ORDER BY day`, from, to,
    ) as Promise<{ day: string; count: number }[]>,

    prisma.$queryRawUnsafe(
      `SELECT DATE("createdAt") as day, COUNT(*)::int as count
       FROM "Episode" WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY DATE("createdAt") ORDER BY day`, from, to,
    ) as Promise<{ day: string; count: number }[]>,

    prisma.$queryRawUnsafe(
      `SELECT DATE("createdAt") as day, COUNT(*)::int as count
       FROM "User" WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY DATE("createdAt") ORDER BY day`, from, to,
    ) as Promise<{ day: string; count: number }[]>,

    prisma.user.groupBy({ by: ["planId"], _count: true }),

    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total,
              COALESCE(AVG("durationTier"), 0)::float as avg_duration
       FROM "FeedItem" WHERE "createdAt" >= $1 AND "createdAt" <= $2`, from, to,
    ) as Promise<[{ total: number; avg_duration: number }]>,

    prisma.$queryRawUnsafe(
      `SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, COUNT(*)::int as count
       FROM "FeedItem" WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY hour ORDER BY count DESC LIMIT 10`, from, to,
    ) as Promise<{ hour: number; count: number }[]>,
  ]);

  // Merge daily trends into a single array
  const feedMap = new Map(feedTrends.map((r) => [r.day, Number(r.count)]));
  const epMap = new Map(episodeTrends.map((r) => [r.day, Number(r.count)]));
  const userMap = new Map(userTrends.map((r) => [r.day, Number(r.count)]));
  const allDays = new Set([...feedMap.keys(), ...epMap.keys(), ...userMap.keys()]);
  const trends = Array.from(allDays).sort().map((day) => ({
    date: day,
    feedItems: feedMap.get(day) ?? 0,
    episodes: epMap.get(day) ?? 0,
    users: userMap.get(day) ?? 0,
  }));

  // Plan breakdown
  const plans = await prisma.plan.findMany({
    where: { id: { in: planCounts.map((p: any) => p.planId) } },
    select: { id: true, name: true },
  });
  const planNameMap = new Map(plans.map((p: any) => [p.id, p.name]));
  const totalUsers = planCounts.reduce((s: number, p: any) => s + p._count, 0);
  const byPlan = planCounts.map((p: any) => ({
    plan: planNameMap.get(p.planId) ?? "Unknown",
    count: p._count,
    percentage: totalUsers > 0 ? Math.round((p._count / totalUsers) * 100) : 0,
  }));

  const agg = feedAgg[0];
  const feedItemCount = Number(agg.total);
  const episodeCount = episodeTrends.reduce((s, r) => s + Number(r.count), 0);
  const userCount = userTrends.reduce((s, r) => s + Number(r.count), 0);

  return c.json({
    data: {
      metrics: {
        feedItems: feedItemCount,
        episodes: episodeCount,
        users: userCount,
        avgDuration: Math.round(Number(agg.avg_duration) * 60),
      },
      trends,
      byPlan,
      peakTimes: peakRows.map((r) => ({ hour: Number(r.hour), count: Number(r.count) })),
      topPodcasts: [],
    },
  });
});

// GET /quality - Quality metrics via SQL aggregation
analyticsRoutes.get("/quality", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);

  const [clipAgg, distAgg, epAgg, dailyQuality, failedCount, poorFitCount] = await Promise.all([
    // Time fitting: AVG of fit scores for clips with actual duration
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(AVG(
        GREATEST(0, 100 - ABS(("actualSeconds" - "durationTier" * 60.0) / ("durationTier" * 60.0)) * 100)
      ), 100)::float as avg_fit
       FROM "Clip"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'COMPLETED'
         AND "actualSeconds" IS NOT NULL AND "durationTier" IS NOT NULL`, from, to,
    ) as Promise<[{ avg_fit: number }]>,

    // Distillation success rate
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed
       FROM "Distillation"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2`, from, to,
    ) as Promise<[{ total: number; completed: number }]>,

    // Transcription coverage
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE "transcriptUrl" IS NOT NULL)::int as with_transcript
       FROM "Episode"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2`, from, to,
    ) as Promise<[{ total: number; with_transcript: number }]>,

    // Daily quality trend (time fitting per day)
    prisma.$queryRawUnsafe(
      `SELECT DATE("createdAt") as day,
              COALESCE(AVG(
                GREATEST(0, 100 - ABS(("actualSeconds" - "durationTier" * 60.0) / ("durationTier" * 60.0)) * 100)
              ), 100)::float as score
       FROM "Clip"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'COMPLETED'
         AND "actualSeconds" IS NOT NULL AND "durationTier" IS NOT NULL
       GROUP BY DATE("createdAt") ORDER BY day`, from, to,
    ) as Promise<{ day: string; score: number }[]>,

    // Failed distillations count
    prisma.distillation.count({
      where: { createdAt: { gte: from, lte: to }, status: "FAILED" },
    }),

    // Poor time fit count
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "Clip"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND status = 'COMPLETED'
         AND "actualSeconds" IS NOT NULL AND "durationTier" IS NOT NULL
         AND GREATEST(0, 100 - ABS(("actualSeconds" - "durationTier" * 60.0) / ("durationTier" * 60.0)) * 100) < 70`,
      from, to,
    ) as Promise<[{ count: number }]>,
  ]);

  const timeFitting = Math.round(Number(clipAgg[0].avg_fit));
  const distTotal = Number(distAgg[0].total);
  const distCompleted = Number(distAgg[0].completed);
  const claimCoverage = distTotal > 0 ? Math.round((distCompleted / distTotal) * 100) : 100;
  const epTotal = Number(epAgg[0].total);
  const epWithTranscript = Number(epAgg[0].with_transcript);
  const transcription = epTotal > 0 ? Math.round((epWithTranscript / epTotal) * 100) : 100;
  const overallScore = Math.round((timeFitting + claimCoverage + transcription) / 3);

  const trend = dailyQuality.map((r) => ({ date: r.day, score: Math.round(Number(r.score)) }));

  const recentIssues: { type: string; count: number }[] = [];
  if (failedCount > 0) recentIssues.push({ type: "failed_distillation", count: failedCount });
  const poorFit = Number(poorFitCount[0].count);
  if (poorFit > 0) recentIssues.push({ type: "poor_time_fit", count: poorFit });

  return c.json({
    data: {
      overallScore,
      components: { timeFitting, claimCoverage, transcription },
      trend,
      recentIssues,
    },
  });
});

// GET /pipeline - Pipeline performance via SQL aggregation
analyticsRoutes.get("/pipeline", async (c) => {
  const prisma = c.get("prisma") as any;
  const { from, to } = parseDateRange(c);
  const periodMs = to.getTime() - from.getTime();
  const hours = Math.max(1, periodMs / (60 * 60 * 1000));

  try {
    const [stageRates, completedCount, prevCount, dailySpeed] = await Promise.all([
      // Per-stage success rates
      prisma.$queryRawUnsafe(
        `SELECT stage,
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed
         FROM "PipelineStep"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY stage`, from, to,
      ) as Promise<{ stage: string; total: number; completed: number }[]>,

      // Total completed for throughput
      prisma.pipelineStep.count({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
      }),

      // Previous period completed count for trend
      prisma.pipelineStep.count({
        where: {
          createdAt: { gte: new Date(from.getTime() - periodMs), lt: from },
          status: "COMPLETED",
        },
      }),

      // Daily average processing speed
      prisma.$queryRawUnsafe(
        `SELECT DATE("createdAt") as day,
                COALESCE(AVG("durationMs"), 0)::float as avg_ms
         FROM "PipelineStep"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND "durationMs" IS NOT NULL
         GROUP BY DATE("createdAt") ORDER BY day`, from, to,
      ) as Promise<{ day: string; avg_ms: number }[]>,
    ]);

    const stageKeys = ["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"];
    const rateMap = new Map(stageRates.map((r) => [r.stage, r]));
    const successRates = stageKeys.map((stage) => {
      const r = rateMap.get(stage);
      return {
        stage,
        name: PIPELINE_STAGE_NAMES[stage] ?? stage,
        rate: r && Number(r.total) > 0 ? Math.round((Number(r.completed) / Number(r.total)) * 100) : 100,
      };
    });

    const episodesPerHour = round(completedCount / hours);
    const prevHours = Math.max(1, periodMs / (60 * 60 * 1000));
    const prevRate = prevCount / prevHours;
    const throughputTrend = prevRate > 0 ? Math.round(((episodesPerHour - prevRate) / prevRate) * 100) : 0;

    const processingSpeed = dailySpeed.map((r) => ({
      date: r.day,
      avgMs: Math.round(Number(r.avg_ms)),
    }));

    const bottlenecks: { stage: string; issue: string; recommendation: string }[] = [];
    for (const sr of successRates) {
      if (sr.rate < 90) {
        bottlenecks.push({
          stage: sr.name,
          issue: `Success rate is ${sr.rate}%`,
          recommendation: `Review failed ${sr.name.toLowerCase()} steps for common error patterns`,
        });
      }
    }

    return c.json({
      data: { throughput: { episodesPerHour, trend: throughputTrend }, successRates, processingSpeed, bottlenecks },
    });
  } catch {
    return c.json({
      data: {
        throughput: { episodesPerHour: 0, trend: 0 },
        successRates: (["TRANSCRIPTION", "DISTILLATION", "NARRATIVE_GENERATION", "AUDIO_GENERATION", "BRIEFING_ASSEMBLY"] as const).map((stage) => ({
          stage,
          name: PIPELINE_STAGE_NAMES[stage] ?? stage,
          rate: 100,
        })),
        processingSpeed: [],
        bottlenecks: [],
      },
    });
  }
});

// GET /revenue - Revenue metrics (already uses groupBy/count, no changes needed)
analyticsRoutes.get("/revenue", async (c) => {
  const prisma = c.get("prisma") as any;

  const [totalUsers, usersByPlan, plans, recentChurn] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({
      by: ["planId"],
      _count: true,
    }),
    prisma.plan.findMany({
      select: { id: true, name: true, slug: true, priceCentsMonthly: true, priceCentsAnnual: true },
    }) as Promise<{ id: string; name: string; slug: string; priceCentsMonthly: number; priceCentsAnnual: number | null }[]>,
    prisma.user.count({
      where: {
        plan: { isDefault: true },
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const planMap = new Map(plans.map((p: any) => [p.id, p]));

  let mrr = 0;
  const byPlan = usersByPlan.map((group: any) => {
    const plan = planMap.get(group.planId);
    const monthlyPrice = plan?.priceCentsMonthly ?? 0;
    const planMrr = (monthlyPrice * group._count) / 100;
    mrr += planMrr;

    return {
      planId: group.planId,
      planName: plan?.name ?? "Unknown",
      planSlug: plan?.slug ?? "unknown",
      userCount: group._count,
      mrr: Math.round(planMrr * 100) / 100,
    };
  });

  return c.json({
    data: {
      totalUsers,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      byPlan,
      churn30d: recentChurn,
      arpu: totalUsers > 0 ? Math.round((mrr / totalUsers) * 100) / 100 : 0,
    },
  });
});

export { analyticsRoutes };
