import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai-models", () => ({
  getModelConfig: vi.fn(),
  STAGE_LABELS: {
    stt: "Transcription",
    distillation: "Distillation",
    narrative: "Narrative Generation",
    tts: "Audio Generation",
  },
}));

vi.mock("../ai-usage", () => ({
  getModelPricing: vi.fn(),
}));

const { getModelConfig } = await import("../ai-models");
const { getModelPricing } = await import("../ai-usage");
const { resolveStageModel } = await import("../model-resolution");

const mockGetModelConfig = getModelConfig as any;
const mockGetModelPricing = getModelPricing as any;

describe("resolveStageModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns resolved model with all fields", async () => {
    mockGetModelConfig.mockResolvedValueOnce({ provider: "openai", model: "gpt-4o" });
    mockGetModelPricing.mockResolvedValueOnce({ priceInputPerMToken: 5, priceOutputPerMToken: 15 });
    const prisma = {
      aiModelProvider: {
        findFirst: vi.fn().mockResolvedValueOnce({ providerModelId: "gpt-4o-2024-08-06" }),
      },
    };

    const result = await resolveStageModel(prisma, "distillation");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
    expect(result.providerModelId).toBe("gpt-4o-2024-08-06");
    expect(result.pricing).toEqual({ priceInputPerMToken: 5, priceOutputPerMToken: 15 });
  });

  it("throws when no config exists", async () => {
    mockGetModelConfig.mockResolvedValueOnce(null);
    const prisma = { aiModelProvider: { findFirst: vi.fn() } };

    await expect(resolveStageModel(prisma, "distillation"))
      .rejects.toThrow("No AI model configured for Distillation stage");
  });

  it("includes stage label in error for each stage", async () => {
    for (const [stage, label] of [
      ["stt", "Transcription"],
      ["narrative", "Narrative Generation"],
      ["tts", "Audio Generation"],
    ] as const) {
      mockGetModelConfig.mockResolvedValueOnce(null);
      const prisma = { aiModelProvider: { findFirst: vi.fn() } };
      await expect(resolveStageModel(prisma, stage))
        .rejects.toThrow(`No AI model configured for ${label} stage`);
    }
  });

  it("falls back to model name when no DB provider row", async () => {
    mockGetModelConfig.mockResolvedValueOnce({ provider: "anthropic", model: "claude-3-haiku" });
    mockGetModelPricing.mockResolvedValueOnce(null);
    const prisma = {
      aiModelProvider: { findFirst: vi.fn().mockResolvedValueOnce(null) },
    };

    const result = await resolveStageModel(prisma, "distillation");
    expect(result.providerModelId).toBe("claude-3-haiku");
  });

  it("returns null pricing when none exists", async () => {
    mockGetModelConfig.mockResolvedValueOnce({ provider: "groq", model: "llama-3" });
    mockGetModelPricing.mockResolvedValueOnce(null);
    const prisma = {
      aiModelProvider: { findFirst: vi.fn().mockResolvedValueOnce({ providerModelId: "llama-3-8b" }) },
    };

    const result = await resolveStageModel(prisma, "distillation");
    expect(result.pricing).toBeNull();
  });
});
