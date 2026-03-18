import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { writeEvent } from "../lib/pipeline-events";
import type { BriefingAssemblyMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for briefing assembly (stage 5).
 *
 * This is the terminal pipeline stage. For each job in the request it finds
 * the completed clip, upserts a per-user Briefing, and marks FeedItems READY.
 * Follows the same PipelineJob/PipelineStep lifecycle as all other stages so
 * jobs appear in the pipeline monitor's assembly column.
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

    if (!(await checkStageEnabled(prisma, batch, "BRIEFING_ASSEMBLY", log))) return;

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

        const jobs = await prisma.pipelineJob.findMany({
          where: { requestId },
        });

        log.info("jobs_loaded", { requestId, total: jobs.length });

        let successCount = 0;
        let failureCount = 0;

        for (const job of jobs) {
          // Jobs that failed in earlier stages are skipped — they have no clip
          if (job.status === "FAILED") {
            failureCount++;
            continue;
          }

          const jobStartTime = Date.now();

          // Advance to IN_PROGRESS and create the audit step
          await prisma.pipelineJob.update({
            where: { id: job.id },
            data: { status: "IN_PROGRESS" },
          });

          const step = await prisma.pipelineStep.create({
            data: {
              jobId: job.id,
              stage: "BRIEFING_ASSEMBLY",
              status: "IN_PROGRESS",
              startedAt: new Date(),
            },
          });

          try {
            await writeEvent(prisma, step.id, "INFO", "Resolving clip for briefing assembly", {
              clipIdFromJob: !!job.clipId,
              episodeId: job.episodeId,
              durationTier: job.durationTier,
            });

            // Resolve clipId — fall back to direct Clip lookup if Hyperdrive returns stale null
            let clipId = job.clipId;
            if (!clipId) {
              const clip = await prisma.clip.findUnique({
                where: { episodeId_durationTier: { episodeId: job.episodeId, durationTier: job.durationTier } },
                select: { id: true },
              });
              clipId = clip?.id ?? null;
              if (clipId) {
                await writeEvent(prisma, step.id, "INFO", "Resolved clipId via DB fallback (Hyperdrive stale read)", {
                  clipId,
                });
              }
            }

            if (!clipId) {
              throw new Error("No clip found for episode/durationTier");
            }

            // Find all FeedItems for this job's episode+tier under this request
            const feedItems = await prisma.feedItem.findMany({
              where: { requestId, episodeId: job.episodeId, durationTier: job.durationTier },
              select: { id: true, userId: true },
            });

            await writeEvent(prisma, step.id, "INFO", `Assembling ${feedItems.length} feed item(s)`);

            for (const fi of feedItems) {
              const briefing = await prisma.briefing.upsert({
                where: { userId_clipId: { userId: fi.userId, clipId: clipId! } },
                create: { userId: fi.userId, clipId: clipId! },
                update: {},
              });

              await prisma.feedItem.update({
                where: { id: fi.id },
                data: { status: "READY", briefingId: briefing.id },
              });
            }

            await writeEvent(prisma, step.id, "INFO", "Briefing assembly complete");

            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: {
                status: "COMPLETED",
                completedAt: new Date(),
                durationMs: Date.now() - jobStartTime,
              },
            });

            await prisma.pipelineJob.update({
              where: { id: job.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            });

            successCount++;
            log.info("job_assembled", { jobId: job.id, episodeId: job.episodeId });
          } catch (jobErr) {
            const errorMessage = jobErr instanceof Error ? jobErr.message : String(jobErr);
            log.error("job_assembly_error", { jobId: job.id, episodeId: job.episodeId }, jobErr);

            await writeEvent(prisma, step.id, "ERROR", `Assembly failed: ${errorMessage.slice(0, 2048)}`).catch(() => {});

            await prisma.pipelineStep
              .updateMany({
                where: { id: step.id, status: "IN_PROGRESS" },
                data: {
                  status: "FAILED",
                  errorMessage,
                  completedAt: new Date(),
                  durationMs: Date.now() - jobStartTime,
                },
              })
              .catch((dbErr: unknown) => {
                console.error(JSON.stringify({
                  level: "error",
                  action: "error_path_db_write_failed",
                  stage: "briefing-assembly",
                  target: "pipelineStep",
                  jobId: job.id,
                  error: dbErr instanceof Error ? dbErr.message : String(dbErr),
                  ts: new Date().toISOString(),
                }));
              });

            await prisma.pipelineJob
              .update({
                where: { id: job.id },
                data: { status: "FAILED", errorMessage, completedAt: new Date() },
              })
              .catch((dbErr: unknown) => {
                console.error(JSON.stringify({
                  level: "error",
                  action: "error_path_db_write_failed",
                  stage: "briefing-assembly",
                  target: "pipelineJob",
                  jobId: job.id,
                  error: dbErr instanceof Error ? dbErr.message : String(dbErr),
                  ts: new Date().toISOString(),
                }));
              });

            failureCount++;
          }
        }

        // Update request-level status
        if (successCount === 0) {
          await prisma.feedItem.updateMany({
            where: { requestId },
            data: { status: "FAILED", errorMessage: "No completed clips available" },
          });

          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: { status: "FAILED", errorMessage: "No completed jobs with clips available" },
          });

          log.info("assembly_all_failed", { requestId });
        } else {
          const isPartial = failureCount > 0;
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: {
              status: "COMPLETED",
              errorMessage: isPartial
                ? `Partial: ${failureCount} of ${jobs.length} jobs failed`
                : null,
            },
          });

          log.info("assembly_complete", {
            requestId,
            successCount,
            failureCount,
            partial: isPartial,
          });
        }

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("assembly_error", { requestId }, err);

        await prisma.feedItem
          .updateMany({
            where: { requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "briefing-assembly",
              target: "feedItem",
              requestId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        await prisma.briefingRequest
          .updateMany({
            where: {
              id: requestId,
              status: { notIn: ["COMPLETED", "FAILED"] },
            },
            data: { status: "FAILED", errorMessage },
          })
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "briefing-assembly",
              target: "briefingRequest",
              requestId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
