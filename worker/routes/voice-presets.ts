import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";

/**
 * Public voice presets route — returns active presets available to the user's plan.
 * System default preset is always included regardless of plan.
 */
export const voicePresets = new Hono<{ Bindings: Env }>();

voicePresets.use("*", requireAuth);

/** GET / — List voice presets available to the current user's plan. */
voicePresets.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  // Load user's plan to get allowedVoicePresetIds
  const plan = await prisma.plan.findUnique({
    where: { id: user.planId },
    select: { allowedVoicePresetIds: true },
  });
  const allowedIds: string[] = plan?.allowedVoicePresetIds ?? [];

  // System presets are always available; non-system presets require plan access
  const presets = await prisma.voicePreset.findMany({
    where: {
      isActive: true,
      OR: [
        { isSystem: true },
        ...(allowedIds.length > 0 ? [{ id: { in: allowedIds } }] : []),
      ],
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
    },
  });

  return c.json({ data: presets });
});
