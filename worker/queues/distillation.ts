import Anthropic from "@anthropic-ai/sdk";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { extractClaims } from "../lib/distillation";
import type { Env } from "../types";

/** Shape of a distillation queue message body. */
interface DistillationMessage {
  episodeId: string;
  transcriptUrl: string;
  type?: "manual";
}

/**
 * Queue consumer for distillation jobs.
 *
 * For each message: fetches the episode transcript, runs Claude claim extraction
 * (Pass 1), and stores the results. Handles idempotency (skips already-completed
 * distillations) and records errors for failed attempts.
 *
 * Messages with `type: "manual"` bypass the stage-enabled check.
 *
 * @param batch - Cloudflare Queue message batch with distillation requests
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleDistillation(
  batch: MessageBatch<DistillationMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    // Check if stage 2 (distillation) is enabled — manual messages bypass this
    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(
        prisma,
        "pipeline.stage.2.enabled",
        true
      );
      if (!stageEnabled) {
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { episodeId, transcriptUrl } = msg.body;

      try {
        // Check for existing completed distillation (idempotency)
        const existing = await prisma.distillation.findUnique({
          where: { episodeId },
        });

        if (existing?.status === "COMPLETED") {
          msg.ack();
          continue;
        }

        // Create or update distillation record to FETCHING_TRANSCRIPT
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "FETCHING_TRANSCRIPT", errorMessage: null },
          create: { episodeId, status: "FETCHING_TRANSCRIPT" },
        });

        // Fetch transcript
        const transcriptResponse = await fetch(transcriptUrl);
        const transcript = await transcriptResponse.text();

        // Update status to EXTRACTING_CLAIMS
        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { status: "EXTRACTING_CLAIMS", transcript },
        });

        // Extract claims via Claude (Pass 1)
        const claims = await extractClaims(anthropic, transcript);

        // Mark as completed with claims
        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { status: "COMPLETED", claimsJson: claims as any },
        });

        msg.ack();
      } catch (err) {
        // Record error and retry the message
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        await prisma.distillation
          .upsert({
            where: { episodeId },
            update: { status: "FAILED", errorMessage },
            create: { episodeId, status: "FAILED", errorMessage },
          })
          .catch(() => {});

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
