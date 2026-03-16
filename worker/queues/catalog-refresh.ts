import type { Env } from "../types";
import type { CatalogRefreshMessage } from "../lib/queue-messages";

export async function handleCatalogRefresh(
  batch: MessageBatch<CatalogRefreshMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  // TODO: implement in Task 8
  for (const msg of batch.messages) {
    console.log(`[catalog-refresh] Received: ${msg.body.action}`);
    msg.ack();
  }
}
