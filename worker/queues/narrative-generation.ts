import { createPrismaClient } from "../lib/db";
import { createPipelineLogger, logDbError } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { generateNarrative, selectClaimsForDuration, type EpisodeMetadata } from "../lib/distillation";
import { clampTierToEpisodeLength } from "../lib/constants";
import { resolveModelChain } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import { recordSuccess, recordFailure, initCircuitBreakerConfig } from "../lib/circuit-breaker";
import type { NarrativeGenerationMessage } from "../lib/queue-messages";
import { resolveEnvForPipeline } from "../lib/service-key-resolver";
import type { Env } from "../types";

/**
 * Queue consumer for narrative generation jobs.
 *
 * For each message: checks for a cached narrative, otherwise generates a spoken
 * narrative from distillation claims (Pass 2) via Claude. Creates a WorkProduct
 * (NARRATIVE) in R2 + DB, upserts a Clip record, and reports completion to the
 * orchestrator.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 */
export async function handleNarrativeGeneration(
  batch: MessageBatch<NarrativeGenerationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const log = await createPipelineLogger({ stage: "narrative-generation", prisma });
  await initCircuitBreakerConfig(prisma);

  try {
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if narrative generation stage is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, "NARRATIVE_GENERATION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId, durationTier } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const startTime = Date.now();
      let stepId: string | undefined;
      let requestId: string | undefined;

      let narrativeModel: string | undefined;
      let narrativeProvider: string | undefined;
      let modelChainAttempts = 0;
      let modelChainLength = 0;
      let claimCount: number | undefined;

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        requestId = job.requestId;

        // Cancellation guard: skip if parent request was cancelled
        const request = await prisma.briefingRequest.findUnique({
          where: { id: job.requestId },
          select: { status: true },
        });
        if (!request || request.status === "CANCELLED") {
          log.info("request_cancelled_skipping", { jobId, requestId: job.requestId });
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "CANCELLED" },
          });
          msg.ack();
          continue;
        }

        // Update job status to IN_PROGRESS
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "IN_PROGRESS" },
        });

        // Create PipelineStep audit record
        const step = await prisma.pipelineStep.create({
          data: {
            jobId,
            stage: "NARRATIVE_GENERATION",
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
        stepId = step.id;

        await writeEvent(prisma, step.id, "INFO", "Checking cache for existing narrative");

        // Cache check: narrative already exists in R2
        const narrativeCacheKey = wpKey({ type: "NARRATIVE", episodeId, durationTier });
        const existingNarrative = await env.R2.head(narrativeCacheKey);

        if (existingNarrative) {
          await writeEvent(prisma, step.id, "INFO", "Cache hit — narrative exists in R2, skipping");
          log.debug("cache_hit", { episodeId, durationTier });

          // Ensure WorkProduct index row exists for UI
          await prisma.workProduct.upsert({
            where: { r2Key: narrativeCacheKey },
            update: {},
            create: { type: "NARRATIVE", episodeId, durationTier, r2Key: narrativeCacheKey, sizeBytes: existingNarrative.size },
          });

          // Mark step SKIPPED (cached)
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          });

          // Report to orchestrator
          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "NARRATIVE_GENERATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load claims from R2 (written by distillation stage)
        const claimsR2Key = wpKey({ type: "CLAIMS", episodeId });
        const claimsData = await getWorkProduct(env.R2, claimsR2Key);
        if (!claimsData) {
          await writeEvent(prisma, step.id, "ERROR", "No claims in R2 — distillation stage must run first");
          throw new Error("No completed distillation with claims found");
        }
        const allClaims = JSON.parse(new TextDecoder().decode(claimsData)) as any[];
        await writeEvent(prisma, step.id, "INFO", `Loaded ${allClaims.length} claims from R2`);

        // Load episode metadata (needed for clamp + narrative intro)
        const episode = await prisma.episode.findUnique({
          where: { id: episodeId },
          select: {
            title: true,
            publishedAt: true,
            durationSeconds: true,
            podcast: { select: { title: true } },
          },
        });

        // Clamp requested tier so the narrative can't exceed ~75% of episode length.
        const effectiveTier = clampTierToEpisodeLength(durationTier, episode?.durationSeconds);
        if (effectiveTier !== durationTier) {
          await writeEvent(
            prisma,
            step.id,
            "INFO",
            `Clamping tier: requested ${durationTier}min → ${effectiveTier}min (episode is ${episode?.durationSeconds}s)`,
            { requestedTier: durationTier, effectiveTier, episodeDurationSeconds: episode?.durationSeconds }
          );
        }

        // Select claims for the effective duration tier
        const hasExcerpts = allClaims.length > 0 && "excerpt" in allClaims[0];
        const claims = hasExcerpts
          ? selectClaimsForDuration(allClaims, effectiveTier)
          : allClaims;

        // Resolve model chain: primary -> secondary -> tertiary
        const modelChain = await resolveModelChain(prisma, "narrative");
        if (modelChain.length === 0) {
          throw new Error("No narrative model configured — configure at least a primary in Admin > AI Models");
        }

        await writeEvent(prisma, step.id, "INFO", `Model chain: ${modelChain.map((m, i) => `${["primary", "secondary", "tertiary"][i]}=${m.provider}/${m.providerModelId}`).join(", ")}`, {
          chainLength: modelChain.length,
        });

        const episodeMetadata: EpisodeMetadata | undefined = episode
          ? {
              podcastTitle: episode.podcast.title,
              episodeTitle: episode.title,
              publishedAt: episode.publishedAt,
              durationSeconds: episode.durationSeconds,
              briefingMinutes: effectiveTier,
            }
          : undefined;

        // Try each model in the chain until one succeeds
        claimCount = claims.length;
        let narrative: string | undefined;
        let narrativeUsage: { model: string; inputTokens: number; outputTokens: number; cost: number | null; cacheCreationTokens?: number; cacheReadTokens?: number } | undefined;
        modelChainLength = modelChain.length;
        for (let i = 0; i < modelChain.length; i++) {
          modelChainAttempts = i + 1;
          const resolved = modelChain[i];
          const tier = ["primary", "secondary", "tertiary"][i];
          const llm = getLlmProviderImpl(resolved.provider);
          narrativeModel = resolved.providerModelId;
          narrativeProvider = resolved.provider;

          // Resolve DB-stored API key for this provider+context
          const resolvedEnv = await resolveEnvForPipeline(prisma, env, "pipeline.narrative", resolved.provider);

          await writeEvent(prisma, step.id, "INFO", `Generating ${effectiveTier}-minute narrative from ${claims.length}/${allClaims.length} claims via ${tier}: ${llm.name} (${resolved.providerModelId})`, {
            tier,
            claimCount: claims.length,
            totalClaims: allClaims.length,
            durationTier,
            effectiveTier,
            model: resolved.providerModelId,
            provider: resolved.provider,
          });

          try {
            const narrativeTimer = log.timer("narrative_generation");
            const result = await generateNarrative(
              prisma,
              llm,
              claims,
              effectiveTier,
              resolved.providerModelId,
              8192,
              resolvedEnv,
              resolved.pricing,
              episodeMetadata
            );
            recordSuccess(resolved.provider);
            narrative = result.narrative;
            narrativeUsage = result.usage;
            const wordCount = narrative.split(/\s+/).length;
            narrativeTimer();

            await writeEvent(prisma, step.id, "INFO", `Narrative generated via ${tier} ${llm.name}: ${wordCount} words`, {
              tier,
              wordCount,
              attemptNumber: i + 1,
            });
            log.info("narrative_generated", { episodeId, wordCount, tier });
            break; // Success — stop trying
          } catch (chainErr) {
            const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
            const httpStatus = (chainErr as any)?.httpStatus;
            recordFailure(resolved.provider);

            await writeEvent(prisma, step.id, "WARN", `${tier} failed: ${llm.name} — ${errMsg.slice(0, 300)}`, {
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

        const wordCount = narrative!.split(/\s+/).length;
        await writeEvent(prisma, step.id, "DEBUG", `Model: ${narrativeUsage!.model}`, {
          inputTokens: narrativeUsage!.inputTokens,
          outputTokens: narrativeUsage!.outputTokens,
          cost: narrativeUsage!.cost,
          ...(narrativeUsage!.cacheCreationTokens ? { cacheCreationTokens: narrativeUsage!.cacheCreationTokens } : {}),
          ...(narrativeUsage!.cacheReadTokens ? { cacheReadTokens: narrativeUsage!.cacheReadTokens } : {}),
        });

        // Write narrative to R2 + index in DB
        const narrativeR2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier });
        await putWorkProduct(env.R2, narrativeR2Key, narrative!);
        const sizeBytes = new TextEncoder().encode(narrative!).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key: narrativeR2Key },
          update: { sizeBytes, metadata: { wordCount } },
          create: { type: "NARRATIVE", episodeId, durationTier, r2Key: narrativeR2Key, sizeBytes, metadata: { wordCount } },
        });
        await writeEvent(prisma, step.id, "INFO", "Saved narrative to R2", { r2Key: narrativeR2Key, wordCount });

        // Upsert Clip record — also persist narrativeText for public Blipp pages
        const distillation = await prisma.distillation.findUnique({ where: { episodeId } });
        const voicePresetId = job.voicePresetId ?? null;
        const existingClip = await prisma.clip.findFirst({
          where: { episodeId, durationTier, voicePresetId },
        });
        if (existingClip) {
          await prisma.clip.update({
            where: { id: existingClip.id },
            data: {
              wordCount,
              narrativeText: narrative!,
              ...(distillation ? { distillationId: distillation.id } : {}),
            },
          });
        } else {
          await prisma.clip.create({
            data: {
              episodeId,
              distillationId: distillation?.id ?? "unknown",
              durationTier,
              voicePresetId,
              status: "PENDING",
              wordCount,
              narrativeText: narrative!,
            },
          });
        }

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            model: narrativeUsage!.model,
            inputTokens: narrativeUsage!.inputTokens,
            outputTokens: narrativeUsage!.outputTokens,
            cost: narrativeUsage!.cost ?? null,
            cacheCreationTokens: narrativeUsage!.cacheCreationTokens ?? null,
            cacheReadTokens: narrativeUsage!.cacheReadTokens ?? null,
          },
        });

        log.info("narrative_completed", { episodeId, durationTier, wordCount });

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
          completedStage: "NARRATIVE_GENERATION",
          correlationId,
        });

        msg.ack();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        log.error("episode_error", { episodeId, durationTier }, err);

        // Try to mark the step as FAILED
        await prisma.pipelineStep
          .updateMany({
            where: { jobId, stage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
            data: {
              status: "FAILED",
              errorMessage,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          })
          .catch(logDbError("narrative", "pipelineStep", jobId));

        if (stepId) await writeEvent(prisma, stepId, "ERROR", `Narrative generation failed: ${errorMessage.slice(0, 2048)}`, {
          model: narrativeModel,
          provider: narrativeProvider,
          durationTier,
          claimCount,
          httpStatus: (err as any)?.httpStatus || (err as any)?.status || (err as any)?.statusCode,
          errorType: err?.constructor?.name,
        });

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
          recordFailure(err.provider);
          const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          writeAiError(prisma, {
            service: "narrative",
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
              stage: "narrative",
              jobId,
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              ts: new Date().toISOString(),
            }));
          });
        }

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
