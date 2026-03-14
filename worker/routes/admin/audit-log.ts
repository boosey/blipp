import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, paginatedResponse } from "../../lib/admin-helpers";

const auditLogRoutes = new Hono<{ Bindings: Env }>();

auditLogRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);

  const actorId = c.req.query("actorId");
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  const action = c.req.query("action");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const where: Record<string, unknown> = {};
  if (actorId) where.actorId = actorId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = { contains: action };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as any).gte = new Date(from);
    if (to) (where.createdAt as any).lte = new Date(to);
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data = entries.map((e: any) => ({
    id: e.id,
    actorId: e.actorId,
    actorEmail: e.actorEmail,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

export { auditLogRoutes };
