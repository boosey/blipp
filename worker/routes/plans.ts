import { Hono } from "hono";
import type { Env } from "../types";

/** Public plans route — no auth required. */
export const plans = new Hono<{ Bindings: Env }>();

plans.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const allPlans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      tier: true,
      name: true,
      priceCents: true,
      features: true,
      highlighted: true,
    },
  });
  return c.json(allPlans);
});
