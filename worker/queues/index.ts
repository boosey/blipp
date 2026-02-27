import { handleFeedRefresh } from "./feed-refresh";
import { handleDistillation } from "./distillation";
import { handleClipGeneration } from "./clip-generation";
import { handleBriefingAssembly } from "./briefing-assembly";
import type { Env } from "../types";

/**
 * Dispatches queue messages to the appropriate consumer based on queue name.
 *
 * @param batch - Cloudflare Queue message batch
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function handleQueue(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
) {
  switch (batch.queue) {
    case "feed-refresh":
      return handleFeedRefresh(batch, env, ctx);
    case "distillation":
      return handleDistillation(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "clip-generation":
      return handleClipGeneration(
        batch as MessageBatch<any>,
        env,
        ctx
      );
    case "briefing-assembly":
      return handleBriefingAssembly(
        batch as MessageBatch<any>,
        env,
        ctx
      );
  }
}

/**
 * Cron trigger handler -- enqueues a feed refresh job.
 *
 * @param event - Cloudflare scheduled event
 * @param env - Worker environment bindings
 * @param ctx - Execution context for background work
 */
export async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
) {
  await env.FEED_REFRESH_QUEUE.send({ type: "cron" });
}
