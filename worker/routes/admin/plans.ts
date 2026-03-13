import { Hono } from "hono";
import type { Env } from "../../types";
import {
  parsePagination,
  parseSort,
  paginatedResponse,
} from "../../lib/admin-helpers";

const plansRoutes = new Hono<{ Bindings: Env }>();

// GET / — List all plans with user counts, paginated/sortable
plansRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c, "sortOrder");

  const [plans, total] = await Promise.all([
    prisma.plan.findMany({
      skip,
      take: pageSize,
      orderBy,
      include: { _count: { select: { users: true } } },
    }),
    prisma.plan.count(),
  ]);

  return c.json(paginatedResponse(plans, total, page, pageSize));
});

// GET /:id — Single plan with user count
plansRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!plan) return c.json({ error: "Plan not found" }, 404);

  return c.json({ data: plan });
});

// POST / — Create plan
plansRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();

  // Validate slug uniqueness
  if (body.slug) {
    const existing = await prisma.plan.findUnique({
      where: { slug: body.slug },
    });
    if (existing) {
      return c.json({ error: `Plan with slug "${body.slug}" already exists` }, 409);
    }
  }

  // If isDefault is true, unset on all other plans first
  if (body.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.create({
    data: body,
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: plan }, 201);
});

// PATCH /:id — Update plan fields
plansRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Plan not found" }, 404);

  // If slug is being changed, validate uniqueness
  if (body.slug && body.slug !== existing.slug) {
    const slugTaken = await prisma.plan.findUnique({
      where: { slug: body.slug },
    });
    if (slugTaken) {
      return c.json({ error: `Plan with slug "${body.slug}" already exists` }, 409);
    }
  }

  // If setting isDefault to true, unset on all other plans first
  if (body.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.update({
    where: { id },
    data: body,
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: plan });
});

// DELETE /:id — Soft delete (set active: false)
plansRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!plan) return c.json({ error: "Plan not found" }, 404);

  if (plan._count.users > 0) {
    return c.json(
      {
        error: `Cannot deactivate plan with ${plan._count.users} active user(s). Migrate users first.`,
      },
      409
    );
  }

  const updated = await prisma.plan.update({
    where: { id },
    data: { active: false },
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: updated });
});

export { plansRoutes };
