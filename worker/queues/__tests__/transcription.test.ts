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

vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "openai", model: "whisper-1" }),
}));

const mockPutWorkProduct = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn(({ type, episodeId }: any) => `wp/transcript/${episodeId}.txt`),
  putWorkProduct: (...args: any[]) => mockPutWorkProduct(...args),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  timer: vi.fn(() => vi.fn()),
}));
vi.mock("../../lib/logger", () => ({
  createPipelineLogger: vi.fn().mockResolvedValue(mockLogger),
}));

const mockWhisperCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      audio = {
        transcriptions: {
          create: mockWhisperCreate,
        },
      };
    },
  };
});

const { getConfig } = await import("../../lib/config");
const { getModelConfig } = await import("../../lib/ai-models");
const { handleTranscription } = await import("../transcription");

function createMsg(body: any) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function createBatch(messages: any[], queue = "transcription") {
  return { queue, messages } as unknown as MessageBatch<any>;
}

const JOB = {
  id: "job1",
  requestId: "req1",
  episodeId: "ep1",
  durationTier: 5,
  status: "PENDING",
  currentStage: "TRANSCRIPTION",
};

const EPISODE = {
  id: "ep1",
  podcastId: "pod1",
  title: "Test Episode",
  audioUrl: "https://example.com/audio.mp3",
  transcriptUrl: "https://example.com/transcript.txt",
};

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
    // Ensure updateMany always returns a promise (used in error handler .catch())
    mockPrisma.pipelineStep.updateMany.mockResolvedValue({ count: 0 });

    // Re-set getConfig default after clearAllMocks (mockReset to clear queued values)
    (getConfig as any).mockReset();
    (getConfig as any).mockResolvedValue(true);

    // Re-set getModelConfig default after clearAllMocks
    (getModelConfig as any).mockReset();
    (getModelConfig as any).mockResolvedValue({ provider: "openai", model: "whisper-1" });

    // Default: fetch returns transcript text
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("This is a transcript."),
      blob: vi.fn().mockResolvedValue(new Blob(["audio-data"])),
    }));

    mockWhisperCreate.mockReset();
    mockWhisperCreate.mockResolvedValue({ text: "Whisper transcript text." });

    mockPutWorkProduct.mockReset();
    mockPutWorkProduct.mockResolvedValue(undefined);

    mockLogger.info.mockReset();
    mockLogger.debug.mockReset();
    mockLogger.error.mockReset();
    mockLogger.timer.mockReset().mockReturnValue(vi.fn());
  });

  it("creates PipelineStep on processing", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.pipelineStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job1",
        stage: "TRANSCRIPTION",
        status: "IN_PROGRESS",
        startedAt: expect.any(Date),
      }),
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("cache hit -> step SKIPPED, cached: true, links existing WorkProduct", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue({
      id: "dist-cached",
      episodeId: "ep1",
      status: "TRANSCRIPT_READY",
      transcript: "Cached transcript",
    });
    mockPrisma.workProduct.findFirst.mockResolvedValue({ id: "wp-existing" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.workProduct.findFirst).toHaveBeenCalledWith({
      where: { type: "TRANSCRIPT", episodeId: "ep1" },
    });
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "SKIPPED",
        cached: true,
        workProductId: "wp-existing",
      }),
    });
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { distillationId: "dist-cached" },
    });
    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req1",
      action: "job-stage-complete",
      jobId: "job1",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("feed URL -> fetches transcript, step COMPLETED with WorkProduct", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalledWith("https://example.com/transcript.txt");
    expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      update: { status: "TRANSCRIPT_READY", transcript: "This is a transcript.", errorMessage: null },
      create: { episodeId: "ep1", status: "TRANSCRIPT_READY", transcript: "This is a transcript." },
    });
    expect(mockPutWorkProduct).toHaveBeenCalledWith(
      env.R2,
      "wp/transcript/ep1.txt",
      "This is a transcript."
    );
    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith({
      data: {
        type: "TRANSCRIPT",
        episodeId: "ep1",
        r2Key: "wp/transcript/ep1.txt",
        sizeBytes: new TextEncoder().encode("This is a transcript.").byteLength,
      },
    });
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        workProductId: "wp1",
      }),
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("Whisper fallback when no transcriptUrl", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    // Stub File if not available in test env
    if (typeof globalThis.File === "undefined") {
      globalThis.File = class File extends Blob {
        name: string;
        lastModified: number;
        constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(parts, opts);
          this.name = name;
          this.lastModified = Date.now();
        }
      } as any;
    }

    await handleTranscription(createBatch([msg]), env, ctx);

    // Should fetch audio URL for Whisper
    expect(fetch).toHaveBeenCalledWith("https://example.com/audio.mp3");
    expect(mockWhisperCreate).toHaveBeenCalledWith({
      model: "whisper-1",
      file: expect.any(File),
    });
    expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      update: { status: "TRANSCRIPT_READY", transcript: "Whisper transcript text.", errorMessage: null },
      create: { episodeId: "ep1", status: "TRANSCRIPT_READY", transcript: "Whisper transcript text." },
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("reads STT model from config for Whisper path", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    if (typeof globalThis.File === "undefined") {
      globalThis.File = class File extends Blob {
        name: string;
        lastModified: number;
        constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
          super(parts, opts);
          this.name = name;
          this.lastModified = Date.now();
        }
      } as any;
    }

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(getModelConfig).toHaveBeenCalledWith(expect.anything(), "stt");
    expect(mockWhisperCreate).toHaveBeenCalledWith({
      model: "whisper-1",
      file: expect.any(File),
    });
  });

  it("reports to orchestrator with jobId", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith({
      requestId: "req1",
      action: "job-stage-complete",
      jobId: "job1",
    });
  });

  it("stage gate disabled -> acks all", async () => {
    (getConfig as any).mockResolvedValueOnce(false);
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.findUnique).not.toHaveBeenCalled();
  });

  it("bypasses stage gate for manual messages", async () => {
    (getConfig as any).mockResolvedValueOnce(false);
    const msg = createMsg({ jobId: "job1", episodeId: "ep1", type: "manual" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("error -> step FAILED, msg.retry()", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    // Episode not found triggers "Episode not found" error
    mockPrisma.episode.findUnique.mockResolvedValue(null);
    mockPrisma.distillation.upsert.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "Episode not found: ep1",
      }),
    });
    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("acks when job not found", async () => {
    const msg = createMsg({ jobId: "nonexistent", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(null);

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineStep.create).not.toHaveBeenCalled();
  });

  it("updates job status to IN_PROGRESS when PENDING", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "IN_PROGRESS" },
    });
  });

  it("creates WorkProduct on successful transcription", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-new" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    // R2 write
    expect(mockPutWorkProduct).toHaveBeenCalledWith(
      env.R2,
      "wp/transcript/ep1.txt",
      "This is a transcript."
    );

    // DB row
    expect(mockPrisma.workProduct.create).toHaveBeenCalledWith({
      data: {
        type: "TRANSCRIPT",
        episodeId: "ep1",
        r2Key: "wp/transcript/ep1.txt",
        sizeBytes: new TextEncoder().encode("This is a transcript.").byteLength,
      },
    });

    // Step links to WorkProduct
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        workProductId: "wp-new",
      }),
    });
  });
});
