import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { extractClaims } from "../lib/distillation";
import { resolveStageModel } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
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
      let distillProvider: string | undefined;
      let distillModel: string | undefined;

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

        // Cache check: claims WorkProduct already exists in R2
        const claimsR2Key = wpKey({ type: "CLAIMS", episodeId });
        const existingClaims = await env.R2.head(claimsR2Key);
        if (existingClaims) {
          await writeEvent(prisma, step.id, "INFO", "Cache hit — claims exist in R2, skipping");
          log.debug("cache_hit", { episodeId, jobId });

          // Ensure WorkProduct index row exists for UI
          await prisma.workProduct.upsert({
            where: { r2Key: claimsR2Key },
            update: {},
            create: { type: "CLAIMS", episodeId, r2Key: claimsR2Key, sizeBytes: existingClaims.size },
          });

          const existing = await prisma.distillation.findUnique({ where: { episodeId } });
          if (existing) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { distillationId: existing.id },
            });
          }

          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
            },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "DISTILLATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load transcript from R2 (written by transcription stage)
        const transcriptR2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        const transcriptData = await getWorkProduct(env.R2, transcriptR2Key);
        if (!transcriptData) {
          await writeEvent(prisma, step.id, "ERROR", "No transcript in R2 — transcription stage must run first");
          throw new Error("No transcript available — run transcription first");
        }
        const transcript = new TextDecoder().decode(transcriptData);
        await writeEvent(prisma, step.id, "INFO", `Loaded transcript from R2 (${transcript.length} bytes)`, {
          transcriptBytes: transcript.length,
        });

        // Ensure Distillation record exists, update status
        const existing = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "EXTRACTING_CLAIMS", errorMessage: null },
          create: { episodeId, status: "EXTRACTING_CLAIMS" },
        });

        // Extract claims via LLM (Pass 1)
        const resolved = await resolveStageModel(prisma, "distillation");
        const llm = getLlmProviderImpl(resolved.provider);
        distillProvider = resolved.provider;
        distillModel = resolved.providerModelId;
        await writeEvent(prisma, step.id, "INFO", `Sending transcript to ${llm.name} (${resolved.providerModelId}) for claim extraction`, {
          transcriptBytes: transcript.length,
          model: resolved.providerModelId,
          provider: resolved.provider,
        });
        const elapsed = log.timer("claude_extraction");
        const { claims, usage: claimsUsage } = await extractClaims(llm, transcript, resolved.providerModelId, 8192, env, resolved.pricing);
        recordSuccess(resolved.provider);
        elapsed();
        await writeEvent(prisma, step.id, "INFO", `Extracted ${claims.length} claims from transcript`);
        await writeEvent(prisma, step.id, "DEBUG", `Model: ${claimsUsage.model}`, { inputTokens: claimsUsage.inputTokens, outputTokens: claimsUsage.outputTokens, cost: claimsUsage.cost });
        log.info("claims_extracted", { episodeId, claimCount: claims.length });

        // Mark distillation as completed (claims content lives in R2 only)
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "COMPLETED" },
        });

        // Write claims to R2 + index in DB
        const claimsStr = JSON.stringify(claims);
        const r2Key = wpKey({ type: "CLAIMS", episodeId });
        await putWorkProduct(env.R2, r2Key, claimsStr);
        const sizeBytes = new TextEncoder().encode(claimsStr).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key },
          update: { sizeBytes, metadata: { claimCount: claims.length } },
          create: { type: "CLAIMS", episodeId, r2Key, sizeBytes, metadata: { claimCount: claims.length } },
        });
        await writeEvent(prisma, step.id, "INFO", "Saved claims to R2", { r2Key, claimCount: claims.length });

        // Mark step COMPLETED
        const completedAt = new Date();
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
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
          completedStage: "DISTILLATION",
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

        if (step) await writeEvent(prisma, step.id, "ERROR", `Distillation failed: ${errorMessage.slice(0, 2048)}`, {
          model: distillModel,
          provider: distillProvider,
          httpStatus: (err as any)?.httpStatus || (err as any)?.status || (err as any)?.statusCode,
          errorType: err?.constructor?.name,
        });

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
