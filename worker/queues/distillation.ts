import Anthropic from "@anthropic-ai/sdk";
import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import { extractClaims } from "../lib/distillation";
import type { Env } from "../types";

/** Shape of a distillation queue message body. */
interface DistillationMessage {
  episodeId: string;
  requestId?: string;
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
    const log = await createPipelineLogger({ stage: "distillation", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    // Check if stage 3 (distillation) is enabled — manual messages bypass this
    const hasManual = batch.messages.some((m) => m.body.type === "manual");
    if (!hasManual) {
      const stageEnabled = await getConfig(
        prisma,
        "pipeline.stage.3.enabled",
        true
      );
      if (!stageEnabled) {
        log.info("stage_disabled", { stage: 3 });
        for (const msg of batch.messages) msg.ack();
        return;
      }
    }

    for (const msg of batch.messages) {
      const { episodeId, requestId } = msg.body;

      try {
        // Check for existing completed distillation (idempotency)
        const existing = await prisma.distillation.findUnique({
          where: { episodeId },
        });

        if (existing?.status === "COMPLETED") {
          log.debug("idempotency_skip", { episodeId, existingStatus: existing.status });
          if (requestId) {
            await env.ORCHESTRATOR_QUEUE.send({
              requestId, action: "stage-complete", stage: 3, episodeId,
            });
          }
          msg.ack();
          continue;
        }

        // Transcript must already be present (fetched by transcription stage)
        if (!existing?.transcript) {
          throw new Error("No transcript available — run transcription first");
        }

        // Update status to EXTRACTING_CLAIMS
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "EXTRACTING_CLAIMS", errorMessage: null },
        });

        // Extract claims via Claude (Pass 1)
        const elapsed = log.timer("claude_extraction");
        const claims = await extractClaims(anthropic, existing.transcript);
        elapsed();
        log.info("claims_extracted", { episodeId, claimCount: claims.length });

        // Mark as completed with claims
        await prisma.distillation.update({
          where: { id: existing.id },
          data: { status: "COMPLETED", claimsJson: claims as any },
        });

        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId, action: "stage-complete", stage: 3, episodeId,
          });
          log.debug("orchestrator_notified", { episodeId, requestId, stage: 3 });
        }

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

        log.error("episode_error", { episodeId }, err);
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
