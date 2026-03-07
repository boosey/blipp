import OpenAI from "openai";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { getModelConfig } from "../lib/ai-models";
import { createPipelineLogger } from "../lib/logger";
import { wpKey, putWorkProduct } from "../lib/work-products";
import { PodcastIndexClient } from "../lib/podcast-index";
import { lookupPodcastIndexTranscript } from "../lib/transcript-source";
import { fetchTranscript } from "../lib/transcript";
import { getAudioMetadata, isMp3, transcribeChunked, WHISPER_MAX_BYTES } from "../lib/whisper-chunked";
import type { Env } from "../types";

interface TranscriptionMessage {
  jobId: string;
  episodeId: string;
  type?: "manual";
}

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

    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(prisma, "pipeline.stage.2.enabled", true);
      if (!stageEnabled) {
        log.info("stage_disabled", { stage: 2 });
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { jobId, episodeId } = msg.body;
      const startTime = Date.now();

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUnique({ where: { id: jobId } });
        if (!job) {
          log.info("job_not_found", { jobId });
          msg.ack();
          continue;
        }

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

        // Cache check: existing Distillation with transcript
        const cached = await prisma.distillation.findUnique({ where: { episodeId } });
        if (cached && cached.transcript && CACHE_STATUSES.has(cached.status)) {
          log.debug("cache_hit", { episodeId, existingStatus: cached.status });

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
          });

          msg.ack();
          continue;
        }

        // Load episode for transcript sources
        const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
        if (!episode) {
          throw new Error(`Episode not found: ${episodeId}`);
        }

        let transcript: string;

        if (episode.transcriptUrl) {
          // Tier 1: RSS feed transcript URL
          const response = await fetch(episode.transcriptUrl);
          transcript = await response.text();
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
            transcript = await fetchTranscript(piTranscriptUrl);
            await prisma.episode.update({
              where: { id: episodeId },
              data: { transcriptUrl: piTranscriptUrl },
            });
            log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "podcast-index" });
          } else {
            // Tier 3: Whisper STT
            const { model: sttModel } = await getModelConfig(prisma, "stt");
            const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
            const { contentLength, contentType } = await getAudioMetadata(episode.audioUrl);

            if (contentLength && contentLength > WHISPER_MAX_BYTES) {
              // Oversized file — chunked transcription (MP3 only)
              if (!isMp3(contentType, episode.audioUrl)) {
                throw new Error(
                  `Audio file too large (${Math.round(contentLength / 1024 / 1024)}MB) and not MP3 — cannot chunk non-MP3 formats`
                );
              }
              transcript = await transcribeChunked(openai, episode.audioUrl, contentLength, sttModel);
              log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "whisper-chunked" });
            } else {
              // Standard single-file Whisper
              const audioResponse = await fetch(episode.audioUrl);
              const audioBlob = await audioResponse.blob();
              const file = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });
              const transcription = await openai.audio.transcriptions.create({
                model: sttModel,
                file,
              });
              transcript = transcription.text;
              log.info("transcript_fetched", { episodeId, bytes: transcript.length, source: "whisper" });
            }
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

        // Mark step COMPLETED
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            workProductId: wp.id,
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
          .catch(() => {});

        // Upsert distillation as FAILED
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(() => {});

        log.error("episode_error", { episodeId, jobId }, err);
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
