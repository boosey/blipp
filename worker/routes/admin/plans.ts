import { Hono } from "hono";
import type { Env } from "../../types";
import {
  parsePagination,
  parseSort,
  paginatedResponse,
} from "../../lib/admin-helpers";
import { writeAuditLog } from "../../lib/audit-log";
import { getAuth } from "../../middleware/auth";

const plansRoutes = new Hono<{ Bindings: Env }>();

/** Fields allowed in Plan create/update via admin API. */
const PLAN_WRITABLE_FIELDS = [
  "name",
  "slug",
  "description",
  // Limits
  "briefingsPerWeek",
  "maxDurationMinutes",
  "maxPodcastSubscriptions",
  "pastEpisodesLimit",
  // Content Delivery
  "transcriptAccess",
  "dailyDigest",
  // Pipeline & Processing
  "concurrentPipelineJobs",
  // Feature flags
  "adFree",
  "priorityProcessing",
  "earlyAccess",
  // Personalization

  "offlineAccess",
  "publicSharing",
  // Billing
  "priceCentsMonthly",
  "priceCentsAnnual",
  "stripePriceIdMonthly",
  "stripePriceIdAnnual",
  "trialDays",
  "allowedVoicePresetIds",
  // Display
  "features",
  "highlighted",
  "active",
  "sortOrder",
  "isDefault",
] as const;

function pickPlanFields(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of PLAN_WRITABLE_FIELDS) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}

// GET / — List all plans with user counts, paginated/sortable
plansRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c, "sortOrder", ["sortOrder", "name", "slug", "priceCentsMonthly", "createdAt", "active"]);

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
  const sanitized = pickPlanFields(body);

  // Require at minimum name and slug for creation
  if (!sanitized.name || !sanitized.slug) {
    return c.json({ error: "name and slug are required" }, 400);
  }

  // Validate slug uniqueness
  const existing = await prisma.plan.findUnique({
    where: { slug: sanitized.slug as string },
  });
  if (existing) {
    return c.json({ error: `Plan with slug "${sanitized.slug}" already exists` }, 409);
  }

  // If isDefault is true, unset on all other plans first
  if (sanitized.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.create({
    data: sanitized,
    include: { _count: { select: { users: true } } },
  });

  writeAuditLog(prisma, {
    actorId: getAuth(c)!.userId!,
    action: "plan.create",
    entityType: "Plan",
    entityId: plan.id,
    after: sanitized,
  }).catch(() => {});

  return c.json({ data: plan }, 201);
});

// PATCH /:id — Update plan fields
plansRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();
  const sanitized = pickPlanFields(body);

  if (Object.keys(sanitized).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Plan not found" }, 404);

  // If slug is being changed, validate uniqueness
  if (sanitized.slug && sanitized.slug !== existing.slug) {
    const slugTaken = await prisma.plan.findUnique({
      where: { slug: sanitized.slug as string },
    });
    if (slugTaken) {
      return c.json({ error: `Plan with slug "${sanitized.slug}" already exists` }, 409);
    }
  }

  // If setting isDefault to true, unset on all other plans first
  if (sanitized.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const plan = await prisma.plan.update({
    where: { id },
    data: sanitized,
    include: { _count: { select: { users: true } } },
  });

  writeAuditLog(prisma, {
    actorId: getAuth(c)!.userId!,
    action: "plan.update",
    entityType: "Plan",
    entityId: id,
    before: { name: existing.name, slug: existing.slug },
    after: sanitized,
  }).catch(() => {});

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

  writeAuditLog(prisma, {
    actorId: getAuth(c)!.userId!,
    action: "plan.delete",
    entityType: "Plan",
    entityId: id,
  }).catch(() => {});

  return c.json({ data: updated });
});

export { plansRoutes };
