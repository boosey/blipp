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

vi.mock("../../lib/ai-models", () => ({
  getModelConfig: vi.fn().mockResolvedValue({ provider: "cloudflare", model: "whisper-large-v3-turbo" }),
}));

vi.mock("../../lib/ai-usage", () => ({
  getModelPricing: vi.fn().mockResolvedValue({ pricePerMinute: 0.0005 }),
  calculateAudioCost: vi.fn().mockReturnValue(0.001),
}));

const mockPutWorkProduct = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/work-products", () => ({
  wpKey: vi.fn(({ type, episodeId }: any) => `wp/transcript/${episodeId}.txt`),
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

const { getConfig } = await import("../../lib/config");
const { getModelConfig } = await import("../../lib/ai-models");
const { getTranscriptSource } = await import("../../lib/transcript-sources");
const { getProviderImpl } = await import("../../lib/stt-providers");
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
    (getConfig as any).mockImplementation((_prisma: any, key: string, _fallback: any) => {
      if (key === "transcript.sources") return Promise.resolve(["rss-feed", "podcast-index"]);
      return Promise.resolve(true);
    });

    // Re-set getModelConfig default after clearAllMocks
    (getModelConfig as any).mockReset();
    (getModelConfig as any).mockResolvedValue({ provider: "cloudflare", model: "whisper-large-v3-turbo" });

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

    // Mock providerModelId lookup
    mockPrisma.aiModelProvider.findFirst.mockResolvedValue({ providerModelId: "@cf/openai/whisper-large-v3-turbo" });

    mockRssLookup.mockReset();
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockReset();
    mockPiLookup.mockResolvedValue(null);

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
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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

  it("feed URL -> fetches transcript via source abstraction, step COMPLETED with WorkProduct", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(mockRssLookup).toHaveBeenCalled();
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

  it("STT fallback when no transcriptUrl", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(fetch).toHaveBeenCalledWith("https://example.com/audio.mp3");
    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: expect.any(ArrayBuffer), filename: expect.any(String) }),
      expect.any(Number),
      expect.anything(),
      "@cf/openai/whisper-large-v3-turbo"
    );
    expect(mockPrisma.distillation.upsert).toHaveBeenCalledWith({
      where: { episodeId: "ep1" },
      update: { status: "TRANSCRIPT_READY", transcript: "Provider transcript text.", errorMessage: null },
      create: { episodeId: "ep1", status: "TRANSCRIPT_READY", transcript: "Provider transcript text." },
    });
    expect(msg.ack).toHaveBeenCalled();
  });

  it("reads STT model from config and dispatches to provider", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    // Both transcript sources return null -> falls to STT
    mockRssLookup.mockResolvedValue(null);
    mockPiLookup.mockResolvedValue(null);

    await handleTranscription(createBatch([msg]), env, ctx);

    expect(getProviderImpl).toHaveBeenCalledWith("cloudflare");
    expect(mockTranscribe).toHaveBeenCalled();
  });

  it("reports to orchestrator with jobId", async () => {
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(EPISODE);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp-new" });
    mockPrisma.pipelineStep.update.mockResolvedValue({});
    mockRssLookup.mockResolvedValue("This is a transcript.");

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

  it("Podcast Index lookup -> fetches transcript when RSS has none", async () => {
    const episodeNoTranscript = { ...EPISODE, transcriptUrl: null };
    const msg = createMsg({ jobId: "job1", episodeId: "ep1" });
    mockPrisma.pipelineJob.findUnique.mockResolvedValue(JOB);
    mockPrisma.pipelineJob.update.mockResolvedValue({});
    mockPrisma.pipelineStep.create.mockResolvedValue({ id: "step1" });
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
    mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
    mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
    mockPrisma.distillation.upsert.mockResolvedValue({ id: "dist1", episodeId: "ep1" });
    mockPrisma.workProduct.create.mockResolvedValue({ id: "wp1" });
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
      mockPrisma.distillation.findUnique.mockResolvedValue(null);
      mockPrisma.episode.findUnique.mockResolvedValue(episodeNoTranscript);
      mockPrisma.podcast.findUnique.mockResolvedValue(PODCAST);
      mockPrisma.distillation.upsert.mockResolvedValue({});
      mockPrisma.pipelineEvent.create.mockResolvedValue({});
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

      // AI error captured to DB
      expect(mockPrisma.aiServiceError.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          service: "stt",
          provider: "cloudflare",
          model: "whisper-large-v3-turbo",
          category: "rate_limit",
          severity: "transient",
          httpStatus: 429,
        }),
      });

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
    mockPrisma.distillation.findUnique.mockResolvedValue(null);
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
});
