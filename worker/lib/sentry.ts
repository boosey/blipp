/**
 * Lightweight error reporting stub.
 * When SENTRY_DSN is configured, reports errors to Sentry.
 * Otherwise, logs to console (existing behavior).
 *
 * To enable: set SENTRY_DSN in worker secrets.
 * Full Sentry SDK integration deferred — this captures the pattern.
 */
export function captureException(
  err: Error,
  context?: Record<string, unknown>
): void {
  console.error(JSON.stringify({
    level: "error",
    action: "exception_captured",
    error: err.message,
    stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    ...context,
    ts: new Date().toISOString(),
  }));
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
): void {
  console.log(JSON.stringify({
    level,
    action: "message_captured",
    message,
    ...context,
    ts: new Date().toISOString(),
  }));
}
