import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { validateBody } from "../lib/validation";

const VALID_REASONS = [
  "blipp_failed",
  "missed_key_points",
  "inaccurate",
  "too_short",
  "too_long",
  "poor_audio",
  "not_interesting",
] as const;

const BlippFeedbackSchema = z.object({
  episodeId: z.string().min(1),
  briefingId: z.string().optional(),
  reasons: z.array(z.enum(VALID_REASONS)).min(1),
  message: z.string().max(2000).optional(),
});

export const blippFeedback = new Hono<{ Bindings: Env }>();

blippFeedback.use("*", requireAuth);

blippFeedback.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await validateBody(c, BlippFeedbackSchema);

  const user = await prisma.user.findUnique({
    where: { clerkId: auth!.userId },
    select: { id: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const isTechnicalFailure = body.reasons.includes("blipp_failed");

  if (isTechnicalFailure) {
    console.warn("BlippFeedback: technical failure reported", {
      userId: user.id,
      episodeId: body.episodeId,
      briefingId: body.briefingId,
      reasons: body.reasons,
    });
  }

  const record = await prisma.blippFeedback.create({
    data: {
      userId: user.id,
      episodeId: body.episodeId,
      briefingId: body.briefingId ?? null,
      reasons: body.reasons,
      message: body.message ?? null,
      isTechnicalFailure,
    },
  });

  return c.json({ id: record.id }, 201);
});
