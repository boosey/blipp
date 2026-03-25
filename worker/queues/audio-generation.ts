import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { generateSpeech } from "../lib/tts";
import { loadPresetConfig, extractProviderConfig } from "../lib/voice-presets";

import { resolveModelChain } from "../lib/model-resolution";
import { getTtsProviderImpl } from "../lib/tts-providers";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import { chunkNarrativeText, createSilenceFrame, concatenateAudioChunks } from "../lib/tts-chunking";
import { DEFAULT_TTS_MAX_INPUT_CHARS } from "../lib/constants";
import type { AudioGenerationMessage } from "../lib/queue-messages";
import type { Env } from "../types";

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
      const { jobId, episodeId, durationTier, voicePresetId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const startTime = Date.now();
      let requestId: string | undefined;

      let audioModel: string | undefined;
      let audioProvider: string | undefined;
      let narrativeLength: number | undefined;

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

        // Resolve voice preset config for TTS
        const voiceTag = voicePresetId ?? "default";
        const presetConfig = voicePresetId ? await loadPresetConfig(prisma, voicePresetId) : null;

        // Cache check: audio clip already exists in R2
        const cachedAudioR2Key = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: voiceTag });
        const existingAudio = await env.R2.head(cachedAudioR2Key);
        const existingClip = await prisma.clip.findFirst({
          where: { episodeId, durationTier, voicePresetId: voicePresetId ?? null },
        });

        if (existingAudio && existingClip?.status === "COMPLETED") {
          log.debug("cache_hit", { episodeId, durationTier });
          await writeEvent(prisma, step.id, "INFO", "Cache hit — audio clip exists in R2, skipping");

          // Ensure WorkProduct index row exists for UI
          await prisma.workProduct.upsert({
            where: { r2Key: cachedAudioR2Key },
            update: {},
            create: { type: "AUDIO_CLIP", episodeId, durationTier, voice: voiceTag, r2Key: cachedAudioR2Key, sizeBytes: existingAudio.size },
          });

          await prisma.pipelineStep.update({
            where: { id: step.id },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          });

          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { clipId: existingClip.id },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "AUDIO_GENERATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load narrative from R2 (written by narrative stage)
        const narrativeR2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier });
        const narrativeData = await getWorkProduct(env.R2, narrativeR2Key);
        if (!narrativeData) {
          await writeEvent(prisma, step.id, "ERROR", "No narrative in R2 — narrative stage must run first");
          throw new Error("No narrative found — narrative stage must run first");
        }
        const narrative = new TextDecoder().decode(narrativeData);
        narrativeLength = narrative.length;
        await writeEvent(prisma, step.id, "INFO", `Loaded narrative from R2 (${narrative.length} bytes)`);

        // Resolve model chain: primary -> secondary -> tertiary
        const modelChain = await resolveModelChain(prisma, "tts");
        if (modelChain.length === 0) {
          throw new Error("No TTS model configured — configure at least a primary in Admin > AI Models");
        }

        await writeEvent(prisma, step.id, "INFO", `Model chain: ${modelChain.map((m, i) => `${["primary", "secondary", "tertiary"][i]}=${m.provider}/${m.providerModelId}`).join(", ")}`, {
          chainLength: modelChain.length,
        });

        // Try each model in the chain until one succeeds
        let audio: ArrayBuffer | undefined;
        let ttsUsage: { model: string; inputTokens: number; outputTokens: number; cost: number | null } | undefined;
        let successAttemptIndex = 0;
        for (let i = 0; i < modelChain.length; i++) {
          const resolved = modelChain[i];
          const tier = ["primary", "secondary", "tertiary"][i];
          const tts = getTtsProviderImpl(resolved.provider);
          audioModel = resolved.providerModelId;
          audioProvider = resolved.provider;

          // Determine chunk size from model limits
          const maxInputChars = (resolved.limits?.maxInputChars as number) ?? DEFAULT_TTS_MAX_INPUT_CHARS;
          const textChunks = chunkNarrativeText(narrative, maxInputChars);

          await writeEvent(prisma, step.id, "INFO",
            textChunks.length > 1
              ? `Generating audio via ${tier} chunked: ${tts.name} (${resolved.providerModelId})`
              : `Generating audio via ${tier}: ${tts.name} (${resolved.providerModelId})`,
            {
              tier,
              narrativeChars: narrative.length,
              narrativeWords: narrative.split(/\s+/).length,
              model: resolved.providerModelId,
              provider: resolved.provider,
              ...(textChunks.length > 1 && { chunks: textChunks.length, maxInputChars }),
            });

          try {
            const ttsTimer = log.timer("tts_generation");
            const voiceConfig = extractProviderConfig(presetConfig, resolved.provider);

            if (textChunks.length <= 1) {
              // Single-shot: no chunking needed
              const result = await generateSpeech(
                tts, narrative, voiceConfig.voice, resolved.providerModelId, env,
                resolved.pricing, voiceConfig.instructions, voiceConfig.speed
              );
              audio = result.audio;
              ttsUsage = result.usage;
            } else {
              // Chunked TTS: generate each chunk, concatenate with silence
              const audioChunks: ArrayBuffer[] = [];
              let totalInputTokens = 0;
              let totalCost: number | null = 0;

              for (let c = 0; c < textChunks.length; c++) {
                await writeEvent(prisma, step.id, "DEBUG", `Generating chunk ${c + 1}/${textChunks.length} (${textChunks[c].length} chars)`, {
                  chunk: c + 1, totalChunks: textChunks.length, chunkChars: textChunks[c].length,
                });
                const result = await generateSpeech(
                  tts, textChunks[c], voiceConfig.voice, resolved.providerModelId, env,
                  resolved.pricing, voiceConfig.instructions, voiceConfig.speed
                );
                audioChunks.push(result.audio);
                totalInputTokens += result.usage.inputTokens;
                totalCost = totalCost !== null && result.usage.cost !== null
                  ? totalCost + result.usage.cost
                  : null;
                await writeEvent(prisma, step.id, "DEBUG", `Chunk ${c + 1}/${textChunks.length} complete`, {
                  chunk: c + 1, chunkChars: textChunks[c].length, chunkAudioBytes: result.audio.byteLength,
                });
              }

              const silence = createSilenceFrame();
              audio = concatenateAudioChunks(audioChunks, silence);
              ttsUsage = {
                model: resolved.providerModelId,
                inputTokens: totalInputTokens,
                outputTokens: 0,
                cost: totalCost,
              };
            }

            recordSuccess(resolved.provider);
            ttsTimer();

            await writeEvent(prisma, step.id, "INFO",
              textChunks.length > 1
                ? `Audio generated via ${tier} chunked ${tts.name} (${textChunks.length} chunks)`
                : `Audio generated via ${tier} ${tts.name}`,
              {
                tier,
                sizeBytes: audio.byteLength,
                attemptNumber: i + 1,
                ...(textChunks.length > 1 && { chunks: textChunks.length, maxInputChars }),
              });
            successAttemptIndex = i;
            break; // Success — stop trying
          } catch (chainErr) {
            const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
            const httpStatus = (chainErr as any)?.httpStatus;
            recordFailure(resolved.provider);

            await writeEvent(prisma, step.id, "WARN", `${tier} failed: ${tts.name} — ${errMsg.slice(0, 300)}`, {
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

        if (successAttemptIndex > 0) {
          await writeEvent(prisma, step.id, "WARN", `Voice degraded: fell back from ${modelChain[0].provider} to ${modelChain[successAttemptIndex].provider}`, {
            voiceDegraded: true,
            primaryProvider: modelChain[0].provider,
            actualProvider: modelChain[successAttemptIndex].provider,
          });
        }

        await writeEvent(prisma, step.id, "DEBUG", `Audio size: ${audio!.byteLength} bytes`, { model: ttsUsage!.model, sizeBytes: audio!.byteLength });

        // Write audio to R2 + index in DB
        const audioR2Key = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: voiceTag });
        await putWorkProduct(env.R2, audioR2Key, audio!);
        await prisma.workProduct.upsert({
          where: { r2Key: audioR2Key },
          update: { sizeBytes: audio!.byteLength },
          create: { type: "AUDIO_CLIP", episodeId, durationTier, voice: voiceTag, r2Key: audioR2Key, sizeBytes: audio!.byteLength },
        });
        await writeEvent(prisma, step.id, "INFO", "Saved audio clip to R2", { r2Key: audioR2Key });

        // Update Clip record: status COMPLETED, store audioKey
        const audioKey = wpKey({ type: "AUDIO_CLIP", episodeId, durationTier, voice: voiceTag });
        let existingClipForUpdate = await prisma.clip.findFirst({
          where: { episodeId, durationTier, voicePresetId: voicePresetId ?? null },
        });
        let finalClipId: string;
        if (existingClipForUpdate) {
          await prisma.clip.update({
            where: { id: existingClipForUpdate.id },
            data: { status: "COMPLETED", audioKey, voiceDegraded: successAttemptIndex > 0 },
          });
          finalClipId = existingClipForUpdate.id;
        } else {
          const distillation = await prisma.distillation.findFirst({
            where: { episodeId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          });
          if (!distillation) throw new Error("No distillation found for clip creation");
          const newClip = await prisma.clip.create({
            data: {
              episodeId,
              distillationId: distillation.id,
              durationTier,
              voicePresetId: voicePresetId ?? null,
              status: "COMPLETED",
              audioKey,
              voiceDegraded: successAttemptIndex > 0,
            },
          });
          finalClipId = newClip.id;
        }

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            model: ttsUsage!.model,
            inputTokens: ttsUsage!.inputTokens,
            outputTokens: ttsUsage!.outputTokens,
            cost: ttsUsage!.cost ?? null,
          },
        });

        // Update job with clipId
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { clipId: finalClipId },
        });

        log.info("audio_completed", { episodeId, durationTier, audioKey });

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
          completedStage: "AUDIO_GENERATION",
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
            where: { jobId, stage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
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
              stage: "tts",
              target: "pipelineStep",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        // Try to record the error on the clip
        const failedClip = await prisma.clip.findFirst({
          where: { episodeId, durationTier, voicePresetId: voicePresetId ?? null },
          select: { id: true },
        }).catch(() => null);
        await (failedClip
          ? prisma.clip.update({ where: { id: failedClip.id }, data: { status: "FAILED", errorMessage } })
          : prisma.clip.create({
              data: {
                episodeId,
                distillationId: "unknown",
                durationTier,
                voicePresetId: voicePresetId ?? null,
                status: "FAILED",
                errorMessage,
              },
            })
        )
          .catch((dbErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "error_path_db_write_failed",
              stage: "tts",
              target: "clip",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        // Write error event — step may not exist if creation itself failed
        try {
          const failedStep = await prisma.pipelineStep.findFirst({
            where: { jobId, stage: "AUDIO_GENERATION", status: "FAILED" },
            select: { id: true },
          });
          if (failedStep) {
            await writeEvent(prisma, failedStep.id, "ERROR", `Audio generation failed: ${errorMessage.slice(0, 2048)}`, {
              model: audioModel,
              provider: audioProvider,
              narrativeBytes: narrativeLength,
              httpStatus: (err as any)?.httpStatus || (err as any)?.status || (err as any)?.statusCode,
              errorType: err?.constructor?.name,
            });
          }
        } catch {
          // Swallow — event logging must never block error handling
        }

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
          recordFailure(err.provider);
          const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          writeAiError(prisma, {
            service: "tts",
            provider: err.provider,
            model: err.model,
            operation: "synthesize",
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
              stage: "tts",
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
