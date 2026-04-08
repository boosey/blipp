import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { resolveModelChain } from "../lib/model-resolution";
import { getTtsProviderImpl } from "../lib/tts/providers";
import { generateSpeech } from "../lib/tts/tts";
import { loadSystemDefaultConfig, extractProviderConfig } from "../lib/voice-presets";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { recordSuccess, recordFailure } from "../lib/circuit-breaker";
import { incrementAndCheckAssembly } from "../lib/digest-helpers";
import type { DigestClipMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for digest clip TTS generation.
 *
 * Per episode: loads the 30-sec condensed narrative, converts to audio via TTS,
 * stores the clip, and tracks completion across all deliveries using this episode.
 * When all episodes in a delivery are ready, dispatches assembly.
 */
export async function handleDigestClip(
  batch: MessageBatch<DigestClipMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "digest-clip", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    for (const msg of batch.messages) {
      const { episodeId, deliveryId, voicePresetId } = msg.body;
      const correlationId = msg.body.correlationId ?? crypto.randomUUID();
      const voice = "default"; // digest uses default voice

      try {
        // Cache check: clip already exists
        const clipKey = wpKey({ type: "DIGEST_CLIP", episodeId, voice });
        const cached = await env.R2.head(clipKey);

        if (cached) {
          log.debug("cache_hit", { episodeId });

          // Ensure WorkProduct index row
          await prisma.workProduct.upsert({
            where: { r2Key: clipKey },
            update: {},
            create: {
              type: "DIGEST_CLIP",
              episodeId,
              voice,
              r2Key: clipKey,
              sizeBytes: cached.size,
            },
          });

          // Mark this episode READY in the delivery
          await prisma.digestDeliveryEpisode.updateMany({
            where: { deliveryId, episodeId },
            data: { status: "READY" },
          });

          // Also mark READY in any OTHER deliveries referencing this episode
          await markReadyAcrossDeliveries(prisma, episodeId, deliveryId);

          await incrementAndCheckAssembly(prisma, deliveryId, env);
          msg.ack();
          continue;
        }

        // Load condensed narrative from R2
        const narrativeKey = wpKey({ type: "DIGEST_NARRATIVE", episodeId });
        const narrativeData = await getWorkProduct(env.R2, narrativeKey);
        if (!narrativeData) {
          throw new Error("No condensed narrative found in R2 — digest-narrative stage must run first");
        }
        const narrative = new TextDecoder().decode(narrativeData);

        // Resolve TTS model chain
        const modelChain = await resolveModelChain(prisma, "tts");
        if (modelChain.length === 0) {
          throw new Error("No TTS model configured");
        }

        // Load voice config (system default for digest)
        const presetConfig = voicePresetId
          ? await (async () => {
              const { loadPresetConfig } = await import("../lib/voice-presets");
              return loadPresetConfig(prisma, voicePresetId);
            })()
          : await loadSystemDefaultConfig(prisma);

        // Try each TTS model in the chain
        let audio: ArrayBuffer | undefined;
        let clipActualSeconds: number | null = null;
        for (let i = 0; i < modelChain.length; i++) {
          const resolved = modelChain[i];
          const tts = getTtsProviderImpl(resolved.provider);
          const voiceConfig = extractProviderConfig(presetConfig, resolved.provider);

          try {
            const result = await generateSpeech(
              tts,
              narrative,
              voiceConfig.voice,
              resolved.providerModelId,
              env,
              resolved.pricing,
              voiceConfig.instructions,
              voiceConfig.speed
            );
            recordSuccess(resolved.provider);
            audio = result.audio;
            clipActualSeconds = result.usage?.audioSeconds
              ? Math.round(result.usage.audioSeconds)
              : null;
            log.info("clip_generated", {
              episodeId,
              sizeBytes: audio.byteLength,
              actualSeconds: clipActualSeconds,
              model: resolved.providerModelId,
            });
            break;
          } catch (chainErr) {
            recordFailure(resolved.provider);
            if (i === modelChain.length - 1) throw chainErr;
          }
        }

        // Store audio in R2
        await putWorkProduct(env.R2, clipKey, audio!, { contentType: "audio/mpeg" });
        await prisma.workProduct.upsert({
          where: { r2Key: clipKey },
          update: { sizeBytes: audio!.byteLength },
          create: {
            type: "DIGEST_CLIP",
            episodeId,
            voice,
            r2Key: clipKey,
            sizeBytes: audio!.byteLength,
          },
        });

        // Mark READY in this delivery with actual duration
        await prisma.digestDeliveryEpisode.updateMany({
          where: { deliveryId, episodeId },
          data: { status: "READY", actualSeconds: clipActualSeconds },
        });

        // Mark READY in any other deliveries referencing this episode
        await markReadyAcrossDeliveries(prisma, episodeId, deliveryId);

        // Check if this delivery is complete
        await incrementAndCheckAssembly(prisma, deliveryId, env);

        // Also check other deliveries that reference this episode
        await checkOtherDeliveries(prisma, episodeId, deliveryId, env);

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

/**
 * Marks this episode as READY in all other PROCESSING deliveries
 * that reference it (the clip is shared across users).
 */
async function markReadyAcrossDeliveries(
  prisma: any,
  episodeId: string,
  excludeDeliveryId: string
): Promise<void> {
  await prisma.digestDeliveryEpisode.updateMany({
    where: {
      episodeId,
      deliveryId: { not: excludeDeliveryId },
      status: { in: ["PENDING", "PROCESSING"] },
      delivery: { status: "PROCESSING" },
    },
    data: { status: "READY" },
  });
}

/**
 * For all other PROCESSING deliveries that reference this episode,
 * increment completedEpisodes and check if assembly should be dispatched.
 */
async function checkOtherDeliveries(
  prisma: any,
  episodeId: string,
  excludeDeliveryId: string,
  env: Env
): Promise<void> {
  const otherDdes = await prisma.digestDeliveryEpisode.findMany({
    where: {
      episodeId,
      deliveryId: { not: excludeDeliveryId },
      status: "READY",
      delivery: { status: "PROCESSING" },
    },
    select: { deliveryId: true },
    distinct: ["deliveryId"],
  });

  for (const dde of otherDdes) {
    await incrementAndCheckAssembly(prisma, dde.deliveryId, env);
  }
}
