import { Hono } from "hono";
import { z } from "zod/v4";
import type { Env } from "../types";
import { validateBody } from "../lib/validation";

const SupportSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

export const support = new Hono<{ Bindings: Env }>();

support.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await validateBody(c, SupportSchema);

  await prisma.supportMessage.create({
    data: {
      name: body.name || null,
      email: body.email,
      subject: body.subject,
      message: body.message,
      userAgent: c.req.header("user-agent") ?? null,
    },
  });

  return c.json({ ok: true }, 201);
});
