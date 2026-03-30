import { Hono } from "hono";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

const feedbackRoutes = new Hono<{ Bindings: Env }>();

feedbackRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c) ?? { createdAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.feedback.findMany({
      skip,
      take: pageSize,
      orderBy,
      include: {
        user: { select: { id: true, email: true, name: true, imageUrl: true } },
      },
    }),
    prisma.feedback.count(),
  ]);

  return c.json(paginatedResponse(rows, total, page, pageSize));
});

feedbackRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  await prisma.feedback.delete({ where: { id } });
  return c.json({ ok: true });
});

export { feedbackRoutes };
