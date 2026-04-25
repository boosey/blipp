import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, adminFetch } from "../api-client";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "web",
  },
}));

// Mock api-base
vi.mock("../api-base", () => ({
  getApiBase: () => "https://api.test.com",
}));

describe("api-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("apiFetch", () => {
    it("should make a request to the correct path with headers", async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({ data: "ok" }), status: 200 };
      (fetch as any).mockResolvedValue(mockResponse);

      const result = await apiFetch("/test", { token: "secret-token" });

      expect(fetch).toHaveBeenCalledWith("https://api.test.com/api/test", expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Client-Platform": "web",
          "Authorization": "Bearer secret-token",
        }),
      }));
      expect(result).toEqual({ data: "ok" });
    });

    it("should throw an error with message from response if not ok", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: "Invalid parameters" }),
      };
      (fetch as any).mockResolvedValue(mockResponse);

      await expect(apiFetch("/fail")).rejects.toThrow("Invalid parameters");
    });

    it("should handle 204 No Content correctly", async () => {
      const mockResponse = { ok: true, status: 204, json: () => Promise.resolve({}) };
      (fetch as any).mockResolvedValue(mockResponse);

      const result = await apiFetch("/nocontent");
      expect(result).toBeUndefined();
    });
  });

  describe("adminFetch", () => {
    it("should use the /api/admin prefix", async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({ admin: true }), status: 200 };
      (fetch as any).mockResolvedValue(mockResponse);

      await adminFetch("/config");

      expect(fetch).toHaveBeenCalledWith("https://api.test.com/api/admin/config", expect.any(Object));
    });
  });
});
