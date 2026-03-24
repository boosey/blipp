import { getConfig } from "../config";

// Loose prisma type — tightens automatically after prisma generate
type PrismaLike = {
  platformConfig: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  cronRun: {
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
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
 * - Returns immediately (no record) if the job is disabled.
 * - Returns immediately (no record) if the interval has not elapsed since the last run.
 * - Creates a CronRun(IN_PROGRESS), calls execute(), marks SUCCESS or FAILED.
 * - Always writes cron.{jobKey}.lastRunAt after execution.
 */
export async function runJob(params: {
  jobKey: string;
  prisma: PrismaLike;
  defaultIntervalMinutes?: number;
  execute: (logger: CronLogger) => Promise<Record<string, unknown>>;
}): Promise<void> {
  const { jobKey, prisma, defaultIntervalMinutes = 60, execute } = params;

  // Check enabled (cached is fine — manual change, 60s lag acceptable)
  const enabled = await getConfig(prisma as any, `cron.${jobKey}.enabled`, true);
  if (!enabled) return;

  // Read intervalMinutes (cached) + lastRunAt (direct DB read — bypass cache)
  const intervalMinutes = await getConfig<number>(
    prisma as any,
    `cron.${jobKey}.intervalMinutes`,
    defaultIntervalMinutes
  );
  const lastRunConfig = await prisma.platformConfig.findUnique({
    where: { key: `cron.${jobKey}.lastRunAt` },
  });
  const lastRunAt = lastRunConfig?.value as string | null;
  if (lastRunAt) {
    const elapsedMs = Date.now() - new Date(lastRunAt).getTime();
    if (elapsedMs < (intervalMinutes as number) * 60_000) return;
  }

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
  } finally {
    // Direct upsert — not via cached getConfig
    await prisma.platformConfig.upsert({
      where: { key: `cron.${jobKey}.lastRunAt` },
      update: { value: new Date().toISOString() },
      create: {
        key: `cron.${jobKey}.lastRunAt`,
        value: new Date().toISOString(),
        description: `Last run timestamp for cron job: ${jobKey}`,
      },
    });
  }
}
