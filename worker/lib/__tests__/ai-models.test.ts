import { describe, it, expect, vi, beforeEach } from "vitest";
import { AI_MODELS, getModelConfig, type AIStage } from "../ai-models";

vi.mock("../config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "../config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI_MODELS registry", () => {
  it("has entries for all 4 stages", () => {
    expect(AI_MODELS.stt.length).toBeGreaterThan(0);
    expect(AI_MODELS.distillation.length).toBeGreaterThan(0);
    expect(AI_MODELS.narrative.length).toBeGreaterThan(0);
    expect(AI_MODELS.tts.length).toBeGreaterThan(0);
  });

  it("each entry has provider, model, and label", () => {
    for (const stage of Object.values(AI_MODELS)) {
      for (const entry of stage) {
        expect(entry).toHaveProperty("provider");
        expect(entry).toHaveProperty("model");
        expect(entry).toHaveProperty("label");
      }
    }
  });
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
