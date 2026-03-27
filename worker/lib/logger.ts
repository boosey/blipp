import { getConfig } from "./config";

export const LOG_LEVELS: Record<string, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

interface LoggerOptions {
  stage: string;
  requestId?: string;
  jobId?: string;
  correlationId?: string;
  prisma: { platformConfig: { findUnique: (args: any) => Promise<any> } };
}

export interface PipelineLogger {
  info: (action: string, data: Record<string, unknown>) => void;
  debug: (action: string, data: Record<string, unknown>) => void;
  error: (action: string, data: Record<string, unknown>, err?: unknown) => void;
  timer: (action: string) => () => void;
}

/**
 * Logs a DB write failure on an error path (fire-and-forget catch handler).
 * Use as: `.catch(logDbError("stage", "target", jobId))`
 */
export function logDbError(stage: string, target: string, jobId: string) {
  return (dbErr: unknown) => {
    console.error(JSON.stringify({
      level: "error",
      action: "error_path_db_write_failed",
      stage,
      target,
      jobId,
      error: dbErr instanceof Error ? (dbErr as Error).message : String(dbErr),
      ts: new Date().toISOString(),
    }));
  };
}

export async function createPipelineLogger(opts: LoggerOptions): Promise<PipelineLogger> {
  const levelName = await getConfig(opts.prisma, "pipeline.logLevel", "info");
  const threshold = LOG_LEVELS[levelName as string] ?? LOG_LEVELS.info;

  const base: Record<string, unknown> = { stage: opts.stage };
  if (opts.requestId) base.requestId = opts.requestId;
  if (opts.jobId) base.jobId = opts.jobId;
  if (opts.correlationId) base.correlationId = opts.correlationId;

  function emit(level: string, action: string, data: Record<string, unknown>) {
    const line = JSON.stringify({ level, ...base, action, ...data, ts: new Date().toISOString() });
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    info(action, data) {
      if (threshold >= LOG_LEVELS.info) emit("info", action, data);
    },
    debug(action, data) {
      if (threshold >= LOG_LEVELS.debug) emit("debug", action, data);
    },
    error(action, data, err?) {
      const errData: Record<string, unknown> = { ...data };
      if (err instanceof Error) {
        errData.error = err.message;
        errData.stack = err.stack;
      } else if (err !== undefined) {
        errData.error = String(err);
      }
      emit("error", action, errData);
    },
    timer(action) {
      const start = Date.now();
      return () => {
        emit(threshold >= LOG_LEVELS.info ? "info" : "debug", action, { durationMs: Date.now() - start });
      };
    },
  };
}
