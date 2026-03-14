import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePagination, parseSort, paginatedResponse } from "../admin-helpers";

function mockContext(query: Record<string, string> = {}) {
  return {
    req: {
      query: (key: string) => query[key],
    },
  } as any;
}

describe("parsePagination", () => {
  it("returns defaults when no query params", () => {
    const result = parsePagination(mockContext());
    expect(result).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it("parses page and pageSize from query", () => {
    const result = parsePagination(mockContext({ page: "3", pageSize: "50" }));
    expect(result).toEqual({ page: 3, pageSize: 50, skip: 100 });
  });

  it("caps pageSize at 100", () => {
    const result = parsePagination(mockContext({ pageSize: "500" }));
    expect(result.pageSize).toBe(100);
  });

  it("calculates skip correctly for page 2", () => {
    const result = parsePagination(mockContext({ page: "2", pageSize: "25" }));
    expect(result.skip).toBe(25);
  });
});

describe("parseSort", () => {
  it("returns default sort when no query param", () => {
    const result = parseSort(mockContext());
    expect(result).toEqual({ createdAt: "desc" });
  });

  it("parses sort field and direction", () => {
    const result = parseSort(mockContext({ sort: "email:asc" }));
    expect(result).toEqual({ email: "asc" });
  });

  it("uses custom default field", () => {
    const result = parseSort(mockContext(), "name");
    expect(result).toEqual({ name: "desc" });
  });

  it("handles sort without direction", () => {
    const result = parseSort(mockContext({ sort: "name" }));
    expect(result).toEqual({ name: "desc" });
  });

  it("should accept valid field from allowlist", () => {
    const result = parseSort(mockContext({ sort: "email:asc" }), "createdAt", ["createdAt", "email"]);
    expect(result).toEqual({ email: "asc" });
  });

  it("should fall back to default for field not in allowlist", () => {
    const result = parseSort(mockContext({ sort: "stripeCustomerId:asc" }), "createdAt", ["createdAt", "email"]);
    expect(result).toEqual({ createdAt: "asc" });
  });

  it("should allow any field when no allowlist provided", () => {
    const result = parseSort(mockContext({ sort: "anything:asc" }));
    expect(result).toEqual({ anything: "asc" });
  });

  it("should normalize invalid sort direction to desc", () => {
    const result = parseSort(mockContext({ sort: "name:INVALID" }));
    expect(result).toEqual({ name: "desc" });
  });
});

describe("paginatedResponse", () => {
  it("returns correct shape with data", () => {
    const result = paginatedResponse([1, 2, 3], 10, 1, 3);
    expect(result).toEqual({
      data: [1, 2, 3],
      total: 10,
      page: 1,
      pageSize: 3,
      totalPages: 4,
    });
  });

  it("calculates totalPages correctly for exact division", () => {
    const result = paginatedResponse([], 100, 1, 25);
    expect(result.totalPages).toBe(4);
  });

  it("rounds up totalPages for partial page", () => {
    const result = paginatedResponse([], 7, 1, 3);
    expect(result.totalPages).toBe(3);
  });

  it("handles zero total", () => {
    const result = paginatedResponse([], 0, 1, 20);
    expect(result.totalPages).toBe(0);
  });
});
