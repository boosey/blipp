import Anthropic from "@anthropic-ai/sdk";
import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { generateNarrative, selectClaimsForDuration } from "../lib/distillation";
import { getModelConfig } from "../lib/ai-models";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import type { Env } from "../types";

/** Shape of a narrative generation queue message body. */
interface NarrativeGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}

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
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const log = await createPipelineLogger({ stage: "narrative-generation", prisma });

  try {
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if narrative generation stage is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, "NARRATIVE_GENERATION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId, durationTier } = msg.body;
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
        const { model: narrativeModel } = await getModelConfig(prisma, "narrative");

        // Generate narrative from claims (Pass 2)
        await writeEvent(prisma, step.id, "INFO", `Generating ${durationTier}-minute narrative from ${claims.length}/${allClaims.length} claims via ${narrativeModel}`);
        const narrativeTimer = log.timer("narrative_generation");
        const { narrative, usage: narrativeUsage } = await generateNarrative(
          anthropic,
          claims,
          durationTier,
          narrativeModel
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
          .catch(() => {});

        if (stepId) await writeEvent(prisma, stepId, "ERROR", `Narrative generation failed: ${errorMessage}`);

        // Notify orchestrator so job is marked FAILED and assembly can proceed
        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId,
            action: "job-failed",
            jobId,
            errorMessage,
          }).catch(() => {});
        }

        msg.ack();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
