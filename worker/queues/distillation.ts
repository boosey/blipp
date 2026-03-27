import { createPrismaClient } from "../lib/db";
import { createPipelineLogger, logDbError } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { extractClaims } from "../lib/distillation";
import { resolveModelChain } from "../lib/model-resolution";
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
      let modelChainAttempts = 0;
      let modelChainLength = 0;

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
        const stepId = step!.id;

        await writeEvent(prisma, stepId, "INFO", "Checking cache for completed distillation");

        // Cache check: claims WorkProduct already exists in R2
        const claimsR2Key = wpKey({ type: "CLAIMS", episodeId });
        const existingClaims = await env.R2.head(claimsR2Key);
        if (existingClaims) {
          await writeEvent(prisma, stepId, "INFO", "Cache hit — claims exist in R2, skipping");
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
            where: { id: stepId },
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
          await writeEvent(prisma, stepId, "ERROR", "No transcript in R2 — transcription stage must run first");
          throw new Error("No transcript available — run transcription first");
        }
        const transcript = new TextDecoder().decode(transcriptData);
        await writeEvent(prisma, stepId, "INFO", `Loaded transcript from R2 (${transcript.length} bytes)`, {
          transcriptBytes: transcript.length,
        });

        // Ensure Distillation record exists, update status
        const existing = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "EXTRACTING_CLAIMS", errorMessage: null },
          create: { episodeId, status: "EXTRACTING_CLAIMS" },
        });

        // Resolve model chain: primary -> secondary -> tertiary
        const modelChain = await resolveModelChain(prisma, "distillation");
        if (modelChain.length === 0) {
          throw new Error("No distillation model configured — configure at least a primary in Admin > AI Models");
        }

        await writeEvent(prisma, stepId, "INFO", `Model chain: ${modelChain.map((m, i) => `${["primary", "secondary", "tertiary"][i]}=${m.provider}/${m.providerModelId}`).join(", ")}`, {
          chainLength: modelChain.length,
        });

        // Try each model in the chain until one succeeds
        let claims: any[] | undefined;
        let claimsUsage: { model: string; inputTokens: number; outputTokens: number; cost: number | null; cacheCreationTokens?: number; cacheReadTokens?: number } | undefined;
        modelChainLength = modelChain.length;
        for (let i = 0; i < modelChain.length; i++) {
          modelChainAttempts = i + 1;
          const resolved = modelChain[i];
          const tier = ["primary", "secondary", "tertiary"][i];
          const llm = getLlmProviderImpl(resolved.provider);
          distillProvider = resolved.provider;
          distillModel = resolved.providerModelId;

          await writeEvent(prisma, stepId, "INFO", `Sending transcript to ${tier}: ${llm.name} (${resolved.providerModelId}) for claim extraction`, {
            tier,
            transcriptBytes: transcript.length,
            model: resolved.providerModelId,
            provider: resolved.provider,
          });

          try {
            const elapsed = log.timer("claude_extraction");
            const result = await extractClaims(prisma, llm, transcript, resolved.providerModelId, 8192, env, resolved.pricing);
            recordSuccess(resolved.provider);
            elapsed();
            claims = result.claims;
            claimsUsage = result.usage;

            await writeEvent(prisma, stepId, "INFO", `Extracted ${claims.length} claims via ${tier} ${llm.name}`, {
              tier,
              claimCount: claims.length,
              attemptNumber: i + 1,
            });
            log.info("claims_extracted", { episodeId, claimCount: claims.length, tier });
            break; // Success — stop trying
          } catch (chainErr) {
            const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
            const httpStatus = (chainErr as any)?.httpStatus;
            recordFailure(resolved.provider);

            await writeEvent(prisma, stepId, "WARN", `${tier} failed: ${llm.name} — ${errMsg.slice(0, 300)}`, {
              tier,
              provider: resolved.provider,
              model: resolved.providerModelId,
              httpStatus,
              errorType: chainErr?.constructor?.name,
              willRetryNext: i < modelChain.length - 1,
            });

            if (i === modelChain.length - 1) {
              // All models exhausted — throw the last error
              throw chainErr;
            }
            // Otherwise continue to next model
          }
        }

        await writeEvent(prisma, stepId, "DEBUG", `Model: ${claimsUsage!.model}`, {
          inputTokens: claimsUsage!.inputTokens,
          outputTokens: claimsUsage!.outputTokens,
          cost: claimsUsage!.cost,
          ...(claimsUsage!.cacheCreationTokens ? { cacheCreationTokens: claimsUsage!.cacheCreationTokens } : {}),
          ...(claimsUsage!.cacheReadTokens ? { cacheReadTokens: claimsUsage!.cacheReadTokens } : {}),
        });

        // Mark distillation as completed (claims content lives in R2 only)
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "COMPLETED" },
        });

        // Write claims to R2 + index in DB
        const claimsStr = JSON.stringify(claims!);
        const r2Key = wpKey({ type: "CLAIMS", episodeId });
        await putWorkProduct(env.R2, r2Key, claimsStr);
        const sizeBytes = new TextEncoder().encode(claimsStr).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key },
          update: { sizeBytes, metadata: { claimCount: claims!.length } },
          create: { type: "CLAIMS", episodeId, r2Key, sizeBytes, metadata: { claimCount: claims!.length } },
        });
        await writeEvent(prisma, stepId, "INFO", "Saved claims to R2", { r2Key, claimCount: claims!.length });

        // Mark step COMPLETED
        const completedAt = new Date();
        await prisma.pipelineStep.update({
          where: { id: stepId },
          data: {
            status: "COMPLETED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            model: claimsUsage!.model,
            inputTokens: claimsUsage!.inputTokens,
            outputTokens: claimsUsage!.outputTokens,
            cost: claimsUsage!.cost,
            cacheCreationTokens: claimsUsage!.cacheCreationTokens ?? null,
            cacheReadTokens: claimsUsage!.cacheReadTokens ?? null,
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
            .catch(logDbError("distillation", "pipelineStep", jobId));
        }

        // Upsert distillation as FAILED
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(logDbError("distillation", "distillation", jobId));

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
            retryCount: modelChainAttempts - 1,
            maxRetries: modelChainLength - 1,
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

        // Retry transient AI errors (rate limits, timeouts, server errors);
        // ack permanent errors (auth, model not found, content filter)
        if (err instanceof AiProviderError) {
          const { severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          if (severity === "transient") {
            msg.retry();
            continue;
          }
        }
        msg.ack();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
