import { createPrismaClient } from "../lib/db";
import { createPipelineLogger, logDbError } from "../lib/logger";
import { checkStageEnabled, claimEpisodeStage, releaseEpisodeStage, LOCK_RETRY_DELAY_S } from "../lib/queue-helpers";
import { extractClaims } from "../lib/distillation";
import { averageEmbeddings } from "../lib/embeddings";
import { resolveModelChain } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { writeEvent } from "../lib/pipeline-events";
import { writeAiError, classifyAiError, AiProviderError, isRateLimitError, parseRetryAfterMs } from "../lib/ai-errors";
import { recordSuccess, recordFailure, initCircuitBreakerConfig } from "../lib/circuit-breaker";
import { getConfig } from "../lib/config";
import { NotAPodcastError, invalidatePodcastAsMusic, MUSIC_FEED_ITEM_ERROR } from "../lib/podcast-invalidation";
import type { DistillationMessage } from "../lib/queue-messages";
import { resolveEnvForPipeline } from "../lib/service-key-resolver";
import type { Env } from "../types";

/**
 * Queue consumer for distillation jobs.
 *
 * For each message: loads the job, checks for cached distillation,
 * runs Claude claim extraction if needed, and tracks progress via PipelineStep.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 */
export async function handleDistillation(
  batch: MessageBatch<DistillationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  await initCircuitBreakerConfig(prisma);

  try {
    const log = await createPipelineLogger({ stage: "distillation", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if distillation stage is enabled — manual messages bypass this
    if (!(await checkStageEnabled(prisma, batch, "DISTILLATION", log))) return;

    for (const msg of batch.messages) {
      const { jobId, episodeId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const startedAt = new Date();

      let step: { id: string } | null = null;
      let requestId: string | undefined;
      let distillProvider: string | undefined;
      let distillModel: string | undefined;
      let modelChainAttempts = 0;
      let modelChainLength = 0;

      try {
        // Load job to get requestId
        const job = await prisma.pipelineJob.findUniqueOrThrow({
          where: { id: jobId },
          select: { id: true, requestId: true },
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

        // Mark job as IN_PROGRESS
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { status: "IN_PROGRESS" },
        });

        // Create PipelineStep for tracking
        step = await prisma.pipelineStep.create({
          data: {
            jobId,
            stage: "DISTILLATION",
            status: "IN_PROGRESS",
            startedAt,
          },
        });
        const stepId = step!.id;

        await writeEvent(prisma, stepId, "INFO", "Checking cache for completed distillation");

        // Cache check: claims WorkProduct already exists in R2
        const claimsR2Key = wpKey({ type: "CLAIMS", episodeId });
        const existingClaims = await env.R2.head(claimsR2Key);
        if (existingClaims) {
          await writeEvent(prisma, stepId, "INFO", "Cache hit — claims exist in R2, skipping");
          log.debug("cache_hit", { episodeId, jobId });

          // Ensure WorkProduct index row exists for UI
          await prisma.workProduct.upsert({
            where: { r2Key: claimsR2Key },
            update: {},
            create: { type: "CLAIMS", episodeId, r2Key: claimsR2Key, sizeBytes: existingClaims.size },
          });

          const existing = await prisma.distillation.findUnique({ where: { episodeId } });
          if (existing) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { distillationId: existing.id },
            });
          }

          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
            },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "DISTILLATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Load transcript from R2 (written by transcription stage)
        const transcriptR2Key = wpKey({ type: "TRANSCRIPT", episodeId });
        const transcriptData = await getWorkProduct(env.R2, transcriptR2Key);
        if (!transcriptData) {
          await writeEvent(prisma, stepId, "ERROR", "No transcript in R2 — transcription stage must run first");
          throw new Error("No transcript available — run transcription first");
        }
        const transcript = new TextDecoder().decode(transcriptData);
        await writeEvent(prisma, stepId, "INFO", `Loaded transcript from R2 (${transcript.length} bytes)`, {
          transcriptBytes: transcript.length,
        });

        // Ensure Distillation row exists so we can CAS-claim it.
        await prisma.distillation.upsert({
          where: { episodeId },
          create: { episodeId, status: "TRANSCRIPT_READY" },
          update: {},
        });

        // Atomically claim distillation work for this episode.
        const claim = await claimEpisodeStage({
          prisma,
          episodeId,
          lockField: "distillationStartedAt",
          requiredStatus: "TRANSCRIPT_READY",
        });

        if (!claim.claimed) {
          await writeEvent(prisma, stepId, "INFO", `Distillation deferred — ${claim.reason} by another worker`, { reason: claim.reason });
          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "SKIPPED",
              cached: false,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
              errorMessage: `coalesce_${claim.reason}`,
            },
          });
          msg.retry({ delaySeconds: LOCK_RETRY_DELAY_S });
          continue;
        }

        // Post-claim cache re-check: covers crash window after a prior worker
        // wrote claims to R2 but did not update status before dying.
        const postClaimCacheHit = await env.R2.head(claimsR2Key);
        if (postClaimCacheHit) {
          log.debug("post_claim_cache_hit", { episodeId });
          await writeEvent(prisma, stepId, "INFO", "Post-claim cache hit — claims exist in R2");

          await prisma.workProduct.upsert({
            where: { r2Key: claimsR2Key },
            update: {},
            create: { type: "CLAIMS", episodeId, r2Key: claimsR2Key, sizeBytes: postClaimCacheHit.size },
          });

          const existingForCache = await prisma.distillation.findUnique({ where: { episodeId } });
          if (existingForCache) {
            await prisma.pipelineJob.update({
              where: { id: jobId },
              data: { distillationId: existingForCache.id },
            });
          }

          await prisma.pipelineStep.update({
            where: { id: stepId },
            data: {
              status: "SKIPPED",
              cached: true,
              completedAt: new Date(),
              durationMs: new Date().getTime() - startedAt.getTime(),
            },
          });

          await env.ORCHESTRATOR_QUEUE.send({
            requestId: job.requestId,
            action: "job-stage-complete",
            jobId,
            completedStage: "DISTILLATION",
            correlationId,
          });

          msg.ack();
          continue;
        }

        // Move status forward — we own the work.
        const existing = await prisma.distillation.update({
          where: { episodeId },
          data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
        });

        // Resolve model chain: primary -> secondary -> tertiary
        const modelChain = await resolveModelChain(prisma, "distillation");
        if (modelChain.length === 0) {
          throw new Error("No distillation model configured — configure at least a primary in Admin > AI Models");
        }

        await writeEvent(prisma, stepId, "INFO", `Model chain: ${modelChain.map((m, i) => `${["primary", "secondary", "tertiary"][i]}=${m.provider}/${m.providerModelId}`).join(", ")}`, {
          chainLength: modelChain.length,
        });

        // Try each model in the chain until one succeeds
        let claims: any[] | undefined;
        let claimsUsage: { model: string; inputTokens: number; outputTokens: number; cost: number | null; cacheCreationTokens?: number; cacheReadTokens?: number } | undefined;
        modelChainLength = modelChain.length;
        for (let i = 0; i < modelChain.length; i++) {
          modelChainAttempts = i + 1;
          const resolved = modelChain[i];
          const tier = ["primary", "secondary", "tertiary"][i];
          const llm = getLlmProviderImpl(resolved.provider);
          distillProvider = resolved.provider;
          distillModel = resolved.providerModelId;

          // Resolve DB-stored API key for this provider+context
          const keyResult = await resolveEnvForPipeline(prisma, env, "pipeline.distillation", resolved.provider);
          const resolvedEnv = keyResult.env;
          if (!keyResult.fromDb && keyResult.envKey) {
            await writeEvent(prisma, stepId, "WARN", `Using env var fallback for ${keyResult.envKey} — configure in Admin > Service Keys`, { envKey: keyResult.envKey, provider: resolved.provider });
            writeAiError(prisma, { service: "distillation", provider: resolved.provider, model: resolved.providerModelId, operation: "key_resolution", correlationId: jobId, jobId, stepId, episodeId, category: "auth", severity: "permanent", errorMessage: `Env var fallback: ${keyResult.envKey} not configured in Service Keys DB for context pipeline.distillation.${resolved.provider}`, requestDurationMs: 0, timestamp: new Date(), retryCount: 0, maxRetries: 0, willRetry: false }).catch(() => {});
          }

          await writeEvent(prisma, stepId, "INFO", `Sending transcript to ${tier}: ${llm.name} (${resolved.providerModelId}) for claim extraction`, {
            tier,
            transcriptBytes: transcript.length,
            model: resolved.providerModelId,
            provider: resolved.provider,
          });

          const rateLimitRetries = await getConfig(prisma, "pipeline.distillation.rateLimitRetries", 3) as number;
          let rateLimitAttempt = 0;
          let succeeded = false;
          while (rateLimitAttempt <= rateLimitRetries) {
            try {
              const elapsed = log.timer("claude_extraction");
              const result = await extractClaims(prisma, llm, transcript, resolved.providerModelId, 8192, resolvedEnv, resolved.pricing);
              recordSuccess(resolved.provider);
              elapsed();
              claims = result.claims;
              claimsUsage = result.usage;

              await writeEvent(prisma, stepId, "INFO", `Extracted ${claims.length} claims via ${tier} ${llm.name}`, {
                tier,
                claimCount: claims.length,
                attemptNumber: i + 1,
              });
              log.info("claims_extracted", { episodeId, claimCount: claims.length, tier });
              succeeded = true;
              break;
            } catch (chainErr) {
              const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
              const httpStatus = (chainErr as any)?.httpStatus;

              if (isRateLimitError(chainErr) && rateLimitAttempt < rateLimitRetries) {
                const waitMs = parseRetryAfterMs(chainErr);
                rateLimitAttempt++;
                await writeEvent(prisma, stepId, "WARN", `${tier} rate-limited — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${rateLimitAttempt}/${rateLimitRetries})`, {
                  tier, provider: resolved.provider, model: resolved.providerModelId, waitMs,
                });
                log.info("rate_limit_backoff", { provider: resolved.provider, waitMs, attempt: rateLimitAttempt });
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
              }

              // Not a rate limit, or retries exhausted — record failure and fall to next model
              if (!isRateLimitError(chainErr)) {
                recordFailure(resolved.provider);
              }

              await writeEvent(prisma, stepId, "WARN", `${tier} failed: ${llm.name} — ${errMsg.slice(0, 300)}`, {
                tier,
                provider: resolved.provider,
                model: resolved.providerModelId,
                httpStatus,
                errorType: chainErr?.constructor?.name,
                willRetryNext: i < modelChain.length - 1,
                rateLimitRetries: rateLimitAttempt,
              });

              if (i === modelChain.length - 1) {
                throw chainErr;
              }
              break; // Fall to next model in chain
            }
          }
          if (succeeded) break;
        }

        await writeEvent(prisma, stepId, "DEBUG", `Model: ${claimsUsage!.model}`, {
          inputTokens: claimsUsage!.inputTokens,
          outputTokens: claimsUsage!.outputTokens,
          cost: claimsUsage!.cost,
          ...(claimsUsage!.cacheCreationTokens ? { cacheCreationTokens: claimsUsage!.cacheCreationTokens } : {}),
          ...(claimsUsage!.cacheReadTokens ? { cacheReadTokens: claimsUsage!.cacheReadTokens } : {}),
        });

        // Phase 4 / Task 8: centroid embedding over claim texts for the Sunday
        // Pulse digest's clustering pass. Non-fatal — episodes without an
        // embedding simply don't participate in clustering that week.
        let claimsEmbedding: number[] | null = null;
        try {
          if (claims && claims.length > 0) {
            const claimTexts = (claims as any[])
              .map((c) => {
                const text = String(c?.claim ?? "").trim();
                const excerpt = String(c?.excerpt ?? "").trim();
                const combined = excerpt ? `${text}. ${excerpt}` : text;
                return combined.slice(0, 512);
              })
              .filter((t) => t.length > 0);

            if (claimTexts.length > 0) {
              const elapsedEmb = log.timer("claims_embedding");
              const result = (await env.AI.run("@cf/baai/bge-base-en-v1.5" as any, {
                text: claimTexts,
              })) as any;
              elapsedEmb();
              const vectors = (result?.data ?? []) as number[][];
              claimsEmbedding = averageEmbeddings(vectors);
              if (claimsEmbedding) {
                await writeEvent(
                  prisma,
                  stepId,
                  "DEBUG",
                  `Embedded ${vectors.length} claims (${claimsEmbedding.length}-dim centroid)`,
                  { claimCount: vectors.length, dim: claimsEmbedding.length }
                );
              }
            }
          }
        } catch (embErr) {
          const msg = embErr instanceof Error ? embErr.message : String(embErr);
          await writeEvent(
            prisma,
            stepId,
            "WARN",
            `Embedding step failed (non-fatal): ${msg.slice(0, 200)}`,
            { error: msg }
          );
          log.info("embedding_failed", { episodeId, error: msg });
        }

        // Mark distillation as completed and release the lock.
        await prisma.distillation.update({
          where: { id: existing.id },
          data: {
            status: "COMPLETED",
            distillationStartedAt: null,
            ...(claimsEmbedding ? { claimsEmbedding } : {}),
          },
        });

        // Write claims to R2 + index in DB
        const claimsStr = JSON.stringify(claims!);
        const r2Key = wpKey({ type: "CLAIMS", episodeId });
        await putWorkProduct(env.R2, r2Key, claimsStr);
        const sizeBytes = new TextEncoder().encode(claimsStr).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key },
          update: { sizeBytes, metadata: { claimCount: claims!.length } },
          create: { type: "CLAIMS", episodeId, r2Key, sizeBytes, metadata: { claimCount: claims!.length } },
        });
        await writeEvent(prisma, stepId, "INFO", "Saved claims to R2", { r2Key, claimCount: claims!.length });

        // Mark step COMPLETED
        const completedAt = new Date();
        await prisma.pipelineStep.update({
          where: { id: stepId },
          data: {
            status: "COMPLETED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            model: claimsUsage!.model,
            inputTokens: claimsUsage!.inputTokens,
            outputTokens: claimsUsage!.outputTokens,
            cost: claimsUsage!.cost,
            cacheCreationTokens: claimsUsage!.cacheCreationTokens ?? null,
            cacheReadTokens: claimsUsage!.cacheReadTokens ?? null,
          },
        });

        // Update job with distillation reference
        await prisma.pipelineJob.update({
          where: { id: jobId },
          data: { distillationId: existing.id },
        });

        // Auto-publish: set publicPage on episode after distillation completes
        try {
          const epForPublish = await prisma.episode.findUnique({
            where: { id: episodeId },
            select: { publicPage: true, slug: true, podcast: { select: { deliverable: true, slug: true } } },
          });
          if (
            epForPublish &&
            !epForPublish.publicPage &&
            epForPublish.slug &&
            epForPublish.podcast?.deliverable &&
            epForPublish.podcast.slug
          ) {
            await prisma.episode.update({
              where: { id: episodeId },
              data: { publicPage: true },
            });
            log.info("auto_publish_episode_distillation", { episodeId });
          }
        } catch (autoPublishErr) {
          log.info("auto_publish_distillation_failed", { episodeId, error: autoPublishErr instanceof Error ? autoPublishErr.message : String(autoPublishErr) });
        }

        // Report to orchestrator
        await env.ORCHESTRATOR_QUEUE.send({
          requestId: job.requestId,
          action: "job-stage-complete",
          jobId,
          completedStage: "DISTILLATION",
          correlationId,
        });
        log.debug("orchestrator_notified", { episodeId, jobId, requestId: job.requestId });

        msg.ack();
      } catch (err) {
        // Release the distillation lock so a retry can immediately re-claim.
        await releaseEpisodeStage({ prisma, episodeId, lockField: "distillationStartedAt" });

        const errorMessage =
          err instanceof Error ? err.message : String(err);

        // Special path: LLM told us this isn't a podcast (song lyrics / music).
        // Invalidate the whole podcast so subscriptions/favorites are wiped and
        // future briefings for it are blocked. Still falls through to mark the
        // job FAILED below so the request can assemble whatever else succeeded.
        if (err instanceof NotAPodcastError) {
          try {
            const ep = await prisma.episode.findUnique({
              where: { id: episodeId },
              select: { podcastId: true },
            });
            if (ep?.podcastId) {
              await invalidatePodcastAsMusic(prisma, ep.podcastId, "song_lyrics_detected");
              if (step) {
                await writeEvent(prisma, step.id, "WARN",
                  `Podcast invalidated as music (song lyrics detected)`, { podcastId: ep.podcastId }
                ).catch(() => {});
              }
            }
          } catch (invalidateErr) {
            log.error("podcast_invalidate_failed", { episodeId, jobId }, invalidateErr);
          }
        }

        // Mark step as FAILED if it was created
        if (step) {
          await prisma.pipelineStep
            .update({
              where: { id: step.id },
              data: {
                status: "FAILED",
                errorMessage,
                completedAt: new Date(),
                durationMs: new Date().getTime() - startedAt.getTime(),
              },
            })
            .catch(logDbError("distillation", "pipelineStep", jobId));
        }

        // Upsert distillation as FAILED
        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(logDbError("distillation", "distillation", jobId));

        if (step) await writeEvent(prisma, step.id, "ERROR", `Distillation failed: ${errorMessage.slice(0, 2048)}`, {
          model: distillModel,
          provider: distillProvider,
          httpStatus: (err as any)?.httpStatus || (err as any)?.status || (err as any)?.statusCode,
          errorType: err?.constructor?.name,
        });

        log.error("episode_error", { episodeId, jobId }, err);

        // Capture AI provider errors
        if (err instanceof AiProviderError) {
          recordFailure(err.provider);
          const { category, severity } = classifyAiError(err, err.httpStatus, err.rawResponse);
          writeAiError(prisma, {
            service: "distillation",
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

        // Notify orchestrator so job is marked FAILED and assembly can proceed.
        // For NotAPodcast we replace the verbose raw error with the UI sentinel
        // so the FeedItem surfaces the proper "this is music, not a podcast" message.
        const reportedError = err instanceof NotAPodcastError ? MUSIC_FEED_ITEM_ERROR : errorMessage;
        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId,
            action: "job-failed",
            jobId,
            errorMessage: reportedError,
            correlationId,
          }).catch((sendErr: unknown) => {
            console.error(JSON.stringify({
              level: "error",
              action: "orchestrator_send_failed",
              stage: "distillation",
              jobId,
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              ts: new Date().toISOString(),
            }));
          });
        }

        // Retry transient AI errors (rate limits, timeouts, server errors);
        // ack permanent errors (auth, model not found, content filter)
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
