import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

// Stub Prisma deps so the generated client doesn't try to resolve at import.
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma() as any;
mockPrisma.pulsePost = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
};
mockPrisma.pulseEditor = {
  findUnique: vi.fn(),
};

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

const { pulse } = await import("../pulse");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

const editorReady = {
  slug: "alex",
  name: "Alex",
  bio: "bio",
  avatarUrl: null,
  twitterHandle: null,
  linkedinUrl: null,
  websiteUrl: null,
  status: "READY",
};

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", mockPrisma as any);
    await next();
  });
  app.route("/pulse", pulse);
  app.onError((err, c) => {
    const { status, message } = classifyHttpError(err);
    return c.json({ error: message }, status as any);
  });
  return app;
}

describe("GET /pulse", () => {
  let env: Env;
  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it("filters to PUBLISHED posts only", async () => {
    mockPrisma.pulsePost.findMany.mockResolvedValue([]);
    mockPrisma.pulsePost.count.mockResolvedValue(0);
    const app = makeApp();
    await app.request("/pulse", {}, env, mockExCtx);
    expect(mockPrisma.pulsePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PUBLISHED" } })
    );
  });

  it("renders post titles in the index", async () => {
    mockPrisma.pulsePost.findMany.mockResolvedValue([
      {
        slug: "post-a",
        title: "Post A",
        subtitle: "Sub A",
        publishedAt: new Date("2026-04-20"),
        wordCount: 1000,
        topicTags: ["AI"],
        editor: { slug: "alex", name: "Alex" },
      },
    ]);
    mockPrisma.pulsePost.count.mockResolvedValue(1);
    const app = makeApp();
    const res = await app.request("/pulse", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Post A");
    expect(html).toContain('href="/pulse/post-a"');
  });
});

describe("GET /pulse/:slug", () => {
  let env: Env;
  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it("returns 404 for non-PUBLISHED posts", async () => {
    mockPrisma.pulsePost.findUnique.mockResolvedValue({
      slug: "x",
      title: "X",
      status: "DRAFT",
      body: "",
      sourcesMarkdown: "x",
      editor: editorReady,
      episodes: [],
    });
    const app = makeApp();
    const res = await app.request("/pulse/x", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("500s when a PUBLISHED post has empty sourcesMarkdown", async () => {
    mockPrisma.pulsePost.findUnique.mockResolvedValue({
      slug: "x",
      title: "X",
      subtitle: null,
      body: "body",
      sourcesMarkdown: "",
      status: "PUBLISHED",
      heroImageUrl: null,
      topicTags: [],
      wordCount: 100,
      publishedAt: new Date(),
      editor: editorReady,
      episodes: [],
    });
    const app = makeApp();
    const res = await app.request("/pulse/x", {}, env, mockExCtx);
    expect(res.status).toBe(500);
  });

  it("500s when a PUBLISHED post is authored by a NOT_READY editor", async () => {
    mockPrisma.pulsePost.findUnique.mockResolvedValue({
      slug: "x",
      title: "X",
      subtitle: null,
      body: "body",
      sourcesMarkdown: "- source",
      status: "PUBLISHED",
      heroImageUrl: null,
      topicTags: [],
      wordCount: 100,
      publishedAt: new Date(),
      editor: { ...editorReady, status: "NOT_READY" },
      episodes: [],
    });
    const app = makeApp();
    const res = await app.request("/pulse/x", {}, env, mockExCtx);
    expect(res.status).toBe(500);
  });

  it("renders the post when published + sources + READY editor", async () => {
    mockPrisma.pulsePost.findUnique.mockResolvedValue({
      slug: "x",
      title: "Post X",
      subtitle: "Sub",
      body: "## Hi\n\nbody",
      sourcesMarkdown: "- source",
      status: "PUBLISHED",
      heroImageUrl: null,
      topicTags: ["AI"],
      wordCount: 500,
      publishedAt: new Date("2026-04-20"),
      seoTitle: null,
      seoDescription: null,
      editor: editorReady,
      episodes: [
        {
          episode: {
            slug: "ep-1",
            title: "Ep 1",
            podcast: { slug: "show-x", title: "Show X" },
          },
        },
      ],
    });
    const app = makeApp();
    const res = await app.request("/pulse/x", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Post X");
    expect(html).toContain("Show X");
    expect(html).toContain("Sources");
  });
});

describe("GET /pulse/by/:editorSlug", () => {
  let env: Env;
  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it("404s for missing editor", async () => {
    mockPrisma.pulseEditor.findUnique.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.request("/pulse/by/missing", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("404s for NOT_READY editors (no surface for incomplete profiles)", async () => {
    mockPrisma.pulseEditor.findUnique.mockResolvedValue({
      ...editorReady,
      expertiseAreas: [],
      status: "NOT_READY",
    });
    const app = makeApp();
    const res = await app.request("/pulse/by/alex", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("renders profile + posts for READY editor", async () => {
    mockPrisma.pulseEditor.findUnique.mockResolvedValue({
      ...editorReady,
      expertiseAreas: ["AI"],
    });
    mockPrisma.pulsePost.findMany.mockResolvedValue([
      {
        slug: "p1",
        title: "Post 1",
        subtitle: null,
        publishedAt: new Date("2026-04-20"),
        wordCount: 800,
        topicTags: [],
        editor: { slug: "alex", name: "Alex" },
      },
    ]);
    const app = makeApp();
    const res = await app.request("/pulse/by/alex", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Alex");
    expect(html).toContain("Post 1");
  });
});

describe("GET /pulse/topic/:topicSlug", () => {
  let env: Env;
  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it("filters posts whose topicTags slugify to the requested slug", async () => {
    mockPrisma.pulsePost.findMany.mockResolvedValue([
      {
        slug: "matched",
        title: "Matched",
        subtitle: null,
        publishedAt: new Date("2026-04-20"),
        wordCount: 500,
        topicTags: ["Generative AI"],
        editor: { slug: "alex", name: "Alex" },
      },
      {
        slug: "missed",
        title: "Missed",
        subtitle: null,
        publishedAt: new Date("2026-04-20"),
        wordCount: 500,
        topicTags: ["Sports"],
        editor: { slug: "alex", name: "Alex" },
      },
    ]);
    const app = makeApp();
    const res = await app.request("/pulse/topic/generative-ai", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Generative AI");
    expect(html).toContain("Matched");
    expect(html).not.toContain("Missed");
  });

  it("404s when no posts match the topic slug", async () => {
    mockPrisma.pulsePost.findMany.mockResolvedValue([
      {
        slug: "x",
        title: "X",
        subtitle: null,
        publishedAt: new Date(),
        wordCount: null,
        topicTags: ["Other"],
        editor: { slug: "alex", name: "Alex" },
      },
    ]);
    const app = makeApp();
    const res = await app.request("/pulse/topic/missing", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });
});
