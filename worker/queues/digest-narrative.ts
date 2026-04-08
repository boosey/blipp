import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { resolveModelChain } from "../lib/model-resolution";
import { getLlmProviderImpl } from "../lib/llm-providers";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import type { DigestNarrativeMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for digest narrative condensation.
 *
 * Per episode: loads the 10-minute narrative from R2, condenses it to ~75 words
 * (30 seconds spoken) via LLM, stores the condensed version, and dispatches
 * to the digest clip queue for TTS.
 */
export async function handleDigestNarrative(
  batch: MessageBatch<DigestNarrativeMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "digest-narrative", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    for (const msg of batch.messages) {
      const { episodeId, deliveryId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();

      try {
        // Cache check: condensed narrative already exists
        const cacheKey = wpKey({ type: "DIGEST_NARRATIVE", episodeId });
        const cached = await env.R2.head(cacheKey);

        if (cached) {
          log.debug("cache_hit", { episodeId });

          // Ensure WorkProduct index row exists
          await prisma.workProduct.upsert({
            where: { r2Key: cacheKey },
            update: {},
            create: {
              type: "DIGEST_NARRATIVE",
              episodeId,
              r2Key: cacheKey,
              sizeBytes: cached.size,
            },
          });

          // Update episode status and dispatch to clip
          await prisma.digestDeliveryEpisode.updateMany({
            where: { deliveryId, episodeId },
            data: { status: "PROCESSING" },
          });

          await env.DIGEST_CLIP_QUEUE.send({ episodeId, deliveryId, correlationId });
          msg.ack();
          continue;
        }

        // Load the 10-min narrative (try common duration tiers)
        let fullNarrative: string | null = null;
        for (const tier of [10, 5, 15, 2, 30]) {
          const r2Key = wpKey({ type: "NARRATIVE", episodeId, durationTier: tier });
          const data = await getWorkProduct(env.R2, r2Key);
          if (data) {
            fullNarrative = new TextDecoder().decode(data);
            break;
          }
        }

        if (!fullNarrative) {
          log.error("no_narrative", { episodeId }, new Error("No 10-min narrative found in R2"));
          // Mark this episode as failed but don't fail the whole delivery
          await prisma.digestDeliveryEpisode.updateMany({
            where: { deliveryId, episodeId },
            data: { status: "FAILED" },
          });
          msg.ack();
          continue;
        }

        // Resolve LLM model for condensation
        const modelChain = await resolveModelChain(prisma, "narrative");
        if (modelChain.length === 0) {
          throw new Error("No narrative model configured for digest condensation");
        }

        // Load episode metadata for context
        const episode = await prisma.episode.findUnique({
          where: { id: episodeId },
          select: {
            title: true,
            podcast: { select: { title: true } },
          },
        });

        const podcastName = episode?.podcast?.title ?? "this podcast";

        // Try each model in the chain
        let condensed: string | undefined;
        for (let i = 0; i < modelChain.length; i++) {
          const resolved = modelChain[i];
          const llm = getLlmProviderImpl(resolved.provider);

          try {
            const result = await llm.complete(
              [{ role: "user", content: fullNarrative }],
              resolved.providerModelId,
              256,
              env,
              {
                system: `You condense podcast briefings into exactly ~75 words (30 seconds spoken). Keep the most important facts. Same voice and tone as the input. Start with the podcast name "${podcastName}". No filler phrases. No introductory meta-commentary.`,
              }
            );

            recordSuccess(resolved.provider);
            condensed = result.text;
            log.info("condensed", {
              episodeId,
              wordCount: condensed.split(/\s+/).length,
              model: resolved.providerModelId,
            });
            break;
          } catch (chainErr) {
            recordFailure(resolved.provider);
            if (i === modelChain.length - 1) throw chainErr;
          }
        }

        // Store condensed narrative in R2
        await putWorkProduct(env.R2, cacheKey, condensed!);
        const sizeBytes = new TextEncoder().encode(condensed!).byteLength;
        await prisma.workProduct.upsert({
          where: { r2Key: cacheKey },
          update: { sizeBytes },
          create: {
            type: "DIGEST_NARRATIVE",
            episodeId,
            r2Key: cacheKey,
            sizeBytes,
          },
        });

        // Update episode status and dispatch to clip
        await prisma.digestDeliveryEpisode.updateMany({
          where: { deliveryId, episodeId },
          data: { status: "PROCESSING" },
        });

        await env.DIGEST_CLIP_QUEUE.send({ episodeId, deliveryId, correlationId });
        log.info("narrative_condensed", { episodeId, deliveryId });
        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("episode_error", { episodeId, deliveryId }, err);

        await prisma.digestDeliveryEpisode
          .updateMany({
            where: { deliveryId, episodeId },
            data: { status: "FAILED" },
          })
          .catch(() => {});

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
