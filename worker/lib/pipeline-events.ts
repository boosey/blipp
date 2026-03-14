type EventLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Write a pipeline event to the database. Fire-and-forget — errors are
 * swallowed and logged to console so event writes never break stage processing.
 */
export async function writeEvent(
  prisma: any,
  stepId: string,
  level: EventLevel,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.pipelineEvent.create({
      data: { stepId, level, message, data },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "warn",
      action: "pipeline_event_write_failed",
      stepId,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
  }
}
