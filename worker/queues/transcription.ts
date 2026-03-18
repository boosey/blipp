import { createPrismaClient } from "../lib/db";
import { resolveStageModel } from "../lib/model-resolution";
import { checkStageEnabled } from "../lib/queue-helpers";
import { createPipelineLogger } from "../lib/logger";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { getTranscriptSource } from "../lib/transcript-sources";
import { getProviderImpl } from "../lib/stt-providers";
import { getConfig } from "../lib/config";
import { calculateAudioCost, type AiUsage } from "../lib/ai-usage";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import type { TranscriptionMessage } from "../lib/queue-messages";
import type { Env } from "../types";

const CACHE_STATUSES = new Set(["TRANSCRIPT_READY", "EXTRACTING_CLAIMS", "COMPLETED"]);

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
  "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/ogg": "ogg",
  "audio/wav": "wav", "audio/webm": "webm", "audio/flac": "flac",
  "audio/x-flac": "flac", "audio/mpga": "mpga", "audio/oga": "oga",
};

function extFromContentType(contentType: string | null, url: string): string {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (ext) return ext;
  }
  // Fallback: extract from URL path
  const match = url.match(/\.(\w{2,5})(?:[?#]|$)/);
  if (match) {
    const urlExt = match[1].toLowerCase();
    if (["mp3", "m4a", "mp4", "ogg", "oga", "wav", "webm", "flac", "mpeg", "mpga"].includes(urlExt)) return urlExt;
  }
  return "mp3"; // last resort default
}

export async function handleTranscription(
  batch: MessageBatch<TranscriptionMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "transcription", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    if (!(await checkStageEnabled(prisma, batch, "TRANSCRIPTION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const startTime = Date.now();

      let stepId: string | null = null;
      let requestId: string | undefined;
      let sttProvider: string | undefined;
      let sttModel: string | undefined;
      let audioSizeBytes: number | undefined;
      let audioContentType: string | undefined;
      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
        if (!job) {
          log.info("job_not_found", { jobId });
          msg.ack();
          continue;
        }
        requestId = job.requestId;

        // Update job status to IN_PROGRESS if PENDING
        if (job.status === "PENDING") {
          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { status: "IN_PROGRESS" },
          });
        }

        // Create PipelineStep
        const step = await prisma.pipelineStep.create({
          data: {
            jobId,
            stage: "TRANSCRIPTION",
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
        stepId = step.id;

        await writeEvent(prisma, step.id, "INFO", "Checking cache for existing transcript");

        // Cache check: transcript WorkProduct already exists in R2
        const transcriptR2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        const existingTranscript = await env.R2.head(transcriptR2Key);
        if (existingTranscript) {
          log.debug("cache_hit", { episodeId });
          await writeEvent(prisma, step.id, "INFO", "Cache hit — transcript exists in R2, skipping");

          // Ensure WorkProduct index row exists for UI
          await prisma.workProduct.upsert({
            where: { r2Key: transcriptR2Key },
            update: {},
            create: { type: "TRANSCRIPT", episodeId, r2Key: transcriptR2Key, sizeBytes: existingTranscript.size },
          });

          // Ensure Distillation record exists for downstream stages
          const distillation = await prisma.distillation.upsert({
            where: { episodeId },
            update: { status: "TRANSCRIPT_READY", errorMessage: null },
            create: { episodeId, status: "TRANSCRIPT_READY" },
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
            data: { distillationId: distillation.id },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "TRANSCRIPTION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load episode + podcast for transcript sources
        const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
        if (!episode) {
          throw new Error(`Episode not found: ${episodeId}`);
        }
        const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
        await writeEvent(prisma, step.id, "DEBUG", `Episode loaded: "${episode.title}"`, {
          audioUrl: episode.audioUrl?.slice(0, 200),
          audioDuration: episode.durationSeconds,
          podcastTitle: podcast?.title,
        });

        let transcript: string | null = null;
        let sttUsage: AiUsage | null = null;

        // Tier 1 & 2: Try configured transcript sources (RSS feed, Podcast Index, etc.)
        const sourceOrder = await getConfig(prisma, "transcript.sources", ["rss-feed", "podcast-index"]) as string[];
        const lookupCtx = {
          episodeGuid: episode.guid,
          episodeTitle: episode.title,
          podcastTitle: podcast?.title ?? "",
          podcastIndexId: podcast?.podcastIndexId ?? null,
          feedUrl: podcast?.feedUrl ?? "",
          transcriptUrl: episode.transcriptUrl ?? null,
        };

        for (const sourceId of sourceOrder) {
          const source = getTranscriptSource(sourceId);
          if (!source) continue;

          transcript = await source.lookup(lookupCtx, env);
          if (transcript) {
            await writeEvent(prisma, step.id, "INFO", `Transcript found via ${source.name}`, { source: sourceId, bytes: transcript.length });
            log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: sourceId });
            break;
          }
        }

        if (!transcript) {
          // Tier 3: STT via configured provider (unchanged)
          await writeEvent(prisma, step.id, "WARN", "No transcript in RSS or Podcast Index — falling back to STT");
          const resolved = await resolveStageModel(prisma, "stt");
          const providerImpl = getProviderImpl(resolved.provider);
          const providerModelId = resolved.providerModelId;
          sttProvider = resolved.provider;
          sttModel = providerModelId;

          // Fetch audio
          const audioResponse = await fetch(episode.audioUrl);
          if (!audioResponse.ok) {
            throw new Error(`Audio fetch failed: HTTP ${audioResponse.status} for ${episode.audioUrl.slice(0, 120)}`);
          }
          const finalContentType = audioResponse.headers.get("content-type")?.split(";")[0].trim() || null;
          if (finalContentType && !finalContentType.startsWith("audio/") && finalContentType !== "application/octet-stream") {
            throw new Error(`Audio URL returned non-audio content (${finalContentType}, ${audioResponse.status}). The episode audio may be unavailable.`);
          }
          const audioBuffer = await audioResponse.arrayBuffer();
          audioContentType = audioResponse.headers.get("content-type") || undefined;
          audioSizeBytes = audioBuffer.byteLength;
          if (audioBuffer.byteLength < 10_000) {
            throw new Error(`Audio file too small (${audioBuffer.byteLength} bytes) — likely an error page, not audio`);
          }

          const maxFileSize = (resolved.limits?.maxFileSizeBytes as number) ?? null;
          const willChunk = maxFileSize != null && audioBuffer.byteLength > maxFileSize;
          await writeEvent(prisma, step.id, "INFO", `Transcribing via ${providerImpl.name} (model: ${providerModelId})`, {
            audioSizeBytes,
            audioContentType,
            audioContentLength: audioResponse.headers.get("content-length"),
            provider: resolved.provider,
            model: providerModelId,
            maxFileSizeBytes: maxFileSize,
            willChunk,
            estimatedChunks: willChunk && maxFileSize ? Math.ceil(audioBuffer.byteLength / maxFileSize) : 1,
          });

          // Store source audio for debugging (idempotent — preserve first-seen)
          const sourceAudioKey = wpKey({ type: "SOURCE_AUDIO", episodeId });
          const existingSource = await env.R2.head(sourceAudioKey);
          if (!existingSource) {
            await putWorkProduct(env.R2, sourceAudioKey, audioBuffer, {
              contentType: audioResponse.headers.get("content-type") || "audio/mpeg",
            });
            await prisma.workProduct.upsert({
              where: { r2Key: sourceAudioKey },
              create: {
                episodeId,
                type: "SOURCE_AUDIO",
                r2Key: sourceAudioKey,
                sizeBytes: audioBuffer.byteLength,
                metadata: {
                  contentType: audioResponse.headers.get("content-type"),
                  contentLength: audioResponse.headers.get("content-length"),
                  sourceUrl: episode.audioUrl?.slice(0, 200),
                },
              },
              update: {},
            });
            await writeEvent(prisma, step.id, "INFO", "Source audio stored to R2", {
              r2Key: sourceAudioKey,
              sizeBytes: audioBuffer.byteLength,
              contentType: audioResponse.headers.get("content-type"),
            });
          }

          const ext = extFromContentType(finalContentType, episode.audioUrl);
          const durationSeconds = episode.durationSeconds ?? Math.round(audioBuffer.byteLength / (128 * 1000 / 8));

          const sttResult = await providerImpl.transcribe(
            { buffer: audioBuffer, filename: `audio.${ext}`, sourceUrl: episode.audioUrl },
            durationSeconds,
            env,
            providerModelId
          );

          transcript = sttResult.transcript;
          recordSuccess(resolved.provider);
          const estimatedSeconds = audioBuffer.byteLength / (128 * 1000 / 8);
          const sttInputTokens = Math.round(audioBuffer.byteLength / 16000);
          sttUsage = { model: resolved.model, inputTokens: sttInputTokens, outputTokens: 0, cost: calculateAudioCost(resolved.pricing, estimatedSeconds) };
          await writeEvent(prisma, step.id, "INFO", `Transcript generated via ${providerImpl.name}`, { bytes: transcript.length, source: resolved.provider });
          log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: resolved.provider });
        }

        // Write transcript to R2 + index in DB
        const r2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        await putWorkProduct(env.R2, r2Key, transcript);
        const sizeBytes = new TextEncoder().encode(transcript).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key },
          update: { sizeBytes },
          create: { type: "TRANSCRIPT", episodeId, r2Key, sizeBytes },
        });
        await writeEvent(prisma, step.id, "INFO", "Saved transcript to R2", { r2Key, sizeBytes });

        // Upsert Distillation status (transcript content lives in R2 only)
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "TRANSCRIPT_READY", errorMessage: null },
          create: { episodeId, status: "TRANSCRIPT_READY" },
        });

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            ...(sttUsage ? { model: sttUsage.model, inputTokens: sttUsage.inputTokens, outputTokens: sttUsage.outputTokens, cost: sttUsage.cost } : {}),
          },
        });

        // Update job distillationId
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { distillationId: distillation.id },
        });

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
          completedStage: "TRANSCRIPTION",
          correlationId,
        });

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Mark step FAILED if it was created
        await prisma.pipelineStep
          .updateMany({
            where: { jobId, stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
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
              stage: "transcription",
              target: "pipelineStep",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        // Write error event if step exists
        if (stepId) {
          await writeEvent(prisma, stepId, "ERROR", `Transcription failed: ${errorMessage.slice(0, 2048)}`, {
            provider: sttProvider,
            model: sttModel,
            audioSizeBytes,
            audioContentType,
            httpStatus: (err as any)?.status || (err as any)?.statusCode,
            errorType: err?.constructor?.name,
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
              stage: "transcription",
              target: "distillation",
              jobId,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              ts: new Date().toISOString(),
            }));
          });

        log.error("episode_error", { episodeId, jobId }, err);

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
          recordFailure(err.provider);
          const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          writeAiError(prisma, {
            service: "stt",
            provider: err.provider,
            model: err.model,
            operation: "transcribe",
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
              stage: "transcription",
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
