import { writeEvent } from "./pipeline-events";
import { logDbError } from "./logger";
import type { PipelineLogger } from "./logger";

/**
 * Core briefing assembly logic — extracted so both the queue handler and
 * synchronous callers (e.g. share endpoint) can use it.
 *
 * For each PipelineJob in the request, resolves the completed clip,
 * upserts a per-user Briefing, and marks FeedItems READY.
 */
export async function assembleBriefings(
  prisma: any,
  requestId: string,
  log: PipelineLogger
): Promise<{ successCount: number; failureCount: number }> {
  const jobs = await prisma.pipelineJob.findMany({
    where: { requestId },
  });

  log.info("jobs_loaded", { requestId, total: jobs.length });

  let successCount = 0;
  let failureCount = 0;

  for (const job of jobs) {
    if (job.status === "FAILED") {
      failureCount++;
      continue;
    }

    const jobStartTime = Date.now();

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

      let clipId = job.clipId;
      if (!clipId) {
        const clip = await prisma.clip.findFirst({
          where: { episodeId: job.episodeId, durationTier: job.durationTier, voicePresetId: job.voicePresetId ?? null },
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

      // Check if any step in this job used AI fallbacks (retryCount > 0)
      const degradedStepCount = await prisma.pipelineStep.count({
        where: { jobId: job.id, retryCount: { gt: 0 } },
      });

      await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: degradedStepCount > 0 ? "COMPLETED_DEGRADED" : "COMPLETED",
          completedAt: new Date(),
        },
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
        .catch(logDbError("briefing-assembly", "pipelineStep", job.id));

      await prisma.pipelineJob
        .update({
          where: { id: job.id },
          data: { status: "FAILED", errorMessage, completedAt: new Date() },
        })
        .catch(logDbError("briefing-assembly", "pipelineJob", job.id));

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
    // Check if any completed jobs used AI fallbacks
    const degradedJobs = await prisma.pipelineJob.count({
      where: { requestId, status: "COMPLETED_DEGRADED" },
    });
    const hasDegradation = degradedJobs > 0;
    await prisma.briefingRequest.update({
      where: { id: requestId },
      data: {
        status: hasDegradation ? "COMPLETED_DEGRADED" : "COMPLETED",
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

  return { successCount, failureCount };
}
