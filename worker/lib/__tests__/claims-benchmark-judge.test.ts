import { describe, it, expect, vi } from "vitest";
import {
  computeScores,
  parseJudgeResponse,
  judgeClaims,
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserMessage,
} from "../claims-benchmark-judge";
import type { Claim } from "../distillation";

const baselineClaims: Claim[] = [
  { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 10, novelty: 7, excerpt: "AI will transform healthcare" },
  { claim: "Costs drop 40%", speaker: "Dr. Smith", importance: 6, novelty: 5, excerpt: "Costs will drop by 40%" },
  { claim: "Timeline is 5 years", speaker: "Dr. Smith", importance: 4, novelty: 3, excerpt: "Within five years" },
];

describe("computeScores", () => {
  it("computes 100% coverage when all claims covered", () => {
    const verdicts = [
      { baselineIndex: 0, status: "COVERED" as const, matchedCandidateIndex: 0, reason: "match" },
      { baselineIndex: 1, status: "COVERED" as const, matchedCandidateIndex: 1, reason: "match" },
      { baselineIndex: 2, status: "COVERED" as const, matchedCandidateIndex: 2, reason: "match" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    expect(scores.coverageScore).toBe(100);
    expect(scores.weightedCoverageScore).toBe(100);
  });

  it("computes 0% coverage when all claims missing", () => {
    const verdicts = [
      { baselineIndex: 0, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 1, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 2, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    expect(scores.coverageScore).toBe(0);
    expect(scores.weightedCoverageScore).toBe(0);
  });

  it("counts PARTIALLY_COVERED as covered in simple score, half in weighted", () => {
    const verdicts = [
      { baselineIndex: 0, status: "PARTIALLY_COVERED" as const, matchedCandidateIndex: 0, reason: "partial" },
      { baselineIndex: 1, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
      { baselineIndex: 2, status: "MISSING" as const, matchedCandidateIndex: null, reason: "missing" },
    ];
    const scores = computeScores(verdicts, baselineClaims);
    // 1 of 3 not missing = 33.33%
    expect(scores.coverageScore).toBeCloseTo(33.33, 1);
    // importance: 10*0.5 + 6*0 + 4*0 = 5, total = 20 → 25%
    expect(scores.weightedCoverageScore).toBe(25);
  });
});

describe("parseJudgeResponse", () => {
  it("parses valid JSON response", () => {
    const json = JSON.stringify({
      verdicts: [{ baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" }],
      hallucinations: [],
    });
    const result = parseJudgeResponse(json);
    expect(result.verdicts).toHaveLength(1);
    expect(result.hallucinations).toHaveLength(0);
  });

  it("strips markdown fences", () => {
    const json = "```json\n" + JSON.stringify({
      verdicts: [{ baselineIndex: 0, status: "MISSING", matchedCandidateIndex: null, reason: "not found" }],
      hallucinations: [],
    }) + "\n```";
    const result = parseJudgeResponse(json);
    expect(result.verdicts).toHaveLength(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJudgeResponse("not json")).toThrow("Judge returned invalid JSON");
  });

  it("throws on missing verdicts", () => {
    expect(() => parseJudgeResponse(JSON.stringify({ hallucinations: [] }))).toThrow("schema validation");
  });
});

describe("buildJudgeUserMessage", () => {
  it("includes both claim sets", () => {
    const candidateClaims: Claim[] = [
      { claim: "AI changes medicine", speaker: "Host", importance: 8, novelty: 6, excerpt: "AI changes medicine" },
    ];
    const msg = buildJudgeUserMessage(baselineClaims, candidateClaims);
    expect(msg).toContain("BASELINE CLAIMS");
    expect(msg).toContain("CANDIDATE CLAIMS");
    expect(msg).toContain("AI transforms healthcare");
    expect(msg).toContain("AI changes medicine");
  });
});

describe("JUDGE_SYSTEM_PROMPT", () => {
  it("exists and mentions impartial evaluator", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("impartial evaluator");
  });
});

describe("computeScores edge cases", () => {
  it("handles single claim", () => {
    const claims: Claim[] = [
      { claim: "Test", speaker: "Host", importance: 5, novelty: 3, excerpt: "test" },
    ];
    const verdicts = [
      { baselineIndex: 0, status: "COVERED" as const, matchedCandidateIndex: 0, reason: "match" },
    ];
    const scores = computeScores(verdicts, claims);
    expect(scores.coverageScore).toBe(100);
    expect(scores.weightedCoverageScore).toBe(100);
  });
});

describe("judgeClaims", () => {
  it("calls LLM with system prompt and returns computed scores", async () => {
    const mockLlm = {
      name: "MockLLM",
      provider: "mock",
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          verdicts: [
            { baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" },
          ],
          hallucinations: [],
        }),
        model: "mock-model",
        inputTokens: 500,
        outputTokens: 200,
      }),
    };
    const baseline: Claim[] = [
      { claim: "AI transforms healthcare", speaker: "Dr. Smith", importance: 10, novelty: 7, excerpt: "AI will transform" },
    ];
    const candidate: Claim[] = [
      { claim: "AI changes medicine", speaker: "Host", importance: 8, novelty: 6, excerpt: "AI changes medicine" },
    ];

    const result = await judgeClaims(mockLlm, baseline, candidate, "mock-model", {});
    expect(result.coverageScore).toBe(100);
    expect(result.output.verdicts).toHaveLength(1);
    expect(result.usage.inputTokens).toBe(500);
    // Verify system prompt was passed with caching
    const callOptions = mockLlm.complete.mock.calls[0][4];
    expect(callOptions.system).toContain("impartial evaluator");
    expect(callOptions.cacheSystemPrompt).toBe(true);
  });
});
