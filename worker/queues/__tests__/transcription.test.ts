import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma();
vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn().mockImplementation((_prisma: any, key: string, fallback: any) => {
    if (key === "transcript.sources") return Promise.resolve(["rss-feed", "podcast-index"]);
    return Promise.resolve(fallback !== undefined ? true : fallback);
  }),
}));

vi.mock("../../lib/model-resolution", () => ({
  resolveStageModel: vi.fn().mockResolvedValue({
    provider: "cloudflare",
    model: "whisper-large-v3-turbo",
    providerModelId: "@cf/openai/whisper-large-v3-turbo",
    pricing: { pricePerMinute: 0.0005 },
    limits: null,
  }),
  resolveSttModelChain: vi.fn().mockResolvedValue([{
    provider: "cloudflare",
    model: "whisper-large-v3-turbo",
    providerModelId: "@cf/openai/whisper-large-v3-turbo",
    pricing: { pricePerMinute: 0.0005 },
    limits: null,
  }]),
  resolveModelChain: vi.fn().mockResolvedValue([{
    provider: "cloudflare",
    model: "whisper-large-v3-turbo",
    providerModelId: "@cf/openai/whisper-large-v3-turbo",
    pricing: { pricePerMinute: 0.0005 },
    limits: null,
  }]),
}));

vi.mock("../../lib/ai-usage", () => ({
  getModelPricing: vi.fn().mockResolvedValue({ pricePerMinute: 0.0005 }),
  calculateAudioCost: vi.fn().mockReturnValue(0.001),
}));

const mockPutWorkProduct = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn(({ episodeId }: any) => `wp/transcript/${episodeId}.txt`),
  putWorkProduct: (...args: any[]) => mockPutWorkProduct(...args),
}));

const mockRssLookup = vi.fn().mockResolvedValue(null);
const mockPiLookup = vi.fn().mockResolvedValue(null);

vi.mock("../../lib/transcript-sources", () => ({
  getTranscriptSource: vi.fn().mockImplementation((id: string) => {
    if (id === "rss-feed") return { name: "RSS Feed", identifier: "rss-feed", lookup: mockRssLookup };
    if (id === "podcast-index") return { name: "Podcast Index", identifier: "podcast-index", lookup: mockPiLookup };
    return undefined;
  }),
  getAllTranscriptSources: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/transcript-source", () => ({
  lookupPodcastIndexTranscript: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/podcast-index", () => ({
  PodcastIndexClient: class MockPodcastIndexClient {},
}));

vi.mock("../../lib/transcript", () => ({
  fetchTranscript: vi.fn().mockResolvedValue("Parsed transcript text."),
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

const mockTranscribe = vi.fn().mockResolvedValue({ transcript: "Provider transcript text.", costDollars: null, latencyMs: 100 });
vi.mock("../../lib/stt-providers", () => ({
  getProviderImpl: vi.fn().mockReturnValue({
    name: "MockProvider",
    provider: "cloudflare",
    transcribe: (...args: any[]) => mockTranscribe(...args),
  }),
}));

vi.mock("../../lib/pipeline-events", () => ({
  writeEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../../lib/ai-errors", () => {
  class AiProviderError extends Error {
    readonly provider: string;
    readonly model: string;
    readonly httpStatus?: number;
    readonly rawResponse?: string;
    readonly requestDurationMs: number;
    readonly rateLimitRemaining?: number;
    readonly rateLimitResetAt?: Date;
    constructor(opts: any) {
      super(opts.message);
      this.name = "AiProviderError";
      this.provider = opts.provider;
      this.model = opts.model;
      this.httpStatus = opts.httpStatus;
      this.rawResponse = opts.rawResponse;
      this.requestDurationMs = opts.requestDurationMs;
      this.rateLimitRemaining = opts.rateLimitRemaining;
      this.rateLimitResetAt = opts.rateLimitResetAt;
    }
  }
  return {
    writeAiError: vi.fn().mockResolvedValue(undefined),
    classifyAiError: vi.fn().mockReturnValue({ category: "unknown", severity: "transient" }),
    AiProviderError,
  };
});

const { getConfig } = await import("../../lib/config");
const { resolveStageModel, resolveSttModelChain, resolveModelChain } = await import("../../lib/model-resolution");
const { getTranscriptSource } = await import("../../lib/transcript-sources");
const { getProviderImpl } = await import("../../lib/stt-providers");
const { writeAiError } = await import("../../lib/ai-errors");
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
  guid: "test-guid",
  audioUrl: "https://example.com/audio.mp3",
  transcriptUrl: "https://example.com/transcript.txt",
};

const PODCAST = {
  id: "pod1",
  podcastIndexId: "42",
  feedUrl: "https://example.com/feed.xml",
  title: "Test Podcast",
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
    // Pipeline events
    mockPrisma.pipelineEvent.create.mockResolvedValue({});

    // Re-set getConfig default after clearAllMocks (mockReset to clear queued values)
    (getConfig as any).mockReset();
    (getConfig as any).mockImplementation((_prisma: any, key: string, _fallback: any) => {
      if (key === "transcript.sources") return Promise.resolve(["rss-feed", "podcast-index"]);
      return Promise.resolve(true);
    });

    // Re-set resolveStageModel + resolveSttModelChain after clearAllMocks
    (resolveStageModel as any).mockReset();
    (resolveStageModel as any).mockResolvedValue({
      provider: "cloudflare",
      model: "whisper-large-v3-turbo",
      providerModelId: "@cf/openai/whisper-large-v3-turbo",
      pricing: { pricePerMinute: 0.0005 },
      limits: null,
    });
    (resolveModelChain as any).mockReset();
    (resolveModelChain as any).mockResolvedValue([{
      provider: "cloudflare",
      model: "whisper-large-v3-turbo",
      providerModelId: "@cf/openai/whisper-large-v3-turbo",
      pricing: { pricePerMinute: 0.0005 },
      limits: null,
    }]);

    // Default: fetch returns a Response-like object
    const audioData = new ArrayBuffer(20000);
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.match(/\.(mp3|m4a|wav|ogg|webm|flac)(\?|$)/i) || url.includes("audio")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "audio/mpeg"]]),
          text: vi.fn().mockResolvedValue(""),
          arrayBuffer: vi.fn().mockResolvedValue(audioData),
        });
      }
      // Transcript URL — return text
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/plain"]]),
        text: vi.fn().mockResolvedValue("This is a transcript."),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      });
    }));

    mockTranscribe.mockReset();
    mockTranscribe.mockResolvedValue({ transcript: "Provider transcript text.", costDollars: null, latencyMs: 100 });

    mockPutWorkProduct.mockReset();
    mockPutWorkProduct.mockResolvedValue(undefined);

    mockRssLookup.mockReset();
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockReset();
    mockPiLookup.mockResolvedValue(null);

    // R2 head returns null (no cache)
    (env.R2.head as any).mockResolvedValue(null);

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
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

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

  it("cache hit -> step SKIPPED, cached: true when R2 has transcript", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    // R2 head returns object (transcript exists)
    (env.R2.head as any).mockResolvedValue({ size: 1024 });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp-existing" });
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist-cached", episodeId: "ep1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    // Step marked SKIPPED + cached
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "SKIPPED",
        cached: true,
      }),
    });
    expect(mockPrisma.pipelineJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { distillationId: "dist-cached" },
    });
    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req1",
        action: "job-stage-complete",
        jobId: "job1",
      })
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("feed URL -> fetches transcript via source abstraction, step COMPLETED", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockRssLookup).toHaveBeenCalled();
    // Distillation upserted with TRANSCRIPT_READY (no transcript field — content lives in R2)
    expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      update: { status: "TRANSCRIPT_READY", errorMessage: null },
      create: { episodeId: "ep1", status: "TRANSCRIPT_READY" },
    });
    // Transcript written to R2
    expect(mockPutWorkProduct).toHaveBeenCalledWith(
      env.R2,
      "wp/transcript/ep1.txt",
      "This is a transcript."
    );
    // WorkProduct row upserted
    expect(mockPrisma.workProduct.upsert).toHaveBeenCalled();
    // Step completed
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "COMPLETED",
      }),
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("STT fallback when no transcriptUrl", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalledWith("https://example.com/audio.mp3");
    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(ArrayBuffer), filename: expect.any(String) }),
      expect.any(Number),
      expect.anything(),
      "@cf/openai/whisper-large-v3-turbo"
    );
    // Distillation upserted (no transcript field — content in R2)
    expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      update: { status: "TRANSCRIPT_READY", errorMessage: null },
      create: { episodeId: "ep1", status: "TRANSCRIPT_READY" },
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("resolves STT model chain and dispatches to provider", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    // Both transcript sources return null -> falls to STT
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue(null);

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(resolveModelChain).toHaveBeenCalled();
    expect(getProviderImpl).toHaveBeenCalledWith("cloudflare");
    expect(mockTranscribe).toHaveBeenCalled();
  });

  it("reports to orchestrator with jobId", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req1",
        action: "job-stage-complete",
        jobId: "job1",
      })
    );
  });

  it("stage gate disabled -> acks all", async () => {
    (getConfig as any).mockResolvedValueOnce(false);
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(msg.ack).toHaveBeenCalled();
    expect(mockPrisma.pipelineJob.findUnique).not.toHaveBeenCalled();
  });

  it("bypasses stage gate for manual messages", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1", type: "manual" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockRssLookup).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("error -> step FAILED, notifies orchestrator, msg.ack()", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
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
    expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req1",
        action: "job-failed",
        jobId: "job1",
        errorMessage: "Episode not found: ep1",
      })
    );
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
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
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

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
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp-new" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

    await handleTranscription(createBatch([msg]), env, ctx);

    // R2 write
    expect(mockPutWorkProduct).toHaveBeenCalledWith(
      env.R2,
      "wp/transcript/ep1.txt",
      "This is a transcript."
    );

    // DB WorkProduct upserted
    expect(mockPrisma.workProduct.upsert).toHaveBeenCalled();

    // Step completed
    expect(mockPrisma.pipelineStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: expect.objectContaining({
        status: "COMPLETED",
      }),
    });
  });

  it("Podcast Index lookup -> fetches transcript when RSS has none", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    // RSS returns null, Podcast Index returns transcript text
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue("Hello from Podcast Index");

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPiLookup).toHaveBeenCalled();
    // Should NOT call Whisper
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("falls through to Whisper when Podcast Index has no transcript", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    // Both transcript sources return null
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue(null);

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPiLookup).toHaveBeenCalled();
    expect(mockTranscribe).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("delegates to provider for any audio size", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue(null);

    await handleTranscription(createBatch([msg]), env, ctx);

    // Provider handles all audio — no chunking logic in the queue handler
    expect(mockTranscribe).toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  describe("AiProviderError handling", () => {
    it("captures AI provider error via writeAiError and notifies orchestrator", async () => {
      const { AiProviderError } = await import("../../lib/ai-errors");
      const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
      mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
      mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
      mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
      mockPrisma.distillation.upsert.mockResolvedValue({});
      mockPrisma.aiServiceError.create.mockResolvedValue({});

      mockRssLookup.mockResolvedValue(null);
      mockPiLookup.mockResolvedValue(null);

      // STT provider throws AiProviderError
      mockTranscribe.mockRejectedValueOnce(
        new AiProviderError({
          message: "Whisper API rate limited",
          provider: "cloudflare",
          model: "whisper-large-v3-turbo",
          httpStatus: 429,
          rawResponse: '{"error":"rate_limit"}',
          requestDurationMs: 500,
        })
      );

      // Mock fetch for audio download
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "audio/mpeg"]]),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(20000)),
      }));

      await handleTranscription(createBatch([msg]), env, ctx);

      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Whisper API rate limited",
        }),
      });

      // AI error captured via writeAiError
      expect(writeAiError).toHaveBeenCalled();

      // Orchestrator notified with job-failed
      expect(env.ORCHESTRATOR_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req1",
          action: "job-failed",
          jobId: "job1",
          errorMessage: "Whisper API rate limited",
        })
      );

      // Message acked (not retried)
      expect(msg.ack).toHaveBeenCalled();
      expect(msg.retry).not.toHaveBeenCalled();
    });
  });


  it("fails gracefully when audio is too small", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({});

    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue(null);

    // Return tiny audio — should fail with "too small" error
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "audio/mpeg"]]),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    }));

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringContaining("too small"),
      }),
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  describe("STT model chain fallback", () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };

    function setupSttBase() {
      mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
      mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
      mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
      mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockRssLookup.mockResolvedValue(null);
      mockPiLookup.mockResolvedValue(null);
    }

    it("falls back to secondary model when primary fails", async () => {
      setupSttBase();
      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

      // Chain: primary (fails) → secondary (succeeds)
      (resolveModelChain as any).mockResolvedValue([
        { provider: "groq", model: "whisper-turbo", providerModelId: "whisper-large-v3-turbo", pricing: null, limits: null },
        { provider: "deepgram", model: "nova-3", providerModelId: "nova-3", pricing: null, limits: null },
      ]);

      // First call fails, second succeeds
      mockTranscribe
        .mockRejectedValueOnce(new Error("Groq 500: Internal Server Error"))
        .mockResolvedValueOnce({ transcript: "Fallback transcript.", costDollars: null, latencyMs: 200 });

      await handleTranscription(createBatch([msg]), env, ctx);

      // Provider was called twice (primary failed, secondary succeeded)
      expect(mockTranscribe).toHaveBeenCalledTimes(2);
      // Transcript was written to R2
      expect(mockPutWorkProduct).toHaveBeenCalledWith(
        env.R2,
        "wp/transcript/ep1.txt",
        "Fallback transcript.",
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("falls back to tertiary when primary and secondary fail", async () => {
      setupSttBase();
      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

      (resolveModelChain as any).mockResolvedValue([
        { provider: "groq", model: "whisper-turbo", providerModelId: "whisper-large-v3-turbo", pricing: null, limits: null },
        { provider: "deepgram", model: "nova-3", providerModelId: "nova-3", pricing: null, limits: null },
        { provider: "openai", model: "whisper-1", providerModelId: "whisper-1", pricing: null, limits: null },
      ]);

      mockTranscribe
        .mockRejectedValueOnce(new Error("Groq 500"))
        .mockRejectedValueOnce(new Error("Deepgram 500"))
        .mockResolvedValueOnce({ transcript: "Third time's a charm.", costDollars: null, latencyMs: 300 });

      await handleTranscription(createBatch([msg]), env, ctx);

      expect(mockTranscribe).toHaveBeenCalledTimes(3);
      expect(mockPutWorkProduct).toHaveBeenCalledWith(
        env.R2,
        "wp/transcript/ep1.txt",
        "Third time's a charm.",
      );
      expect(msg.ack).toHaveBeenCalled();
    });

    it("fails when all models in the chain fail", async () => {
      setupSttBase();
      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

      (resolveModelChain as any).mockResolvedValue([
        { provider: "groq", model: "whisper-turbo", providerModelId: "whisper-large-v3-turbo", pricing: null, limits: null },
        { provider: "deepgram", model: "nova-3", providerModelId: "nova-3", pricing: null, limits: null },
      ]);

      mockTranscribe
        .mockRejectedValueOnce(new Error("Groq 500"))
        .mockRejectedValueOnce(new Error("Deepgram 500"));

      await handleTranscription(createBatch([msg]), env, ctx);

      expect(mockTranscribe).toHaveBeenCalledTimes(2);
      // Step marked FAILED
      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("Deepgram 500"),
        }),
      });
      expect(msg.ack).toHaveBeenCalled();
    });

    it("throws when model chain is empty (no models configured)", async () => {
      setupSttBase();
      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });

      (resolveModelChain as any).mockResolvedValue([]);

      await handleTranscription(createBatch([msg]), env, ctx);

      expect(mockPrisma.pipelineStep.updateMany).toHaveBeenCalledWith({
        where: { jobId: "job1", stage: "TRANSCRIPTION", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("No STT model configured"),
        }),
      });
      expect(msg.ack).toHaveBeenCalled();
    });
  });

  describe("audio format detection", () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };

    it("logs detected audio format in events", async () => {
      mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
      mockPrisma.pipelineJob.update.mockResolvedValue({});
      mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
      mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
      mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
      mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
      mockPrisma.workProduct.upsert.mockResolvedValue({ id: "wp1" });
      mockPrisma.pipelineStep.update.mockResolvedValue({});
      mockRssLookup.mockResolvedValue(null);
      mockPiLookup.mockResolvedValue(null);

      const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
      await handleTranscription(createBatch([msg]), env, ctx);

      // writeEvent should have been called with "Audio file analysis"
      const { writeEvent } = await import("../../lib/pipeline-events");
      expect(writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        "step1",
        "INFO",
        "Audio file analysis",
        expect.objectContaining({
          detectedFormat: expect.any(String),
          sizeBytes: expect.any(Number),
          claimedContentType: expect.any(String),
        })
      );
    });
  });
});

/**
 * detectAudioFormat is not exported from transcription.ts, so we duplicate it
 * here to test its logic directly without modifying the source.
 */
function detectAudioFormat(buffer: ArrayBuffer): { format: string; details?: string } {
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  if (bytes.length < 4) return { format: "unknown", details: "too small" };

  // ID3 tag (MP3 with metadata header)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return { format: "mp3", details: `ID3v2.${bytes[3]}` };
  }
  // MP3 sync word (0xFF followed by 0xE0+ for various MPEG versions/layers)
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    const version = (bytes[1] >> 3) & 0x03;
    const layer = (bytes[1] >> 1) & 0x03;
    const versionStr = version === 3 ? "MPEG1" : version === 2 ? "MPEG2" : version === 0 ? "MPEG2.5" : "unknown";
    const layerStr = layer === 1 ? "Layer3" : layer === 2 ? "Layer2" : layer === 3 ? "Layer1" : "unknown";
    return { format: "mp3", details: `${versionStr} ${layerStr}` };
  }
  // RIFF/WAV
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return { format: "wav", details: "RIFF" };
  }
  // fLaC
  if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return { format: "flac" };
  }
  // OggS
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return { format: "ogg" };
  }
  // MP4/M4A (ftyp box)
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { format: "m4a", details: "ftyp" };
  }
  return { format: "unknown", details: `magic: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, "0")).join(" ")}` };
}

describe("detectAudioFormat (unit tests)", () => {
  function makeBuffer(...bytes: number[]): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) view[i] = bytes[i];
    return buf;
  }

  it("MP3 with ID3v2 header", () => {
    const result = detectAudioFormat(makeBuffer(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "mp3", details: "ID3v2.4" });
  });

  it("MP3 raw MPEG1 Layer3", () => {
    // 0xFF 0xFB = sync word + MPEG1 (version bits 11) + Layer3 (layer bits 01)
    const result = detectAudioFormat(makeBuffer(0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "mp3", details: "MPEG1 Layer3" });
  });

  it("WAV RIFF header", () => {
    const result = detectAudioFormat(makeBuffer(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "wav", details: "RIFF" });
  });

  it("FLAC header", () => {
    // fLaC = 0x66 0x4C 0x61 0x43
    const result = detectAudioFormat(makeBuffer(0x66, 0x4C, 0x61, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "flac" });
  });

  it("OGG header", () => {
    // OggS = 0x4F 0x67 0x67 0x53
    const result = detectAudioFormat(makeBuffer(0x4F, 0x67, 0x67, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "ogg" });
  });

  it("M4A ftyp box", () => {
    // ftyp at offset 4: bytes[4..7] = 0x66 0x74 0x79 0x70
    const result = detectAudioFormat(makeBuffer(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20));
    expect(result).toEqual({ format: "m4a", details: "ftyp" });
  });

  it("unknown bytes", () => {
    const result = detectAudioFormat(makeBuffer(0xAA, 0xBB, 0xCC, 0xDD, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
    expect(result).toEqual({ format: "unknown", details: "magic: aa bb cc dd" });
  });

  it("buffer < 4 bytes returns unknown too small", () => {
    const result = detectAudioFormat(makeBuffer(0xFF, 0xFB));
    expect(result).toEqual({ format: "unknown", details: "too small" });
  });
});
