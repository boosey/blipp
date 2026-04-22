import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../../types";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { validateBody } from "../../lib/validation";

const supportRoutes = new Hono<{ Bindings: Env }>();

supportRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c) ?? { createdAt: "desc" };
  const status = c.req.query("status");

  const where = status && status !== "all" ? { status } : {};

  const [rows, total, openCount] = await Promise.all([
    prisma.supportMessage.findMany({ skip, take: pageSize, orderBy, where }),
    prisma.supportMessage.count({ where }),
    prisma.supportMessage.count({ where: { status: "open" } }),
  ]);

  return c.json({
    ...paginatedResponse(rows, total, page, pageSize),
    openCount,
  });
});

const PatchSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

supportRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await validateBody(c, PatchSchema);

  const updated = await prisma.supportMessage.update({
    where: { id },
    data: { status: body.status },
  });

  return c.json(updated);
});

supportRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  await prisma.supportMessage.delete({ where: { id } });
  return c.json({ ok: true });
});

export { supportRoutes };
