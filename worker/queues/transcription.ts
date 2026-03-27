import { createPrismaClient } from "../lib/db";
import { resolveModelChain } from "../lib/model-resolution";
import { checkStageEnabled } from "../lib/queue-helpers";
import { createPipelineLogger, logDbError } from "../lib/logger";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { getTranscriptSource } from "../lib/transcript/sources";
import { getProviderImpl } from "../lib/stt/providers";
import { getConfig } from "../lib/config";
import { calculateAudioCost, type AiUsage } from "../lib/ai-usage";
import { safeFetch } from "../lib/url-validation";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import { probeAudio, transcribeChunked } from "../lib/stt/audio-probe";
import { DEFAULT_STT_CHUNK_SIZE, MIN_AUDIO_SIZE_BYTES, ASSUMED_BITRATE_BYTES_PER_SEC, STT_BYTES_PER_TOKEN } from "../lib/constants";
import type { TranscriptionMessage } from "../lib/queue-messages";
import type { Env } from "../types";

const CACHE_STATUSES = new Set(["TRANSCRIPT_READY", "EXTRACTING_CLAIMS", "COMPLETED"]);

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
      let modelChainAttempts = 0;
      let modelChainLength = 0;
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
          // Tier 3: STT via configured model chain (primary → secondary → tertiary)
          await writeEvent(prisma, step.id, "WARN", "No transcript in RSS or Podcast Index — falling back to STT");

          // Phase 1: Probe audio metadata (HEAD + 12 bytes — no full download)
          const probe = await probeAudio(episode.audioUrl, episode.durationSeconds);

          if (probe.contentType && !probe.contentType.startsWith("audio/") && probe.contentType !== "application/octet-stream") {
            throw new Error(`Audio URL returned non-audio content (${probe.contentType}). The episode audio may be unavailable.`);
          }
          if (probe.contentLength != null && probe.contentLength < MIN_AUDIO_SIZE_BYTES) {
            throw new Error(`Audio file too small (${probe.contentLength} bytes) — likely an error page, not audio`);
          }

          audioSizeBytes = probe.contentLength ?? undefined;
          audioContentType = probe.contentType ?? undefined;
          const durationSeconds = probe.durationEstimateSeconds;
          const ext = probe.ext;

          const formatMismatch = probe.contentType && probe.detectedFormat.format !== "unknown"
            && !probe.contentType.includes(probe.detectedFormat.format);

          await writeEvent(prisma, step.id, "INFO", "Audio file analysis", {
            sizeBytes: probe.contentLength,
            claimedContentType: probe.contentType,
            detectedFormat: probe.detectedFormat.format,
            formatDetails: probe.detectedFormat.details,
            formatMismatch: formatMismatch || false,
            durationEstimateSeconds: probe.durationEstimateSeconds,
            episodeDurationSeconds: episode.durationSeconds,
            supportsRangeRequests: probe.supportsRangeRequests,
            sourceUrl: episode.audioUrl?.slice(0, 200),
          });

          // Phase 2: Resolve model chain
          const modelChain = await resolveModelChain(prisma, "stt");
          if (modelChain.length === 0) {
            throw new Error("No STT model configured — configure at least a primary in Admin > AI Models");
          }

          await writeEvent(prisma, step.id, "INFO", `STT model chain: ${modelChain.map((m, i) => `${["primary", "secondary", "tertiary"][i]}=${m.provider}/${m.providerModelId}`).join(", ")}`, {
            chainLength: modelChain.length,
          });

          // Phase 3: Try each model — URL-direct → chunked fallback → next model
          const sttErrors: { provider: string; model: string; error: string; httpStatus?: number }[] = [];
          modelChainLength = modelChain.length;
          for (let i = 0; i < modelChain.length; i++) {
            modelChainAttempts = i + 1;
            const resolved = modelChain[i];
            const tier = ["primary", "secondary", "tertiary"][i];
            const providerImpl = getProviderImpl(resolved.provider);
            const providerModelId = resolved.providerModelId;
            sttProvider = resolved.provider;
            sttModel = providerModelId;

            const maxFileSize = (resolved.limits?.maxFileSizeBytes as number) ?? DEFAULT_STT_CHUNK_SIZE;

            // Step A: Try URL-direct if provider supports it
            if (providerImpl.supportsUrl) {
              await writeEvent(prisma, step.id, "INFO", `Attempting ${tier} URL-direct: ${providerImpl.name} (${providerModelId})`, {
                tier, provider: resolved.provider, model: providerModelId,
              });

              try {
                const sttResult = await providerImpl.transcribe(
                  { url: episode.audioUrl },
                  durationSeconds, env, providerModelId,
                );

                transcript = sttResult.transcript;
                recordSuccess(resolved.provider);
                const estimatedSeconds = probe.contentLength ? probe.contentLength / ASSUMED_BITRATE_BYTES_PER_SEC : durationSeconds;
                const sttInputTokens = probe.contentLength ? Math.round(probe.contentLength / STT_BYTES_PER_TOKEN) : 0;
                sttUsage = { model: resolved.model, inputTokens: sttInputTokens, outputTokens: 0, cost: calculateAudioCost(resolved.pricing, estimatedSeconds), audioSeconds: estimatedSeconds };

                await writeEvent(prisma, step.id, "INFO", `Transcript generated via ${tier} URL-direct ${providerImpl.name}`, {
                  tier, bytes: transcript.length, source: resolved.provider,
                  attemptNumber: i + 1, previousFailures: sttErrors.length,
                });
                log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: resolved.provider, tier, method: "url-direct" });
                break; // Success
              } catch (urlErr) {
                const errMsg = urlErr instanceof Error ? urlErr.message : String(urlErr);
                await writeEvent(prisma, step.id, "WARN", `${tier} URL-direct failed: ${providerImpl.name} — ${errMsg.slice(0, 300)}`, {
                  tier, provider: resolved.provider, model: providerModelId,
                  httpStatus: (urlErr as any)?.httpStatus,
                  errorType: urlErr?.constructor?.name,
                });
                // Fall through to chunked fallback below
              }
            }

            // Step B: Chunked byte-range fallback
            if (probe.contentLength != null && probe.supportsRangeRequests) {
              const estimatedChunks = Math.ceil(probe.contentLength / maxFileSize);
              await writeEvent(prisma, step.id, "INFO", `Attempting ${tier} chunked: ${providerImpl.name} (${providerModelId})`, {
                tier, provider: resolved.provider, model: providerModelId,
                chunkSize: maxFileSize, estimatedChunks, audioSizeBytes: probe.contentLength,
              });

              try {
                const sttResult = await transcribeChunked(
                  episode.audioUrl, probe.contentLength, maxFileSize, ext,
                  providerImpl, durationSeconds, env, providerModelId,
                );

                transcript = sttResult.transcript;
                recordSuccess(resolved.provider);
                const estimatedSeconds = probe.contentLength / ASSUMED_BITRATE_BYTES_PER_SEC;
                const sttInputTokens = Math.round(probe.contentLength / STT_BYTES_PER_TOKEN);
                sttUsage = { model: resolved.model, inputTokens: sttInputTokens, outputTokens: 0, cost: calculateAudioCost(resolved.pricing, estimatedSeconds), audioSeconds: estimatedSeconds };

                await writeEvent(prisma, step.id, "INFO", `Transcript generated via ${tier} chunked ${providerImpl.name}`, {
                  tier, bytes: transcript.length, source: resolved.provider,
                  chunks: estimatedChunks, attemptNumber: i + 1, previousFailures: sttErrors.length,
                });
                log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: resolved.provider, tier, method: "chunked" });
                break; // Success
              } catch (chunkErr) {
                const errMsg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
                const httpStatus = (chunkErr as any)?.httpStatus;
                recordFailure(resolved.provider);
                sttErrors.push({ provider: resolved.provider, model: providerModelId, error: errMsg.slice(0, 500), httpStatus });

                await writeEvent(prisma, step.id, "WARN", `${tier} chunked failed: ${providerImpl.name} — ${errMsg.slice(0, 300)}`, {
                  tier, provider: resolved.provider, model: providerModelId,
                  httpStatus, errorType: chunkErr?.constructor?.name,
                  willRetryNext: i < modelChain.length - 1,
                });

                if (i === modelChain.length - 1) throw chunkErr;
              }
            } else if (probe.contentLength != null && probe.contentLength <= maxFileSize) {
              // No range support but file is small enough for a single download
              await writeEvent(prisma, step.id, "INFO", `Attempting ${tier} single-download: ${providerImpl.name} (${providerModelId})`, {
                tier, provider: resolved.provider, model: providerModelId, audioSizeBytes: probe.contentLength,
              });

              try {
                const resp = await safeFetch(episode.audioUrl);
                if (!resp.ok) throw new Error(`Audio fetch failed: HTTP ${resp.status}`);
                const buffer = await resp.arrayBuffer();

                const sttResult = await providerImpl.transcribe(
                  { buffer, filename: `audio.${ext}`, sourceUrl: episode.audioUrl },
                  durationSeconds, env, providerModelId,
                );

                transcript = sttResult.transcript;
                recordSuccess(resolved.provider);
                const estimatedSeconds = buffer.byteLength / ASSUMED_BITRATE_BYTES_PER_SEC;
                const sttInputTokens = Math.round(buffer.byteLength / STT_BYTES_PER_TOKEN);
                sttUsage = { model: resolved.model, inputTokens: sttInputTokens, outputTokens: 0, cost: calculateAudioCost(resolved.pricing, estimatedSeconds), audioSeconds: estimatedSeconds };

                await writeEvent(prisma, step.id, "INFO", `Transcript generated via ${tier} ${providerImpl.name}`, {
                  tier, bytes: transcript.length, source: resolved.provider,
                  attemptNumber: i + 1, previousFailures: sttErrors.length,
                });
                log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: resolved.provider, tier, method: "single-download" });
                break; // Success
              } catch (dlErr) {
                const errMsg = dlErr instanceof Error ? dlErr.message : String(dlErr);
                const httpStatus = (dlErr as any)?.httpStatus;
                recordFailure(resolved.provider);
                sttErrors.push({ provider: resolved.provider, model: providerModelId, error: errMsg.slice(0, 500), httpStatus });

                await writeEvent(prisma, step.id, "WARN", `${tier} single-download failed: ${providerImpl.name} — ${errMsg.slice(0, 300)}`, {
                  tier, provider: resolved.provider, model: providerModelId,
                  httpStatus, errorType: dlErr?.constructor?.name,
                  willRetryNext: i < modelChain.length - 1,
                });

                if (i === modelChain.length - 1) throw dlErr;
              }
            } else {
              // No range support and file too large (or unknown size) — skip buffer-only providers
              const reason = probe.contentLength == null
                ? "unknown file size and no range support"
                : `file too large (${probe.contentLength} bytes) for single download and no range support`;
              await writeEvent(prisma, step.id, "WARN", `${tier} skipped: ${providerImpl.name} — ${reason}`, {
                tier, provider: resolved.provider, model: providerModelId,
                contentLength: probe.contentLength, maxFileSize, supportsRangeRequests: false,
                willRetryNext: i < modelChain.length - 1,
              });
              sttErrors.push({ provider: resolved.provider, model: providerModelId, error: reason });

              if (i === modelChain.length - 1) {
                throw new Error(`All STT models exhausted. Last: ${reason}`);
              }
            }
          }
        }

        // Write transcript to R2 + index in DB
        const r2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        await putWorkProduct(env.R2, r2Key, transcript!);
        const sizeBytes = new TextEncoder().encode(transcript!).byteLength;
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
            ...(sttUsage ? { model: sttUsage.model, inputTokens: sttUsage.inputTokens, outputTokens: sttUsage.outputTokens, cost: sttUsage.cost, audioSeconds: sttUsage.audioSeconds } : {}),
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
          .catch(logDbError("transcription", "pipelineStep", jobId));

        // Write error event if step exists
        if (stepId) {
          await writeEvent(prisma, stepId, "ERROR", `Transcription failed: ${errorMessage.slice(0, 2048)}`, {
            provider: sttProvider,
            model: sttModel,
            audioSizeBytes,
            audioContentType,
            httpStatus: (err as any)?.httpStatus || (err as any)?.status || (err as any)?.statusCode,
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
          .catch(logDbError("transcription", "distillation", jobId));

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
              stage: "transcription",
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
