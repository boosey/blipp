import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { generateSpeech } from "../lib/tts";
import { putClip } from "../lib/clip-cache";
import { getModelConfig } from "../lib/ai-models";
import { getModelPricing } from "../lib/ai-usage";
import { getTtsProviderImpl } from "../lib/tts-providers";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import type { Env } from "../types";

/** Shape of an audio generation queue message body. */
interface AudioGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}

/**
 * Queue consumer for audio generation jobs.
 *
 * For each message: checks for a cached audio clip, otherwise loads the
 * narrative text from the Clip record (set by narrative stage), converts to
 * MP3 via TTS, stores in R2, and updates the Clip record to COMPLETED.
 * Creates PipelineStep audit records and reports completion to the orchestrator.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 */
export async function handleAudioGeneration(
  batch: MessageBatch<AudioGenerationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const log = await createPipelineLogger({ stage: "audio-generation", prisma });

  try {
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if audio generation stage is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, "AUDIO_GENERATION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId, durationTier } = msg.body;
      const startTime = Date.now();
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
            stage: "AUDIO_GENERATION",
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });

        await writeEvent(prisma, step.id, "INFO", "Checking cache for completed audio clip");

        // Cache check: if Clip already COMPLETED and AUDIO_CLIP WorkProduct exists, mark SKIPPED
        const existingClip = await prisma.clip.findUnique({
          where: { episodeId_durationTier: { episodeId, durationTier } },
        });

        if (existingClip?.status === "COMPLETED") {
          const existingAudioWp = await prisma.workProduct.findFirst({
            where: { type: "AUDIO_CLIP", episodeId, durationTier },
          });

          if (existingAudioWp) {
            log.debug("cache_hit", { episodeId, durationTier });
            await writeEvent(prisma, step.id, "INFO", "Cache hit — completed audio clip exists, skipping");

            // Mark step SKIPPED (cached)
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: {
                status: "SKIPPED",
                cached: true,
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
                workProductId: existingAudioWp.id,
              },
            });

            // Update job with cached clipId
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { clipId: existingClip.id },
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
        }

        // Load narrative text from Clip record (set by narrative stage)
        if (!existingClip?.narrativeText) {
          await writeEvent(prisma, step.id, "ERROR", "No clip with narrative text found — narrative stage must run first");
          throw new Error("No clip with narrative text found — narrative stage must run first");
        }

        const narrative = existingClip.narrativeText;

        // Read model config
        const { provider: ttsProviderName, model: ttsModel } = await getModelConfig(prisma, "tts");
        const ttsPricing = await getModelPricing(prisma, ttsModel, ttsProviderName);
        const dbTtsProvider = await prisma.aiModelProvider.findFirst({
          where: { provider: ttsProviderName, model: { modelId: ttsModel } },
        });
        const ttsProviderModelId = dbTtsProvider?.providerModelId ?? ttsModel;
        const tts = getTtsProviderImpl(ttsProviderName);

        // Generate TTS audio
        await writeEvent(prisma, step.id, "INFO", `Generating audio via ${tts.name} (${ttsProviderModelId})`);
        const ttsTimer = log.timer("tts_generation");
        const { audio, usage: ttsUsage } = await generateSpeech(tts, narrative, undefined, ttsProviderModelId, env, ttsPricing);
        ttsTimer();
        await writeEvent(prisma, step.id, "INFO", "Audio generated successfully");
        await writeEvent(prisma, step.id, "DEBUG", `Audio size: ${audio.byteLength} bytes`, { model: ttsUsage.model, sizeBytes: audio.byteLength });

        // Store in R2 (legacy path)
        await putClip(env.R2, episodeId, durationTier, audio);

        // Store AUDIO_CLIP WorkProduct in R2
        const audioR2Key = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: "default" });
        await putWorkProduct(env.R2, audioR2Key, audio);
        const audioWp = await prisma.workProduct.create({
          data: {
            type: "AUDIO_CLIP",
            episodeId,
            durationTier,
            voice: "default",
            r2Key: audioR2Key,
            sizeBytes: audio.byteLength,
          },
        });

        await writeEvent(prisma, step.id, "INFO", "Saved audio clip to R2 and updated clip record", { r2Key: audioR2Key });

        // Update Clip record: status COMPLETED, store audioKey
        const audioKey = `clips/${episodeId}/${durationTier}.mp3`;
        const clip = await prisma.clip.update({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          data: {
            status: "COMPLETED",
            audioKey,
          },
        });

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            workProductId: audioWp.id,
            model: ttsUsage.model,
            inputTokens: ttsUsage.inputTokens,
            outputTokens: ttsUsage.outputTokens,
            cost: ttsUsage.cost ?? null,
          },
        });

        // Update job with clipId
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { clipId: clip.id },
        });

        log.info("audio_completed", { episodeId, durationTier, audioKey });

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
            where: { jobId, stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
            data: {
              status: "FAILED",
              errorMessage,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          })
          .catch(() => {});

        // Try to record the error on the clip
        await prisma.clip
          .upsert({
            where: {
              episodeId_durationTier: { episodeId, durationTier },
            },
            update: { status: "FAILED", errorMessage },
            create: {
              episodeId,
              distillationId: "unknown",
              durationTier,
              status: "FAILED",
              errorMessage,
            },
          })
          .catch(() => {});

        // Write error event — step may not exist if creation itself failed
        try {
          const failedStep = await prisma.pipelineStep.findFirst({
            where: { jobId, stage: "AUDIO_GENERATION", status: "FAILED" },
            select: { id: true },
          });
          if (failedStep) {
            await writeEvent(prisma, failedStep.id, "ERROR", `Audio generation failed: ${errorMessage}`);
          }
        } catch {
          // Swallow — event logging must never block error handling
        }

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
