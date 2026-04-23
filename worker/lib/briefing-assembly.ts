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
  const request = await prisma.briefingRequest.findUnique({
    where: { id: requestId },
    select: { mode: true },
  });

  const jobs = await prisma.pipelineJob.findMany({
    where: { requestId },
  });

  log.info("jobs_loaded", { requestId, mode: request?.mode, total: jobs.length });

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

      // CATALOG mode: create a CatalogBriefing record instead of user-scoped Briefing + FeedItem
      if (request.mode === "CATALOG") {
        const episode = await prisma.episode.findUnique({
          where: { id: job.episodeId },
          select: { podcastId: true },
        });

        if (!episode) {
          throw new Error(`Episode ${job.episodeId} not found`);
        }

        await prisma.catalogBriefing.upsert({
          where: { episodeId_durationTier: { episodeId: job.episodeId, durationTier: job.durationTier } },
          create: {
            episodeId: job.episodeId,
            podcastId: episode.podcastId,
            durationTier: job.durationTier,
            clipId: clipId!,
            requestId,
          },
          update: {
            clipId: clipId!,
            requestId,
            stale: false,
          },
        });

        await writeEvent(prisma, step.id, "INFO", "CatalogBriefing upserted", {
          episodeId: job.episodeId,
          durationTier: job.durationTier,
        });
      } else {
        // USER mode: create per-user Briefing + mark FeedItems READY
        const feedItems = await prisma.feedItem.findMany({
          where: { requestId, episodeId: job.episodeId, durationTier: job.durationTier },
          select: { id: true, userId: true },
        });

        if (feedItems.length === 0) {
          // Completed job with no matching FeedItem means the FeedItem is orphaned
          // — it will sit in PROCESSING until the stale-job-reaper marks it FAILED.
          // Historically caused by a tier-downgrade/FeedItem desync (fixed in
          // orchestrator syncFeedItemTierForCap); keep this as a tripwire.
          const orphans = await prisma.feedItem.findMany({
            where: { requestId, episodeId: job.episodeId },
            select: { id: true, durationTier: true, status: true },
          });
          await writeEvent(prisma, step.id, "ERROR", "No FeedItems matched completed job — possible tier desync", {
            jobId: job.id,
            episodeId: job.episodeId,
            jobDurationTier: job.durationTier,
            orphanFeedItems: orphans,
          });
          log.error("feed_item_lookup_empty", {
            requestId, jobId: job.id, episodeId: job.episodeId, jobDurationTier: job.durationTier, orphans,
          });
        } else {
          await writeEvent(prisma, step.id, "INFO", `Assembling ${feedItems.length} feed item(s)`);
        }

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
    // Only update FeedItems for USER mode (CATALOG/SEO_BACKFILL have none)
    if (request?.mode !== "CATALOG" && request?.mode !== "SEO_BACKFILL") {
      await prisma.feedItem.updateMany({
        where: { requestId },
        data: { status: "FAILED", errorMessage: "No completed clips available" },
      });
    }

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
