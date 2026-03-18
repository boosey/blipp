import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEnv } from "../../../tests/helpers/mocks";

// Mock dependencies before importing the runner
vi.mock("../distillation", () => ({
  extractClaims: vi.fn().mockResolvedValue({
    claims: [
      { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "excerpt" },
    ],
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: 0.01 },
  }),
}));

vi.mock("../claims-benchmark-judge", () => ({
  judgeClaims: vi.fn().mockResolvedValue({
    output: {
      verdicts: [
        { baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" },
      ],
      hallucinations: [],
    },
    coverageScore: 100,
    weightedCoverageScore: 100,
    usage: { model: "judge-model", inputTokens: 500, outputTokens: 200, cost: 0.05 },
  }),
}));

vi.mock("../llm-providers", () => ({
  getLlmProviderImpl: vi.fn().mockReturnValue({
    name: "MockLLM",
    provider: "mock",
    complete: vi.fn(),
  }),
}));

vi.mock("../ai-usage", () => ({
  getModelPricing: vi.fn().mockResolvedValue({
    priceInputPerMToken: 3.0,
    priceOutputPerMToken: 15.0,
  }),
}));

vi.mock("../work-products", () => ({
  wpKey: vi.fn().mockReturnValue("wp/transcript/ep-1.txt"),
  getWorkProduct: vi.fn().mockResolvedValue(
    new TextEncoder().encode("This is the transcript text.").buffer
  ),
}));

import { runNextTask } from "../claims-benchmark-runner";
import { extractClaims } from "../distillation";
import { judgeClaims } from "../claims-benchmark-judge";
import { getWorkProduct } from "../work-products";

function createMockPrisma() {
  return {
    claimsExperiment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    claimsBenchmarkResult: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    aiModelProvider: {
      findFirst: vi.fn().mockResolvedValue({
        providerModelId: "test-provider-model",
        provider: "anthropic",
      }),
    },
  };
}

describe("runNextTask", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockEnv = createMockEnv();

    // Re-set mocks that vi.clearAllMocks() clears
    vi.mocked(extractClaims).mockResolvedValue({
      claims: [
        { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "excerpt" },
      ],
      usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cost: 0.01 },
    });

    vi.mocked(judgeClaims).mockResolvedValue({
      output: {
        verdicts: [
          { baselineIndex: 0, status: "COVERED", matchedCandidateIndex: 0, reason: "match" },
        ],
        hallucinations: [],
      },
      coverageScore: 100,
      weightedCoverageScore: 100,
      usage: { model: "judge-model", inputTokens: 500, outputTokens: 200, cost: 0.05 },
    });

    vi.mocked(getWorkProduct).mockResolvedValue(
      new TextEncoder().encode("This is the transcript text.").buffer
    );

    mockPrisma.aiModelProvider.findFirst.mockResolvedValue({
      providerModelId: "test-provider-model",
      provider: "anthropic",
    });
    mockPrisma.claimsBenchmarkResult.count.mockResolvedValue(0);
  });

  it("returns done when experiment not found", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue(null);
    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);
    expect(result.done).toBe(true);
  });

  it("returns done when experiment is cancelled", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "CANCELLED",
    });
    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);
    expect(result.done).toBe(true);
  });

  it("returns done when experiment is already completed", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "COMPLETED",
      doneTasks: 4,
      totalTasks: 4,
    });
    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);
    expect(result.done).toBe(true);
  });

  it("extraction phase picks baseline first and runs extractClaims", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "RUNNING",
      doneTasks: 0,
      totalTasks: 4,
      totalJudgeTasks: 2,
    });
    mockPrisma.claimsBenchmarkResult.findFirst.mockResolvedValue({
      id: "res-1",
      episodeId: "ep-1",
      model: "claude-sonnet",
      provider: "anthropic",
      isBaseline: true,
      episode: { title: "Test Episode", podcast: { title: "Test Podcast" } },
    });
    mockPrisma.claimsExperiment.update.mockResolvedValue({
      id: "exp-1",
      doneTasks: 1,
      totalTasks: 4,
    });

    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);

    expect(result.done).toBe(false);
    expect(result.phase).toBe("extraction");
    expect(result.progress.done).toBe(1);
    expect(result.progress.total).toBe(4);
    // Verify extractClaims was called
    expect(extractClaims).toHaveBeenCalled();
    // Verify result was updated to RUNNING then COMPLETED
    expect(mockPrisma.claimsBenchmarkResult.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "RUNNING" } })
    );
    expect(mockPrisma.claimsBenchmarkResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
    // Verify R2 put was called for storing claims
    expect(mockEnv.R2.put).toHaveBeenCalled();
  });

  it("transitions to JUDGING when no pending extraction tasks remain", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "RUNNING",
      doneTasks: 4,
      totalTasks: 4,
      totalJudgeTasks: 2,
    });
    // No pending extraction tasks
    mockPrisma.claimsBenchmarkResult.findFirst.mockResolvedValue(null);

    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);

    expect(result.done).toBe(false);
    expect(result.phase).toBe("judging");
    // Verify experiment transitioned to JUDGING
    expect(mockPrisma.claimsExperiment.update).toHaveBeenCalledWith({
      where: { id: "exp-1" },
      data: { status: "JUDGING" },
    });
  });

  it("judging phase loads claims and calls judge", async () => {
    const claimsJson = JSON.stringify([
      { claim: "Test claim", speaker: "Host", importance: 9, novelty: 7, excerpt: "excerpt" },
    ]);
    vi.mocked(getWorkProduct).mockResolvedValue(
      new TextEncoder().encode(claimsJson).buffer
    );

    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "JUDGING",
      judgeModelId: "claude-opus",
      judgeProvider: "anthropic",
      doneJudgeTasks: 0,
      totalJudgeTasks: 2,
    });
    // Pending judge task
    mockPrisma.claimsBenchmarkResult.findFirst
      .mockResolvedValueOnce({
        id: "res-2",
        episodeId: "ep-1",
        model: "gpt-4",
        provider: "openai",
        isBaseline: false,
        r2ClaimsKey: "benchmark/claims/exp-1/ep-1/gpt-4:openai.json",
        episode: { title: "Test Episode", podcast: { title: "Test Podcast" } },
      })
      // Baseline lookup
      .mockResolvedValueOnce({
        id: "res-1",
        isBaseline: true,
        status: "COMPLETED",
        r2ClaimsKey: "benchmark/claims/exp-1/ep-1/claude-sonnet:anthropic.json",
      });

    mockPrisma.claimsExperiment.update.mockResolvedValue({
      id: "exp-1",
      doneJudgeTasks: 1,
    });

    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);

    expect(result.done).toBe(false);
    expect(result.phase).toBe("judging");
    expect(result.progress.done).toBe(1);
    expect(judgeClaims).toHaveBeenCalled();
    // Verify judge verdicts stored in R2
    expect(mockEnv.R2.put).toHaveBeenCalled();
  });

  it("completes experiment when no pending judge tasks remain", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "JUDGING",
      judgeModelId: "claude-opus",
      judgeProvider: "anthropic",
      doneJudgeTasks: 2,
      totalJudgeTasks: 2,
    });
    // No pending judge tasks
    mockPrisma.claimsBenchmarkResult.findFirst.mockResolvedValue(null);

    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);

    expect(result.done).toBe(true);
    expect(result.phase).toBe("judging");
    expect(mockPrisma.claimsExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });

  it("marks result as FAILED on extraction error and increments progress", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "RUNNING",
      doneTasks: 0,
      totalTasks: 4,
      totalJudgeTasks: 2,
    });
    mockPrisma.claimsBenchmarkResult.findFirst.mockResolvedValue({
      id: "res-1",
      episodeId: "ep-1",
      model: "bad-model",
      provider: "anthropic",
      isBaseline: false,
      episode: { title: "Test Episode", podcast: { title: "Test Podcast" } },
    });
    // Make extraction fail
    vi.mocked(extractClaims).mockRejectedValue(new Error("API timeout"));
    mockPrisma.claimsExperiment.update.mockResolvedValue({
      id: "exp-1",
      doneTasks: 1,
      totalTasks: 4,
    });

    const result = await runNextTask("exp-1", mockEnv as any, mockPrisma);

    expect(result.done).toBe(false);
    expect(result.phase).toBe("extraction");
    // Verify result marked FAILED
    expect(mockPrisma.claimsBenchmarkResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "API timeout",
        }),
      })
    );
  });

  it("fails experiment when >50% of tasks fail", async () => {
    mockPrisma.claimsExperiment.findUnique.mockResolvedValue({
      id: "exp-1",
      status: "RUNNING",
      doneTasks: 1,
      totalTasks: 4,
      totalJudgeTasks: 2,
    });
    mockPrisma.claimsBenchmarkResult.findFirst.mockResolvedValue({
      id: "res-2",
      episodeId: "ep-1",
      model: "bad-model",
      provider: "anthropic",
      isBaseline: false,
      episode: { title: "Test Episode", podcast: { title: "Test Podcast" } },
    });
    vi.mocked(extractClaims).mockRejectedValue(new Error("API timeout"));
    mockPrisma.claimsExperiment.update.mockResolvedValue({
      id: "exp-1",
      doneTasks: 2,
      totalTasks: 4,
    });
    // >50% failed
    mockPrisma.claimsBenchmarkResult.count.mockResolvedValue(3);

    await runNextTask("exp-1", mockEnv as any, mockPrisma);

    // Should mark experiment as FAILED
    expect(mockPrisma.claimsExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Over 50% of tasks failed",
        }),
      })
    );
  });
});
