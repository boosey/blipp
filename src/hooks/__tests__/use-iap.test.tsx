import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useIAP } from "../use-iap";
import { useUser } from "@clerk/clerk-react";
import { Capacitor } from "@capacitor/core";
import { initIAP, getCurrentOffering } from "@/lib/iap";
import { useApiFetch } from "@/lib/api-client";

vi.mock("@clerk/clerk-react", () => ({
  useUser: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@/lib/iap", () => ({
  initIAP: vi.fn().mockResolvedValue({}),
  getCurrentOffering: vi.fn().mockResolvedValue({ identifier: "offering1" }),
  purchaseProduct: vi.fn(),
  restorePurchases: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/api-client", () => ({
  useApiFetch: vi.fn(),
}));

describe("useIAP", () => {
  const mockApiFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useApiFetch as any).mockReturnValue(mockApiFetch);
    mockApiFetch.mockResolvedValue({ data: { activeSources: [] } });
  });

  it("should initialize on native platform", async () => {
    (useUser as any).mockReturnValue({ isLoaded: true, user: { id: "u1" } });
    (Capacitor.isNativePlatform as any).mockReturnValue(true);

    const { result } = renderHook(() => useIAP());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(initIAP).toHaveBeenCalledWith("u1");
    expect(getCurrentOffering).toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledWith("/iap/billing-status");
    expect(result.current.offering?.identifier).toBe("offering1");
  });

  it("should only load billing status on web", async () => {
    (useUser as any).mockReturnValue({ isLoaded: true, user: { id: "u1" } });
    (Capacitor.isNativePlatform as any).mockReturnValue(false);

    const { result } = renderHook(() => useIAP());

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/iap/billing-status");
    });

    expect(initIAP).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });
});
