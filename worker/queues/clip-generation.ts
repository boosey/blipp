import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { generateNarrative } from "../lib/distillation";
import { generateSpeech } from "../lib/tts";
import { putClip } from "../lib/clip-cache";
import { getModelConfig } from "../lib/ai-models";
import { wpKey, putWorkProduct } from "../lib/work-products";
import type { Env } from "../types";

/** Shape of a clip generation queue message body. */
interface ClipGenerationMessage {
  jobId: string;
  episodeId: string;
  durationTier: number;
  type?: "manual";
}

/**
 * Queue consumer for clip generation jobs.
 *
 * For each message: checks for a cached clip, otherwise generates a spoken
 * narrative from distillation claims (Pass 2), converts to audio via TTS,
 * stores the MP3 in R2, and updates the clip record. Creates PipelineStep
 * audit records and reports completion to the orchestrator.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 */
export async function handleClipGeneration(
  batch: MessageBatch<ClipGenerationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const log = await createPipelineLogger({ stage: "clip-generation", prisma });

  try {
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if stage 4 (clip generation) is enabled — manual messages bypass this
    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(
        prisma,
        "pipeline.stage.4.enabled",
        true
      );
      if (!stageEnabled) {
        log.info("stage_disabled", { stage: 4 });
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { jobId, episodeId, durationTier } = msg.body;
      const startTime = Date.now();

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
        });

        // Update job status to IN_PROGRESS
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "IN_PROGRESS" },
        });

        // Create PipelineStep audit record
        const step = await prisma.pipelineStep.create({
          data: {
            jobId,
            stage: "CLIP_GENERATION",
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });

        // Cache check: find existing completed clip for (episodeId, durationTier)
        const existingClip = await prisma.clip.findUnique({
          where: { episodeId_durationTier: { episodeId, durationTier } },
        });

        if (existingClip?.status === "COMPLETED") {
          log.debug("cache_hit", { episodeId, durationTier });

          // Backfill AUDIO_CLIP WorkProduct from cached clip if none exists
          let existingWp = await prisma.workProduct.findFirst({
            where: { type: "AUDIO_CLIP", episodeId, durationTier },
          });

          if (!existingWp && existingClip.audioKey) {
            // Read the cached audio from old key pattern to get size
            const cachedAudio = await env.R2.get(existingClip.audioKey);
            const audioR2Key = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: "default" });
            if (cachedAudio) {
              const audioBuffer = await cachedAudio.arrayBuffer();
              await putWorkProduct(env.R2, audioR2Key, audioBuffer);
              existingWp = await prisma.workProduct.create({
                data: {
                  type: "AUDIO_CLIP",
                  episodeId,
                  durationTier,
                  voice: "default",
                  r2Key: audioR2Key,
                  sizeBytes: audioBuffer.byteLength,
                },
              });
            }
          }

          // Also backfill NARRATIVE WorkProduct if missing
          const existingNarrativeWp = await prisma.workProduct.findFirst({
            where: { type: "NARRATIVE", episodeId, durationTier },
          });
          if (!existingNarrativeWp && existingClip.narrativeText) {
            const narrativeR2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier });
            await putWorkProduct(env.R2, narrativeR2Key, existingClip.narrativeText);
            await prisma.workProduct.create({
              data: {
                type: "NARRATIVE",
                episodeId,
                durationTier,
                r2Key: narrativeR2Key,
                sizeBytes: new TextEncoder().encode(existingClip.narrativeText).byteLength,
                metadata: { wordCount: existingClip.wordCount },
              },
            });
          }

          // Mark step SKIPPED (cached)
          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
              ...(existingWp ? { workProductId: existingWp.id } : {}),
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

        // Load distillation claims from DB
        const distillation = await prisma.distillation.findFirst({
          where: { episodeId, status: "COMPLETED" },
        });

        if (!distillation?.claimsJson) {
          throw new Error("No completed distillation with claims found");
        }

        const claims = distillation.claimsJson as any[];

        // Read model configs
        const { model: narrativeModel } = await getModelConfig(prisma, "narrative");
        const { model: ttsModel } = await getModelConfig(prisma, "tts");

        // Generate narrative from claims (Pass 2)
        const narrativeTimer = log.timer("narrative_generation");
        const narrative = await generateNarrative(
          anthropic,
          claims,
          durationTier,
          narrativeModel
        );
        const wordCount = narrative.split(/\s+/).length;
        narrativeTimer();
        log.info("narrative_generated", { episodeId, wordCount });

        // Generate TTS audio
        const ttsTimer = log.timer("tts_generation");
        const audio = await generateSpeech(openai, narrative, undefined, ttsModel);
        ttsTimer();

        // Store in R2
        await putClip(env.R2, episodeId, durationTier, audio);

        // Create/update Clip record
        const audioKey = `clips/${episodeId}/${durationTier}.mp3`;
        const clip = await prisma.clip.upsert({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          update: {
            status: "COMPLETED",
            narrativeText: narrative,
            wordCount,
            audioKey,
            distillationId: distillation.id,
          },
          create: {
            episodeId,
            distillationId: distillation.id,
            durationTier,
            status: "COMPLETED",
            narrativeText: narrative,
            wordCount,
            audioKey,
          },
        });

        // Dual-write work products
        const narrativeR2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier });
        await putWorkProduct(env.R2, narrativeR2Key, narrative);
        await prisma.workProduct.create({
          data: {
            type: "NARRATIVE",
            episodeId,
            durationTier,
            r2Key: narrativeR2Key,
            sizeBytes: new TextEncoder().encode(narrative).byteLength,
            metadata: { wordCount },
          },
        });

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

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            workProductId: audioWp.id,
          },
        });

        // Update job with clipId
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { clipId: clip.id },
        });

        log.info("clip_completed", { episodeId, durationTier, audioKey });

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
            where: { jobId, stage: "CLIP_GENERATION", status: "IN_PROGRESS" },
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

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
