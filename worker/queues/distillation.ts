import Anthropic from "@anthropic-ai/sdk";
import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { extractClaims } from "../lib/distillation";
import { getModelConfig } from "../lib/ai-models";
import { wpKey, putWorkProduct } from "../lib/work-products";
import type { Env } from "../types";

/** Shape of a distillation queue message body. */
interface DistillationMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}

/**
 * Queue consumer for distillation jobs.
 *
 * For each message: loads the job, checks for cached distillation,
 * runs Claude claim extraction if needed, and tracks progress via PipelineStep.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 */
export async function handleDistillation(
  batch: MessageBatch<DistillationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    const log = await createPipelineLogger({ stage: "distillation", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if stage 3 (distillation) is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, 3, log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId } = msg.body;
      const startedAt = new Date();

      let step: { id: string } | null = null;

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
          select: { id: true, requestId: true },
        });

        // Mark job as IN_PROGRESS
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "IN_PROGRESS" },
        });

        // Create PipelineStep for tracking
        step = await prisma.pipelineStep.create({
          data: {
            jobId,
            stage: "DISTILLATION",
            status: "IN_PROGRESS",
            startedAt,
          },
        });

        // Cache check: is there a completed distillation for this episode?
        const existing = await prisma.distillation.findUnique({
          where: { episodeId },
        });

        if (existing?.status === "COMPLETED") {
          // Cache hit — skip processing, backfill WorkProduct if needed
          let existingWp = await prisma.workProduct.findFirst({
            where: { type: "CLAIMS", episodeId },
          });

          if (!existingWp && existing.claimsJson) {
            const claimsStr = JSON.stringify(existing.claimsJson);
            const r2Key = wpKey({ type: "CLAIMS", episodeId });
            await putWorkProduct(env.R2, r2Key, claimsStr);
            existingWp = await prisma.workProduct.create({
              data: {
                type: "CLAIMS",
                episodeId,
                r2Key,
                sizeBytes: new TextEncoder().encode(claimsStr).byteLength,
                metadata: { claimCount: Array.isArray(existing.claimsJson) ? (existing.claimsJson as any[]).length : 0 },
              },
            });
          }

          const completedAt = new Date();
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt,
              durationMs: completedAt.getTime() - startedAt.getTime(),
              ...(existingWp ? { workProductId: existingWp.id } : {}),
            },
          });

          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { distillationId: existing.id },
          });

          log.debug("cache_hit", { episodeId, jobId });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
          });

          msg.ack();
          continue;
        }

        // Transcript must already be present (fetched by transcription stage)
        if (!existing?.transcript) {
          throw new Error("No transcript available — run transcription first");
        }

        // Update status to EXTRACTING_CLAIMS
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
        });

        // Extract claims via Claude (Pass 1)
        const { model: distillationModel } = await getModelConfig(prisma, "distillation");
        const elapsed = log.timer("claude_extraction");
        const { claims, usage: claimsUsage } = await extractClaims(anthropic, existing.transcript, distillationModel);
        elapsed();
        log.info("claims_extracted", { episodeId, claimCount: claims.length });

        // Mark distillation as completed with claims
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "COMPLETED", claimsJson: claims as any },
        });

        // Dual-write WorkProduct: store claims in R2 and register in DB
        const claimsJson = JSON.stringify(claims);
        const r2Key = wpKey({ type: "CLAIMS", episodeId });
        await putWorkProduct(env.R2, r2Key, claimsJson);
        const wp = await prisma.workProduct.create({
          data: {
            type: "CLAIMS",
            episodeId,
            r2Key,
            sizeBytes: new TextEncoder().encode(claimsJson).byteLength,
            metadata: { claimCount: claims.length },
          },
        });

        // Mark step COMPLETED
        const completedAt = new Date();
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            workProductId: wp.id,
            model: claimsUsage.model,
            inputTokens: claimsUsage.inputTokens,
            outputTokens: claimsUsage.outputTokens,
            cost: claimsUsage.cost,
          },
        });

        // Update job with distillation reference
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { distillationId: existing.id },
        });

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
        });
        log.debug("orchestrator_notified", { episodeId, jobId, requestId: job.requestId });

        msg.ack();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        // Mark step as FAILED if it was created
        if (step) {
          await prisma.pipelineStep
            .update({
              where: { id: step.id },
              data: {
                status: "FAILED",
                errorMessage,
                completedAt: new Date(),
                durationMs: new Date().getTime() - startedAt.getTime(),
              },
            })
            .catch(() => {});
        }

        // Upsert distillation as FAILED
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(() => {});

        log.error("episode_error", { episodeId, jobId }, err);
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
