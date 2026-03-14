import { vi } from "vitest";
import type { Env } from "../../worker/types";

/**
 * Creates a mock PrismaClient with all models stubbed.
 * Each model gets common Prisma methods (findUnique, findMany, create, update, etc.)
 * pre-mocked with `vi.fn()` so tests can set return values.
 *
 * @returns A deeply-mocked PrismaClient-like object
 */
export function createMockPrisma() {
  const modelMethods = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  });

  return {
    plan: modelMethods(),
    user: modelMethods(),
    podcast: modelMethods(),
    episode: modelMethods(),
    distillation: modelMethods(),
    clip: modelMethods(),
    subscription: modelMethods(),
    briefing: modelMethods(),
    pipelineJob: modelMethods(),
    pipelineStep: modelMethods(),
    pipelineEvent: modelMethods(),
    briefingRequest: modelMethods(),
    platformConfig: modelMethods(),
    feedItem: modelMethods(),
    workProduct: modelMethods(),
    aiModel: modelMethods(),
    aiModelProvider: modelMethods(),
    sttExperiment: modelMethods(),
    sttBenchmarkResult: modelMethods(),
    aiServiceError: modelMethods(),
    auditLog: modelMethods(),
    apiKey: modelMethods(),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock Env object with stubbed R2, Queues, and placeholder secrets.
 * All queue `.send()` calls are mocked. R2 `.get()` and `.put()` are mocked.
 *
 * @returns A mock Env matching the worker/types.ts definition
 */
export function createMockEnv(): Env {
  return {
    ASSETS: {} as Fetcher,
    HYPERDRIVE: { connectionString: "postgres://mock" } as unknown as Hyperdrive,
    R2: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [] }),
    } as unknown as R2Bucket,
    CLERK_SECRET_KEY: "sk_test_mock",
    CLERK_PUBLISHABLE_KEY: "pk_test_mock",
    CLERK_WEBHOOK_SECRET: "whsec_mock",
    STRIPE_SECRET_KEY: "sk_test_mock",
    STRIPE_WEBHOOK_SECRET: "whsec_mock",
    ANTHROPIC_API_KEY: "sk-ant-mock",
    OPENAI_API_KEY: "sk-mock",
    PODCAST_INDEX_KEY: "mock-key",
    PODCAST_INDEX_SECRET: "mock-secret",
    FEED_REFRESH_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    DISTILLATION_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    NARRATIVE_GENERATION_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    AUDIO_GENERATION_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    BRIEFING_ASSEMBLY_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    TRANSCRIPTION_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    ORCHESTRATOR_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    DEEPGRAM_API_KEY: "mock-deepgram-key",
    ASSEMBLYAI_API_KEY: "mock-assemblyai-key",
    GOOGLE_STT_API_KEY: "mock-google-stt-key",
    GROQ_API_KEY: "mock-groq-key",
    AI: { run: vi.fn() } as unknown as Ai,
  };
}

/**
 * Creates a minimal Hono Context mock for route handler testing.
 * Includes mocked `req`, `json()`, `env`, `executionCtx`, and auth helpers.
 *
 * @param env - Optional Env override (defaults to createMockEnv())
 * @param userId - Optional Clerk userId for authenticated requests
 * @returns A mock Hono Context object
 */
export function createMockContext(env?: Env, userId?: string) {
  const mockEnv = env ?? createMockEnv();

  return {
    env: mockEnv,
    req: {
      json: vi.fn(),
      query: vi.fn(),
      param: vi.fn(),
      header: vi.fn().mockReturnValue("http://localhost:5173"),
      raw: {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      },
    },
    json: vi.fn((data: unknown, status?: number) => {
      return new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
    get: vi.fn((key: string) => {
      // Simulates Hono's c.get() for auth middleware values
      if (key === "clerkAuth" || key === "clerk") {
        return userId ? { userId } : null;
      }
      return undefined;
    }),
    executionCtx: {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    },
  };
}
