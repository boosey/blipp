import { z } from "zod/v4";
import type { Context } from "hono";

export class ValidationError extends Error {
  status = 400;
  code = "VALIDATION_ERROR";
  details: Array<{ path: string; message: string }>;

  constructor(issues: z.core.$ZodIssue[]) {
    super("Validation error");
    this.name = "ValidationError";
    this.details = issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
  }
}

export async function validateBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => ({}));
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}
