import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

const blippFeedbackRoutes = new Hono<{ Bindings: Env }>();

blippFeedbackRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c) ?? { createdAt: "desc" };

  const isTechnicalFailure = c.req.query("isTechnicalFailure");
  const where = isTechnicalFailure != null
    ? { isTechnicalFailure: isTechnicalFailure === "true" }
    : {};

  const [rows, total] = await Promise.all([
    prisma.blippFeedback.findMany({
      skip,
      take: pageSize,
      orderBy,
      where,
      include: {
        user: { select: { id: true, email: true, name: true, imageUrl: true } },
        episode: { select: { id: true, title: true } },
      },
    }),
    prisma.blippFeedback.count({ where }),
  ]);

  return c.json(paginatedResponse(rows, total, page, pageSize));
});

blippFeedbackRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  await prisma.blippFeedback.delete({ where: { id } });
  return c.json({ ok: true });
});

export { blippFeedbackRoutes };
