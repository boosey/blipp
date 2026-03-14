import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

/** Public plans route — no auth required for listing. */
export const plans = new Hono<{ Bindings: Env }>();

plans.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const allPlans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceCentsMonthly: true,
      priceCentsAnnual: true,
      features: true,
      highlighted: true,
      briefingsPerWeek: true,
      maxDurationMinutes: true,
      maxPodcastSubscriptions: true,
      adFree: true,
      priorityProcessing: true,
      earlyAccess: true,
    },
  });
  return c.json(allPlans);
});

/** GET /current — returns the authenticated user's current plan. */
plans.get("/current", requireAuth, async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { plan: true },
  });
  return c.json({
    plan: {
      id: fullUser.plan.id,
      name: fullUser.plan.name,
      slug: fullUser.plan.slug,
      priceCentsMonthly: fullUser.plan.priceCentsMonthly,
    },
  });
});
