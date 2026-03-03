import { createPrismaClient } from "../lib/db";
import { getConfig } from "../lib/config";
import { createPipelineLogger } from "../lib/logger";
import type { Env } from "../types";

interface TranscriptionMessage {
  episodeId: string;
  transcriptUrl: string;
  requestId?: string;
  type?: "manual";
}

const SKIP_STATUSES = new Set(["TRANSCRIPT_READY", "EXTRACTING_CLAIMS", "COMPLETED"]);

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
      const { episodeId, transcriptUrl, requestId } = msg.body;

      try {
        const existing = await prisma.distillation.findUnique({ where: { episodeId } });
        if (existing && SKIP_STATUSES.has(existing.status)) {
          log.debug("idempotency_skip", { episodeId, existingStatus: existing.status });
          if (requestId) {
            await env.ORCHESTRATOR_QUEUE.send({
              requestId, action: "stage-complete", stage: 2, episodeId,
            });
          }
          msg.ack();
          continue;
        }

        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          update: { status: "FETCHING_TRANSCRIPT", errorMessage: null },
          create: { episodeId, status: "FETCHING_TRANSCRIPT" },
        });

        await prisma.pipelineJob.create({
          data: {
            type: "TRANSCRIPTION",
            status: "IN_PROGRESS",
            entityId: episodeId,
            entityType: "episode",
            stage: 2,
            requestId: requestId ?? null,
            startedAt: new Date(),
          },
        });

        const response = await fetch(transcriptUrl);
        const transcript = await response.text();
        log.info("transcript_fetched", { episodeId, bytes: transcript.length });

        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { status: "TRANSCRIPT_READY", transcript },
        });

        if (requestId) {
          await env.ORCHESTRATOR_QUEUE.send({
            requestId, action: "stage-complete", stage: 2, episodeId,
          });
          log.debug("orchestrator_notified", { episodeId, requestId, stage: 2 });
        }

        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
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
