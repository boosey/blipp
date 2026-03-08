import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import type { Env } from "../types";

interface BriefingAssemblyMessage {
  requestId: string;
  type?: "manual";
}

/**
 * Queue consumer for briefing assembly (stage 5).
 *
 * This is the terminal pipeline stage. For each request it finds the completed
 * clip(s) and updates all linked FeedItems to READY with the clipId.
 */
export async function handleBriefingAssembly(
  batch: MessageBatch<BriefingAssemblyMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "briefing-assembly", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    if (!(await checkStageEnabled(prisma, batch, 5, log))) return;

    for (const msg of batch.messages) {
      const { requestId } = msg.body;

      try {
        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
        });

        if (!request) {
          log.info("request_not_found", { requestId });
          msg.ack();
          continue;
        }
        if (request.status === "COMPLETED" || request.status === "FAILED") {
          log.info("request_already_terminal", { requestId, status: request.status });
          msg.ack();
          continue;
        }

        // Load all jobs for this request
        const jobs = await prisma.pipelineJob.findMany({
          where: { requestId },
        });

        const completedJobs = jobs.filter(
          (j: any) => j.status === "COMPLETED" && j.clipId
        );
        const failedJobs = jobs.filter((j: any) => j.status === "FAILED");

        log.info("jobs_loaded", {
          requestId,
          total: jobs.length,
          completed: completedJobs.length,
          failed: failedJobs.length,
        });

        // Update FeedItems linked to this request
        if (completedJobs.length > 0) {
          // For each completed job, update matching FeedItems
          for (const job of completedJobs) {
            await prisma.feedItem.updateMany({
              where: {
                requestId,
                episodeId: job.episodeId,
                durationTier: job.durationTier,
              },
              data: {
                status: "READY",
                clipId: job.clipId,
              },
            });
          }

          const isPartial = failedJobs.length > 0;
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: {
              status: "COMPLETED",
              errorMessage: isPartial
                ? `Partial: ${failedJobs.length} of ${jobs.length} jobs failed`
                : null,
            },
          });

          log.info("assembly_complete", {
            requestId,
            clipCount: completedJobs.length,
            partial: isPartial,
          });
        } else {
          // All jobs failed — mark FeedItems as FAILED
          await prisma.feedItem.updateMany({
            where: { requestId },
            data: {
              status: "FAILED",
              errorMessage: "No completed clips available",
            },
          });

          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: {
              status: "FAILED",
              errorMessage: "No completed jobs with clips available",
            },
          });

          log.info("assembly_all_failed", { requestId });
        }

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("assembly_error", { requestId }, err);

        // Mark FeedItems and request as FAILED
        await prisma.feedItem
          .updateMany({
            where: { requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch(() => {});

        await prisma.briefingRequest
          .updateMany({
            where: {
              id: requestId,
              status: { notIn: ["COMPLETED", "FAILED"] },
            },
            data: { status: "FAILED", errorMessage },
          })
          .catch(() => {});

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
