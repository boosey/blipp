import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

// LLM provider — captures the .complete() call for assertion.
const mockComplete = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: "# Synthesizing this week's signal\n\nDraft body here.\n\n## Sources\n- [Ep — Show](/p/show/ep)",
    model: "test-narrative-model",
    inputTokens: 200,
    outputTokens: 300,
  })
);
vi.mock("../../lib/llm-providers", () => ({
  getLlmProviderImpl: vi.fn().mockReturnValue({ name: "MockLLM", provider: "anthropic", complete: mockComplete }),
}));

vi.mock("../../lib/model-resolution", () => ({
  resolveModelChain: vi.fn().mockResolvedValue([
    {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      providerModelId: "claude-sonnet-4-20250514",
      pricing: null,
      limits: null,
    },
  ]),
}));

vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn(({ episodeId }: { episodeId: string }) => `wp/claims/${episodeId}.json`),
  getWorkProduct: vi.fn(),
}));

import { runPulseGenerate } from "../pulse-generate";
import { resolveModelChain } from "../../lib/model-resolution";
import { getWorkProduct } from "../../lib/work-products";

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockEnv: ReturnType<typeof createMockEnv>;
let mockLogger: any;

function makeDistillation(id: string, embedding: number[]) {
  return {
    id: `dist-${id}`,
    episodeId: `ep-${id}`,
    claimsEmbedding: embedding,
    updatedAt: new Date(),
    episode: {
      id: `ep-${id}`,
      slug: `episode-${id}`,
      title: `Episode ${id}`,
      podcast: { slug: `show-${id}`, title: `Show ${id}` },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = createMockPrisma();
  mockEnv = createMockEnv();
  mockLogger = {
    debug: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  };

  // Default: gate is met (≥6 published, ≥4 human).
  mockPrisma.pulsePost.count
    .mockResolvedValueOnce(8) // PUBLISHED total
    .mockResolvedValueOnce(5); // PUBLISHED & HUMAN

  mockPrisma.pulseEditor.findFirst.mockResolvedValue({
    id: "editor-1",
    slug: "alex",
    name: "Alex",
  });

  // Default: 3 distillations, all in same cluster.
  const sameVec = [1, 0, 0];
  mockPrisma.distillation.findMany.mockResolvedValue([
    makeDistillation("a", sameVec),
    makeDistillation("b", sameVec),
    makeDistillation("c", sameVec),
  ]);

  // R2 returns claims for each episode.
  (getWorkProduct as any).mockImplementation(async (_r2: any, key: string) => {
    const id = key.replace("wp/claims/ep-", "").replace(".json", "");
    return new TextEncoder().encode(
      JSON.stringify([{ claim: `Claim from ${id}` }, { claim: "Second claim" }])
    ).buffer;
  });

  mockPrisma.pulsePost.create.mockResolvedValue({
    id: "post-new",
    slug: "pulse-draft-2026-04-27-abc123",
    title: "Synthesizing this week's signal",
  });
  mockPrisma.episodePulsePost.createMany.mockResolvedValue({ count: 3 });
});

describe("runPulseGenerate — editorial gate", () => {
  it("no-ops when published count < 6", async () => {
    mockPrisma.pulsePost.count.mockReset();
    mockPrisma.pulsePost.count
      .mockResolvedValueOnce(5) // PUBLISHED total
      .mockResolvedValueOnce(5); // PUBLISHED & HUMAN

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result).toEqual(
      expect.objectContaining({
        generated: false,
        reason: "editorial_threshold_not_met",
        publishedCount: 5,
        humanPublishedCount: 5,
      })
    );
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "pulse_generate_gated",
      expect.objectContaining({ publishedCount: 5, humanPublishedCount: 5 })
    );
  });

  it("no-ops when human-published count < 4 even if total ≥ 6", async () => {
    mockPrisma.pulsePost.count.mockReset();
    mockPrisma.pulsePost.count
      .mockResolvedValueOnce(10) // PUBLISHED total
      .mockResolvedValueOnce(3); // PUBLISHED & HUMAN

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result.generated).toBe(false);
    expect(result.reason).toBe("editorial_threshold_not_met");
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
  });

  it("queries PulsePost.count with correct filters", async () => {
    await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(mockPrisma.pulsePost.count).toHaveBeenNthCalledWith(1, {
      where: { status: "PUBLISHED" },
    });
    expect(mockPrisma.pulsePost.count).toHaveBeenNthCalledWith(2, {
      where: { status: "PUBLISHED", mode: "HUMAN" },
    });
  });
});

describe("runPulseGenerate — preconditions after gate", () => {
  it("no-ops when no READY editor exists", async () => {
    mockPrisma.pulseEditor.findFirst.mockResolvedValue(null);

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result).toEqual({ generated: false, reason: "no_ready_editor" });
    expect(mockPrisma.pulseEditor.findFirst).toHaveBeenCalledWith({
      where: { status: "READY" },
      orderBy: { createdAt: "asc" },
      select: expect.any(Object),
    });
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
  });

  it("no-ops when corpus has fewer than 3 embedded distillations", async () => {
    mockPrisma.distillation.findMany.mockResolvedValue([
      makeDistillation("a", [1, 0, 0]),
      makeDistillation("b", [1, 0, 0]),
    ]);

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result).toEqual({ generated: false, reason: "insufficient_corpus" });
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
  });

  it("no-ops when no LLM chain configured for the narrative stage", async () => {
    (resolveModelChain as any).mockResolvedValueOnce([]);

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result).toEqual({ generated: false, reason: "no_llm_configured" });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
  });
});

describe("runPulseGenerate — clustering picks largest cluster", () => {
  it("selects the largest cluster when distillations split into multiple groups", async () => {
    // Cluster A: 3 items, all [1,0,0] (similar)
    // Cluster B: 2 items, both [0,1,0] (similar to each other, orthogonal to A)
    mockPrisma.distillation.findMany.mockResolvedValue([
      makeDistillation("A1", [1, 0, 0]),
      makeDistillation("A2", [1, 0, 0]),
      makeDistillation("A3", [1, 0, 0]),
      makeDistillation("B1", [0, 1, 0]),
      makeDistillation("B2", [0, 1, 0]),
    ]);

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result.generated).toBe(true);
    expect(result.clusterSize).toBe(3); // largest cluster wins

    // Sources persisted via the join table — verify only A-cluster episodes.
    const createManyArgs = (mockPrisma.episodePulsePost.createMany as any).mock.calls[0][0];
    const linkedIds = createManyArgs.data.map((d: any) => d.episodeId).sort();
    expect(linkedIds).toEqual(["ep-A1", "ep-A2", "ep-A3"]);
  });

  it("no-ops when largest cluster has fewer than 3 episodes", async () => {
    // Two pairs — neither qualifies (orthogonal vectors don't merge).
    mockPrisma.distillation.findMany.mockResolvedValue([
      makeDistillation("a", [1, 0, 0]),
      makeDistillation("b", [1, 0, 0]),
      makeDistillation("c", [0, 1, 0]),
      makeDistillation("d", [0, 1, 0]),
    ]);

    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result).toEqual({ generated: false, reason: "no_qualifying_cluster" });
    expect(mockPrisma.pulsePost.create).not.toHaveBeenCalled();
  });
});

describe("runPulseGenerate — happy path output", () => {
  it("creates PulsePost with status=DRAFT, mode=AI_ASSISTED, editor attribution, and generationMeta", async () => {
    const result = await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(result.generated).toBe(true);
    expect(result.postId).toBe("post-new");

    const createCall = (mockPrisma.pulsePost.create as any).mock.calls[0][0];
    expect(createCall.data.status).toBe("DRAFT");
    expect(createCall.data.mode).toBe("AI_ASSISTED");
    expect(createCall.data.editorId).toBe("editor-1");
    expect(createCall.data.body).toContain("Synthesizing this week's signal");
    // Title extracted from leading markdown heading.
    expect(createCall.data.title).toBe("Synthesizing this week's signal");
    expect(createCall.data.slug).toMatch(/^pulse-draft-\d{4}-\d{2}-\d{2}-/);

    expect(createCall.data.generationMeta).toEqual(
      expect.objectContaining({
        mode: "ai_assisted",
        provider: "anthropic",
        model: "test-narrative-model",
        inputTokens: 200,
        outputTokens: 300,
        clusterSize: 3,
        clusterEpisodeIds: expect.arrayContaining(["ep-a", "ep-b", "ep-c"]),
        sourceEpisodeIds: expect.arrayContaining(["ep-a", "ep-b", "ep-c"]),
        editorialGate: { publishedCount: 8, humanPublishedCount: 5 },
        weeklyWindow: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      })
    );
  });

  it("links cited episodes via EpisodePulsePost.createMany with displayOrder", async () => {
    await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    const linkArgs = (mockPrisma.episodePulsePost.createMany as any).mock.calls[0][0];
    expect(linkArgs).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({ pulsePostId: "post-new", displayOrder: expect.any(Number) }),
      ]),
      skipDuplicates: true,
    });
    expect(linkArgs.data).toHaveLength(3);
    const orders = linkArgs.data.map((d: any) => d.displayOrder).sort();
    expect(orders).toEqual([0, 1, 2]);
  });

  it("calls the LLM with a system prompt that constrains quoting + a sources index", async () => {
    await runPulseGenerate(mockPrisma, mockEnv, mockLogger);

    expect(mockComplete).toHaveBeenCalledTimes(1);
    const [messages, , , , options] = mockComplete.mock.calls[0];
    expect(options?.system).toMatch(/draft/i);
    expect(options?.system).toMatch(/Do NOT reproduce transcripts/);
    expect(messages[0].content).toContain("/p/show-a/episode-a");
    expect(messages[0].content).toContain("/p/show-b/episode-b");
  });
});
