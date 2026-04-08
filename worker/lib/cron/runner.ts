// Loose prisma type — tightens automatically after prisma generate
type PrismaLike = {
  cronJob: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  cronRun: {
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
  };
  cronRunLog: {
    create: (args: any) => Promise<any>;
  };
};

export type CronLogger = {
  debug(message: string, data?: Record<string, unknown>): Promise<void>;
  info(message: string, data?: Record<string, unknown>): Promise<void>;
  warn(message: string, data?: Record<string, unknown>): Promise<void>;
  error(message: string, data?: Record<string, unknown>): Promise<void>;
};

function createCronLogger(runId: string, prisma: PrismaLike): CronLogger {
  async function log(
    level: "DEBUG" | "INFO" | "WARN" | "ERROR",
    message: string,
    data?: Record<string, unknown>
  ) {
    await prisma.cronRunLog.create({
      data: { runId, level, message, data: data ?? null },
    });
    console.log(
      JSON.stringify({
        level: level.toLowerCase(),
        jobRun: runId,
        message,
        ...(data ?? {}),
        ts: new Date().toISOString(),
      })
    );
  }

  return {
    debug: (m, d) => log("DEBUG", m, d),
    info: (m, d) => log("INFO", m, d),
    warn: (m, d) => log("WARN", m, d),
    error: (m, d) => log("ERROR", m, d),
  };
}

/**
 * Runs a named cron job with interval gating, run-record lifecycle, and log capture.
 *
 * - Reads config (enabled, intervalMinutes, lastRunAt) from the CronJob table.
 * - Returns immediately (no record) if the job is disabled or missing from DB.
 * - Returns immediately (no record) if the interval has not elapsed since the last run.
 * - Creates a CronRun(IN_PROGRESS), calls execute(), marks SUCCESS or FAILED.
 * - Updates CronJob.lastRunAt after execution.
 */
export async function runJob(params: {
  jobKey: string;
  prisma: PrismaLike;
  execute: (logger: CronLogger) => Promise<Record<string, unknown>>;
}): Promise<void> {
  const { jobKey, prisma, execute } = params;

  // Read job config from CronJob table
  const job = await prisma.cronJob.findUnique({ where: { jobKey } });
  if (!job || !job.enabled) return;

  const intervalMinutes: number = job.intervalMinutes;

  // Check if interval has elapsed since last run
  if (job.lastRunAt) {
    const elapsedMs = Date.now() - new Date(job.lastRunAt).getTime();
    if (elapsedMs < intervalMinutes * 60_000) return;
  }

  // Time-of-day gate: if runAtHour is set, only run during that UTC hour
  if (job.runAtHour != null && new Date().getUTCHours() !== job.runAtHour) return;

  // Guard: if there's already a recent IN_PROGRESS run, skip to prevent pile-up
  // (handles case where Worker was killed before updating status/lastRunAt)
  const stuckRun = await prisma.cronRun.findFirst({
    where: { jobKey, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (stuckRun) {
    const stuckAgeMs = Date.now() - new Date(stuckRun.startedAt).getTime();
    const staleThresholdMs = intervalMinutes * 60_000;
    if (stuckAgeMs < staleThresholdMs) {
      // Recent IN_PROGRESS run exists — skip this tick
      return;
    }
    // Stuck run is older than the interval — mark it FAILED so it doesn't block forever
    await prisma.cronRun.update({
      where: { id: stuckRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: stuckAgeMs,
        errorMessage: "Marked as failed: exceeded expected run duration (likely Worker timeout)",
      },
    });
  }

  // Write lastRunAt BEFORE execution so that if the Worker is killed mid-run,
  // the next cron tick won't immediately re-trigger this job
  const now = new Date();
  await prisma.cronJob.update({
    where: { jobKey },
    data: { lastRunAt: now },
  });

  // Create run record
  const run = await prisma.cronRun.create({
    data: { jobKey, status: "IN_PROGRESS" },
  });

  const logger = createCronLogger(run.id, prisma);
  const startedAt = Date.now();

  try {
    const result = await execute(logger);
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        result,
      },
    });
  } catch (err) {
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
