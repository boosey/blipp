import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { recommendations } from "../recommendations";
import { createMockPrisma } from "../../../tests/helpers/mocks";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  getConfig: vi.fn(),
}));

vi.mock("../../lib/recommendations", () => ({
  scoreRecommendations: vi.fn(),
  cosineSimilarity: vi.fn(),
  recomputeUserProfile: vi.fn().mockResolvedValue(undefined),
}));

import { getCurrentUser } from "../../lib/admin-helpers";

describe("GET /local", () => {
  let app: Hono;
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    app = new Hono();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/", recommendations);
    (getCurrentUser as any).mockResolvedValue({ id: "user1" });
  });

  it("returns empty when user has no city/state", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ city: null, state: null, country: null });

    const res = await app.request("/local");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.local).toHaveLength(0);
    expect(data.data.localSports).toHaveLength(0);
    expect(data.data.location).toBeNull();
  });

  it("returns local and localSports when user has city/state", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ city: "New York", state: "New York", country: "US" });
    mockPrisma.podcastGeoProfile.findMany.mockResolvedValue([
      {
        id: "gp1",
        teamId: null,
        city: "New York",
        state: "New York",
        scope: "city",
        confidence: 0.9,
        podcast: { id: "pod1", title: "NYC News", imageUrl: null, author: "Author", categories: ["News"] },
        team: null,
      },
      {
        id: "gp2",
        teamId: "team1",
        city: "New York",
        state: "New York",
        scope: "city",
        confidence: 0.85,
        podcast: { id: "pod2", title: "Yankees Talk", imageUrl: null, author: "Sports Author", categories: ["Sports"] },
        team: { id: "team1", name: "New York Yankees", nickname: "Yankees", abbreviation: "NYY" },
      },
    ]);

    const res = await app.request("/local");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.location).toEqual({ city: "New York", state: "New York", country: "US" });
    expect(data.data.local).toHaveLength(1);
    expect(data.data.local[0].podcast.id).toBe("pod1");
    expect(data.data.localSports).toHaveLength(1);
    expect(data.data.localSports[0].podcast.id).toBe("pod2");
    expect(data.data.localSports[0].team.nickname).toBe("Yankees");
  });
});
