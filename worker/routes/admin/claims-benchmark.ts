import { Hono } from "hono";
import type { Env } from "../../types";
import {
  parsePagination,
  parseSort,
  paginatedResponse,
  getCurrentUser,
} from "../../lib/admin-helpers";
import { runNextTask } from "../../lib/claims-benchmark-runner";
import { writeAuditLog } from "../../lib/audit-log";

const claimsBenchmarkRoutes = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /eligible-episodes — episodes with transcripts in R2 (WorkProduct)
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/eligible-episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const search = c.req.query("search");

  // Episodes that have a TRANSCRIPT work product
  const where: Record<string, unknown> = {
    workProducts: { some: { type: "TRANSCRIPT" } },
  };

  if (search) {
    where.AND = [
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          {
            podcast: {
              title: { contains: search, mode: "insensitive" },
            },
          },
        ],
      },
    ];
  }

  const [episodes, total] = await Promise.all([
    prisma.episode.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { publishedAt: "desc" },
      include: {
        podcast: { select: { title: true, imageUrl: true } },
        workProducts: {
          where: { type: "TRANSCRIPT" },
          select: { sizeBytes: true },
          take: 1,
        },
      },
    }),
    prisma.episode.count({ where }),
  ]);

  const data = episodes.map((e: any) => ({
    id: e.id,
    title: e.title,
    podcastTitle: e.podcast.title,
    podcastImageUrl: e.podcast.imageUrl ?? undefined,
    durationSeconds: e.durationSeconds ?? undefined,
    transcriptSizeBytes: e.workProducts[0]?.sizeBytes ?? undefined,
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// ---------------------------------------------------------------------------
// POST /experiments — create a new claims benchmark experiment
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.post("/experiments", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{
    name: string;
    baselineModelId: string;
    baselineProvider: string;
    judgeModelId: string;
    judgeProvider: string;
    models: { modelId: string; provider: string }[];
    episodeIds: string[];
  }>();

  const { name, baselineModelId, baselineProvider, judgeModelId, judgeProvider, models, episodeIds } = body;

  if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
  if (!baselineModelId || !baselineProvider) return c.json({ error: "Baseline model is required" }, 400);
  if (!judgeModelId || !judgeProvider) return c.json({ error: "Judge model is required" }, 400);
  if (!models?.length) return c.json({ error: "At least one model is required" }, 400);
  if (!episodeIds?.length) return c.json({ error: "At least one episode is required" }, 400);

  // Ensure baseline is included in models list
  const allModels = models.some(
    (m) => m.modelId === baselineModelId && m.provider === baselineProvider
  )
    ? models
    : [{ modelId: baselineModelId, provider: baselineProvider }, ...models];

  const totalTasks = allModels.length * episodeIds.length;
  // Non-baseline models need judging (one per episode)
  const totalJudgeTasks = (allModels.length - 1) * episodeIds.length;

  const experiment = await prisma.claimsExperiment.create({
    data: {
      name: name.trim(),
      baselineModelId,
      baselineProvider,
      judgeModelId,
      judgeProvider,
      config: { models: allModels, episodeIds },
      totalTasks,
      totalJudgeTasks,
    },
  });

  // Pre-generate all result rows (cartesian product)
  const resultData: {
    experimentId: string;
    episodeId: string;
    model: string;
    provider: string;
    isBaseline: boolean;
    judgeStatus: string | null;
  }[] = [];

  for (const episodeId of episodeIds) {
    for (const { modelId, provider } of allModels) {
      const isBaseline = modelId === baselineModelId && provider === baselineProvider;
      resultData.push({
        experimentId: experiment.id,
        episodeId,
        model: modelId,
        provider,
        isBaseline,
        judgeStatus: isBaseline ? null : "PENDING",
      });
    }
  }

  await prisma.claimsBenchmarkResult.createMany({ data: resultData });

  // Audit log
  try {
    const user = await getCurrentUser(c as any, prisma);
    await writeAuditLog(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "claims_experiment.create",
      entityType: "ClaimsExperiment",
      entityId: experiment.id,
      after: { name: experiment.name, models: allModels.length, episodes: episodeIds.length },
    });
  } catch {
    // Audit log failure is non-fatal
  }

  return c.json({ data: experiment }, 201);
});

// ---------------------------------------------------------------------------
// GET /experiments — list experiments
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/experiments", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c, "createdAt", [
    "createdAt", "name", "status", "totalTasks",
  ]);

  const [experiments, total] = await Promise.all([
    prisma.claimsExperiment.findMany({
      skip,
      take: pageSize,
      orderBy,
      include: {
        _count: { select: { results: true } },
      },
    }),
    prisma.claimsExperiment.count(),
  ]);

  const data = experiments.map((e: any) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    baselineModelId: e.baselineModelId,
    baselineProvider: e.baselineProvider,
    judgeModelId: e.judgeModelId,
    judgeProvider: e.judgeProvider,
    config: e.config,
    totalTasks: e.totalTasks,
    doneTasks: e.doneTasks,
    totalJudgeTasks: e.totalJudgeTasks,
    doneJudgeTasks: e.doneJudgeTasks,
    errorMessage: e.errorMessage ?? undefined,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? undefined,
    resultCount: e._count.results,
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// ---------------------------------------------------------------------------
// GET /experiments/:id — experiment detail with status counts
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/experiments/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id },
    include: {
      _count: { select: { results: true } },
    },
  });

  if (!experiment) return c.json({ error: "Experiment not found" }, 404);

  // Count results by status
  const statusCounts = await prisma.claimsBenchmarkResult.groupBy({
    by: ["status"],
    where: { experimentId: id },
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row._count.id;
  }

  // Count results by judgeStatus
  const judgeCounts = await prisma.claimsBenchmarkResult.groupBy({
    by: ["judgeStatus"],
    where: { experimentId: id, judgeStatus: { not: null } },
    _count: { id: true },
  });

  const judgeStatusCounts: Record<string, number> = {};
  for (const row of judgeCounts) {
    if (row.judgeStatus) judgeStatusCounts[row.judgeStatus] = row._count.id;
  }

  return c.json({
    data: {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      baselineModelId: experiment.baselineModelId,
      baselineProvider: experiment.baselineProvider,
      judgeModelId: experiment.judgeModelId,
      judgeProvider: experiment.judgeProvider,
      config: experiment.config,
      totalTasks: experiment.totalTasks,
      doneTasks: experiment.doneTasks,
      totalJudgeTasks: experiment.totalJudgeTasks,
      doneJudgeTasks: experiment.doneJudgeTasks,
      errorMessage: experiment.errorMessage ?? undefined,
      createdAt: experiment.createdAt.toISOString(),
      updatedAt: experiment.updatedAt.toISOString(),
      completedAt: experiment.completedAt?.toISOString() ?? undefined,
      statusCounts: counts,
      judgeStatusCounts,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /experiments/:id/run — execute next pending task
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.post("/experiments/:id/run", async (c) => {
  const prisma = c.get("prisma") as any;
  const { id } = c.req.param();
  const experiment = await prisma.claimsExperiment.findUnique({ where: { id } });
  if (!experiment) return c.json({ error: "Not found" }, 404);

  if (experiment.status === "CANCELLED" || experiment.status === "FAILED") {
    return c.json({ error: `Experiment is ${experiment.status}` }, 400);
  }

  // First run: transition PENDING → RUNNING
  if (experiment.status === "PENDING") {
    await prisma.claimsExperiment.update({
      where: { id },
      data: { status: "RUNNING" },
    });
  }

  try {
    const result = await runNextTask(id, c.env, prisma);
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("claims-benchmark runNextTask error:", message);
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /experiments/:id/cancel — cancel experiment
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.post("/experiments/:id/cancel", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id },
  });

  if (!experiment) return c.json({ error: "Experiment not found" }, 404);

  const updated = await prisma.claimsExperiment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return c.json({ data: updated });
});

// ---------------------------------------------------------------------------
// DELETE /experiments/:id — delete experiment + R2 cleanup
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.delete("/experiments/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id },
  });

  if (!experiment) return c.json({ error: "Experiment not found" }, 404);

  // R2 cleanup with pagination (max 1000 per list call)
  for (const prefix of [`benchmark/claims/${id}/`, `benchmark/judge/${id}/`]) {
    let cursor: string | undefined;
    do {
      const listed = await c.env.R2.list({ prefix, cursor });
      if (listed.objects.length > 0) {
        await Promise.all(listed.objects.map((obj) => c.env.R2.delete(obj.key)));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  // Cascade delete handles ClaimsBenchmarkResult rows
  await prisma.claimsExperiment.delete({ where: { id } });

  // Audit log
  try {
    const user = await getCurrentUser(c as any, prisma);
    await writeAuditLog(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "claims_experiment.delete",
      entityType: "ClaimsExperiment",
      entityId: id,
      before: { name: experiment.name },
    });
  } catch {
    // Audit log failure is non-fatal
  }

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// GET /experiments/:id/results — results + summary grid
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/experiments/:id/results", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id },
  });

  if (!experiment) return c.json({ error: "Experiment not found" }, 404);

  const results = await prisma.claimsBenchmarkResult.findMany({
    where: { experimentId: id },
    include: {
      episode: {
        select: {
          title: true,
          podcast: { select: { title: true } },
        },
      },
    },
    orderBy: [{ model: "asc" }, { provider: "asc" }, { createdAt: "asc" }],
  });

  const mappedResults = results.map((r: any) => ({
    id: r.id,
    experimentId: r.experimentId,
    episodeId: r.episodeId,
    model: r.model,
    provider: r.provider,
    isBaseline: r.isBaseline,
    status: r.status,
    claimCount: r.claimCount ?? undefined,
    inputTokens: r.inputTokens ?? undefined,
    outputTokens: r.outputTokens ?? undefined,
    costDollars: r.costDollars ?? undefined,
    latencyMs: r.latencyMs ?? undefined,
    coverageScore: r.coverageScore ?? undefined,
    weightedCoverageScore: r.weightedCoverageScore ?? undefined,
    hallucinations: r.hallucinations ?? undefined,
    judgeStatus: r.judgeStatus ?? undefined,
    r2ClaimsKey: r.r2ClaimsKey ?? undefined,
    r2JudgeKey: r.r2JudgeKey ?? undefined,
    errorMessage: r.errorMessage ?? undefined,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? undefined,
    episodeTitle: r.episode.title,
    podcastTitle: r.episode.podcast.title,
  }));

  // Build summary grid: aggregate by (model, provider) for non-baseline completed results
  const gridMap = new Map<
    string,
    {
      model: string;
      provider: string;
      coverageSum: number;
      weightedCoverageSum: number;
      hallucinationSum: number;
      claimCountSum: number;
      costSum: number;
      latencySum: number;
      completedCount: number;
      failedCount: number;
    }
  >();

  for (const r of results) {
    if (r.isBaseline) continue;

    const key = `${r.model}|${r.provider}`;
    let entry = gridMap.get(key);
    if (!entry) {
      entry = {
        model: r.model,
        provider: r.provider,
        coverageSum: 0,
        weightedCoverageSum: 0,
        hallucinationSum: 0,
        claimCountSum: 0,
        costSum: 0,
        latencySum: 0,
        completedCount: 0,
        failedCount: 0,
      };
      gridMap.set(key, entry);
    }

    if (r.judgeStatus === "COMPLETED") {
      entry.completedCount++;
      entry.coverageSum += r.coverageScore ?? 0;
      entry.weightedCoverageSum += r.weightedCoverageScore ?? 0;
      entry.hallucinationSum += r.hallucinations ?? 0;
      entry.claimCountSum += r.claimCount ?? 0;
      entry.costSum += r.costDollars ?? 0;
      entry.latencySum += r.latencyMs ?? 0;
    } else if (r.status === "FAILED" || r.judgeStatus === "FAILED") {
      entry.failedCount++;
    }
  }

  const grid = Array.from(gridMap.values()).map((e) => ({
    model: e.model,
    provider: e.provider,
    avgCoverage: e.completedCount > 0 ? e.coverageSum / e.completedCount : 0,
    avgWeightedCoverage: e.completedCount > 0 ? e.weightedCoverageSum / e.completedCount : 0,
    avgHallucinations: e.completedCount > 0 ? e.hallucinationSum / e.completedCount : 0,
    avgClaimCount: e.completedCount > 0 ? e.claimCountSum / e.completedCount : 0,
    avgCost: e.completedCount > 0 ? e.costSum / e.completedCount : 0,
    avgLatency: e.completedCount > 0 ? e.latencySum / e.completedCount : 0,
    completedCount: e.completedCount,
    failedCount: e.failedCount,
  }));

  // Compute winners
  const completedCells = grid.filter((g) => g.completedCount > 0);
  const winners = {
    bestCoverage: completedCells.length
      ? completedCells.reduce((best, g) =>
          g.avgCoverage > best.avgCoverage ? g : best
        )
      : null,
    bestCost: completedCells.length
      ? completedCells.reduce((best, g) =>
          g.avgCost < best.avgCost ? g : best
        )
      : null,
    bestCoveragePerDollar: completedCells.length
      ? completedCells.reduce((best, g) => {
          const gRatio = g.avgCost > 0 ? g.avgCoverage / g.avgCost : 0;
          const bestRatio = best.avgCost > 0 ? best.avgCoverage / best.avgCost : 0;
          return gRatio > bestRatio ? g : best;
        })
      : null,
  };

  return c.json({
    data: {
      experiment,
      results: mappedResults,
      grid,
      winners,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /results/:id/claims — fetch extracted claims from R2
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/results/:id/claims", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const result = await prisma.claimsBenchmarkResult.findUnique({
    where: { id },
  });

  if (!result) return c.json({ error: "Result not found" }, 404);
  if (!result.r2ClaimsKey) return c.json({ error: "No claims available" }, 404);

  const obj = await c.env.R2.get(result.r2ClaimsKey);
  if (!obj) return c.json({ error: "Claims not found in storage" }, 404);

  const text = await obj.text();
  return c.json({ data: { claims: JSON.parse(text) } });
});

// ---------------------------------------------------------------------------
// GET /results/:id/verdicts — fetch judge verdicts from R2
// ---------------------------------------------------------------------------
claimsBenchmarkRoutes.get("/results/:id/verdicts", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const result = await prisma.claimsBenchmarkResult.findUnique({
    where: { id },
  });

  if (!result) return c.json({ error: "Result not found" }, 404);
  if (!result.r2JudgeKey) return c.json({ error: "No verdicts available" }, 404);

  const obj = await c.env.R2.get(result.r2JudgeKey);
  if (!obj) return c.json({ error: "Verdicts not found in storage" }, 404);

  const text = await obj.text();
  return c.json({ data: { verdicts: JSON.parse(text) } });
});

export { claimsBenchmarkRoutes };
