import { describe, it, expect, vi } from "vitest";
import {
  extractClaims,
  generateNarrative,
  WORDS_PER_MINUTE,
  type Claim,
} from "../distillation";

function createMockAnthropicClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        model: "claude-sonnet-4-20250514",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

describe("extractClaims", () => {
  const sampleClaims: Claim[] = [
    { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
    { claim: "Costs will drop by 40%", speaker: "Dr. Smith", importance: 8, novelty: 6, excerpt: "Our models show costs will drop by 40% within the next five years as automation scales." },
  ];

  it("should parse claims JSON from Claude response", async () => {
    const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
    const result = await extractClaims(client, "Some transcript text");

    expect(result.claims).toEqual(sampleClaims);
    expect(result.claims).toHaveLength(2);
    expect(result.usage).toEqual({
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      cost: (100 * 3 + 50 * 15) / 1_000_000,
    });
  });

  it("should pass the transcript in the prompt", async () => {
    const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
    await extractClaims(client, "My specific transcript");

    const call = client.messages.create.mock.calls[0][0];
    expect(call.messages[0].content).toContain("My specific transcript");
  });

  it("should ask for variable claims with excerpts in the prompt", async () => {
    const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
    await extractClaims(client, "My transcript");

    const call = client.messages.create.mock.calls[0][0];
    const prompt = call.messages[0].content;
    // Should NOT ask for fixed "top 10"
    expect(prompt).not.toContain("top 10");
    // Should ask for excerpts
    expect(prompt).toContain("excerpt");
    expect(prompt).toContain("verbatim");
    // Should use higher max_tokens
    expect(call.max_tokens).toBe(8192);
  });

  it("should use default model when none provided", async () => {
    const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
    await extractClaims(client, "transcript");

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-20250514");
  });

  it("should use provided model when specified", async () => {
    const client = createMockAnthropicClient(JSON.stringify(sampleClaims));
    await extractClaims(client, "transcript", "claude-haiku-4-5-20251001");

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });

  it("should throw on invalid JSON response", async () => {
    const client = createMockAnthropicClient("not valid json");
    await expect(extractClaims(client, "transcript")).rejects.toThrow();
  });
});

describe("generateNarrative", () => {
  const claims: Claim[] = [
    { claim: "AI will transform healthcare", speaker: "Dr. Smith", importance: 9, novelty: 7, excerpt: "I truly believe that AI will transform healthcare in ways we can barely imagine right now." },
  ];

  it("should return narrative text from Claude", async () => {
    const narrative = "Today we explore how AI is set to transform healthcare...";
    const client = createMockAnthropicClient(narrative);

    const result = await generateNarrative(client, claims, 3);
    expect(result.narrative).toBe(narrative);
    expect(result.usage).toEqual({
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      cost: (100 * 3 + 50 * 15) / 1_000_000,
    });
  });

  it("should include target word count in the prompt", async () => {
    const client = createMockAnthropicClient("narrative text");
    await generateNarrative(client, claims, 5);

    const call = client.messages.create.mock.calls[0][0];
    const expectedWords = 5 * WORDS_PER_MINUTE;
    expect(call.messages[0].content).toContain(`${expectedWords} words`);
  });

  it("should use default model when none provided", async () => {
    const client = createMockAnthropicClient("narrative text");
    await generateNarrative(client, claims, 3);

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-20250514");
  });

  it("should use provided model when specified", async () => {
    const client = createMockAnthropicClient("narrative text");
    await generateNarrative(client, claims, 3, "claude-haiku-4-5-20251001");

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });

  it("should include the claims in the prompt", async () => {
    const client = createMockAnthropicClient("narrative text");
    await generateNarrative(client, claims, 3);

    const call = client.messages.create.mock.calls[0][0];
    expect(call.messages[0].content).toContain("AI will transform healthcare");
  });
});

describe("WORDS_PER_MINUTE", () => {
  it("should be 150", () => {
    expect(WORDS_PER_MINUTE).toBe(150);
  });
});
