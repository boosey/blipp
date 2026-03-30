import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { validateBody } from "../lib/validation";

const FeedbackSchema = z.object({
  message: z.string().min(1).max(5000),
});

export const feedback = new Hono<{ Bindings: Env }>();

feedback.use("*", requireAuth);

feedback.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await validateBody(c, FeedbackSchema);
  if (body instanceof Response) return body;

  const user = await prisma.user.findUnique({
    where: { clerkId: auth!.userId },
    select: { id: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await prisma.feedback.create({
    data: {
      userId: user.id,
      message: body.message,
    },
  });

  return c.json({ ok: true }, 201);
});
