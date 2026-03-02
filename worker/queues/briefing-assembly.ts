import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
import { allocateWordBudget } from "../lib/time-fitting";
import type { Env } from "../types";

/** Shape of a briefing assembly queue message body. */
interface BriefingAssemblyMessage {
  briefingId: string;
  userId: string;
  type?: "manual";
}

/**
 * Queue consumer for briefing assembly jobs.
 *
 * Collects the user's subscribed podcasts, finds latest episodes with completed
 * distillations, allocates a time budget, gathers cached clips, and concatenates
 * them into a final briefing MP3. Re-queues with delay if clips are still generating.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 *
 * @param batch - Cloudflare Queue message batch with briefing assembly requests
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleBriefingAssembly(
  batch: MessageBatch<BriefingAssemblyMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    // Check if stage 4 (briefing assembly) is enabled — manual messages bypass this
    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(
        prisma,
        "pipeline.stage.4.enabled",
        true
      );
      if (!stageEnabled) {
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { briefingId, userId } = msg.body;

      try {
        // Get briefing record
        const briefing = await prisma.briefing.findUniqueOrThrow({
          where: { id: briefingId },
        });

        // Update to ASSEMBLING
        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: "ASSEMBLING" },
        });

        // Get user's subscriptions with latest episodes that have completed distillations
        const subscriptions = await prisma.subscription.findMany({
          where: { userId },
        });

        if (subscriptions.length === 0) {
          await prisma.briefing.update({
            where: { id: briefingId },
            data: { status: "FAILED", errorMessage: "No subscriptions found" },
          });
          msg.ack();
          continue;
        }

        // Find latest episodes with completed distillations for each subscription
        const readyEpisodes: Array<{
          episode: any;
          distillation: any;
        }> = [];

        for (const sub of subscriptions) {
          const episode = await prisma.episode.findFirst({
            where: {
              podcastId: sub.podcastId,
              distillation: { status: "COMPLETED" },
            },
            orderBy: { publishedAt: "desc" },
          });

          if (episode) {
            const distillation = await prisma.distillation.findUnique({
              where: { episodeId: episode.id },
            });
            if (distillation) {
              readyEpisodes.push({ episode, distillation });
            }
          }
        }

        if (readyEpisodes.length === 0) {
          await prisma.briefing.update({
            where: { id: briefingId },
            data: {
              status: "FAILED",
              errorMessage: "No episodes with completed distillations",
            },
          });
          msg.ack();
          continue;
        }

        // Allocate time budget
        const episodeInputs = readyEpisodes.map((re) => ({
          transcriptWordCount: re.distillation.transcript
            ? re.distillation.transcript.split(/\s+/).length
            : 1000,
        }));

        const allocations = allocateWordBudget(
          episodeInputs,
          briefing.targetMinutes
        );

        // Check for cached clips and queue missing ones
        const clipBuffers: Array<ArrayBuffer | null> = [];
        let allReady = true;

        for (const alloc of allocations) {
          const re = readyEpisodes[alloc.index];
          const cached = await getClip(
            env.R2,
            re.episode.id,
            alloc.durationTier
          );

          if (cached) {
            clipBuffers.push(cached);
          } else {
            allReady = false;
            clipBuffers.push(null);

            // Queue clip generation for this episode/tier
            await env.CLIP_GENERATION_QUEUE.send({
              episodeId: re.episode.id,
              distillationId: re.distillation.id,
              durationTier: alloc.durationTier,
              claims: re.distillation.claimsJson,
            });
          }
        }

        if (!allReady) {
          // Re-queue the briefing assembly with a 60s delay
          await env.BRIEFING_ASSEMBLY_QUEUE.send(
            { briefingId, userId },
            { delaySeconds: 60 }
          );
          msg.ack();
          continue;
        }

        // All clips are ready — concatenate
        const validBuffers = clipBuffers.filter(
          (b): b is ArrayBuffer => b !== null
        );
        const finalAudio = concatMp3Buffers(validBuffers);

        // Store assembled briefing in R2
        const today = new Date().toISOString().split("T")[0];
        const audioKey = await putBriefing(env.R2, userId, today, finalAudio);

        // Create briefing segments for tracking
        for (let i = 0; i < readyEpisodes.length; i++) {
          const re = readyEpisodes[i];
          const clip = await prisma.clip.findUnique({
            where: {
              episodeId_durationTier: {
                episodeId: re.episode.id,
                durationTier: allocations[i].durationTier,
              },
            },
          });

          if (clip) {
            await prisma.briefingSegment.create({
              data: {
                briefingId,
                clipId: clip.id,
                orderIndex: i,
                transitionText: `Next, from ${re.episode.title}...`,
              },
            });
          }
        }

        // Mark briefing as completed
        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: "COMPLETED", audioKey },
        });

        msg.ack();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        await prisma.briefing
          .update({
            where: { id: briefingId },
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
