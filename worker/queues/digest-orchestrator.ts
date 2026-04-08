import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import {
  collectDigestEpisodes,
  determineEntryStage,
  incrementAndCheckAssembly,
} from "../lib/digest-helpers";
import type { DigestOrchestratorMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for digest orchestration.
 *
 * Per user: collects eligible episodes, creates a DigestDelivery record,
 * determines the optimal entry stage per episode, and dispatches to the
 * correct queue (reusing existing pipeline queues for unprocessed content,
 * or digest-specific queues for condensation/TTS).
 */
export async function handleDigestOrchestrator(
  batch: MessageBatch<DigestOrchestratorMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "digest-orchestrator", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    for (const msg of batch.messages) {
      const { userId, date } = msg.body;

      try {
        // Load user with plan
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { plan: { select: { dailyDigest: true } } },
        });

        if (!user) {
          log.info("user_not_found", { userId });
          msg.ack();
          continue;
        }

        if (!user.plan?.dailyDigest) {
          log.info("plan_no_digest", { userId, planId: user.planId });
          msg.ack();
          continue;
        }

        if (!user.digestEnabled) {
          log.info("digest_disabled", { userId });
          msg.ack();
          continue;
        }

        // Check for duplicate delivery — allow retry if previous one failed
        const existing = await prisma.digestDelivery.findUnique({
          where: { userId_date: { userId, date } },
        });
        if (existing) {
          if (existing.status === "FAILED") {
            // Delete the failed delivery so we can retry
            await prisma.digestDeliveryEpisode.deleteMany({ where: { deliveryId: existing.id } });
            await prisma.digestDelivery.delete({ where: { id: existing.id } });
            log.info("deleted_failed_delivery", { userId, date, deliveryId: existing.id });
          } else {
            log.info("delivery_exists", { userId, date, deliveryId: existing.id, status: existing.status });
            msg.ack();
            continue;
          }
        }

        // Collect eligible episodes
        const candidates = await collectDigestEpisodes(prisma, userId, {
          includeSubscriptions: user.digestIncludeSubscriptions,
          includeFavorites: user.digestIncludeFavorites,
          includeRecommended: user.digestIncludeRecommended,
        });

        if (candidates.length === 0) {
          log.info("no_episodes", { userId, date });
          msg.ack();
          continue;
        }

        // Create DigestDelivery
        const delivery = await prisma.digestDelivery.create({
          data: {
            userId,
            date,
            status: "PROCESSING",
            totalEpisodes: candidates.length,
            completedEpisodes: 0,
            episodeCount: candidates.length,
          },
        });

        // Create DigestDeliveryEpisode rows
        await prisma.digestDeliveryEpisode.createMany({
          data: candidates.map((c) => ({
            deliveryId: delivery.id,
            episodeId: c.episodeId,
            sourceType: c.sourceType,
            status: "PENDING",
          })),
        });

        log.info("delivery_created", {
          deliveryId: delivery.id,
          userId,
          date,
          episodeCount: candidates.length,
        });

        // Determine entry stage per episode and dispatch
        const voice = "default";
        let readyCount = 0;

        for (const candidate of candidates) {
          const stage = await determineEntryStage(prisma, candidate.episodeId, voice);

          // Update the DigestDeliveryEpisode with the entry stage
          await prisma.digestDeliveryEpisode.updateMany({
            where: { deliveryId: delivery.id, episodeId: candidate.episodeId },
            data: { entryStage: stage },
          });

          if (stage === "DIGEST_CLIP_DONE") {
            // Already fully processed
            await prisma.digestDeliveryEpisode.updateMany({
              where: { deliveryId: delivery.id, episodeId: candidate.episodeId },
              data: { status: "READY" },
            });
            readyCount++;
          } else if (stage === "DIGEST_CLIP") {
            await prisma.digestDeliveryEpisode.updateMany({
              where: { deliveryId: delivery.id, episodeId: candidate.episodeId },
              data: { status: "PROCESSING" },
            });
            await env.DIGEST_CLIP_QUEUE.send({
              episodeId: candidate.episodeId,
              deliveryId: delivery.id,
            });
          } else if (stage === "DIGEST_NARRATIVE") {
            await prisma.digestDeliveryEpisode.updateMany({
              where: { deliveryId: delivery.id, episodeId: candidate.episodeId },
              data: { status: "PROCESSING" },
            });
            await env.DIGEST_NARRATIVE_QUEUE.send({
              episodeId: candidate.episodeId,
              deliveryId: delivery.id,
            });
          } else if (stage === "NARRATIVE_GENERATION") {
            // Needs 10-min narrative first — create a PipelineJob so the
            // existing orchestrator processes it and checkDigestProgress bridges back
            await dispatchExistingPipeline(prisma, env, candidate.episodeId, "NARRATIVE_GENERATION", delivery.id);
          } else if (stage === "DISTILLATION") {
            await dispatchExistingPipeline(prisma, env, candidate.episodeId, "DISTILLATION", delivery.id);
          } else {
            // TRANSCRIPTION — start from scratch
            await dispatchExistingPipeline(prisma, env, candidate.episodeId, "TRANSCRIPTION", delivery.id);
          }
        }

        // If all episodes already done, update completedEpisodes and dispatch assembly
        if (readyCount === candidates.length) {
          await prisma.digestDelivery.update({
            where: { id: delivery.id },
            data: { completedEpisodes: readyCount },
          });
          await env.DIGEST_ASSEMBLY_QUEUE.send({ deliveryId: delivery.id });
          log.info("assembly_dispatched_all_cached", { deliveryId: delivery.id });
        } else if (readyCount > 0) {
          await prisma.digestDelivery.update({
            where: { id: delivery.id },
            data: { completedEpisodes: readyCount },
          });
        }

        log.info("dispatch_complete", {
          deliveryId: delivery.id,
          totalEpisodes: candidates.length,
          readyCount,
          dispatched: candidates.length - readyCount,
        });

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("orchestrator_error", { userId, date }, err);

        // Try to mark delivery as failed if it was created
        await prisma.digestDelivery
          .updateMany({
            where: { userId, date, status: "PROCESSING" },
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

/**
 * Creates a lightweight BriefingRequest + PipelineJob to reuse the existing
 * pipeline stages (transcription, distillation, narrative generation).
 * The existing orchestrator handles stage advancement, and checkDigestProgress
 * bridges back to digest-specific stages on completion.
 */
async function dispatchExistingPipeline(
  prisma: any,
  env: Env,
  episodeId: string,
  entryStage: string,
  deliveryId: string
): Promise<void> {
  // Check if there's already an active PipelineJob for this episode at a
  // stage that will produce what we need
  const existingJob = await prisma.pipelineJob.findFirst({
    where: {
      episodeId,
      status: { notIn: ["FAILED", "CANCELLED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, currentStage: true, status: true },
  });

  // If there's already a job processing this episode, don't create a duplicate.
  // The checkDigestProgress bridge will pick up the result when the existing
  // pipeline completes.
  if (existingJob && existingJob.status !== "COMPLETED" && existingJob.status !== "COMPLETED_DEGRADED") {
    return;
  }

  // Create a minimal BriefingRequest to drive the pipeline
  const request = await prisma.briefingRequest.create({
    data: {
      userId: "system", // system-initiated for digest
      status: "PROCESSING",
      targetMinutes: 10,
      items: [{ podcastId: "digest", episodeId, durationTier: 10, useLatest: false }],
      source: "digest",
    },
  });

  const job = await prisma.pipelineJob.create({
    data: {
      requestId: request.id,
      episodeId,
      durationTier: 10, // digest needs the 10-min narrative
      status: "PENDING",
      currentStage: entryStage,
    },
  });

  // Dispatch to the appropriate existing queue
  const STAGE_QUEUE_MAP: Record<string, string> = {
    TRANSCRIPTION: "TRANSCRIPTION_QUEUE",
    DISTILLATION: "DISTILLATION_QUEUE",
    NARRATIVE_GENERATION: "NARRATIVE_GENERATION_QUEUE",
  };

  const queueBinding = STAGE_QUEUE_MAP[entryStage] as keyof Env;
  const message: any = {
    jobId: job.id,
    episodeId,
    correlationId: request.id,
  };

  if (entryStage === "NARRATIVE_GENERATION") {
    message.durationTier = 10;
  }

  await (env[queueBinding] as Queue).send(message);
}
