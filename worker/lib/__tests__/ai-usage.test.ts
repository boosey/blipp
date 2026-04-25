import { describe, it, expect, vi } from "vitest";
import {
  calculateTokenCost,
  calculateAudioCost,
  calculateCharCost,
  getModelPricing,
} from "../ai-usage";

describe("ai-usage", () => {
  describe("calculateTokenCost", () => {
    const pricing = {
      priceInputPerMToken: 10, // $10 per 1M tokens
      priceOutputPerMToken: 30, // $30 per 1M tokens
    };

    it("should return null if pricing is missing input price", () => {
      expect(calculateTokenCost(null, 100, 100)).toBeNull();
      expect(calculateTokenCost({ priceInputPerMToken: null }, 100, 100)).toBeNull();
    });

    it("should calculate simple token cost correctly", () => {
      // (100 * 10 + 100 * 30) / 1,000,000 = 4000 / 1,000,000 = 0.004
      const cost = calculateTokenCost(pricing, 100, 100);
      expect(cost).toBeCloseTo(0.004);
    });

    it("should handle cache tokens correctly (Anthropic style)", () => {
      // inputTokens: 1000
      // cacheCreation: 200 (1.25x price)
      // cacheRead: 300 (0.1x price)
      // standardInput: 500 (1.0x price)
      // outputTokens: 500 (standard price)
      
      // cost = (500 * 10 + 200 * 10 * 1.25 + 300 * 10 * 0.1 + 500 * 30) / 1,000,000
      // cost = (5000 + 2500 + 300 + 15000) / 1,000,000
      // cost = 22800 / 1,000,000 = 0.0228
      
      const cost = calculateTokenCost(pricing, 1000, 500, 200, 300);
      expect(cost).toBeCloseTo(0.0228);
    });

    it("should handle missing output pricing", () => {
      const cheapPricing = { priceInputPerMToken: 10 };
      const cost = calculateTokenCost(cheapPricing as any, 100, 100);
      // (100 * 10 + 100 * 0) / 1,000,000 = 0.001
      expect(cost).toBeCloseTo(0.001);
    });
  });

  describe("calculateAudioCost", () => {
    const pricing = { pricePerMinute: 0.006 };

    it("should return null if pricing is missing", () => {
      expect(calculateAudioCost(null, 60)).toBeNull();
    });

    it("should calculate audio cost correctly", () => {
      expect(calculateAudioCost(pricing, 60)).toBeCloseTo(0.006);
      expect(calculateAudioCost(pricing, 30)).toBeCloseTo(0.003);
    });
  });

  describe("calculateCharCost", () => {
    const pricing = { pricePerKChars: 0.015 };

    it("should return null if pricing is missing", () => {
      expect(calculateCharCost(null, 1000)).toBeNull();
    });

    it("should calculate char cost correctly", () => {
      expect(calculateCharCost(pricing, 1000)).toBeCloseTo(0.015);
      expect(calculateCharCost(pricing, 2000)).toBeCloseTo(0.030);
    });
  });

  describe("getModelPricing", () => {
    it("should fetch pricing from prisma", async () => {
      const mockPrisma = {
        aiModelProvider: {
          findFirst: vi.fn().mockResolvedValue({
            pricePerMinute: 0.1,
            priceInputPerMToken: 1.0,
            priceOutputPerMToken: 2.0,
            pricePerKChars: 0.05,
          }),
        },
      };

      const pricing = await getModelPricing(mockPrisma, "model-1", "provider-1");
      
      expect(mockPrisma.aiModelProvider.findFirst).toHaveBeenCalledWith({
        where: { provider: "provider-1", model: { modelId: "model-1" } },
      });
      expect(pricing).toEqual({
        pricePerMinute: 0.1,
        priceInputPerMToken: 1.0,
        priceOutputPerMToken: 2.0,
        pricePerKChars: 0.05,
      });
    });

    it("should return null if model not found", async () => {
      const mockPrisma = {
        aiModelProvider: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const pricing = await getModelPricing(mockPrisma, "model-1", "provider-1");
      expect(pricing).toBeNull();
    });
  });
});
