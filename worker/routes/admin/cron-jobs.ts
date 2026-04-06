import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const VALID_INTERVALS = [15, 30, 60, 120, 360, 720, 1440, 10080];

export const cronJobsRoutes = new Hono<{ Bindings: Env }>();

/** GET /api/admin/cron-jobs — all jobs with latest run */
cronJobsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  const jobs = await prisma.cronJob.findMany({
    orderBy: { jobKey: "asc" },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          status: true,
          result: true,
          errorMessage: true,
        },
      },
    },
  });

  return c.json({
    jobs: jobs.map((job: any) => ({
      jobKey: job.jobKey,
      label: job.label,
      description: job.description,
      enabled: job.enabled,
      intervalMinutes: job.intervalMinutes,
      defaultIntervalMinutes: job.defaultIntervalMinutes,
      lastRunAt: job.lastRunAt,
      latestRun: job.runs[0] ?? null,
    })),
  });
});

/** PATCH /api/admin/cron-jobs/:jobKey — update enabled and/or intervalMinutes */
cronJobsRoutes.patch("/:jobKey", async (c) => {
  const { jobKey } = c.req.param();
  const prisma = c.get("prisma") as any;

  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const body = await c.req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  if (typeof body.intervalMinutes === "number") {
    if (!VALID_INTERVALS.includes(body.intervalMinutes)) {
      return c.json(
        { error: `intervalMinutes must be one of: ${VALID_INTERVALS.join(", ")}` },
        400
      );
    }
    data.intervalMinutes = body.intervalMinutes;
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  await prisma.cronJob.update({ where: { jobKey }, data });
  return c.json({ success: true });
});

/** POST /api/admin/cron-jobs/:jobKey/trigger — queue job to run on next cron tick */
cronJobsRoutes.post("/:jobKey/trigger", async (c) => {
  const { jobKey } = c.req.param();
  const prisma = c.get("prisma") as any;

  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }
  if (!job.enabled) {
    return c.json({ error: "Job is disabled — enable it first" }, 400);
  }

  // Clear lastRunAt so the runner picks it up on the next cron tick (≤5 min)
  await prisma.cronJob.update({
    where: { jobKey },
    data: { lastRunAt: null },
  });
  return c.json({ success: true, message: "Job will run on the next cron tick (within 5 minutes)" });
});

/** PATCH /api/admin/cron-jobs/:jobKey/reset — reset interval to default */
cronJobsRoutes.patch("/:jobKey/reset", async (c) => {
  const { jobKey } = c.req.param();
  const prisma = c.get("prisma") as any;

  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  await prisma.cronJob.update({
    where: { jobKey },
    data: { intervalMinutes: job.defaultIntervalMinutes },
  });
  return c.json({ success: true });
});

/** GET /api/admin/cron-jobs/:jobKey/runs — paginated run history */
cronJobsRoutes.get("/:jobKey/runs", async (c) => {
  const { jobKey } = c.req.param();
  const prisma = c.get("prisma") as any;

  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const { page, pageSize, skip } = parsePagination(c);

  const [runs, total] = await Promise.all([
    prisma.cronRun.findMany({
      where: { jobKey },
      orderBy: { startedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        jobKey: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        status: true,
        result: true,
        errorMessage: true,
      },
    }),
    prisma.cronRun.count({ where: { jobKey } }),
  ]);

  return c.json(paginatedResponse(runs, total, page, pageSize));
});

/** GET /api/admin/cron-jobs/:jobKey/runs/:runId/logs — on-demand logs for one run */
cronJobsRoutes.get("/:jobKey/runs/:runId/logs", async (c) => {
  const { jobKey, runId } = c.req.param();
  const prisma = c.get("prisma") as any;

  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const run = await prisma.cronRun.findUnique({ where: { id: runId } });
  if (!run || run.jobKey !== jobKey) {
    return c.json({ error: "Run not found" }, 404);
  }

  const logs = await prisma.cronRunLog.findMany({
    where: { runId },
    orderBy: { timestamp: "asc" },
    select: { id: true, level: true, message: true, data: true, timestamp: true },
  });

  return c.json({ logs });
});
