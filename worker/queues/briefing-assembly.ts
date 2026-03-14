import { assembleBriefingAudio } from "../lib/audio/assembly";
import { getConfig } from "../lib/config";
import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import type { BriefingAssemblyMessage } from "../lib/queue-messages";
import type { Env } from "../types";
import { wpKey, getWorkProduct, putWorkProduct } from "../lib/work-products";

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

        // Create Briefings and update FeedItems linked to this request
        if (completedJobs.length > 0) {
          // For each completed job, create Briefing per user and update FeedItems
          for (const job of completedJobs) {
            // Find all FeedItems for this job's episode+tier under this request
            const feedItems = await prisma.feedItem.findMany({
              where: {
                requestId,
                episodeId: job.episodeId,
                durationTier: job.durationTier,
              },
              select: { id: true, userId: true },
            });

            for (const fi of feedItems) {
              // Upsert Briefing (per-user wrapper around shared Clip)
              const briefing = await prisma.briefing.upsert({
                where: {
                  userId_clipId: {
                    userId: fi.userId,
                    clipId: job.clipId!,
                  },
                },
                create: {
                  userId: fi.userId,
                  clipId: job.clipId!,
                },
                update: {},
              });

              // Audio assembly (gated by feature toggle)
              const assemblyEnabled = await getConfig(
                prisma,
                "BRIEFING_ASSEMBLY_AUDIO_ENABLED",
                false
              );

              if (assemblyEnabled) {
                try {
                  const clipR2Key = wpKey({
                    type: "AUDIO_CLIP",
                    episodeId: job.episodeId,
                    durationTier: job.durationTier,
                    voice: "default",
                  });
                  const clipAudio = await getWorkProduct(env.R2, clipR2Key);

                  if (clipAudio) {
                    const result = await assembleBriefingAudio(clipAudio, env.R2, {
                      warn: (action, data) => log.info(action, data),
                    });

                    const briefingR2Key = wpKey({
                      type: "BRIEFING_AUDIO",
                      briefingId: briefing.id,
                    });
                    await putWorkProduct(env.R2, briefingR2Key, result.audio, {
                      contentType: "audio/mpeg",
                    });

                    await prisma.workProduct.create({
                      data: {
                        type: "BRIEFING_AUDIO",
                        userId: fi.userId,
                        r2Key: briefingR2Key,
                        sizeBytes: result.sizeBytes,
                        metadata: {
                          hasJingles: result.hasJingles,
                          isFallback: result.isFallback,
                        },
                      },
                    });

                    log.info("briefing_audio_assembled", {
                      briefingId: briefing.id,
                      hasJingles: result.hasJingles,
                      isFallback: result.isFallback,
                      sizeBytes: result.sizeBytes,
                    });
                  } else {
                    log.info("briefing_audio_skip_no_clip", {
                      briefingId: briefing.id,
                      clipR2Key,
                    });
                  }
                } catch (err) {
                  // Audio assembly failure must not block briefing delivery
                  log.error("briefing_audio_error", {
                    briefingId: briefing.id,
                  }, err);
                }
              }

              await prisma.feedItem.update({
                where: { id: fi.id },
                data: {
                  status: "READY",
                  briefingId: briefing.id,
                },
              });
            }
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
