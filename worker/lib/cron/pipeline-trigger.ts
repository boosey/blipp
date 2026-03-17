import { getConfig } from "../config";
import type { CronLogger } from "./runner";
import type { Env } from "../../types";

type PrismaLike = {
  platformConfig: { upsert: (args: any) => Promise<any> };
};

/**
 * Pipeline Trigger job: enqueues a feed refresh cycle.
 * Respects the master pipeline.enabled flag independently of the cron-level enabled toggle.
 * Also updates pipeline.lastAutoRunAt for backward compatibility with the pipeline controls page.
 */
export async function runPipelineTriggerJob(
  prisma: PrismaLike,
  env: Env,
  logger: CronLogger
): Promise<Record<string, unknown>> {
  const pipelineEnabled = await getConfig(prisma as any, "pipeline.enabled", true);
  if (!pipelineEnabled) {
    await logger.info("pipeline_disabled", { skipped: true });
    return { skipped: true, reason: "pipeline_disabled" };
  }

  await env.FEED_REFRESH_QUEUE.send({ type: "cron" });

  // Keep pipeline.lastAutoRunAt in sync for the Pipeline Controls page
  await prisma.platformConfig.upsert({
    where: { key: "pipeline.lastAutoRunAt" },
    update: { value: new Date().toISOString() },
    create: {
      key: "pipeline.lastAutoRunAt",
      value: new Date().toISOString(),
      description: "Timestamp of last automatic pipeline run",
    },
  });

  await logger.info("feed_refresh_enqueued", { trigger: "cron" });
  return { enqueued: true, trigger: "cron" };
}
