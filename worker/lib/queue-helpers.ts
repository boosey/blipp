import { getConfig } from "./config";

/**
 * Check if a pipeline stage is enabled. Returns true if enabled or if any
 * message in the batch is manual (manual messages bypass the check).
 */
export async function checkStageEnabled(
  prisma: any,
  batch: MessageBatch,
  stageName: string,
  log: { info: (action: string, data: Record<string, unknown>) => void }
): Promise<boolean> {
  const hasManual = batch.messages.some(
    (m) => (m.body as any)?.type === "manual"
  );
  if (hasManual) return true;

  const enabled = await getConfig(
    prisma,
    `pipeline.stage.${stageName}.enabled`,
    true
  );
  if (!enabled) {
    log.info("stage_disabled", { stage: stageName });
    for (const msg of batch.messages) msg.ack();
    return false;
  }
  return true;
}

/** Acknowledge all messages in a batch. */
export function ackAll(
  messages: readonly { ack(): void }[]
): void {
  for (const msg of messages) msg.ack();
}
