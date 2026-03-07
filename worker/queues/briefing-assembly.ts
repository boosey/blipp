import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
import { wpKey, putWorkProduct } from "../lib/work-products";
import type { Env } from "../types";

/** Shape of a briefing assembly queue message body. */
interface BriefingAssemblyMessage {
  requestId: string;
  type?: "manual";
}

/**
 * Queue consumer for briefing assembly (stage 5).
 *
 * This is the terminal pipeline stage. For each request it gathers completed
 * clips from all PipelineJobs, concatenates them into a final MP3, creates a
 * Briefing record with segments, and marks the BriefingRequest as COMPLETED.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
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

    // Stage gate: check if stage 5 is enabled (manual messages bypass)
    if (!(await checkStageEnabled(prisma, batch, 5, log))) return;

    for (const msg of batch.messages) {
      const { requestId } = msg.body;
      const startTime = Date.now();
      let stepId: string | null = null;

      try {
        // Load BriefingRequest with user
        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
          include: { user: true },
        });

        // Guard: request not found or already terminal
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

        log.info("assembly_start", { requestId, userId: request.userId });

        // Load all PipelineJobs for this request
        const jobs = await prisma.pipelineJob.findMany({
          where: { requestId },
          include: { episode: true },
        });

        // Split into completed (with clipId) and failed
        const completedJobs = jobs.filter(
          (j) => j.status === "COMPLETED" && j.clipId
        );
        const failedJobs = jobs.filter((j) => j.status === "FAILED");

        log.info("jobs_loaded", {
          requestId,
          total: jobs.length,
          completed: completedJobs.length,
          failed: failedJobs.length,
        });

        // If zero completed jobs, mark request FAILED
        if (completedJobs.length === 0) {
          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: {
              status: "FAILED",
              errorMessage: "No completed jobs with clips available for assembly",
            },
          });
          log.info("assembly_no_clips", { requestId });
          msg.ack();
          continue;
        }

        // Create PipelineStep audit trail on first completed job
        const anchorJobId = completedJobs[0].id;
        const step = await prisma.pipelineStep.create({
          data: {
            jobId: anchorJobId,
            stage: "BRIEFING_ASSEMBLY",
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
        stepId = step.id;

        // Gather clip audio from R2 for each completed job
        const clipEntries: Array<{
          job: (typeof completedJobs)[0];
          audio: ArrayBuffer;
          clipId: string;
        }> = [];

        for (const job of completedJobs) {
          const audio = await getClip(env.R2, job.episodeId, job.durationTier);
          if (audio) {
            clipEntries.push({ job, audio, clipId: job.clipId! });
          } else {
            log.info("clip_audio_missing", {
              requestId,
              episodeId: job.episodeId,
              durationTier: job.durationTier,
            });
          }
        }

        // If no audio buffers retrieved, mark step and request FAILED
        if (clipEntries.length === 0) {
          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "FAILED",
              errorMessage: "No clip audio found in R2",
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          });

          await prisma.briefingRequest.update({
            where: { id: requestId },
            data: {
              status: "FAILED",
              errorMessage: "No clip audio found in R2 for completed jobs",
            },
          });

          log.info("assembly_no_audio", { requestId });
          msg.ack();
          continue;
        }

        // Concatenate clip audio
        const concatTimer = log.timer("mp3_concat");
        const clipBuffers = clipEntries.map((e) => e.audio);
        const finalAudio = concatMp3Buffers(clipBuffers);
        concatTimer();

        // Store assembled briefing in R2
        const today = new Date().toISOString().split("T")[0];
        const audioKey = await putBriefing(env.R2, request.userId, today, finalAudio);

        // Dual-write to WorkProduct registry
        const isPartialCheck = failedJobs.length > 0;
        const wpR2Key = wpKey({ type: "BRIEFING_AUDIO", userId: request.userId, date: today });
        await putWorkProduct(env.R2, wpR2Key, finalAudio);
        const wp = await prisma.workProduct.create({
          data: {
            type: "BRIEFING_AUDIO",
            userId: request.userId,
            r2Key: wpR2Key,
            sizeBytes: finalAudio.byteLength,
            metadata: {
              clipCount: clipEntries.length,
              partial: isPartialCheck,
            },
          },
        });

        // Link WorkProduct to PipelineStep
        await prisma.pipelineStep.update({
          where: { id: stepId },
          data: { workProductId: wp.id },
        });

        // Create Briefing record
        const briefing = await prisma.briefing.create({
          data: {
            userId: request.userId,
            status: "COMPLETED",
            targetMinutes: request.targetMinutes,
            audioKey,
          },
        });

        // Create BriefingSegment per assembled clip
        for (let i = 0; i < clipEntries.length; i++) {
          const entry = clipEntries[i];
          await prisma.briefingSegment.create({
            data: {
              briefingId: briefing.id,
              clipId: entry.clipId,
              orderIndex: i,
              transitionText: `Next, from ${entry.job.episode.title}...`,
            },
          });
        }

        // Mark BriefingRequest COMPLETED with briefingId link
        const isPartial = failedJobs.length > 0;
        await prisma.briefingRequest.update({
          where: { id: requestId },
          data: {
            status: "COMPLETED",
            briefingId: briefing.id,
            errorMessage: isPartial
              ? `Partial assembly: ${failedJobs.length} of ${jobs.length} jobs failed`
              : null,
          },
        });

        // Mark PipelineStep COMPLETED with metadata
        await prisma.pipelineStep.update({
          where: { id: stepId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            output: {
              audioKey,
              briefingId: briefing.id,
              clipCount: clipEntries.length,
              partial: isPartial,
            },
          },
        });

        log.info("assembly_complete", {
          requestId,
          briefingId: briefing.id,
          audioKey,
          clipCount: clipEntries.length,
          partial: isPartial,
        });

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("assembly_error", { requestId }, err);

        // Mark step FAILED if it was created
        if (stepId) {
          await prisma.pipelineStep
            .update({
              where: { id: stepId },
              data: {
                status: "FAILED",
                errorMessage,
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
              },
            })
            .catch(() => {});
        }

        // Mark request FAILED if not already terminal
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
