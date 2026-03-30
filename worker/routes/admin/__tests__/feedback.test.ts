import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../types";
import { feedbackRoutes } from "../feedback";
import { createMockPrisma, createMockEnv } from "../../../../tests/helpers/mocks";

const mockExCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} };

describe("admin feedback routes", () => {
  let app: Hono<{ Bindings: Env }>;
  let mockPrisma: any;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    env = createMockEnv();

    app = new Hono<{ Bindings: Env }>();
    app.use("/*", async (c, next) => {
      c.set("prisma", mockPrisma);
      await next();
    });
    app.route("/feedback", feedbackRoutes);
  });

  describe("GET /feedback", () => {
    it("returns paginated feedback", async () => {
      const mockFeedback = [
        {
          id: "fb1",
          message: "Great app!",
          createdAt: new Date(),
          user: { id: "u1", email: "test@test.com", name: "Test", imageUrl: null },
        },
      ];
      mockPrisma.feedback.findMany.mockResolvedValue(mockFeedback);
      mockPrisma.feedback.count.mockResolvedValue(1);

      const res = await app.request("/feedback?page=1&pageSize=20", {
        method: "GET",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  describe("DELETE /feedback/:id", () => {
    it("deletes feedback entry", async () => {
      mockPrisma.feedback.delete.mockResolvedValue({ id: "fb1" });

      const res = await app.request("/feedback/fb1", {
        method: "DELETE",
      }, env, mockExCtx);

      expect(res.status).toBe(200);
      expect(mockPrisma.feedback.delete).toHaveBeenCalledWith({
        where: { id: "fb1" },
      });
    });
  });
});
