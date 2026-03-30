import { createPrismaClient } from "../lib/db";
import { createPipelineLogger, logDbError } from "../lib/logger";
import { checkStageEnabled } from "../lib/queue-helpers";
import { assembleBriefings } from "../lib/briefing-assembly";
import type { BriefingAssemblyMessage } from "../lib/queue-messages";
import type { Env } from "../types";

/**
 * Queue consumer for briefing assembly (stage 5).
 *
 * This is the terminal pipeline stage. Delegates to the shared
 * assembleBriefings() function which can also be called directly
 * (e.g. from the share endpoint for instant assembly).
 */
export async function handleBriefingAssembly(
  batch: MessageBatch<BriefingAssemblyMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    const log = await createPipelineLogger({ stage: "briefing-assembly", prisma });
    log.info("batch_start", { messageCount: batch.messages.length });

    if (!(await checkStageEnabled(prisma, batch, "BRIEFING_ASSEMBLY", log))) return;

    for (const msg of batch.messages) {
      const { requestId } = msg.body;

      try {
        const request = await prisma.briefingRequest.findUnique({
          where: { id: requestId },
        });

        if (!request) {
          log.info("request_not_found", { requestId });
          msg.ack();
          continue;
        }
        if (["COMPLETED", "COMPLETED_DEGRADED", "FAILED"].includes(request.status)) {
          log.info("request_already_terminal", { requestId, status: request.status });
          msg.ack();
          continue;
        }

        await assembleBriefings(prisma, requestId, log);
        msg.ack();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("assembly_error", { requestId }, err);

        await prisma.feedItem
          .updateMany({
            where: { requestId },
            data: { status: "FAILED", errorMessage },
          })
          .catch(logDbError("briefing-assembly", "feedItem", requestId));

        await prisma.briefingRequest
          .updateMany({
            where: {
              id: requestId,
              status: { notIn: ["COMPLETED", "COMPLETED_DEGRADED", "FAILED"] },
            },
            data: { status: "FAILED", errorMessage },
          })
          .catch(logDbError("briefing-assembly", "briefingRequest", requestId));

        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
