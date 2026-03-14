import { createPrismaClient } from "../lib/db";
import { resolveStageModel } from "../lib/model-resolution";
import { checkStageEnabled } from "../lib/queue-helpers";
import { createPipelineLogger } from "../lib/logger";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { PodcastIndexClient } from "../lib/podcast-index";
import { lookupPodcastIndexTranscript } from "../lib/transcript-source";
import { fetchTranscript } from "../lib/transcript";
import { getProviderImpl } from "../lib/stt-providers";
import { calculateAudioCost, type AiUsage } from "../lib/ai-usage";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError } from "../lib/ai-errors";
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

        // Cache check: existing Distillation with transcript
        const cached = await prisma.distillation.findUnique({ where: { episodeId } });
        if (cached && cached.transcript && CACHE_STATUSES.has(cached.status)) {
          log.debug("cache_hit", { episodeId, existingStatus: cached.status });
          await writeEvent(prisma, step.id, "INFO", "Cache hit — existing transcript found, skipping");
          await writeEvent(prisma, step.id, "DEBUG", `Existing distillation status: ${cached.status}`, { distillationId: cached.id });

          let existingWp = await prisma.workProduct.findFirst({
            where: { type: "TRANSCRIPT", episodeId },
          });

          // Backfill: create WorkProduct from cached inline data if none exists
          if (!existingWp && cached.transcript) {
            const r2Key = wpKey({ type: "TRANSCRIPT", episodeId });
            await putWorkProduct(env.R2, r2Key, cached.transcript);
            existingWp = await prisma.workProduct.create({
              data: {
                type: "TRANSCRIPT",
                episodeId,
                r2Key,
                sizeBytes: new TextEncoder().encode(cached.transcript).byteLength,
              },
            });
          }

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

          await prisma.pipelineJob.update({
            where: { id: jobId },
            data: { distillationId: cached.id },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load episode for transcript sources
        const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
        if (!episode) {
          throw new Error(`Episode not found: ${episodeId}`);
        }
        await writeEvent(prisma, step.id, "DEBUG", `Episode loaded: "${episode.title}"`, { audioUrl: episode.audioUrl?.slice(0, 120) });

        let transcript: string;
        let sttUsage: AiUsage | null = null;

        if (episode.transcriptUrl) {
          // Tier 1: RSS feed transcript URL
          await writeEvent(prisma, step.id, "INFO", "Fetching transcript from RSS feed URL");
          const response = await fetch(episode.transcriptUrl);
          transcript = await response.text();
          await writeEvent(prisma, step.id, "INFO", "Transcript fetched from RSS feed", { bytes: transcript.length, source: "feed" });
          log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "feed" });
        } else {
          // Tier 2: Podcast Index lookup
          const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
          const piClient = new PodcastIndexClient(env.PODCAST_INDEX_KEY, env.PODCAST_INDEX_SECRET);
          const piTranscriptUrl = await lookupPodcastIndexTranscript(
            piClient,
            podcast?.podcastIndexId ?? null,
            episode.guid,
            episode.title
          );

          if (piTranscriptUrl) {
            // Found via Podcast Index — fetch and parse, backfill episode
            await writeEvent(prisma, step.id, "INFO", "Found transcript via Podcast Index");
            transcript = await fetchTranscript(piTranscriptUrl);
            await prisma.episode.update({
              where: { id: episodeId },
              data: { transcriptUrl: piTranscriptUrl },
            });
            await writeEvent(prisma, step.id, "DEBUG", "Backfilled episode transcriptUrl from Podcast Index", { source: "podcast-index", bytes: transcript.length });
            log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "podcast-index" });
          } else {
            // Tier 3: STT via configured provider
            await writeEvent(prisma, step.id, "WARN", "No transcript in RSS or Podcast Index — falling back to STT");
            const resolved = await resolveStageModel(prisma, "stt");
            const providerImpl = getProviderImpl(resolved.provider);
            const providerModelId = resolved.providerModelId;
            await writeEvent(prisma, step.id, "INFO", `Transcribing via ${providerImpl.name} (model: ${providerModelId})`);

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
            if (audioBuffer.byteLength < 10_000) {
              throw new Error(`Audio file too small (${audioBuffer.byteLength} bytes) — likely an error page, not audio`);
            }

            const ext = extFromContentType(finalContentType, episode.audioUrl);
            const durationSeconds = episode.durationSeconds ?? Math.round(audioBuffer.byteLength / (128 * 1000 / 8));

            const sttResult = await providerImpl.transcribe(
              { buffer: audioBuffer, filename: `audio.${ext}` },
              durationSeconds,
              env,
              providerModelId
            );

            transcript = sttResult.transcript;
            const estimatedSeconds = audioBuffer.byteLength / (128 * 1000 / 8);
            const sttInputTokens = Math.round(audioBuffer.byteLength / 16000);
            sttUsage = { model: resolved.model, inputTokens: sttInputTokens, outputTokens: 0, cost: calculateAudioCost(resolved.pricing, estimatedSeconds) };
            await writeEvent(prisma, step.id, "INFO", `Transcript generated via ${providerImpl.name}`, { bytes: transcript.length, source: resolved.provider });
            log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: resolved.provider });
          }
        }

        // Upsert Distillation with transcript
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "TRANSCRIPT_READY", transcript, errorMessage: null },
          create: { episodeId, status: "TRANSCRIPT_READY", transcript },
        });

        // Write WorkProduct to R2 and create DB row
        const r2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        await putWorkProduct(env.R2, r2Key, transcript);
        const wp = await prisma.workProduct.create({
          data: {
            type: "TRANSCRIPT",
            episodeId,
            r2Key,
            sizeBytes: new TextEncoder().encode(transcript).byteLength,
          },
        });
        await writeEvent(prisma, step.id, "INFO", "Saved transcript work product to R2", { r2Key, sizeBytes: new TextEncoder().encode(transcript).byteLength });

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            workProductId: wp.id,
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
          await writeEvent(prisma, stepId, "ERROR", `Transcription failed: ${errorMessage}`);
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
