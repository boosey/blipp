import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const aiErrorsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET / - Paginated list of AI service errors with filters.
 */
aiErrorsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const service = c.req.query("service");
  const provider = c.req.query("provider");
  const category = c.req.query("category");
  const severity = c.req.query("severity");
  const resolved = c.req.query("resolved");
  const since = c.req.query("since");
  const search = c.req.query("search");

  const where: Record<string, unknown> = {};
  if (service) where.service = service;
  if (provider) where.provider = provider;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (resolved !== undefined && resolved !== null) where.resolved = resolved === "true";
  if (since) where.timestamp = { gte: new Date(since) };
  if (search) where.errorMessage = { contains: search, mode: "insensitive" };

  const [errors, total] = await Promise.all([
    prisma.aiServiceError.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { timestamp: "desc" },
    }),
    prisma.aiServiceError.count({ where }),
  ]);

  const data = errors.map((e: any) => ({
    id: e.id,
    service: e.service,
    provider: e.provider,
    model: e.model,
    operation: e.operation,
    correlationId: e.correlationId,
    jobId: e.jobId,
    stepId: e.stepId,
    episodeId: e.episodeId,
    category: e.category,
    severity: e.severity,
    httpStatus: e.httpStatus,
    errorMessage: e.errorMessage,
    rawResponse: e.rawResponse,
    requestDurationMs: e.requestDurationMs,
    timestamp: e.timestamp.toISOString(),
    retryCount: e.retryCount,
    maxRetries: e.maxRetries,
    willRetry: e.willRetry,
    resolved: e.resolved,
    rateLimitRemaining: e.rateLimitRemaining,
    rateLimitResetAt: e.rateLimitResetAt?.toISOString(),
    createdAt: e.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

/**
 * GET /summary - Aggregate error statistics.
 */
aiErrorsRoutes.get("/summary", async (c) => {
  const prisma = c.get("prisma") as any;
  const since = c.req.query("since")
    ? new Date(c.req.query("since")!)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const baseWhere = { timestamp: { gte: since } };

  const [
    totalErrors,
    byService,
    byProvider,
    byCategory,
    bySeverity,
    errorsLast1h,
    errorsLast7d,
    topErrors,
  ] = await Promise.all([
    prisma.aiServiceError.count({ where: baseWhere }),
    prisma.aiServiceError.groupBy({ by: ["service"], _count: true, where: baseWhere }),
    prisma.aiServiceError.groupBy({ by: ["provider"], _count: true, where: baseWhere }),
    prisma.aiServiceError.groupBy({ by: ["category"], _count: true, where: baseWhere }),
    prisma.aiServiceError.groupBy({ by: ["severity"], _count: true, where: baseWhere }),
    prisma.aiServiceError.count({ where: { timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
    prisma.aiServiceError.count({ where: { timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.aiServiceError.groupBy({
      by: ["errorMessage"],
      _count: true,
      _max: { timestamp: true },
      where: baseWhere,
      orderBy: { _count: { errorMessage: "desc" } },
      take: 10,
    }),
  ]);

  const toMap = (groups: any[]) =>
    Object.fromEntries(groups.map((g) => [g.service ?? g.provider ?? g.category ?? g.severity, g._count]));

  return c.json({
    data: {
      totalErrors,
      byService: toMap(byService),
      byProvider: toMap(byProvider),
      byCategory: toMap(byCategory),
      bySeverity: toMap(bySeverity),
      errorRate: {
        last1h: errorsLast1h,
        last24h: totalErrors,
        last7d: errorsLast7d,
      },
      topErrors: topErrors.map((g: any) => ({
        errorMessage: g.errorMessage.slice(0, 200),
        count: g._count,
        lastSeen: g._max.timestamp?.toISOString(),
      })),
      since: since.toISOString(),
    },
  });
});

/**
 * GET /:id - Single error detail.
 */
aiErrorsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const error = await prisma.aiServiceError.findUnique({
    where: { id: c.req.param("id") },
  });

  if (!error) return c.json({ error: "AI error not found" }, 404);

  return c.json({
    data: {
      id: error.id,
      service: error.service,
      provider: error.provider,
      model: error.model,
      operation: error.operation,
      correlationId: error.correlationId,
      jobId: error.jobId,
      stepId: error.stepId,
      episodeId: error.episodeId,
      category: error.category,
      severity: error.severity,
      httpStatus: error.httpStatus,
      errorMessage: error.errorMessage,
      rawResponse: error.rawResponse,
      requestDurationMs: error.requestDurationMs,
      timestamp: error.timestamp.toISOString(),
      retryCount: error.retryCount,
      maxRetries: error.maxRetries,
      willRetry: error.willRetry,
      resolved: error.resolved,
      rateLimitRemaining: error.rateLimitRemaining,
      rateLimitResetAt: error.rateLimitResetAt?.toISOString(),
      createdAt: error.createdAt.toISOString(),
    },
  });
});

export { aiErrorsRoutes };
