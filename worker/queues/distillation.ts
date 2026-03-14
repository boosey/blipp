import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { extractClaims } from "../lib/distillation";
import { resolveStageModel } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import type { DistillationMessage } from "../lib/queue-messages";
import type { Env } from "../types";

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

  try {
    const log = await createPipelineLogger({ stage: "distillation", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if distillation stage is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, "DISTILLATION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const startedAt = new Date();

      let step: { id: string } | null = null;
      let requestId: string | undefined;

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
          select: { id: true, requestId: true },
        });
        requestId = job.requestId;

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

        await writeEvent(prisma, step.id, "INFO", "Checking cache for completed distillation");

        // Cache check: is there a completed distillation for this episode?
        const existing = await prisma.distillation.findUnique({
          where: { episodeId },
        });

        if (existing?.status === "COMPLETED") {
          await writeEvent(prisma, step.id, "INFO", "Cache hit — completed distillation found, skipping");
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
                metadata: {
                  claimCount: Array.isArray(existing.claimsJson) ? (existing.claimsJson as any[]).length : 0,
                  hasExcerpts: Array.isArray(existing.claimsJson) && (existing.claimsJson as any[]).length > 0 && "excerpt" in (existing.claimsJson as any[])[0],
                },
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
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Transcript must already be present (fetched by transcription stage)
        if (!existing?.transcript) {
          await writeEvent(prisma, step.id, "ERROR", "No transcript available — transcription stage must run first");
          throw new Error("No transcript available — run transcription first");
        }

        // Update status to EXTRACTING_CLAIMS
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
        });

        // Extract claims via LLM (Pass 1)
        const resolved = await resolveStageModel(prisma, "distillation");
        const llm = getLlmProviderImpl(resolved.provider);
        await writeEvent(prisma, step.id, "INFO", `Sending transcript to ${llm.name} (${resolved.providerModelId}) for claim extraction`);
        const elapsed = log.timer("claude_extraction");
        const { claims, usage: claimsUsage } = await extractClaims(llm, existing.transcript, resolved.providerModelId, 8192, env, resolved.pricing);
        recordSuccess(resolved.provider);
        elapsed();
        await writeEvent(prisma, step.id, "INFO", `Extracted ${claims.length} claims from transcript`);
        await writeEvent(prisma, step.id, "DEBUG", `Model: ${claimsUsage.model}`, { inputTokens: claimsUsage.inputTokens, outputTokens: claimsUsage.outputTokens, cost: claimsUsage.cost });
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
            metadata: {
              claimCount: claims.length,
              hasExcerpts: claims.length > 0 && "excerpt" in claims[0],
            },
          },
        });

        await writeEvent(prisma, step.id, "INFO", "Saved claims work product to R2", { r2Key, sizeBytes: new TextEncoder().encode(claimsJson).byteLength, claimCount: claims.length });

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
          correlationId,
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
            .catch((dbErr: unknown) => {
              console.error(JSON.stringify({
                level: "error",
                action: "error_path_db_write_failed",
                stage: "distillation",
                target: "pipelineStep",
                jobId,
                error: dbErr instanceof Error ? dbErr.message : String(dbErr),
                ts: new Date().toISOString(),
              }));
            });
        }

        // Upsert distillation as FAILED
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "distillation",
              target: "distillation",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        if (step) await writeEvent(prisma, step.id, "ERROR", `Distillation failed: ${errorMessage}`);

        log.error("episode_error", { episodeId, jobId }, err);

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
          recordFailure(err.provider);
          const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          writeAiError(prisma, {
            service: "distillation",
            provider: err.provider,
            model: err.model,
            operation: "complete",
            correlationId,
            jobId,
            episodeId,
            category,
            severity,
            httpStatus: err.httpStatus,
            errorMessage: err.message,
            rawResponse: err.rawResponse,
            requestDurationMs: err.requestDurationMs,
            timestamp: new Date(),
            retryCount: 0,
            maxRetries: 0,
            willRetry: false,
            rateLimitRemaining: err.rateLimitRemaining,
            rateLimitResetAt: err.rateLimitResetAt,
          }).catch(() => {}); // Fire-and-forget
        }

        // Notify orchestrator so job is marked FAILED and assembly can proceed
        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId,
            action: "job-failed",
            jobId,
            errorMessage,
            correlationId,
          }).catch((sendErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "orchestrator_send_failed",
              stage: "distillation",
              jobId,
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              ts: new Date().toISOString(),
            }));
          });
        }

        msg.ack();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
