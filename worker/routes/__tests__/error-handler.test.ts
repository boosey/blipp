import { describe, it, expect, vi } from "vitest";
import { classifyHttpError } from "../../lib/errors";
import { ValidationError } from "../../lib/validation";

describe("classifyHttpError", () => {
  it("classifies Prisma NotFoundError as 404", () => {
    const err = new Error("Not found");
    err.name = "NotFoundError";
    const result = classifyHttpError(err);
    expect(result).toEqual({ status: 404, message: "Not found", code: "NOT_FOUND" });
  });

  it("classifies Prisma P2025 as 404", () => {
    const err = new Error("An operation failed because it depends on one or more records that were required but not found. P2025");
    err.name = "PrismaClientKnownRequestError";
    const result = classifyHttpError(err);
    expect(result).toEqual({ status: 404, message: "Not found", code: "NOT_FOUND" });
  });

  it("classifies P2002 unique constraint as 409", () => {
    const err = new Error("Unique constraint failed on the constraint: P2002");
    const result = classifyHttpError(err);
    expect(result).toEqual({ status: 409, message: "Resource already exists", code: "CONFLICT" });
  });

  it("classifies P2003 foreign key as 400", () => {
    const err = new Error("Foreign key constraint failed P2003");
    const result = classifyHttpError(err);
    expect(result).toEqual({ status: 400, message: "Invalid reference", code: "INVALID_REFERENCE" });
  });

  it("classifies 'not found' messages as 404", () => {
    const err = new Error("Episode not found");
    const result = classifyHttpError(err);
    expect(result.status).toBe(404);
    expect(result.message).toBe("Episode not found");
  });

  it("classifies generic errors as 500 without leaking details", () => {
    const err = new Error("something broke with database connection string postgres://user:password@host");
    const result = classifyHttpError(err);
    expect(result).toEqual({ status: 500, message: "Internal server error", code: "INTERNAL_ERROR" });
  });

  it("classifies Stripe errors as 502", () => {
    const err = new Error("Stripe API error");
    err.name = "StripeError";
    const result = classifyHttpError(err);
    expect(result.status).toBe(502);
  });

  it("classifies non-Error values as 500", () => {
    const result = classifyHttpError("string error");
    expect(result.status).toBe(500);
  });

  it("classifies ValidationError as 400 with details", () => {
    const err = new ValidationError([
      { path: ["name"], message: "Required", code: "invalid_type", expected: "string", received: "undefined" } as any,
    ]);
    const result = classifyHttpError(err);
    expect(result.status).toBe(400);
    expect(result.message).toBe("Validation error");
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.details).toEqual([{ path: "name", message: "Required" }]);
  });
});
