import { createPrismaClient } from "./db";
import type { Env } from "../types";

interface HealthComponent {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  message?: string;
}

interface DeepHealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: HealthComponent[];
}

export async function deepHealthCheck(env: Env): Promise<DeepHealthResponse> {
  const components: HealthComponent[] = [];

  // DB check
  const dbStart = Date.now();
  try {
    const prisma = createPrismaClient(env.HYPERDRIVE);
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      const latency = Date.now() - dbStart;
      components.push({
        name: "database",
        status:
          latency > 5000 ? "unhealthy" : latency > 1000 ? "degraded" : "healthy",
        latencyMs: latency,
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    components.push({
      name: "database",
      status: "unhealthy",
      latencyMs: Date.now() - dbStart,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // R2 check
  const r2Start = Date.now();
  try {
    await env.R2.head("_health-check");
    const latency = Date.now() - r2Start;
    components.push({
      name: "r2",
      status: latency > 2000 ? "degraded" : "healthy",
      latencyMs: latency,
    });
  } catch (err) {
    // R2.head on missing key returns null, not error. An error means R2 is down.
    components.push({
      name: "r2",
      status: "unhealthy",
      latencyMs: Date.now() - r2Start,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // Queue binding check
  components.push({
    name: "queues",
    status:
      typeof env.ORCHESTRATOR_QUEUE?.send === "function"
        ? "healthy"
        : "unhealthy",
    latencyMs: 0,
  });

  const hasUnhealthy = components.some((c) => c.status === "unhealthy");
  const hasDegraded = components.some((c) => c.status === "degraded");

  return {
    status: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    components,
  };
}
