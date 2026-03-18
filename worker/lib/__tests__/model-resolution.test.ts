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

const mockCheckCircuit = vi.fn();
class MockCircuitOpenError extends Error {
  constructor(public readonly provider: string) {
    super(`Circuit breaker OPEN for provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}
vi.mock("../circuit-breaker", () => ({
  checkCircuit: (...args: any[]) => mockCheckCircuit(...args),
  CircuitOpenError: MockCircuitOpenError,
}));

const mockGetConfig = vi.fn();
vi.mock("../config", () => ({
  getConfig: (...args: any[]) => mockGetConfig(...args),
}));

const { getModelConfig } = await import("../ai-models");
const { getModelPricing } = await import("../ai-usage");
const { resolveStageModel, resolveModelChain } = await import("../model-resolution");

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

describe("resolveModelChain", () => {
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCircuit.mockImplementation(() => {}); // default: circuit closed
    mockGetModelPricing.mockResolvedValue(null);
    prisma = {
      platformConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      aiModelProvider: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
  });

  function setConfigForKeys(configs: Record<string, { provider: string; model: string } | null>) {
    mockGetConfig.mockImplementation((_prisma: any, key: string, _fallback: any) => {
      return Promise.resolve(configs[key] ?? null);
    });
  }

  it("chain with primary only returns 1-item array", async () => {
    setConfigForKeys({
      "ai.distillation.model": { provider: "openai", model: "gpt-4o" },
    });
    prisma.aiModelProvider.findFirst.mockResolvedValue({ providerModelId: "gpt-4o-2024-08-06" });

    const chain = await resolveModelChain(prisma, "distillation");

    expect(chain).toHaveLength(1);
    expect(chain[0].provider).toBe("openai");
    expect(chain[0].model).toBe("gpt-4o");
    expect(chain[0].providerModelId).toBe("gpt-4o-2024-08-06");
  });

  it("chain with primary + secondary returns 2-item array in order", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": { provider: "deepgram", model: "nova-3" },
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(2);
    expect(chain[0].provider).toBe("groq");
    expect(chain[0].model).toBe("whisper-turbo");
    expect(chain[1].provider).toBe("deepgram");
    expect(chain[1].model).toBe("nova-3");
  });

  it("chain with primary + secondary + tertiary returns 3-item array", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": { provider: "deepgram", model: "nova-3" },
      "ai.stt.model.tertiary": { provider: "openai", model: "whisper-1" },
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(3);
    expect(chain[0].provider).toBe("groq");
    expect(chain[1].provider).toBe("deepgram");
    expect(chain[2].provider).toBe("openai");
  });

  it("primary circuit-broken, secondary available returns [secondary] only", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": { provider: "deepgram", model: "nova-3" },
    });
    mockCheckCircuit.mockImplementation((provider: string) => {
      if (provider === "groq") throw new MockCircuitOpenError("groq");
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(1);
    expect(chain[0].provider).toBe("deepgram");
    expect(chain[0].model).toBe("nova-3");
  });

  it("all models circuit-broken returns empty array", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": { provider: "deepgram", model: "nova-3" },
    });
    mockCheckCircuit.mockImplementation((provider: string) => {
      throw new MockCircuitOpenError(provider);
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(0);
  });

  it("secondary config is null, returns [primary] only", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": null,
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(1);
    expect(chain[0].provider).toBe("groq");
  });

  it("tertiary has null provider, skipped", async () => {
    setConfigForKeys({
      "ai.stt.model": { provider: "groq", model: "whisper-turbo" },
      "ai.stt.model.secondary": { provider: "deepgram", model: "nova-3" },
      "ai.stt.model.tertiary": { provider: null as any, model: "whisper-1" },
    });

    const chain = await resolveModelChain(prisma, "stt");

    expect(chain).toHaveLength(2);
    expect(chain[0].provider).toBe("groq");
    expect(chain[1].provider).toBe("deepgram");
  });
});
