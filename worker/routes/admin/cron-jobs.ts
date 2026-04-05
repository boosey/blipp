import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const VALID_INTERVALS = [15, 30, 60, 120, 360, 720, 1440, 10080];

const JOB_DEFINITIONS = [
  {
    jobKey: "apple-discovery",
    label: "Apple Discovery",
    description: "Discovers new podcasts from Apple Podcasts and adds them to the library",
    defaultIntervalMinutes: 10080,
  },
  {
    jobKey: "podcast-index-discovery",
    label: "Podcast Index Discovery",
    description: "Discovers new podcasts from Podcast Index and adds them to the library",
    defaultIntervalMinutes: 10080,
  },
  {
    jobKey: "pipeline-trigger",
    label: "Fetch New Episodes",
    description: "Checks all podcast feeds for new episodes and enqueues them for processing",
    defaultIntervalMinutes: 15,
  },
  {
    jobKey: "monitoring",
    label: "Update AI Models",
    description: "Refreshes AI model pricing and checks cost threshold alerts",
    defaultIntervalMinutes: 60,
  },
  {
    jobKey: "user-lifecycle",
    label: "Promotion Aging",
    description: "Checks for users whose free trial has expired",
    defaultIntervalMinutes: 360,
  },
  {
    jobKey: "data-retention",
    label: "Data Pruning",
    description: "Counts/deletes aged episodes, stale podcasts, and old requests",
    defaultIntervalMinutes: 1440,
  },
  {
    jobKey: "recommendations",
    label: "Compute Recommendations",
    description: "Rebuilds podcast recommendation profiles for all users",
    defaultIntervalMinutes: 10080,
  },
  {
    jobKey: "listen-original-aggregation",
    label: "Listen-to-Original Aggregation",
    description: "Aggregates listen-to-original conversion events into daily publisher report batches",
    defaultIntervalMinutes: 1440,
  },
  {
    jobKey: "stale-job-reaper",
    label: "Stale Job Reaper",
    description: "Marks stalled PipelineJobs, FeedItems, and EpisodeRefreshJobs as failed",
    defaultIntervalMinutes: 30,
  },
] as const;

const VALID_JOB_KEYS = JOB_DEFINITIONS.map((j) => j.jobKey);

export const cronJobsRoutes = new Hono<{ Bindings: Env }>();

/** GET /api/admin/cron-jobs — all jobs with config + latest run */
cronJobsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  const [configs, latestRuns] = await Promise.all([
    prisma.platformConfig.findMany({
      where: { key: { startsWith: "cron." } },
    }),
    Promise.all(
      VALID_JOB_KEYS.map((jobKey) =>
        prisma.cronRun
          .findFirst({
            where: { jobKey },
            orderBy: { startedAt: "desc" },
          })
          .then((run: any) => ({ jobKey, run }))
      )
    ),
  ]);

  const latestRunMap = Object.fromEntries(
    latestRuns.map(({ jobKey, run }: { jobKey: string; run: any }) => [jobKey, run])
  );

  const jobs = JOB_DEFINITIONS.map((def) => {
    const get = (suffix: string, fallback: unknown) => {
      const entry = configs.find((c: any) => c.key === `cron.${def.jobKey}.${suffix}`);
      return entry?.value ?? fallback;
    };
    return {
      jobKey: def.jobKey,
      label: def.label,
      description: def.description,
      enabled: get("enabled", true),
      intervalMinutes: get("intervalMinutes", def.defaultIntervalMinutes),
      lastRunAt: get("lastRunAt", null),
      latestRun: latestRunMap[def.jobKey] ?? null,
    };
  });

  return c.json({ jobs });
});

/** PATCH /api/admin/cron-jobs/:jobKey — update enabled and/or intervalMinutes */
cronJobsRoutes.patch("/:jobKey", async (c) => {
  const { jobKey } = c.req.param();
  if (!VALID_JOB_KEYS.includes(jobKey as any)) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const updates: Promise<any>[] = [];

  if (typeof body.enabled === "boolean") {
    updates.push(
      prisma.platformConfig.upsert({
        where: { key: `cron.${jobKey}.enabled` },
        update: { value: body.enabled },
        create: {
          key: `cron.${jobKey}.enabled`,
          value: body.enabled,
          description: `Enabled flag for cron job: ${jobKey}`,
        },
      })
    );
  }

  if (typeof body.intervalMinutes === "number") {
    if (!VALID_INTERVALS.includes(body.intervalMinutes)) {
      return c.json(
        { error: `intervalMinutes must be one of: ${VALID_INTERVALS.join(", ")}` },
        400
      );
    }
    updates.push(
      prisma.platformConfig.upsert({
        where: { key: `cron.${jobKey}.intervalMinutes` },
        update: { value: body.intervalMinutes },
        create: {
          key: `cron.${jobKey}.intervalMinutes`,
          value: body.intervalMinutes,
          description: `Run interval (minutes) for cron job: ${jobKey}`,
        },
      })
    );
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  await Promise.all(updates);
  return c.json({ success: true });
});

/** GET /api/admin/cron-jobs/:jobKey/runs — paginated run history */
cronJobsRoutes.get("/:jobKey/runs", async (c) => {
  const { jobKey } = c.req.param();
  if (!VALID_JOB_KEYS.includes(jobKey as any)) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const prisma = c.get("prisma") as any;
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
  if (!VALID_JOB_KEYS.includes(jobKey as any)) {
    return c.json({ error: `Unknown jobKey: ${jobKey}` }, 404);
  }

  const prisma = c.get("prisma") as any;

  // Verify the run belongs to this job
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
