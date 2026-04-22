// worker/lib/errors.ts

import type { Context } from "hono";
import type { Env } from "../types";
import { ValidationError } from "./validation";

/** Typed HTTP error for route handlers — avoids string matching in classifyHttpError. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Standard API error response shape. Every error from the API uses this. */
export interface ApiErrorResponse {
  error: string;
  requestId?: string;
  code?: string;
  details?: Array<{ path: string; message: string }>;
}

/**
 * Determines the HTTP status code and user-safe message for a thrown error.
 * Prevents Prisma internals, stack traces, and API keys from leaking to clients.
 */
export function classifyHttpError(err: unknown): { status: number; message: string; code?: string; details?: Array<{ path: string; message: string }> } {
  // Typed HTTP errors from route handlers
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, code: err.code };
  }

  // Validation errors — return 400 with field-level details
  if (err instanceof ValidationError) {
    return { status: 400, message: err.message, code: err.code, details: err.details };
  }

  if (err instanceof Error) {
    const msg = err.message;
    const name = err.name;

    // Prisma P2025: Record not found
    if (name === "PrismaClientKnownRequestError" || name === "NotFoundError") {
      if (msg.includes("P2025") || name === "NotFoundError") {
        return { status: 404, message: "Not found", code: "NOT_FOUND" };
      }
    }

    // Prisma P2002: Unique constraint violation
    if (msg.includes("P2002")) {
      return { status: 409, message: "Resource already exists", code: "CONFLICT" };
    }

    // Prisma P2003: Foreign key constraint violation
    if (msg.includes("P2003")) {
      return { status: 400, message: "Invalid reference", code: "INVALID_REFERENCE" };
    }

    // Stripe errors — Stripe SDK throws Error subclasses whose names start with "Stripe"
    // (StripeError, StripeInvalidRequestError, StripeAPIError, etc.) and whose messages
    // sometimes don't contain the word "Stripe". Match by name prefix to catch them all.
    if (name.startsWith("Stripe") || msg.includes("Stripe")) {
      return {
        status: 502,
        message: `Payment service error: ${msg}`,
        code: "PAYMENT_ERROR",
      };
    }

    // Auth errors
    if (msg.includes("Unauthorized") || msg.includes("No default plan configured")) {
      return { status: 401, message: "Authentication required", code: "UNAUTHORIZED" };
    }
  }

  return { status: 500, message: "Internal server error", code: "INTERNAL_ERROR" };
}
