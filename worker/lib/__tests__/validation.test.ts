import { describe, it, expect, vi } from "vitest";
import { z } from "zod/v4";
import { ValidationError, validateBody } from "../validation";

describe("ValidationError", () => {
  it("constructs with Zod issues and formats details", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = new ValidationError(result.error.issues);
      expect(err.message).toBe("Validation error");
      expect(err.name).toBe("ValidationError");
      expect(err.status).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details.length).toBeGreaterThan(0);
      expect(err.details[0]).toHaveProperty("path");
      expect(err.details[0]).toHaveProperty("message");
    }
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  function mockContext(body: unknown) {
    return {
      req: {
        json: vi.fn().mockResolvedValue(body),
      },
    } as any;
  }

  it("returns parsed data on valid input", async () => {
    const c = mockContext({ name: "test" });
    const result = await validateBody(c, schema);
    expect(result).toEqual({ name: "test" });
  });

  it("strips unknown fields", async () => {
    const c = mockContext({ name: "test", extra: "field" });
    const result = await validateBody(c, schema);
    expect(result).toEqual({ name: "test" });
  });

  it("throws ValidationError on invalid input", async () => {
    const c = mockContext({ name: "" });
    await expect(validateBody(c, schema)).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError with details on missing fields", async () => {
    const c = mockContext({});
    try {
      await validateBody(c, schema);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details[0].path).toBe("name");
    }
  });

  it("handles unparseable JSON gracefully", async () => {
    const c = { req: { json: vi.fn().mockRejectedValue(new Error("bad json")) } } as any;
    await expect(validateBody(c, schema)).rejects.toThrow(ValidationError);
  });
});
