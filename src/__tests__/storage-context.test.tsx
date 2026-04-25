import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { StorageProvider } from "../contexts/storage-context";

// Controllable Clerk auth state — flipped between renders.
let mockAuthState: { isLoaded: boolean; userId: string | null | undefined } = {
  isLoaded: true,
  userId: "user_a",
};

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => mockAuthState,
}));

// Spy targets — stable across re-renders so we can assert call counts.
const clearAllSpy = vi.fn().mockResolvedValue(undefined);
const initSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/storage-manager", () => ({
  StorageManager: class {
    init = initSpy;
    close = vi.fn();
    getUsage = vi
      .fn()
      .mockResolvedValue({ usedBytes: 0, budgetBytes: 100, entryCount: 0 });
    clearAll = clearAllSpy;
    setBudget = vi.fn();
    setCurrentlyPlaying = vi.fn();
  },
}));

vi.mock("../services/prefetcher", () => ({
  Prefetcher: class {
    dispose = vi.fn();
    setCellularEnabled = vi.fn();
  },
}));

describe("StorageProvider auth-state listener", () => {
  beforeEach(() => {
    clearAllSpy.mockClear();
    initSpy.mockClear();
  });

  async function renderProvider() {
    const result = render(
      <StorageProvider>
        <div>child</div>
      </StorageProvider>,
    );
    // Wait for manager.init() to resolve so isReady = true and the auth
    // effect's `!isReady` guard releases.
    await waitFor(() => expect(initSpy).toHaveBeenCalled());
    // Flush the post-init state update.
    await act(async () => {});
    return result;
  }

  it("does NOT clear cache on first render (signed-in user, no prior state)", async () => {
    mockAuthState = { isLoaded: true, userId: "user_a" };
    await renderProvider();
    expect(clearAllSpy).not.toHaveBeenCalled();
  });

  it("does NOT clear cache when userId stays the same across re-renders", async () => {
    mockAuthState = { isLoaded: true, userId: "user_a" };
    const { rerender } = await renderProvider();

    await act(async () => {
      rerender(
        <StorageProvider>
          <div>child</div>
        </StorageProvider>,
      );
    });

    expect(clearAllSpy).not.toHaveBeenCalled();
  });

  it("clears cache on sign-out (userId transitions from non-null to null)", async () => {
    mockAuthState = { isLoaded: true, userId: "user_a" };
    const { rerender } = await renderProvider();
    expect(clearAllSpy).not.toHaveBeenCalled();

    mockAuthState = { isLoaded: true, userId: null };
    await act(async () => {
      rerender(
        <StorageProvider>
          <div>child</div>
        </StorageProvider>,
      );
    });

    await waitFor(() => expect(clearAllSpy).toHaveBeenCalledTimes(1));
  });

  it("clears cache on user swap (userId transitions to a different non-null id)", async () => {
    mockAuthState = { isLoaded: true, userId: "user_a" };
    const { rerender } = await renderProvider();
    expect(clearAllSpy).not.toHaveBeenCalled();

    mockAuthState = { isLoaded: true, userId: "user_b" };
    await act(async () => {
      rerender(
        <StorageProvider>
          <div>child</div>
        </StorageProvider>,
      );
    });

    await waitFor(() => expect(clearAllSpy).toHaveBeenCalledTimes(1));
  });

  it("does NOT clear cache when transitioning from loading (undefined) to signed-in", async () => {
    mockAuthState = { isLoaded: false, userId: undefined };
    const { rerender } = await renderProvider();
    expect(clearAllSpy).not.toHaveBeenCalled();

    mockAuthState = { isLoaded: true, userId: "user_a" };
    await act(async () => {
      rerender(
        <StorageProvider>
          <div>child</div>
        </StorageProvider>,
      );
    });

    expect(clearAllSpy).not.toHaveBeenCalled();
  });

  it("does NOT clear cache when transitioning from loading (undefined) to signed-out (null)", async () => {
    // Fresh page load on a never-signed-in browser. Don't wipe an empty
    // (or pre-existing) cache just because Clerk resolved to null.
    mockAuthState = { isLoaded: false, userId: undefined };
    const { rerender } = await renderProvider();

    mockAuthState = { isLoaded: true, userId: null };
    await act(async () => {
      rerender(
        <StorageProvider>
          <div>child</div>
        </StorageProvider>,
      );
    });

    expect(clearAllSpy).not.toHaveBeenCalled();
  });
});
