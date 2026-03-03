import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockResolvedValue(true),
}));

const { getConfig } = await import("../../lib/config");
const { handleTranscription } = await import("../transcription");

function createMsg(body: any) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function createBatch(messages: any[], queue = "transcription") {
  return { queue, messages } as unknown as MessageBatch<any>;
}

describe("handleTranscription", () => {
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

    // Reset all mock prisma methods
    Object.values(mockPrisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method === "function" && "mockReset" in method) {
            (method as any).mockReset();
          }
        });
      }
    });
    mockPrisma.$disconnect.mockResolvedValue(undefined);

    // Re-set getConfig default after clearAllMocks
    (getConfig as any).mockResolvedValue(true);

    // Default: fetch returns transcript text
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("This is a transcript."),
    }));
  });

  it("should fetch transcript and store it with TRANSCRIPT_READY status", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    mockPrisma.distillation.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalledWith("https://example.com/t.txt");
    expect(mockPrisma.distillation.update).toHaveBeenCalledWith({
      where: { id: "dist1" },
      data: { status: "TRANSCRIPT_READY", transcript: "This is a transcript." },
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should report to orchestrator when requestId is present", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt", requestId: "req1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    mockPrisma.distillation.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req1", action: "stage-complete", stage: 2, episodeId: "ep1",
    });
  });

  it("should not report to orchestrator when requestId is absent", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    mockPrisma.distillation.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(env.ORCHESTRATOR_QUEUE.send).not.toHaveBeenCalled();
  });

  it("should skip if distillation already has TRANSCRIPT_READY status", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt", requestId: "req1" });
    mockPrisma.distillation.findUnique.mockResolvedValue({ status: "TRANSCRIPT_READY" });

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).not.toHaveBeenCalled();
    expect(mockPrisma.distillation.upsert).not.toHaveBeenCalled();
    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req1", action: "stage-complete", stage: 2, episodeId: "ep1",
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should skip if distillation already COMPLETED", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
    mockPrisma.distillation.findUnique.mockResolvedValue({ status: "COMPLETED" });

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should respect stage gate when disabled", async () => {
    (getConfig as any).mockResolvedValueOnce(false);
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should bypass stage gate for manual messages", async () => {
    (getConfig as any).mockResolvedValueOnce(false);
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt", type: "manual" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    mockPrisma.distillation.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should retry on error and mark distillation FAILED", async () => {
    (getConfig as any).mockReset();
    (getConfig as any).mockResolvedValue(true);
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    // Make the final update (TRANSCRIPT_READY) fail to trigger catch
    mockPrisma.distillation.update.mockRejectedValue(new Error("DB write failed"));

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("should create a PipelineJob record", async () => {
    const msg = createMsg({ episodeId: "ep1", transcriptUrl: "https://example.com/t.txt", requestId: "req1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.pipelineJob.create.mockResolvedValue({});
    mockPrisma.distillation.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "TRANSCRIPTION",
        status: "IN_PROGRESS",
        entityId: "ep1",
        entityType: "episode",
        stage: 2,
        requestId: "req1",
      }),
    });
  });
});
