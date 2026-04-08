import { createPrismaClient } from "../lib/db";
import { createPipelineLogger } from "../lib/logger";
import { wpKey, putWorkProduct, getWorkProduct } from "../lib/work-products";
import { concatenateAudioChunks, createSilenceFrame } from "../lib/tts/chunking";
import { ASSUMED_BITRATE_BYTES_PER_SEC } from "../lib/constants";
import type { DigestAssemblyMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for digest assembly.
 *
 * Per delivery: loads all 30-sec audio clips, concatenates them with silence
 * separators, stores the final audio, and marks the delivery as READY.
 * Source order: subscriptions first, then favorites, then recommended.
 */
export async function handleDigestAssembly(
  batch: MessageBatch<DigestAssemblyMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "digest-assembly", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    for (const msg of batch.messages) {
      const { deliveryId } = msg.body;

      try {
        // Load delivery with episodes
        const delivery = await prisma.digestDelivery.findUnique({
          where: { id: deliveryId },
          include: {
            episodes: {
              where: { status: "READY" },
              include: {
                episode: {
                  select: {
                    id: true,
                    title: true,
                    podcast: { select: { id: true, title: true, imageUrl: true } },
                  },
                },
              },
            },
          },
        });

        if (!delivery) {
          log.info("delivery_not_found", { deliveryId });
          msg.ack();
          continue;
        }

        if (delivery.status === "READY" || delivery.status === "FAILED") {
          log.info("delivery_already_terminal", { deliveryId, status: delivery.status });
          msg.ack();
          continue;
        }

        const readyEpisodes = delivery.episodes;
        if (readyEpisodes.length === 0) {
          await prisma.digestDelivery.update({
            where: { id: deliveryId },
            data: { status: "FAILED", errorMessage: "No episodes ready for assembly" },
          });
          msg.ack();
          continue;
        }

        // Sort: subscriptions first, then favorites, then recommended
        const SOURCE_ORDER = { subscribed: 0, favorited: 1, recommended: 2 };
        readyEpisodes.sort(
          (a: any, b: any) =>
            (SOURCE_ORDER[a.sourceType as keyof typeof SOURCE_ORDER] ?? 3) -
            (SOURCE_ORDER[b.sourceType as keyof typeof SOURCE_ORDER] ?? 3)
        );

        // Load all audio clips
        const voice = "default";
        const audioChunks: ArrayBuffer[] = [];
        for (const dde of readyEpisodes) {
          const clipKey = wpKey({ type: "DIGEST_CLIP", episodeId: dde.episodeId, voice });
          const data = await getWorkProduct(env.R2, clipKey);
          if (data) {
            audioChunks.push(data);
          } else {
            log.info("clip_missing", { deliveryId, episodeId: dde.episodeId });
          }
        }

        if (audioChunks.length === 0) {
          await prisma.digestDelivery.update({
            where: { id: deliveryId },
            data: { status: "FAILED", errorMessage: "No audio clips found in R2" },
          });
          msg.ack();
          continue;
        }

        // Concatenate with silence separators
        const silence = createSilenceFrame();
        const finalAudio = concatenateAudioChunks(audioChunks, silence);

        // Calculate duration from audio size
        const actualSeconds = Math.round(finalAudio.byteLength / ASSUMED_BITRATE_BYTES_PER_SEC);

        // Store in R2
        const audioKey = wpKey({ type: "DIGEST_AUDIO", userId: delivery.userId, date: delivery.date });
        await putWorkProduct(env.R2, audioKey, finalAudio, { contentType: "audio/mpeg" });
        await prisma.workProduct.upsert({
          where: { r2Key: audioKey },
          update: { sizeBytes: finalAudio.byteLength },
          create: {
            type: "DIGEST_AUDIO",
            r2Key: audioKey,
            sizeBytes: finalAudio.byteLength,
          },
        });

        // Build sources JSON for frontend
        const sources = readyEpisodes.map((dde: any) => ({
          episodeId: dde.episodeId,
          episodeTitle: dde.episode.title,
          podcastId: dde.episode.podcast.id,
          podcastTitle: dde.episode.podcast.title,
          podcastImageUrl: dde.episode.podcast.imageUrl ?? null,
          sourceType: dde.sourceType,
        }));

        // Update delivery to READY
        await prisma.digestDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "READY",
            audioKey,
            actualSeconds,
            episodeCount: audioChunks.length,
            sources,
          },
        });

        log.info("assembly_complete", {
          deliveryId,
          episodeCount: audioChunks.length,
          actualSeconds,
          sizeBytes: finalAudio.byteLength,
        });

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("assembly_error", { deliveryId }, err);

        await prisma.digestDelivery
          .update({
            where: { id: deliveryId },
            data: { status: "FAILED", errorMessage },
          })
          .catch(() => {});

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
