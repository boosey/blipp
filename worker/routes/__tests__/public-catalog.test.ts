import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { publicCatalog } from "../public-catalog";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

interface AppMockPrisma extends ReturnType<typeof createMockPrisma> {
  category: any;
  podcastCategory: any;
}

function makeApp(prisma: AppMockPrisma) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/*", async (c, next) => {
    c.set("prisma", prisma as any);
    await next();
  });
  app.route("/public", publicCatalog);
  return app;
}

function makePrisma(): AppMockPrisma {
  const base = createMockPrisma() as AppMockPrisma;
  base.category = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };
  base.podcastCategory = {
    groupBy: vi.fn(),
  };
  return base;
}

describe("GET /public/categories", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("returns categories with show counts, omits zero-count categories", async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: "c1", name: "Technology", slug: "technology" },
      { id: "c2", name: "Sports", slug: "sports" },
      { id: "c3", name: "Empty", slug: "empty" },
    ]);
    prisma.podcastCategory.groupBy.mockResolvedValue([
      { categoryId: "c1", _count: { _all: 5 } },
      { categoryId: "c2", _count: { _all: 3 } },
    ]);

    const app = makeApp(prisma);
    const res = await app.request("/public/categories", {}, env, mockExCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
    const body: any = await res.json();
    expect(body.categories).toEqual([
      { slug: "technology", name: "Technology", showCount: 5 },
      { slug: "sports", name: "Sports", showCount: 3 },
    ]);
  });

  it("filters out categories without slugs", async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: "c1", name: "Technology", slug: "technology" },
      { id: "c2", name: "Slugless", slug: null },
    ]);
    prisma.podcastCategory.groupBy.mockResolvedValue([
      { categoryId: "c1", _count: { _all: 5 } },
      { categoryId: "c2", _count: { _all: 2 } },
    ]);

    const app = makeApp(prisma);
    const res = await app.request("/public/categories", {}, env, mockExCtx);
    const body: any = await res.json();
    expect(body.categories.map((c: any) => c.slug)).toEqual(["technology"]);
  });
});

describe("GET /public/categories/:slug/shows", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("returns 404 when category not found", async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    const app = makeApp(prisma);
    const res = await app.request("/public/categories/missing/shows", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("paginates shows and scrubs feedUrl", async () => {
    prisma.category.findUnique.mockResolvedValue({ id: "c1", name: "Technology", slug: "technology" });
    prisma.podcast.findMany.mockResolvedValue([
      {
        slug: "show-a",
        title: "Show A",
        author: "Alice",
        description: "Desc",
        imageUrl: "https://example.com/a.jpg",
        categories: ["Technology"],
        _count: { episodes: 10 },
        // Note: feedUrl deliberately not in select; if Prisma returned it, our handler must omit.
      },
    ]);
    prisma.podcast.count.mockResolvedValue(1);

    const app = makeApp(prisma);
    const res = await app.request("/public/categories/technology/shows?page=1&pageSize=24", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.shows).toEqual([
      {
        slug: "show-a",
        title: "Show A",
        author: "Alice",
        description: "Desc",
        imageUrl: "https://example.com/a.jpg",
        categories: ["Technology"],
        publicEpisodeCount: 10,
      },
    ]);
    expect(body.shows[0]).not.toHaveProperty("feedUrl");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(24);
  });

  it("clamps pageSize to PAGE_SIZE_MAX (60)", async () => {
    prisma.category.findUnique.mockResolvedValue({ id: "c1", name: "Tech", slug: "technology" });
    prisma.podcast.findMany.mockResolvedValue([]);
    prisma.podcast.count.mockResolvedValue(0);

    const app = makeApp(prisma);
    const res = await app.request("/public/categories/technology/shows?pageSize=999", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.pageSize).toBe(60);
    // Verify findMany call used clamped take
    expect(prisma.podcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 })
    );
  });
});

describe("GET /public/shows/:slug", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("returns 404 for inactive show", async () => {
    prisma.podcast.findUnique.mockResolvedValue({
      slug: "x", title: "X", author: null, description: null, imageUrl: null,
      categories: [], status: "archived", deliverable: true,
      _count: { episodes: 5 },
    });
    const app = makeApp(prisma);
    const res = await app.request("/public/shows/x", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for show with no public episodes", async () => {
    prisma.podcast.findUnique.mockResolvedValue({
      slug: "x", title: "X", author: null, description: null, imageUrl: null,
      categories: [], status: "active", deliverable: true,
      _count: { episodes: 0 },
    });
    const app = makeApp(prisma);
    const res = await app.request("/public/shows/x", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("returns show + first 12 public episodes", async () => {
    prisma.podcast.findUnique.mockResolvedValue({
      slug: "show-a", title: "Show A", author: "Alice", description: "About",
      imageUrl: "https://example.com/a.jpg", categories: ["Tech"],
      status: "active", deliverable: true,
      _count: { episodes: 25 },
    });
    prisma.episode.findMany.mockResolvedValue([
      {
        slug: "ep1", title: "Ep 1", description: "First",
        publishedAt: new Date("2026-04-01"), durationSeconds: 1800, topicTags: ["ai"],
      },
    ]);

    const app = makeApp(prisma);
    const res = await app.request("/public/shows/show-a", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const body: any = await res.json();
    expect(body.show.publicEpisodeCount).toBe(25);
    expect(body.episodes).toHaveLength(1);
    expect(body.show).not.toHaveProperty("feedUrl");
    expect(body.show).not.toHaveProperty("status");
  });
});

describe("GET /public/shows/:slug/episodes", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("paginates and returns 404 for unknown show", async () => {
    prisma.podcast.findUnique.mockResolvedValue(null);
    const app = makeApp(prisma);
    const res = await app.request("/public/shows/missing/episodes", {}, env, mockExCtx);
    expect(res.status).toBe(404);
  });

  it("returns paginated episode list", async () => {
    prisma.podcast.findUnique.mockResolvedValue({
      id: "p1", status: "active", deliverable: true,
    });
    prisma.episode.findMany.mockResolvedValue([
      {
        slug: "ep1", title: "Ep 1", description: "First",
        publishedAt: new Date("2026-04-01"), durationSeconds: 1800, topicTags: [],
      },
    ]);
    prisma.episode.count.mockResolvedValue(1);

    const app = makeApp(prisma);
    const res = await app.request("/public/shows/p1/episodes?page=2&pageSize=10", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.episodes).toHaveLength(1);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(prisma.episode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });
});

describe("GET /public/recommendations/featured", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("returns trending and newest rows; omits empty rows", async () => {
    prisma.podcast.findMany
      .mockResolvedValueOnce([
        { slug: "trending-show", title: "Top Show", author: null, imageUrl: null, categories: [], _count: { episodes: 5 } },
      ])
      .mockResolvedValueOnce([]);

    const app = makeApp(prisma);
    const res = await app.request("/public/recommendations/featured", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=900");
    const body: any = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].id).toBe("trending");
    expect(body.rows[0].shows[0].slug).toBe("trending-show");
  });
});

describe("GET /public/recently-blipped", () => {
  let prisma: AppMockPrisma;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    env = createMockEnv();
  });

  it("returns recently-public episodes joined with show meta", async () => {
    prisma.episode.findMany.mockResolvedValue([
      {
        slug: "ep1", title: "Ep 1", publishedAt: new Date("2026-04-01"),
        durationSeconds: 1800, topicTags: ["ai"],
        podcast: { slug: "show-a", title: "Show A", imageUrl: "https://x/a.jpg" },
      },
    ]);

    const app = makeApp(prisma);
    const res = await app.request("/public/recently-blipped?limit=6", {}, env, mockExCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    const body: any = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      episode: {
        slug: "ep1",
        title: "Ep 1",
        publishedAt: "2026-04-01T00:00:00.000Z",
        durationSeconds: 1800,
        topicTags: ["ai"],
      },
      show: { slug: "show-a", title: "Show A", imageUrl: "https://x/a.jpg" },
    });
  });

  it("filters out items where podcast slug is missing", async () => {
    prisma.episode.findMany.mockResolvedValue([
      { slug: "ep1", title: "Ep 1", publishedAt: null, durationSeconds: null, topicTags: [], podcast: { slug: null, title: "X", imageUrl: null } },
      { slug: "ep2", title: "Ep 2", publishedAt: null, durationSeconds: null, topicTags: [], podcast: { slug: "ok", title: "OK", imageUrl: null } },
    ]);

    const app = makeApp(prisma);
    const res = await app.request("/public/recently-blipped", {}, env, mockExCtx);
    const body: any = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].show.slug).toBe("ok");
  });

  it("clamps limit to 12", async () => {
    prisma.episode.findMany.mockResolvedValue([]);
    const app = makeApp(prisma);
    await app.request("/public/recently-blipped?limit=99", {}, env, mockExCtx);
    expect(prisma.episode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 12 })
    );
  });
});
