import { describe, it, expect, vi, beforeEach } from "vitest";
import { initIAP, getCurrentOffering, purchaseProduct } from "../iap";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: vi.fn().mockResolvedValue({}),
    logIn: vi.fn().mockResolvedValue({}),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn().mockResolvedValue({}),
    logOut: vi.fn().mockResolvedValue({}),
  },
}));

describe("iap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    import.meta.env.VITE_REVENUECAT_APPLE_API_KEY = "test-key";
  });

  describe("initIAP", () => {
    it("should do nothing on non-native platform", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(false);
      await initIAP("user1");
      expect(Purchases.configure).not.toHaveBeenCalled();
    });

    it("should call configure on native platform", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      await initIAP("user1");
      expect(Purchases.configure).toHaveBeenCalledWith({
        apiKey: "test-key",
        appUserID: "user1",
      });
    });
  });

  describe("getCurrentOffering", () => {
    it("should return null on non-native platform", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(false);
      const offering = await getCurrentOffering();
      expect(offering).toBeNull();
    });

    it("should map offerings from Purchases", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Purchases.getOfferings as any).mockResolvedValue({
        current: {
          identifier: "offering1",
          serverDescription: "Standard Offering",
          monthly: {
            product: {
              identifier: "prod1",
              title: "Monthly",
              description: "Desc",
              priceString: "$9.99",
              price: 9.99,
              currencyCode: "USD",
            },
          },
          annual: null,
        },
      });

      const offering = await getCurrentOffering();
      expect(offering?.identifier).toBe("offering1");
      expect(offering?.monthly?.identifier).toBe("prod1");
      expect(offering?.annual).toBeNull();
    });
  });

  describe("purchaseProduct", () => {
    it("should throw error if product not found", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      (Purchases.getOfferings as any).mockResolvedValue({
        all: {
          off1: {
            monthly: { product: { identifier: "prod-other" } },
          },
        },
      });

      await expect(purchaseProduct("prod1")).rejects.toThrow("Product prod1 not found");
    });

    it("should call purchasePackage if product found", async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true);
      const mockPkg = { identifier: "pkg1", product: { identifier: "prod1" } };
      (Purchases.getOfferings as any).mockResolvedValue({
        all: {
          off1: {
            monthly: mockPkg,
          },
        },
      });
      (Purchases.purchasePackage as any).mockResolvedValue({
        transaction: { transactionIdentifier: "trans1" },
      });

      const result = await purchaseProduct("prod1");
      expect(result.productIdentifier).toBe("prod1");
      expect(result.originalTransactionId).toBe("trans1");
      expect(Purchases.purchasePackage).toHaveBeenCalledWith({ aPackage: mockPkg });
    });
  });
});
