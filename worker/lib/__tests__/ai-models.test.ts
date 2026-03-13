import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModelConfig, getModelRegistry, type AIStage } from "../ai-models";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getModelConfig", () => {
  const mockPrisma = {} as any;

  it("returns config value when set in PlatformConfig", async () => {
    (getConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    const result = await getModelConfig(mockPrisma, "distillation");
    expect(result).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    expect(getConfig).toHaveBeenCalledWith(mockPrisma, "ai.distillation.model", expect.any(Object));
  });

  it("returns fallback default when config is not set", async () => {
    (getConfig as any).mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
    const result = await getModelConfig(mockPrisma, "distillation");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("uses correct config key per stage", async () => {
    (getConfig as any).mockResolvedValue({ provider: "openai", model: "whisper-1" });
    await getModelConfig(mockPrisma, "stt");
    expect(getConfig).toHaveBeenCalledWith(mockPrisma, "ai.stt.model", expect.any(Object));
  });
});

describe("getModelRegistry", () => {
  it("returns models for a given stage from DB", async () => {
    const mockPrisma = { aiModel: { findMany: vi.fn() } };
    mockPrisma.aiModel.findMany.mockResolvedValue([
      {
        id: "m1", stage: "stt", modelId: "whisper-1", label: "Whisper v1",
        developer: "openai", isActive: true, createdAt: new Date(),
        providers: [
          { id: "p1", provider: "openai", providerLabel: "OpenAI",
            pricePerMinute: 0.006, isDefault: true, isAvailable: true },
        ],
      },
    ]);
    const result = await getModelRegistry(mockPrisma, "stt");
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe("whisper-1");
    expect(result[0].providers).toHaveLength(1);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stage: "stt", isActive: true } })
    );
  });

  it("returns all stages when no stage given", async () => {
    const mockPrisma = { aiModel: { findMany: vi.fn().mockResolvedValue([]) } };
    await getModelRegistry(mockPrisma);
    expect(mockPrisma.aiModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });
});
