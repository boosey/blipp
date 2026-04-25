import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFeed } from "../use-feed";
import { useApiFetch } from "../../lib/api-client";
import { useFetch } from "../../lib/use-fetch";

vi.mock("../../lib/api-client", () => ({
  useApiFetch: vi.fn(),
}));

vi.mock("../../lib/use-fetch", () => ({
  useFetch: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("useFeed", () => {
  const mockApiFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useApiFetch as any).mockReturnValue(mockApiFetch);
    (useFetch as any).mockReturnValue({ data: { total: 0 } });
    
    // Mock sessionStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  it("should load feed items on mount", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "1", status: "READY", createdAt: new Date().toISOString(), episode: { title: "Ep 1" } }] });

    const { result } = renderHook(() => useFeed());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("/feed?limit=50"));
  });

  it("should handle filter changes", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilter("new");
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("listened=false"));
    });
  });

  it("should handle item removal with undo", async () => {
    vi.useFakeTimers();
    const item = { id: "1", status: "READY" as const, createdAt: new Date().toISOString(), episode: { id: "e1" } };
    mockApiFetch.mockResolvedValue({ items: [item] });

    const { result } = renderHook(() => useFeed());
    
    // Wait for initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.removeItem("1");
    });

    expect(result.current.items).toHaveLength(0);

    // After 5s, it should call the API
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001);
    });
    
    expect(mockApiFetch).toHaveBeenCalledWith("/feed/1", { method: "DELETE" });
    vi.useRealTimers();
  });
});
