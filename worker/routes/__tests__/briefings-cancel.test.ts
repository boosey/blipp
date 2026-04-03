import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../types";
import { briefings } from "../briefings";
import { createMockPrisma, createMockEnv } from "../../../tests/helpers/mocks";
import { classifyHttpError } from "../../lib/errors";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk1" })),
}));

vi.mock("../../lib/admin-helpers", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("../../lib/plan-limits", () => ({
  getUserWithPlan: vi.fn(),
  checkDurationLimit: vi.fn().mockReturnValue(null),
  checkWeeklyBriefingLimit: vi.fn().mockResolvedValue(null),
  checkPastEpisodesLimit: vi.fn().mockResolvedValue(null),
}));

import { getCurrentUser } from "../../lib/admin-helpers";

describe("POST /requests/:requestId/cancel", () => {
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
    app.route("/", briefings);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });

    (getCurrentUser as any).mockResolvedValue({ id: "user1", isAdmin: false });
  });

  it("cancels a PENDING request and marks feed items and pipeline jobs as CANCELLED", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "PENDING",
    });
    mockPrisma.briefingRequest.update.mockResolvedValue({
      id: "req1",
      status: "CANCELLED",
      cancelledAt: expect.any(Date),
    });
    mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 2 });

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.request.status).toBe("CANCELLED");

    expect(mockPrisma.briefingRequest.update).toHaveBeenCalledWith({
      where: { id: "req1" },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
    expect(mockPrisma.feedItem.updateMany).toHaveBeenCalledWith({
      where: { requestId: "req1", status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "CANCELLED" },
    });
    expect(mockPrisma.pipelineJob.updateMany).toHaveBeenCalledWith({
      where: { requestId: "req1", status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "CANCELLED" },
    });
  });

  it("cancels a PROCESSING request", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "PROCESSING",
    });
    mockPrisma.briefingRequest.update.mockResolvedValue({
      id: "req1",
      status: "CANCELLED",
    });
    mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 0 });

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(200);
  });

  it("returns 404 when request not found", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue(null);

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe("Request not found");
  });

  it("returns 404 when request belongs to another user", async () => {
    // findFirst with userId filter returns null for other users' requests
    mockPrisma.briefingRequest.findFirst.mockResolvedValue(null);

    const res = await app.request("/requests/other-req/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(404);
  });

  it("returns 400 when request is already cancelled", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "CANCELLED",
    });

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Request is already cancelled");
  });

  it("returns 400 when request is COMPLETED (terminal, not cancellable)", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "COMPLETED",
    });

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Cannot cancel a COMPLETED request");
  });

  it("returns 400 when request is FAILED (terminal, not cancellable)", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "FAILED",
    });

    const res = await app.request("/requests/req1/cancel", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Cannot cancel a FAILED request");
  });
});

describe("POST /cancel-by-feed-item/:feedItemId", () => {
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
    app.route("/", briefings);
    app.onError((err, c) => {
      const { status, message, code, details } = classifyHttpError(err);
      return c.json({ error: message, code, details }, status as any);
    });

    (getCurrentUser as any).mockResolvedValue({ id: "user1", isAdmin: false });
  });

  it("cancels via feed item that has a requestId", async () => {
    mockPrisma.feedItem.findFirst.mockResolvedValue({
      requestId: "req1",
      status: "PROCESSING",
    });
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req1",
      userId: "user1",
      status: "PROCESSING",
    });
    mockPrisma.briefingRequest.update.mockResolvedValue({
      id: "req1",
      status: "CANCELLED",
    });
    mockPrisma.feedItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.pipelineJob.updateMany.mockResolvedValue({ count: 1 });

    const res = await app.request("/cancel-by-feed-item/fi1", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.request.status).toBe("CANCELLED");
  });

  it("cancels feed item directly when requestId is null", async () => {
    mockPrisma.feedItem.findFirst.mockResolvedValue({
      requestId: null,
      status: "PENDING",
    });
    mockPrisma.feedItem.update.mockResolvedValue({ id: "fi1", status: "CANCELLED" });

    const res = await app.request("/cancel-by-feed-item/fi1", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.feedItemCancelled).toBe(true);
    expect(body.request).toBeNull();

    expect(mockPrisma.feedItem.update).toHaveBeenCalledWith({
      where: { id: "fi1" },
      data: { status: "CANCELLED" },
    });
  });

  it("returns 404 when feed item not found", async () => {
    mockPrisma.feedItem.findFirst.mockResolvedValue(null);

    const res = await app.request("/cancel-by-feed-item/fi1", {
      method: "POST",
    }, env, { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as any);

    expect(res.status).toBe(404);
  });
});
