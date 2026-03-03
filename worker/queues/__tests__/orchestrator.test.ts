import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("../../lib/clip-cache", () => ({
  getClip: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
  putBriefing: vi.fn().mockResolvedValue("briefings/user1/2026-03-03.mp3"),
}));

vi.mock("../../lib/mp3-concat", () => ({
  concatMp3Buffers: vi.fn().mockReturnValue(new ArrayBuffer(20)),
}));

vi.mock("../../lib/time-fitting", () => ({
  allocateWordBudget: vi.fn().mockReturnValue([
    { index: 0, allocatedWords: 150, durationTier: 1 },
  ]),
}));

const { handleOrchestrator } = await import("../orchestrator");
const { getClip } = await import("../../lib/clip-cache");

function createMsg(body: any) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function createBatch(messages: any[], queue = "orchestrator") {
  return { queue, messages } as unknown as MessageBatch<any>;
}

describe("handleOrchestrator", () => {
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

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
  });

  it("should skip COMPLETED requests", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "COMPLETED", podcastIds: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.briefingRequest.update).not.toHaveBeenCalled();
  });

  it("should skip FAILED requests", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "FAILED", podcastIds: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
  });

  it("should set PENDING request to PROCESSING", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PENDING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue(null);
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
      where: { id: "req1" },
      data: { status: "PROCESSING" },
    });
  });

  it("should dispatch to TRANSCRIPTION_QUEUE when episode has no distillation", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep1", podcastId: "pod1", transcriptUrl: "https://example.com/t.txt",
      distillation: null, clips: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledWith({
      episodeId: "ep1", transcriptUrl: "https://example.com/t.txt", requestId: "req1",
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should dispatch to DISTILLATION_QUEUE when transcript is ready", async () => {
    const msg = createMsg({ requestId: "req1", action: "stage-complete" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep1", podcastId: "pod1",
      distillation: { id: "d1", status: "TRANSCRIPT_READY", transcript: "text" },
      clips: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(env.DISTILLATION_QUEUE.send).toHaveBeenCalledWith({
      episodeId: "ep1", requestId: "req1",
    });
  });

  it("should dispatch to CLIP_GENERATION_QUEUE when distillation completed but no clip", async () => {
    const msg = createMsg({ requestId: "req1", action: "stage-complete" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep1", podcastId: "pod1",
      distillation: { id: "d1", status: "COMPLETED", claimsJson: [{ claim: "test" }] },
      clips: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(env.CLIP_GENERATION_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: "ep1", distillationId: "d1", requestId: "req1",
      })
    );
  });

  it("should assemble briefing when all episodes are ready", async () => {
    const msg = createMsg({ requestId: "req1", action: "stage-complete" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep1", podcastId: "pod1", title: "Episode 1",
      distillation: { id: "d1", status: "COMPLETED", transcript: "words here", claimsJson: [] },
      clips: [{ id: "c1", status: "COMPLETED", durationTier: 1 }],
    });
    mockPrisma.briefing.create.mockResolvedValue({ id: "brief1" });
    mockPrisma.briefingSegment.create.mockResolvedValue({});
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(mockPrisma.briefing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        targetMinutes: 5,
        status: "COMPLETED",
      }),
    });
    expect(mockPrisma.briefingSegment.create).toHaveBeenCalled();
    expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
      where: { id: "req1" },
      data: { status: "COMPLETED", briefingId: "brief1" },
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should mark request FAILED when no episodes available", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue(null);
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
      where: { id: "req1" },
      data: { status: "FAILED", errorMessage: "No episodes available for briefing" },
    });
  });

  it("should wait (ack without action) for in-progress stages", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", podcastIds: ["pod1"], userId: "u1", targetMinutes: 5,
    });
    mockPrisma.episode.findFirst.mockResolvedValue({
      id: "ep1", podcastId: "pod1",
      distillation: { id: "d1", status: "EXTRACTING_CLAIMS" },
      clips: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    // Should not send to any queue, just ack (work in progress)
    expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
    expect(env.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();
    expect(env.CLIP_GENERATION_QUEUE.send).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("should mark request FAILED on error and retry", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockRejectedValue(new Error("DB down"));
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
      where: { id: "req1" },
      data: { status: "FAILED", errorMessage: "DB down" },
    });
    expect(msg.retry).toHaveBeenCalled();
  });
});
