import * as Sentry from "@sentry/cloudflare";

export function captureException(err: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(err, { extra: context });
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, unknown>): void {
  Sentry.captureMessage(message, { level, extra: context });
}
