import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma } from "../../../tests/helpers/mocks";
import {
  resolveVoicePresetId,
  extractProviderConfig,
  loadPresetConfig,
  loadSystemDefaultConfig,
} from "../voice-presets";

let mockPrisma: ReturnType<typeof createMockPrisma>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
});

describe("resolveVoicePresetId", () => {
  it("returns subscription voicePresetId when set", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ voicePresetId: "preset-sub" });
    const result = await resolveVoicePresetId(mockPrisma, "user-1", "podcast-1");
    expect(result).toBe("preset-sub");
  });

  it("falls back to user defaultVoicePresetId when subscription has none", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ voicePresetId: null });
    mockPrisma.user.findUnique.mockResolvedValue({ defaultVoicePresetId: "preset-user" });
    const result = await resolveVoicePresetId(mockPrisma, "user-1", "podcast-1");
    expect(result).toBe("preset-user");
  });

  it("returns null when neither subscription nor user has a preset", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ voicePresetId: null });
    mockPrisma.user.findUnique.mockResolvedValue({ defaultVoicePresetId: null });
    const result = await resolveVoicePresetId(mockPrisma, "user-1", "podcast-1");
    expect(result).toBeNull();
  });

  it("returns null when subscription not found", async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ defaultVoicePresetId: null });
    const result = await resolveVoicePresetId(mockPrisma, "user-1", "podcast-1");
    expect(result).toBeNull();
  });
});

describe("extractProviderConfig", () => {
  const fullConfig = {
    openai: { voice: "nova", instructions: "Speak clearly", speed: 1.1 },
    groq: { voice: "aura-orpheus-en" },
    cloudflare: { voice: "luna" },
  };

  it("returns correct config for openai provider", () => {
    const result = extractProviderConfig(fullConfig, "openai");
    expect(result.voice).toBe("nova");
    expect(result.instructions).toBe("Speak clearly");
    expect(result.speed).toBe(1.1);
  });

  it("returns correct config for groq provider", () => {
    const result = extractProviderConfig(fullConfig, "groq");
    expect(result.voice).toBe("aura-orpheus-en");
  });

  it("throws when provider key is missing from config", () => {
    expect(() => extractProviderConfig({ openai: { voice: "nova" } }, "groq"))
      .toThrow('no mapping for provider "groq"');
  });

  it("throws when preset config is null", () => {
    expect(() => extractProviderConfig(null, "openai"))
      .toThrow("No voice preset config available");
  });

  it("throws when provider voice is empty", () => {
    expect(() => extractProviderConfig({ groq: {} }, "groq"))
      .toThrow('no voice set');
  });
});

describe("loadPresetConfig", () => {
  it("returns config when preset is found and active", async () => {
    const config = { openai: { voice: "coral" }, groq: { voice: "austin" } };
    mockPrisma.voicePreset.findUnique.mockResolvedValue({ config, isActive: true });

    const result = await loadPresetConfig(mockPrisma as any, "preset-1");
    expect(result).toEqual(config);
    expect(mockPrisma.voicePreset.findUnique).toHaveBeenCalledWith({
      where: { id: "preset-1" },
      select: { config: true, isActive: true },
    });
  });

  it("returns null for unknown preset ID", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue(null);
    const result = await loadPresetConfig(mockPrisma as any, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns null for inactive preset", async () => {
    mockPrisma.voicePreset.findUnique.mockResolvedValue({
      config: { openai: { voice: "alloy" } },
      isActive: false,
    });
    const result = await loadPresetConfig(mockPrisma as any, "preset-inactive");
    expect(result).toBeNull();
  });
});

describe("loadSystemDefaultConfig", () => {
  it("returns config from the System Default preset", async () => {
    const config = { openai: { voice: "coral" }, groq: { voice: "diana" }, cloudflare: { voice: "luna" } };
    mockPrisma.voicePreset.findFirst.mockResolvedValue({ config });

    const result = await loadSystemDefaultConfig(mockPrisma as any);
    expect(result).toEqual(config);
    expect(mockPrisma.voicePreset.findFirst).toHaveBeenCalledWith({
      where: { name: "System Default", isSystem: true, isActive: true },
      select: { config: true },
    });
  });

  it("returns null when no system default preset exists", async () => {
    mockPrisma.voicePreset.findFirst.mockResolvedValue(null);
    const result = await loadSystemDefaultConfig(mockPrisma as any);
    expect(result).toBeNull();
  });
});
