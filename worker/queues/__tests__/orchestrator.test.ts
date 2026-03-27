import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
}));
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

const { handleOrchestrator } = await import("../orchestrator");

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
    // Default: no cached work products (evaluate probes these for stage routing)
    mockPrisma.workProduct.findMany.mockResolvedValue([]);
    mockPrisma.clip.findMany.mockResolvedValue([]);
  });

  // ── Request-level guards ──

  it("should ack and skip when request not found", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue(null);

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.create).not.toHaveBeenCalled();
  });

  it("should ack and skip COMPLETED requests", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "COMPLETED", items: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.create).not.toHaveBeenCalled();
  });

  it("should ack and skip FAILED requests", async () => {
    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "FAILED", items: [],
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
  });

  // ── evaluate action ──

  describe("evaluate", () => {
    it("should create PipelineJobs from request items and dispatch to TRANSCRIPTION_QUEUE", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 10,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
          { podcastId: "pod2", episodeId: "ep2", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create
        .mockResolvedValueOnce({ id: "job1", episodeId: "ep1", durationTier: 5 })
        .mockResolvedValueOnce({ id: "job2", episodeId: "ep2", durationTier: 5 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Creates 2 jobs
      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: "req1",
          episodeId: "ep1",
          durationTier: 5,
          status: "PENDING",
          currentStage: "TRANSCRIPTION",
        }),
      });

      // Dispatches to TRANSCRIPTION_QUEUE
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledTimes(2);
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
        })
      );
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job2",
          episodeId: "ep2",
        })
      );

      // Sets request to PROCESSING
      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req1" },
        data: { status: "PROCESSING" },
      });

      expect(msg.ack).toHaveBeenCalled();
    });

    it("should resolve useLatest items to actual episodeIds", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: null, durationTier: 5, useLatest: true },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.episode.findFirst.mockResolvedValue({ id: "latest-ep1" });
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "latest-ep1", durationTier: 5 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Should look up latest episode
      expect(mockPrisma.episode.findFirst).toHaveBeenCalledWith({
        where: { podcastId: "pod1" },
        orderBy: { publishedAt: "desc" },
        select: { id: true },
      });

      // Job created with resolved episodeId
      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ episodeId: "latest-ep1" }),
      });

      // Dispatched with resolved episodeId
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "latest-ep1",
        })
      );
    });

    it("should skip items where no episode is found for podcast", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 10,
        items: [
          { podcastId: "pod1", episodeId: null, durationTier: 5, useLatest: true },
          { podcastId: "pod2", episodeId: "ep2", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.episode.findFirst.mockResolvedValue(null); // pod1 has no episodes
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep2", durationTier: 5 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Only 1 job created (pod2's item with explicit episodeId)
      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ episodeId: "ep2" }),
      });
    });

    it("should fail request when no items resolve to episodes", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: null, durationTier: 5, useLatest: true },
        ],
      });
      mockPrisma.episode.findFirst.mockResolvedValue(null);
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req1" },
        data: { status: "FAILED", errorMessage: "No episodes found for any requested podcasts" },
      });
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should skip to AUDIO_GENERATION when narrative WorkProduct exists", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 3, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep1", durationTier: 3 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "NARRATIVE", episodeId: "ep1", durationTier: 3, voice: null },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStage: "AUDIO_GENERATION",
        }),
      });
      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 3,
        })
      );
      expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
    });

    it("should skip to NARRATIVE_GENERATION when claims WorkProduct exists", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep1", durationTier: 5 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "CLAIMS", episodeId: "ep1", durationTier: null, voice: null },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStage: "NARRATIVE_GENERATION",
        }),
      });
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 5,
        })
      );
      expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
    });

    it("should skip to DISTILLATION when transcript WorkProduct exists", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep1", durationTier: 5 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "TRANSCRIPT", episodeId: "ep1", durationTier: null, voice: null },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStage: "DISTILLATION",
        }),
      });
      expect(env.DISTILLATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
        })
      );
      expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
    });

    it("should skip to BRIEFING_ASSEMBLY when audio WorkProduct and completed Clip exist", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({
        id: "job1", episodeId: "ep1", durationTier: 5,
        currentStage: "BRIEFING_ASSEMBLY", status: "PENDING",
      });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "AUDIO_CLIP", episodeId: "ep1", durationTier: 5, voice: "default" },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([
        { id: "clip1", episodeId: "ep1", durationTier: 5, voicePresetId: null },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStage: "BRIEFING_ASSEMBLY",
          clipId: "clip1",
          status: "PENDING",
        }),
      });
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req1" })
      );
      expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
      expect(env.AUDIO_GENERATION_QUEUE.send).not.toHaveBeenCalled();
    });

    it("should dispatch to AUDIO_GENERATION when audio WorkProduct exists but Clip is not COMPLETED", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep1", durationTier: 5 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "AUDIO_CLIP", episodeId: "ep1", durationTier: 5, voice: "default" },
      ]);
      // No completed clips
      mockPrisma.clip.findMany.mockResolvedValue([]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStage: "AUDIO_GENERATION",
        }),
      });
      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: "job1" })
      );
    });

    it("should include voicePresetId in AUDIO_GENERATION dispatch", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PENDING", userId: "u1", targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 3, useLatest: false, voicePresetId: "voice-abc" },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create.mockResolvedValue({ id: "job1", episodeId: "ep1", durationTier: 3 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "NARRATIVE", episodeId: "ep1", durationTier: 3, voice: null },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 3,
          voicePresetId: "voice-abc",
        })
      );
    });

    it("should dispatch assembly immediately when all items are fully cached", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PENDING", userId: "u1", targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
          { podcastId: "pod2", episodeId: "ep2", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create
        .mockResolvedValueOnce({ id: "job1", episodeId: "ep1", durationTier: 5 })
        .mockResolvedValueOnce({ id: "job2", episodeId: "ep2", durationTier: 5 });
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "AUDIO_CLIP", episodeId: "ep1", durationTier: 5, voice: "default" },
        { type: "AUDIO_CLIP", episodeId: "ep2", durationTier: 5, voice: "default" },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([
        { id: "clip1", episodeId: "ep1", durationTier: 5, voicePresetId: null },
        { id: "clip2", episodeId: "ep2", durationTier: 5, voicePresetId: null },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // No stage queues dispatched
      expect(env.TRANSCRIPTION_QUEUE.send).not.toHaveBeenCalled();
      expect(env.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();
      expect(env.NARRATIVE_GENERATION_QUEUE.send).not.toHaveBeenCalled();
      expect(env.AUDIO_GENERATION_QUEUE.send).not.toHaveBeenCalled();

      // Assembly dispatched immediately
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req1" })
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should NOT dispatch assembly when only some items are cached", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PENDING", userId: "u1", targetMinutes: 5,
        items: [
          { podcastId: "pod1", episodeId: "ep1", durationTier: 5, useLatest: false },
          { podcastId: "pod2", episodeId: "ep2", durationTier: 5, useLatest: false },
        ],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});
      mockPrisma.pipelineJob.create
        .mockResolvedValueOnce({ id: "job1", episodeId: "ep1", durationTier: 5 })
        .mockResolvedValueOnce({ id: "job2", episodeId: "ep2", durationTier: 5 });
      // Only ep1 is fully cached
      mockPrisma.workProduct.findMany.mockResolvedValue([
        { type: "AUDIO_CLIP", episodeId: "ep1", durationTier: 5, voice: "default" },
      ]);
      mockPrisma.clip.findMany.mockResolvedValue([
        { id: "clip1", episodeId: "ep1", durationTier: 5, voicePresetId: null },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // ep2 goes to TRANSCRIPTION, ep1 goes to assembly
      expect(env.TRANSCRIPTION_QUEUE.send).toHaveBeenCalledTimes(1);
      // Assembly NOT dispatched early (one item still needs processing)
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).not.toHaveBeenCalled();
    });

    it("should fail request when items array is empty", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1",
        status: "PENDING",
        userId: "u1",
        targetMinutes: 5,
        items: [],
      });
      mockPrisma.briefingRequest.update.mockResolvedValue({});

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
        where: { id: "req1" },
        data: { status: "FAILED", errorMessage: "No items in request" },
      });
    });
  });

  // ── job-stage-complete action ──

  describe("job-stage-complete", () => {
    it("should advance job from TRANSCRIPTION to DISTILLATION (CAS via updateMany)", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "TRANSCRIPTION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "TRANSCRIPTION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // CAS advance via updateMany
      expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job1", currentStage: "TRANSCRIPTION" },
        data: { currentStage: "DISTILLATION", status: "IN_PROGRESS" },
      });
      expect(env.DISTILLATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
        })
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should advance job from DISTILLATION to NARRATIVE_GENERATION with durationTier", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "DISTILLATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 3,
        status: "IN_PROGRESS", currentStage: "DISTILLATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job1", currentStage: "DISTILLATION" },
        data: { currentStage: "NARRATIVE_GENERATION", status: "IN_PROGRESS" },
      });
      expect(env.NARRATIVE_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 3,
        })
      );
    });

    it("should advance job from NARRATIVE_GENERATION to AUDIO_GENERATION", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "NARRATIVE_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 3,
        status: "IN_PROGRESS", currentStage: "NARRATIVE_GENERATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job1", currentStage: "NARRATIVE_GENERATION" },
        data: { currentStage: "AUDIO_GENERATION", status: "IN_PROGRESS" },
      });
      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 3,
        })
      );
    });

    it("should advance job to BRIEFING_ASSEMBLY after AUDIO_GENERATION and dispatch to assembly queue", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "AUDIO_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "AUDIO_GENERATION",
      });
      // CAS to BRIEFING_ASSEMBLY via updateMany
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });
      // All jobs queued for assembly (just this one)
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "PENDING", currentStage: "BRIEFING_ASSEMBLY", clipId: "clip1", episodeId: "ep1", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Job advanced to BRIEFING_ASSEMBLY via CAS updateMany
      expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job1", status: { not: "COMPLETED" } },
        data: { currentStage: "BRIEFING_ASSEMBLY", status: "PENDING" },
      });
      // Dispatched to assembly queue
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req1",
        })
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should skip already COMPLETED jobs", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "AUDIO_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", status: "COMPLETED", currentStage: "AUDIO_GENERATION",
      });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.update).not.toHaveBeenCalled();
      expect(mockPrisma.pipelineJob.updateMany).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should ack when job not found", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "gone", completedStage: "TRANSCRIPTION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue(null);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
    });

    it("should ack when CAS fails (job already advanced past reported stage)", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "TRANSCRIPTION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "TRANSCRIPTION",
      });
      // CAS fails — another handler already advanced
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 0 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // No queue dispatch
      expect(env.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should ack stale message where completedStage is behind currentStage", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "TRANSCRIPTION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      // Job already at NARRATIVE_GENERATION, but message reports TRANSCRIPTION complete
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "NARRATIVE_GENERATION",
      });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Should not attempt CAS or dispatch
      expect(mockPrisma.pipelineJob.updateMany).not.toHaveBeenCalled();
      expect(env.DISTILLATION_QUEUE.send).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should include voicePresetId when advancing to AUDIO_GENERATION", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "NARRATIVE_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 3,
        voicePresetId: "voice-xyz",
        status: "IN_PROGRESS", currentStage: "NARRATIVE_GENERATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(env.AUDIO_GENERATION_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job1",
          episodeId: "ep1",
          durationTier: 3,
          voicePresetId: "voice-xyz",
        })
      );
    });

    it("should skip already FAILED jobs", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "TRANSCRIPTION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", status: "FAILED", currentStage: "TRANSCRIPTION",
      });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.updateMany).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Dispatch to assembly ──

  describe("dispatch to assembly", () => {
    it("should dispatch to BRIEFING_ASSEMBLY_QUEUE when all jobs are done", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "AUDIO_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 10,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "AUDIO_GENERATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "PENDING", currentStage: "BRIEFING_ASSEMBLY", clipId: "clip1", episodeId: "ep1", durationTier: 5 },
        { id: "job2", status: "PENDING", currentStage: "BRIEFING_ASSEMBLY", clipId: "clip2", episodeId: "ep2", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req1",
        })
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should NOT dispatch to assembly when some jobs are still in progress", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "AUDIO_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 10,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "AUDIO_GENERATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });
      // job1 just completed but job2 is still in progress
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "COMPLETED", clipId: "clip1", episodeId: "ep1", durationTier: 5 },
        { id: "job2", status: "IN_PROGRESS", clipId: null, episodeId: "ep2", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should still dispatch to assembly when some jobs FAILED (partial assembly)", async () => {
      const msg = createMsg({ requestId: "req1", action: "job-stage-complete", jobId: "job1", completedStage: "AUDIO_GENERATION" });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 10,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "AUDIO_GENERATION",
      });
      mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });
      // All jobs terminal: one COMPLETED, one FAILED
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "PENDING", currentStage: "BRIEFING_ASSEMBLY", clipId: "clip1", episodeId: "ep1", durationTier: 5 },
        { id: "job2", status: "FAILED", clipId: null, episodeId: "ep2", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Assembly queue handles partial assembly logic
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req1",
        })
      );
      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── job-failed action ──

  describe("job-failed", () => {
    it("should mark job as FAILED and dispatch to assembly when all jobs terminal", async () => {
      const msg = createMsg({
        requestId: "req1", action: "job-failed", jobId: "job1",
        errorMessage: "Transcription failed: Audio too small",
      });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "TRANSCRIPTION",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      // Only this one job, now terminal
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "FAILED", episodeId: "ep1", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Job marked FAILED with error message
      expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith({
        where: { id: "job1" },
        data: {
          status: "FAILED",
          errorMessage: "Transcription failed: Audio too small",
          completedAt: expect.any(Date),
        },
      });

      // Assembly dispatched since all jobs are terminal
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req1" })
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should NOT dispatch to assembly when other jobs still in progress", async () => {
      const msg = createMsg({
        requestId: "req1", action: "job-failed", jobId: "job1",
        errorMessage: "STT failed",
      });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 10,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", requestId: "req1", episodeId: "ep1", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "TRANSCRIPTION",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      // job1 failed but job2 still going
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "FAILED", episodeId: "ep1", durationTier: 5 },
        { id: "job2", status: "IN_PROGRESS", episodeId: "ep2", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should skip already-terminal jobs", async () => {
      const msg = createMsg({
        requestId: "req1", action: "job-failed", jobId: "job1",
        errorMessage: "Duplicate failure",
      });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job1", status: "FAILED", currentStage: "TRANSCRIPTION",
      });

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Should NOT update job again
      expect(mockPrisma.pipelineJob.update).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should ack when job not found for failure", async () => {
      const msg = createMsg({
        requestId: "req1", action: "job-failed", jobId: "ghost",
        errorMessage: "Unknown error",
      });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue(null);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineJob.update).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalled();
    });

    it("should dispatch to assembly when all jobs fail (total failure)", async () => {
      const msg = createMsg({
        requestId: "req1", action: "job-failed", jobId: "job2",
        errorMessage: "Distillation timeout",
      });
      mockPrisma.briefingRequest.findUnique.mockResolvedValue({
        id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 10,
      });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue({
        id: "job2", requestId: "req1", episodeId: "ep2", durationTier: 5,
        status: "IN_PROGRESS", currentStage: "DISTILLATION",
      });
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      // Both jobs now FAILED
      mockPrisma.pipelineJob.findMany.mockResolvedValue([
        { id: "job1", status: "FAILED", episodeId: "ep1", durationTier: 5 },
        { id: "job2", status: "FAILED", episodeId: "ep2", durationTier: 5 },
      ]);

      await handleOrchestrator(createBatch([msg]), env, ctx);

      // Assembly still dispatched so it can handle the total failure
      expect(env.BRIEFING_ASSEMBLY_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req1" })
      );
      expect(msg.ack).toHaveBeenCalled();
    });
  });

  // ── Error handling ──

  describe("error handling", () => {
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

    it("should ack when request was deleted (update fails)", async () => {
      const msg = createMsg({ requestId: "req1", action: "evaluate" });
      mockPrisma.briefingRequest.findUnique.mockRejectedValue(new Error("DB down"));
      mockPrisma.briefingRequest.update.mockRejectedValue(new Error("Record not found"));

      await handleOrchestrator(createBatch([msg]), env, ctx);

      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();
    });
  });

  // ── Unknown action ──

  it("should ack unknown actions without processing", async () => {
    const msg = createMsg({ requestId: "req1", action: "bogus-action" });
    mockPrisma.briefingRequest.findUnique.mockResolvedValue({
      id: "req1", status: "PROCESSING", userId: "u1", targetMinutes: 5,
    });

    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.create).not.toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.findUnique).not.toHaveBeenCalled();
  });

  // ── Cleanup ──

  it("disconnects prisma via ctx.waitUntil in finally block", async () => {
    mockPrisma.briefingRequest.findUnique.mockResolvedValue(null);

    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("disconnects prisma even when handler throws", async () => {
    mockPrisma.briefingRequest.findUnique.mockRejectedValue(new Error("boom"));
    mockPrisma.briefingRequest.update.mockResolvedValue({});

    const msg = createMsg({ requestId: "req1", action: "evaluate" });
    await handleOrchestrator(createBatch([msg]), env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  // ── Batch processing ──

  it("processes multiple messages independently", async () => {
    const msg1 = createMsg({ requestId: "req1", action: "evaluate" });
    const msg2 = createMsg({ requestId: "req2", action: "evaluate" });
    mockPrisma.briefingRequest.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await handleOrchestrator(createBatch([msg1, msg2]), env, ctx);

    expect(msg1.ack).toHaveBeenCalled();
    expect(msg2.ack).toHaveBeenCalled();
  });
});
