import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { generateNarrative } from "../lib/distillation";
import { generateSpeech } from "../lib/tts";
import { putClip } from "../lib/clip-cache";
import type { Env } from "../types";

/** Shape of a clip generation queue message body. */
interface ClipGenerationMessage {
  episodeId: string;
  distillationId: string;
  durationTier: number;
  claims: any[];
  requestId?: string;
  type?: "manual";
}

/**
 * Queue consumer for clip generation jobs.
 *
 * For each message: generates a spoken narrative from claims (Pass 2),
 * converts it to audio via TTS, stores the MP3 in R2, and updates the
 * clip record. Handles idempotency and error recording.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 *
 * @param batch - Cloudflare Queue message batch with clip generation requests
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleClipGeneration(
  batch: MessageBatch<ClipGenerationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    // Check if stage 4 (clip generation) is enabled — manual messages bypass this
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
      const { episodeId, distillationId, durationTier, claims } = msg.body;

      try {
        // Idempotency: check if clip is already completed
        const existing = await prisma.clip.findUnique({
          where: { episodeId_durationTier: { episodeId, durationTier } },
        });

        if (existing?.status === "COMPLETED") {
          msg.ack();
          continue;
        }

        // Create or update clip record
        const clip = await prisma.clip.upsert({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          update: { status: "GENERATING_NARRATIVE", errorMessage: null },
          create: {
            episodeId,
            distillationId,
            durationTier,
            status: "GENERATING_NARRATIVE",
          },
        });

        // Pass 2: generate narrative from claims
        const narrative = await generateNarrative(
          anthropic,
          claims,
          durationTier
        );
        const wordCount = narrative.split(/\s+/).length;

        await prisma.clip.update({
          where: { id: clip.id },
          data: {
            status: "GENERATING_AUDIO",
            narrativeText: narrative,
            wordCount,
          },
        });

        // Generate TTS audio
        const audio = await generateSpeech(openai, narrative);

        // Store in R2
        await putClip(env.R2, episodeId, durationTier, audio);

        // Mark clip as completed
        const audioKey = `clips/${episodeId}/${durationTier}.mp3`;
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "COMPLETED", audioKey },
        });

        if (msg.body.requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId: msg.body.requestId, action: "stage-complete", stage: 4, episodeId,
          });
        }

        msg.ack();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        // Try to record the error on the clip
        await prisma.clip
          .upsert({
            where: {
              episodeId_durationTier: { episodeId, durationTier },
            },
            update: { status: "FAILED", errorMessage },
            create: {
              episodeId,
              distillationId,
              durationTier,
              status: "FAILED",
              errorMessage,
            },
          })
          .catch(() => {});

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
