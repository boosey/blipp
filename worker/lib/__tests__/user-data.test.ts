import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUserExport, deleteR2ByPrefix, deleteUserAccount } from "../user-data";

// Mock external modules
vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      deleteUser: vi.fn().mockResolvedValue({}),
    },
  })),
}));

vi.mock("./service-key-resolver", () => ({
  resolveApiKey: vi.fn().mockResolvedValue("test-api-key"),
}));

describe("user-data", () => {
  const mockPrisma = {
    user: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    briefing: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  const mockR2 = {
    list: vi.fn(),
    delete: vi.fn(),
  };

  const mockEnv = {
    R2: mockR2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildUserExport", () => {
    it("should build a complete export object", async () => {
      const now = new Date();
      const mockUser = {
        id: "u1",
        email: "test@example.com",
        name: "Test User",
        createdAt: now,
        plan: { name: "Pro", slug: "pro" },
        subscriptions: [
          {
            createdAt: now,
            durationTier: 10,
            podcast: { title: "Podcast A" },
          },
        ],
        feedItems: [
          {
            createdAt: now,
            status: "ready",
            listened: true,
            listenedAt: now,
            episode: { title: "Ep 1" },
            podcast: { title: "Podcast A" },
          },
        ],
        briefingRequests: [
          {
            createdAt: now,
            status: "completed",
            targetMinutes: 10,
          },
        ],
      };

      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      const result = await buildUserExport(mockPrisma, "u1");

      expect(result.user.id).toBe("u1");
      expect(result.user.email).toBe("test@example.com");
      expect(result.subscriptions).toHaveLength(1);
      expect(result.subscriptions[0].podcastTitle).toBe("Podcast A");
      expect(result.feedItems[0].episodeTitle).toBe("Ep 1");
      expect(result.briefingRequests[0].status).toBe("completed");
    });
  });

  describe("deleteR2ByPrefix", () => {
    it("should list and delete all objects with prefix", async () => {
      mockR2.list
        .mockResolvedValueOnce({
          objects: [{ key: "a/1" }, { key: "a/2" }],
          truncated: true,
          cursor: "c1",
        })
        .mockResolvedValueOnce({
          objects: [{ key: "a/3" }],
          truncated: false,
        });

      const deletedCount = await deleteR2ByPrefix(mockR2 as any, "a/");

      expect(deletedCount).toBe(3);
      expect(mockR2.delete).toHaveBeenCalledTimes(3);
      expect(mockR2.list).toHaveBeenCalledWith({ prefix: "a/", cursor: undefined, limit: 1000 });
      expect(mockR2.list).toHaveBeenCalledWith({ prefix: "a/", cursor: "c1", limit: 1000 });
    });
  });

  describe("deleteUserAccount", () => {
    it("should delete user from DB, Clerk, and clean up R2", async () => {
      const userId = "u1";
      const clerkId = "c1";
      
      mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: "cus_123" });
      mockPrisma.briefing.findMany.mockResolvedValue([
        { clipId: "clip1", clip: { audioKey: "audio/clip1.mp3" } },
      ]);
      // First briefing clip has no other refs
      mockPrisma.briefing.count.mockResolvedValue(0);

      const result = await deleteUserAccount(mockPrisma as any, mockEnv as any, userId, clerkId);

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockR2.delete).toHaveBeenCalledWith("audio/clip1.mp3");
      expect(result.r2Deleted).toBe(1);
    });

    it("should NOT delete R2 key if other users reference it", async () => {
      const userId = "u1";
      const clerkId = "c1";
      
      mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });
      mockPrisma.briefing.findMany.mockResolvedValue([
        { clipId: "clip1", clip: { audioKey: "audio/clip1.mp3" } },
      ]);
      // Clip has 1 other ref
      mockPrisma.briefing.count.mockResolvedValue(1);

      const result = await deleteUserAccount(mockPrisma as any, mockEnv as any, userId, clerkId);

      expect(mockR2.delete).not.toHaveBeenCalled();
      expect(result.r2Deleted).toBe(0);
    });
  });
});
