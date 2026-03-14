import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { generateNarrative, selectClaimsForDuration, type EpisodeMetadata } from "../lib/distillation";
import { resolveStageModel } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import type { NarrativeGenerationMessage } from "../lib/queue-messages";
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

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        requestId = job.requestId;

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

        // Cache check: if NARRATIVE WorkProduct already exists for (episodeId, durationTier), mark SKIPPED
        const existingNarrativeWp = await prisma.workProduct.findFirst({
          where: { type: "NARRATIVE", episodeId, durationTier },
        });

        if (existingNarrativeWp) {
          await writeEvent(prisma, step.id, "INFO", "Cache hit — narrative work product exists, skipping");
          log.debug("cache_hit", { episodeId, durationTier });

          // Mark step SKIPPED (cached)
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
              workProductId: existingNarrativeWp.id,
            },
          });

          // Report to orchestrator
          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load distillation claims from DB
        const distillation = await prisma.distillation.findFirst({
          where: { episodeId, status: "COMPLETED" },
        });

        if (!distillation?.claimsJson) {
          await writeEvent(prisma, step.id, "ERROR", "No completed distillation with claims found");
          throw new Error("No completed distillation with claims found");
        }

        const allClaims = distillation.claimsJson as any[];

        // Select claims for this duration tier (filters by importance/novelty composite score)
        const hasExcerpts = allClaims.length > 0 && "excerpt" in allClaims[0];
        const claims = hasExcerpts
          ? selectClaimsForDuration(allClaims, durationTier)
          : allClaims;

        // Read model config
        const resolved = await resolveStageModel(prisma, "narrative");
        const llm = getLlmProviderImpl(resolved.provider);

        // Load episode metadata for narrative intro
        const episode = await prisma.episode.findUnique({
          where: { id: episodeId },
          select: {
            title: true,
            publishedAt: true,
            durationSeconds: true,
            podcast: { select: { title: true } },
          },
        });

        const episodeMetadata: EpisodeMetadata | undefined = episode
          ? {
              podcastTitle: episode.podcast.title,
              episodeTitle: episode.title,
              publishedAt: episode.publishedAt,
              durationSeconds: episode.durationSeconds,
              briefingMinutes: durationTier,
            }
          : undefined;

        // Generate narrative from claims (Pass 2)
        await writeEvent(prisma, step.id, "INFO", `Generating ${durationTier}-minute narrative from ${claims.length}/${allClaims.length} claims via ${llm.name} (${resolved.providerModelId})`);
        const narrativeTimer = log.timer("narrative_generation");
        const { narrative, usage: narrativeUsage } = await generateNarrative(
          llm,
          claims,
          durationTier,
          resolved.providerModelId,
          8192,
          env,
          resolved.pricing,
          episodeMetadata
        );
        const wordCount = narrative.split(/\s+/).length;
        narrativeTimer();
        await writeEvent(prisma, step.id, "INFO", `Narrative generated: ${wordCount} words`);
        await writeEvent(prisma, step.id, "DEBUG", `Model: ${narrativeUsage.model}`, { inputTokens: narrativeUsage.inputTokens, outputTokens: narrativeUsage.outputTokens, cost: narrativeUsage.cost });
        log.info("narrative_generated", { episodeId, wordCount });

        // Store narrative WorkProduct in R2
        const narrativeR2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier });
        await putWorkProduct(env.R2, narrativeR2Key, narrative);
        const narrativeWp = await prisma.workProduct.create({
          data: {
            type: "NARRATIVE",
            episodeId,
            durationTier,
            r2Key: narrativeR2Key,
            sizeBytes: new TextEncoder().encode(narrative).byteLength,
            metadata: { wordCount },
          },
        });

        await writeEvent(prisma, step.id, "INFO", "Saved narrative work product to R2", { r2Key: narrativeR2Key, wordCount });

        // Upsert Clip record with narrative text (status stays partial — audio gen completes it)
        await prisma.clip.upsert({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          update: {
            narrativeText: narrative,
            wordCount,
            distillationId: distillation.id,
          },
          create: {
            episodeId,
            distillationId: distillation.id,
            durationTier,
            status: "PENDING",
            narrativeText: narrative,
            wordCount,
          },
        });

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            workProductId: narrativeWp.id,
            model: narrativeUsage.model,
            inputTokens: narrativeUsage.inputTokens,
            outputTokens: narrativeUsage.outputTokens,
            cost: narrativeUsage.cost ?? null,
          },
        });

        log.info("narrative_completed", { episodeId, durationTier, wordCount });

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
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
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "narrative",
              target: "pipelineStep",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        if (stepId) await writeEvent(prisma, stepId, "ERROR", `Narrative generation failed: ${errorMessage}`);

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
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
              stage: "narrative",
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
