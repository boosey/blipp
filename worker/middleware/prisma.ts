import { createMiddleware } from "hono/factory";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

/**
 * Hono middleware: creates a per-request PrismaClient on c.get("prisma")
 * and disconnects automatically via waitUntil.
 */
export const prismaMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const prisma = createPrismaClient(c.env.HYPERDRIVE);
    c.set("prisma", prisma);
    try {
      await next();
    } finally {
      c.executionCtx.waitUntil(prisma.$disconnect());
    }
  }
);
