import { describe, it, expect, vi } from "vitest";
import {
  extractClaims,
  generateNarrative,
  selectClaimsForDuration,
  WORDS_PER_MINUTE,
  type Claim,
  type EpisodeMetadata,
} from "../distillation";
import type { LlmProvider, LlmResult } from "../llm-providers";

function createMockLlmProvider(responseText: string): LlmProvider {
  return {
    name: "MockLLM",
    provider: "mock",
    complete: vi.fn().mockResolvedValue({
      text: responseText,
      model: "mock-model-1",
      inputTokens: 100,
      outputTokens: 50,
    } satisfies LlmResult),
  };
}

const mockEnv = {} as any;
const mockPricing = {
  priceInputPerMToken: 3,
  priceOutputPerMToken: 15,
};

describe("extractClaims", () => {
  const sampleClaims: Claim[] = [
    { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
    { claim: "Costs will drop by 40%", speaker: "Dr. Smith", importance: 8, novelty: 6, excerpt: "Our models show costs will drop by 40% within the next five years as automation scales." },
  ];

  it("should parse claims JSON from LLM response", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    const result = await extractClaims(llm, "Some transcript text", "mock-model-1", 8192, mockEnv, mockPricing);

    expect(result.claims).toEqual(sampleClaims);
    expect(result.claims).toHaveLength(2);
    expect(result.usage).toEqual({
      model: "mock-model-1",
      inputTokens: 100,
      outputTokens: 50,
      cost: (100 * 3 + 50 * 15) / 1_000_000,
    });
  });

  it("should pass the transcript in the prompt", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    await extractClaims(llm, "My specific transcript", "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = call[0];
    expect(messages[0].content).toContain("My specific transcript");
  });

  it("should ask for variable claims with excerpts in the prompt", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    await extractClaims(llm, "My transcript", "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = call[0];
    const prompt = messages[0].content;
    expect(prompt).not.toContain("top 10");
    expect(prompt).toContain("excerpt");
    expect(prompt).toContain("verbatim");
  });

  it("should pass providerModelId and maxTokens to the provider", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    await extractClaims(llm, "transcript", "custom-model", 4096, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("custom-model");
    expect(call[2]).toBe(4096);
  });

  it("should strip markdown fences from response", async () => {
    const llm = createMockLlmProvider("```json\n" + JSON.stringify(sampleClaims) + "\n```");
    const result = await extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv);

    expect(result.claims).toEqual(sampleClaims);
  });

  it("should throw on invalid JSON response", async () => {
    const llm = createMockLlmProvider("not valid json");
    await expect(extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv)).rejects.toThrow("LLM returned invalid JSON");
  });

  it("should unwrap object with claims key", async () => {
    const llm = createMockLlmProvider(JSON.stringify({ claims: sampleClaims }));
    const result = await extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv);
    expect(result.claims).toEqual(sampleClaims);
  });

  it("should unwrap object with results key", async () => {
    const llm = createMockLlmProvider(JSON.stringify({ results: sampleClaims }));
    const result = await extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv);
    expect(result.claims).toEqual(sampleClaims);
  });

  it("should throw on missing required fields", async () => {
    const llm = createMockLlmProvider(JSON.stringify([{ claim: "x" }]));
    await expect(extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv)).rejects.toThrow("LLM output failed schema validation");
  });

  it("should throw on empty array", async () => {
    const llm = createMockLlmProvider("[]");
    await expect(extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv)).rejects.toThrow("LLM output failed schema validation");
  });

  it("should instruct LLM to exclude advertisements from claims", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    await extractClaims(llm, "My transcript", "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    const prompt = call[0][0].content;
    expect(prompt).toContain("EXCLUDE ALL ADVERTISEMENTS");
    expect(prompt).toContain("sponsored segments");
    expect(prompt).toContain("ad reads");
    expect(prompt).toContain("discount codes");
  });

  it("should throw on importance out of range", async () => {
    const llm = createMockLlmProvider(JSON.stringify([{ ...sampleClaims[0], importance: 15 }]));
    await expect(extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv)).rejects.toThrow("LLM output failed schema validation");
  });

  it("should return null cost when no pricing provided", async () => {
    const llm = createMockLlmProvider(JSON.stringify(sampleClaims));
    const result = await extractClaims(llm, "transcript", "mock-model-1", 8192, mockEnv);
    expect(result.usage.cost).toBeNull();
  });
});

describe("generateNarrative", () => {
  const claims: Claim[] = [
    { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
  ];

  it("should return narrative text from LLM", async () => {
    const narrative = "Today we explore how AI is set to transform healthcare...";
    const llm = createMockLlmProvider(narrative);

    const result = await generateNarrative(llm, claims, 3, "mock-model-1", 8192, mockEnv, mockPricing);
    expect(result.narrative).toBe(narrative);
    expect(result.usage).toEqual({
      model: "mock-model-1",
      inputTokens: 100,
      outputTokens: 50,
      cost: (100 * 3 + 50 * 15) / 1_000_000,
    });
  });

  it("should include target word count in the prompt", async () => {
    const llm = createMockLlmProvider("narrative text");
    await generateNarrative(llm, claims, 5, "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = call[0];
    const expectedWords = 5 * WORDS_PER_MINUTE;
    expect(messages[0].content).toContain(`${expectedWords} words`);
  });

  it("should pass providerModelId to the provider", async () => {
    const llm = createMockLlmProvider("narrative text");
    await generateNarrative(llm, claims, 3, "custom-model", 4096, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("custom-model");
    expect(call[2]).toBe(4096);
  });

  it("should include the claims in the prompt", async () => {
    const llm = createMockLlmProvider("narrative text");
    await generateNarrative(llm, claims, 3, "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0][0].content).toContain("AI will transform healthcare");
  });

  it("should use excerpts-aware prompt when claims have excerpt field", async () => {
    const claimsWithExcerpts: Claim[] = [
      { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I believe AI will completely transform how we deliver healthcare services." },
    ];
    const llm = createMockLlmProvider("narrative text");
    await generateNarrative(llm, claimsWithExcerpts, 3, "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0][0].content).toContain("CLAIMS AND EXCERPTS");
    expect(call[0][0].content).toContain("EXCERPT text for accurate detail");
  });

  it("should use legacy prompt when claims lack excerpt field", async () => {
    const legacyClaims = [
      { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7 },
    ] as Claim[];
    const llm = createMockLlmProvider("narrative text");
    await generateNarrative(llm, legacyClaims, 3, "mock-model-1", 8192, mockEnv);

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0][0].content).toContain("CLAIMS:");
    expect(call[0][0].content).not.toContain("CLAIMS AND EXCERPTS");
  });
});

describe("selectClaimsForDuration", () => {
  const claims: Claim[] = Array.from({ length: 10 }, (_, i) => ({
    claim: `Claim ${i + 1}`,
    speaker: "Host",
    importance: 10 - i,
    novelty: Math.max(1, 5 - i),
    excerpt: `Excerpt for claim ${i + 1}`,
  }));

  it("returns minimum 3 claims for 1-minute tier", () => {
    const result = selectClaimsForDuration(claims, 1);
    expect(result).toHaveLength(3);
  });

  it("returns ~2.5 * duration claims for mid-range tiers", () => {
    const result = selectClaimsForDuration(claims, 3);
    expect(result).toHaveLength(8);
  });

  it("caps at available claims count", () => {
    const result = selectClaimsForDuration(claims, 15);
    expect(result).toHaveLength(10);
  });

  it("sorts by composite score (importance 0.7 + novelty 0.3)", () => {
    const result = selectClaimsForDuration(claims, 1);
    expect(result[0].claim).toBe("Claim 1");
    expect(result[1].claim).toBe("Claim 2");
    expect(result[2].claim).toBe("Claim 3");
  });

  it("returns all claims when duration would require more than available", () => {
    const fewClaims = claims.slice(0, 2);
    const result = selectClaimsForDuration(fewClaims, 5);
    expect(result).toHaveLength(2);
  });

  it("handles empty claims array", () => {
    const result = selectClaimsForDuration([], 5);
    expect(result).toHaveLength(0);
  });
});

describe("WORDS_PER_MINUTE", () => {
  it("should be 150", () => {
    expect(WORDS_PER_MINUTE).toBe(150);
  });
});

describe("generateNarrative with metadata", () => {
  const testClaims: Claim[] = [
    { claim: "Test", speaker: "Host", importance: 7, novelty: 5, excerpt: "Some text" },
  ];

  it("includes podcast title in prompt when metadata provided", async () => {
    const llm = createMockLlmProvider("This is a test narrative.");
    const metadata: EpisodeMetadata = {
      podcastTitle: "The Daily",
      episodeTitle: "Election Results",
      publishedAt: new Date("2026-03-12"),
      durationSeconds: 2700,
      briefingMinutes: 5,
    };

    await generateNarrative(llm, testClaims, 5, "model", 8192, {}, null, metadata);

    const prompt = (llm.complete as any).mock.calls[0][0][0].content;
    expect(prompt).toContain("The Daily");
    expect(prompt).toContain("Election Results");
    expect(prompt).toContain("Originally 45 minutes");
    expect(prompt).toContain("5 minutes");
  });

  it("omits metadata block when metadata not provided", async () => {
    const llm = createMockLlmProvider("This is a test narrative.");

    await generateNarrative(llm, testClaims, 5, "model", 8192, {});

    const prompt = (llm.complete as any).mock.calls[0][0][0].content;
    expect(prompt).not.toContain("Begin the narrative with a brief spoken introduction");
  });

  it("handles missing durationSeconds gracefully", async () => {
    const llm = createMockLlmProvider("This is a test narrative.");
    const metadata: EpisodeMetadata = {
      podcastTitle: "Test Pod",
      episodeTitle: "Test Ep",
      publishedAt: new Date(),
      durationSeconds: null,
      briefingMinutes: 3,
    };

    await generateNarrative(llm, testClaims, 3, "model", 8192, {}, null, metadata);

    const prompt = (llm.complete as any).mock.calls[0][0][0].content;
    expect(prompt).toContain("Original length unknown");
  });
});
