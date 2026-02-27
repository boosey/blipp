import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma";

/**
 * Creates a per-request PrismaClient instance for Cloudflare Workers.
 *
 * Workers reuse isolates across requests, so a global PrismaClient causes
 * connection pool hangs after the first request. This factory creates a
 * fresh client with the Hyperdrive-provided connection string each time.
 *
 * @param hyperdrive - Cloudflare Hyperdrive binding for connection pooling
 * @returns A fresh PrismaClient instance. Caller must disconnect via `ctx.waitUntil(prisma.$disconnect())`.
 */
export function createPrismaClient(hyperdrive: Hyperdrive): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: hyperdrive.connectionString,
  });
  return new PrismaClient({ adapter });
}
