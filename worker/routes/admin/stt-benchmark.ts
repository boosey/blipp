import { Hono } from "hono";
import type { Env } from "../../types";
import {
  parsePagination,
  parseSort,
  paginatedResponse,
} from "../../lib/admin-helpers";
import { runNextTask } from "../../lib/stt-benchmark-runner";
import { STT_PROVIDERS } from "../../lib/stt-providers";

const sttBenchmarkRoutes = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /eligible-episodes — episodes with transcripts available
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/eligible-episodes", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const search = c.req.query("search");

  // Only episodes with official/external transcripts (transcriptUrl from RSS feed).
  // Blipp-generated distillation transcripts are Whisper output and can't serve
  // as ground truth for WER comparison.
  const where: Record<string, unknown> = {
    transcriptUrl: { not: null },
  };

  // Layer search filter on top
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
        distillation: { select: { status: true, transcript: true } },
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
    transcriptUrl: e.transcriptUrl ?? undefined,
    hasDistillationTranscript: !!e.distillation?.transcript,
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// ---------------------------------------------------------------------------
// GET /episode-audio/:id — proxy audio bytes to avoid CORS issues
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/episode-audio/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const episode = await prisma.episode.findUnique({
    where: { id },
    select: { audioUrl: true },
  });

  if (!episode) {
    return c.json({ error: "Episode not found" }, 404);
  }

  // Proxy the audio to avoid CORS — limit to first ~15 min at 192kbps
  const MAX_BYTES = 900 * 192_000 / 8;
  const upstream = await fetch(episode.audioUrl, {
    headers: { Range: `bytes=0-${MAX_BYTES - 1}` },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return c.json({ error: `Audio fetch failed: ${upstream.status}` }, 502);
  }

  const contentType = upstream.headers.get("content-type") || "audio/mpeg";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

// ---------------------------------------------------------------------------
// GET /results/:resultId/transcript — fetch STT output transcript from R2
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/results/:resultId/transcript", async (c) => {
  const prisma = c.get("prisma") as any;
  const resultId = c.req.param("resultId");

  const result = await prisma.sttBenchmarkResult.findUnique({
    where: { id: resultId },
  });

  if (!result) {
    return c.json({ error: "Result not found" }, 404);
  }

  if (!result.r2TranscriptKey) {
    return c.json({ error: "No transcript available" }, 404);
  }

  const obj = await c.env.R2.get(result.r2TranscriptKey);
  if (!obj) {
    return c.json({ error: "Transcript not found in storage" }, 404);
  }

  const text = await obj.text();
  return c.json({ data: { transcript: text } });
});

// ---------------------------------------------------------------------------
// GET /episodes/:episodeId/reference-transcript — fetch official transcript
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/episodes/:episodeId/reference-transcript", async (c) => {
  const prisma = c.get("prisma") as any;
  const episodeId = c.req.param("episodeId");

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: { transcriptUrl: true, durationSeconds: true },
  });

  if (!episode) {
    return c.json({ error: "Episode not found" }, 404);
  }

  if (!episode.transcriptUrl) {
    return c.json({ error: "No official transcript available" }, 404);
  }

  const resp = await fetch(episode.transcriptUrl);
  if (!resp.ok) {
    return c.json({ error: `Failed to fetch transcript: ${resp.status}` }, 502);
  }

  let text = await resp.text();

  // Strip HTML/XML tags (speaker labels, timestamps) to match normalizeText
  text = text.replace(/<[^>]*>/g, " ");

  // Optional truncation: ?maxWords=N limits output to first N words
  const maxWords = parseInt(c.req.query("maxWords") ?? "", 10);
  if (maxWords > 0) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length > maxWords) {
      text = words.slice(0, maxWords).join(" ") + " …";
    }
  }

  return c.json({ data: { transcript: text } });
});

// ---------------------------------------------------------------------------
// POST /experiments — create a new benchmark experiment
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.post("/experiments", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json<{
    name: string;
    models: string[];
    speeds: number[];
    episodeIds: string[];
  }>();

  const { name, models, speeds, episodeIds } = body;

  if (!name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }
  if (!models?.length) {
    return c.json({ error: "At least one model is required" }, 400);
  }
  if (!speeds?.length) {
    return c.json({ error: "At least one speed is required" }, 400);
  }
  if (!episodeIds?.length) {
    return c.json({ error: "At least one episode is required" }, 400);
  }

  // Validate model IDs against known providers
  const validModelIds = new Set(STT_PROVIDERS.map((p) => p.modelId));
  const invalidModels = models.filter((m) => !validModelIds.has(m));
  if (invalidModels.length) {
    return c.json(
      { error: `Unknown model(s): ${invalidModels.join(", ")}` },
      400,
    );
  }

  const totalTasks = episodeIds.length * models.length * speeds.length;

  const experiment = await prisma.sttExperiment.create({
    data: {
      name: name.trim(),
      config: { models, speeds, episodeIds },
      totalTasks,
    },
  });

  // Pre-generate all result rows (cartesian product)
  const resultData: {
    experimentId: string;
    episodeId: string;
    model: string;
    speed: number;
  }[] = [];

  for (const episodeId of episodeIds) {
    for (const model of models) {
      for (const speed of speeds) {
        resultData.push({
          experimentId: experiment.id,
          episodeId,
          model,
          speed,
        });
      }
    }
  }

  await prisma.sttBenchmarkResult.createMany({ data: resultData });

  return c.json({ data: experiment }, 201);
});

// ---------------------------------------------------------------------------
// GET /experiments — list experiments
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/experiments", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c, "createdAt");

  const [experiments, total] = await Promise.all([
    prisma.sttExperiment.findMany({
      skip,
      take: pageSize,
      orderBy,
      include: {
        _count: { select: { results: true } },
      },
    }),
    prisma.sttExperiment.count(),
  ]);

  const data = experiments.map((e: any) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    config: e.config,
    totalTasks: e.totalTasks,
    doneTasks: e.doneTasks,
    errorMessage: e.errorMessage ?? undefined,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? undefined,
    resultCount: e._count.results,
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

// ---------------------------------------------------------------------------
// GET /experiments/:id — experiment detail
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/experiments/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.sttExperiment.findUnique({
    where: { id },
    include: {
      _count: {
        select: { results: true },
      },
    },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  // Count results by status for progress breakdown
  const statusCounts = await prisma.sttBenchmarkResult.groupBy({
    by: ["status"],
    where: { experimentId: id },
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row._count.id;
  }

  return c.json({
    data: {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      config: experiment.config,
      totalTasks: experiment.totalTasks,
      doneTasks: experiment.doneTasks,
      errorMessage: experiment.errorMessage ?? undefined,
      createdAt: experiment.createdAt.toISOString(),
      updatedAt: experiment.updatedAt.toISOString(),
      completedAt: experiment.completedAt?.toISOString() ?? undefined,
      statusCounts: counts,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /experiments/:id/run — execute next pending task
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.post("/experiments/:id/run", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.sttExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  if (experiment.status === "CANCELLED" || experiment.status === "FAILED") {
    return c.json(
      { error: `Experiment is ${experiment.status}` },
      400,
    );
  }

  // Transition PENDING -> RUNNING on first run
  if (experiment.status === "PENDING") {
    await prisma.sttExperiment.update({
      where: { id },
      data: { status: "RUNNING" },
    });
  }

  // COMPLETED experiments can be resumed if orphaned POLLING/PENDING rows exist
  // (runNextTask handles re-opening the experiment)

  try {
    const result = await runNextTask(id, c.env, prisma);
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("runNextTask error:", message);
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /experiments/:id/cancel — cancel experiment
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.post("/experiments/:id/cancel", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.sttExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const updated = await prisma.sttExperiment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return c.json({ data: updated });
});

// ---------------------------------------------------------------------------
// GET /experiments/:id/results — results + summary grid
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.get("/experiments/:id/results", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.sttExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  const results = await prisma.sttBenchmarkResult.findMany({
    where: { experimentId: id },
    include: {
      episode: {
        select: {
          title: true,
          podcast: { select: { title: true } },
        },
      },
    },
    orderBy: [{ model: "asc" }, { speed: "asc" }, { createdAt: "asc" }],
  });

  const mappedResults = results.map((r: any) => ({
    id: r.id,
    experimentId: r.experimentId,
    episodeId: r.episodeId,
    model: r.model,
    speed: r.speed,
    status: r.status,
    costDollars: r.costDollars ?? undefined,
    latencyMs: r.latencyMs ?? undefined,
    wer: r.wer ?? undefined,
    wordCount: r.wordCount ?? undefined,
    refWordCount: r.refWordCount ?? undefined,
    r2AudioKey: r.r2AudioKey ?? undefined,
    r2TranscriptKey: r.r2TranscriptKey ?? undefined,
    pollingId: r.pollingId ?? undefined,
    errorMessage: r.errorMessage ?? undefined,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? undefined,
    episodeTitle: r.episode.title,
    podcastTitle: r.episode.podcast.title,
  }));

  // Build summary grid: aggregate by (model, speed)
  const gridMap = new Map<
    string,
    {
      model: string;
      speed: number;
      werSum: number;
      costSum: number;
      latencySum: number;
      completedCount: number;
      failedCount: number;
    }
  >();

  for (const r of results) {
    const key = `${r.model}|${r.speed}`;
    let entry = gridMap.get(key);
    if (!entry) {
      entry = {
        model: r.model,
        speed: r.speed,
        werSum: 0,
        costSum: 0,
        latencySum: 0,
        completedCount: 0,
        failedCount: 0,
      };
      gridMap.set(key, entry);
    }

    if (r.status === "COMPLETED") {
      entry.completedCount++;
      entry.werSum += r.wer ?? 0;
      entry.costSum += r.costDollars ?? 0;
      entry.latencySum += r.latencyMs ?? 0;
    } else if (r.status === "FAILED") {
      entry.failedCount++;
    }
  }

  const grid = Array.from(gridMap.values()).map((e) => ({
    model: e.model,
    speed: e.speed,
    avgWer: e.completedCount > 0 ? e.werSum / e.completedCount : 0,
    avgCost: e.completedCount > 0 ? e.costSum / e.completedCount : 0,
    avgLatency: e.completedCount > 0 ? e.latencySum / e.completedCount : 0,
    completedCount: e.completedCount,
    failedCount: e.failedCount,
  }));

  // Compute winners across all grid cells
  const completedCells = grid.filter((g) => g.completedCount > 0);
  const winners = {
    bestWer: completedCells.length
      ? completedCells.reduce((best, g) =>
          g.avgWer < best.avgWer ? g : best,
        )
      : null,
    bestCost: completedCells.length
      ? completedCells.reduce((best, g) =>
          g.avgCost < best.avgCost ? g : best,
        )
      : null,
    bestLatency: completedCells.length
      ? completedCells.reduce((best, g) =>
          g.avgLatency < best.avgLatency ? g : best,
        )
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
// DELETE /experiments/:id — delete experiment + R2 cleanup
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.delete("/experiments/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const experiment = await prisma.sttExperiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    return c.json({ error: "Experiment not found" }, 404);
  }

  // Clean up R2 temp audio and transcripts
  const prefixes = [`benchmark/tmp/${id}/`, `benchmark/transcripts/${id}/`];
  for (const prefix of prefixes) {
    const listed = await c.env.R2.list({ prefix });
    if (listed.objects.length > 0) {
      await Promise.all(
        listed.objects.map((obj) => c.env.R2.delete(obj.key)),
      );
    }
  }

  // Cascade delete handles SttBenchmarkResult rows
  await prisma.sttExperiment.delete({ where: { id } });

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /upload-audio — upload sped-up audio to R2
// ---------------------------------------------------------------------------
sttBenchmarkRoutes.post("/upload-audio", async (c) => {
  try {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const experimentId = formData.get("experimentId") as string | null;
  const episodeId = formData.get("episodeId") as string | null;
  const speed = formData.get("speed") as string | null;

  console.log(`[upload-audio] file: ${!!file} (${file?.size ?? 0} bytes), experimentId: ${experimentId}, episodeId: ${episodeId}, speed: ${speed}`);

  if (!file || !experimentId || !episodeId || !speed) {
    return c.json(
      { error: "Missing required fields: file, experimentId, episodeId, speed" },
      400,
    );
  }

  const key = `benchmark/tmp/${experimentId}/${episodeId}/${speed}.mp3`;
  const buffer = await file.arrayBuffer();
  await c.env.R2.put(key, buffer, {
    httpMetadata: { contentType: "audio/mpeg" },
  });

  // Update the corresponding result row's r2AudioKey
  const prisma = c.get("prisma") as any;
  await prisma.sttBenchmarkResult.updateMany({
    where: {
      experimentId,
      episodeId,
      speed: parseFloat(speed),
    },
    data: { r2AudioKey: key },
  });

  return c.json({ data: { key } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-audio] error:", message);
    return c.json({ error: message }, 500);
  }
});

export { sttBenchmarkRoutes };
