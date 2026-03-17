import type { Env } from "../types";

/**
 * Binding name → queue name mapping.
 * Must match the producers in wrangler.jsonc.
 */
const QUEUE_BINDINGS: Record<string, string> = {
  FEED_REFRESH_QUEUE: "feed-refresh",
  TRANSCRIPTION_QUEUE: "transcription",
  DISTILLATION_QUEUE: "distillation",
  NARRATIVE_GENERATION_QUEUE: "narrative-generation",
  AUDIO_GENERATION_QUEUE: "clip-generation",
  BRIEFING_ASSEMBLY_QUEUE: "briefing-assembly",
  ORCHESTRATOR_QUEUE: "orchestrator",
  CATALOG_REFRESH_QUEUE: "catalog-refresh",
  CONTENT_PREFETCH_QUEUE: "content-prefetch",
};

/**
 * Detects local development by checking ENVIRONMENT env var.
 * Set `ENVIRONMENT=development` in `.dev.vars` to enable.
 */
function isLocalDev(env: Env): boolean {
  return env.ENVIRONMENT === "development";
}

/**
 * Creates a fake MessageBatch that the existing queue handlers accept.
 */
function createFakeBatch<T>(queue: string, body: T): MessageBatch<T> {
  return {
    queue,
    messages: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        body,
        ack() {},
        retry() {},
      },
    ],
  } as unknown as MessageBatch<T>;
}

/**
 * Replaces queue bindings with shims that directly invoke handlers in local dev.
 *
 * In production (or when ENVIRONMENT !== "development"), returns env unchanged.
 * In local dev, each queue's `.send()` method is replaced with a function that:
 *   1. Creates a fake MessageBatch with the message body
 *   2. Dynamically imports the queue dispatcher
 *   3. Calls handleQueue() directly (synchronous pipeline execution)
 *
 * Delayed sends (e.g. briefing-assembly re-queue) are skipped with a warning
 * to avoid infinite loops in local dev.
 */
export function shimQueuesForLocalDev(env: Env, ctx: ExecutionContext): Env {
  if (!isLocalDev(env)) return env;

  const shimmed = { ...env };

  for (const [binding, queueName] of Object.entries(QUEUE_BINDINGS)) {
    const sendOne = async (body: unknown, options?: { delaySeconds?: number }) => {
      if (options?.delaySeconds) {
        console.log(
          JSON.stringify({
            level: "info",
            stage: "local-queue-shim",
            action: "delayed_send_skipped",
            queue: queueName,
            delaySeconds: options.delaySeconds,
            ts: new Date().toISOString(),
          })
        );
        return;
      }

      console.log(
        JSON.stringify({
          level: "debug",
          stage: "local-queue-shim",
          action: "direct_dispatch",
          queue: queueName,
          ts: new Date().toISOString(),
        })
      );

      // Fire-and-forget via waitUntil so .send() returns immediately
      // (matches production behavior where queue.send() is non-blocking)
      const work = import("../queues/index").then(({ handleQueue }) => {
        const batch = createFakeBatch(queueName, body);
        return handleQueue(batch, shimmed, ctx);
      });
      ctx.waitUntil(work);
    };

    (shimmed as any)[binding] = {
      send: sendOne,
      sendBatch: async (messages: { body: unknown; delaySeconds?: number }[]) => {
        for (const msg of messages) {
          await sendOne(msg.body, msg.delaySeconds ? { delaySeconds: msg.delaySeconds } : undefined);
        }
      },
    };
  }

  return shimmed;
}
