import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { createMockEnv, createMockPrisma } from "../../../tests/helpers/mocks";

// Mock Prisma deps so Vite doesn't try to resolve the generated client
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));
vi.mock("../../../src/generated/prisma", () => ({ PrismaClient: vi.fn() }));

const mockPrisma = createMockPrisma() as any;
// Add models the public-pages route needs that aren't in the shared mock
mockPrisma.podcastCategory = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
};

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock("hono/factory", () => ({
  createMiddleware: vi.fn((fn) => fn),
}));

// Import after mocks are set up
const { publicPages } = await import("../public-pages");

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("GET /:showSlug/:episodeSlug", () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma as any);
      await next();
    });
    app.route("/p", publicPages);

    mockPrisma.podcast.findUnique.mockResolvedValue({
      id: "pod_1",
      title: "Future Forward",
      slug: "future-forward",
      imageUrl: "https://example.com/cover.jpg",
      description: "Things that come next.",
    });

    mockPrisma.podcastCategory.findFirst.mockResolvedValue({
      category: { id: "cat_1", name: "Technology", slug: "technology" },
    });

    mockPrisma.episode.findMany.mockResolvedValue([]); // moreFromShow default
    mockPrisma.podcastCategory.findMany.mockResolvedValue([]); // related default
  });

  it("ranks topClaims by scoreClaim and renders the top 3 in score order", async () => {
    mockPrisma.episode.findFirst.mockResolvedValue({
      title: "AI in healthcare",
      slug: "ai-in-healthcare",
      description: null,
      publishedAt: new Date("2026-04-20"),
      durationSeconds: 1800,
      topicTags: ["ai"],
      clips: [
        {
          narrativeText: Array.from({ length: 250 })
            .map((_, i) => `Word${i}`)
            .join(" "),
        },
      ],
      distillation: {
        status: "COMPLETED",
        claimsJson: [
          // Mid score (5.4), but listed first — ordering test relies on score ordering
          { claim: "Mid claim", importance: 6, novelty: 4 },
          // Highest score (8.7) → must come first
          { claim: "Top claim", importance: 9, novelty: 8 },
          // Lowest score (3.0) → must come last (never appears in top-3 of 3)
          { claim: "Low claim", importance: 3, novelty: 3 },
        ],
      },
    });

    const res = await app.request(
      "/p/future-forward/ai-in-healthcare",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // Top claim must come before mid claim in the rendered HTML
    const topIdx = html.indexOf("Top claim");
    const midIdx = html.indexOf("Mid claim");
    const lowIdx = html.indexOf("Low claim");
    expect(topIdx).toBeGreaterThan(0);
    expect(midIdx).toBeGreaterThan(topIdx);
    expect(lowIdx).toBeGreaterThan(midIdx);
  });

  it("renders the page without takeaways when only episode.description is available", async () => {
    mockPrisma.episode.findFirst.mockResolvedValue({
      title: "AI in healthcare",
      slug: "ai-in-healthcare",
      description:
        "A short fallback episode description that is enough to render but has no claims.",
      publishedAt: new Date("2026-04-20"),
      durationSeconds: 1800,
      topicTags: [],
      clips: [], // no clip narrative
      distillation: null, // no distillation either
    });

    const res = await app.request(
      "/p/future-forward/ai-in-healthcare",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toContain("Top takeaways");
    expect(html).toContain("AI in healthcare");
    // Signup CTA still renders
    expect(html).toContain(
      `/sign-up?next=${encodeURIComponent("/p/future-forward/ai-in-healthcare")}`
    );
  });

  it("returns 404 when no narrative source is available", async () => {
    mockPrisma.episode.findFirst.mockResolvedValue({
      title: "Empty",
      slug: "empty",
      description: null,
      publishedAt: null,
      durationSeconds: null,
      topicTags: [],
      clips: [],
      distillation: null,
    });

    const res = await app.request(
      "/p/future-forward/empty",
      {},
      env,
      mockExCtx
    );
    expect(res.status).toBe(404);
  });
});
