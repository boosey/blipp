import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";

const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.get("/health", (c) => c.json({ status: "ok" }));

// GET / - All config entries grouped by key prefix
configRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  let configs: any[] = [];
  try {
    configs = await prisma.platformConfig.findMany({
      orderBy: { key: "asc" },
    });
  } catch {
    // PlatformConfig table may not exist
    return c.json({ data: [] });
  }

  // Group by key prefix (e.g., "pipeline.timeout" -> "pipeline")
  const grouped = new Map<string, typeof configs>();
  for (const cfg of configs) {
    const prefix = cfg.key.split(".")[0] ?? "general";
    if (!grouped.has(prefix)) grouped.set(prefix, []);
    grouped.get(prefix)!.push(cfg);
  }

  const data = Array.from(grouped.entries()).map(([category, entries]) => ({
    category,
    entries: entries.map((e: any) => ({
      id: e.id,
      key: e.key,
      value: e.value,
      description: e.description,
      updatedAt: e.updatedAt.toISOString(),
      updatedBy: e.updatedBy,
    })),
  }));

  return c.json({ data });
});

// PATCH /:key - Update a config entry
configRoutes.patch("/:key", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = c.req.param("key");
  const body = await c.req.json<{ value: unknown; description?: string }>();

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key } });

    if (existing) {
      const updated = await prisma.platformConfig.update({
        where: { key },
        data: {
          value: body.value as any,
          ...(body.description !== undefined && { description: body.description }),
          updatedBy: auth?.userId ?? null,
        },
      });
      return c.json({ data: { id: updated.id, key: updated.key, value: updated.value } });
    } else {
      const created = await prisma.platformConfig.create({
        data: {
          key,
          value: body.value as any,
          description: body.description,
          updatedBy: auth?.userId ?? null,
        },
      });
      return c.json({ data: { id: created.id, key: created.key, value: created.value } }, 201);
    }
  } catch {
    return c.json({ error: "Config not available" }, 503);
  }
});

// GET /tiers/duration - Duration tier configuration
configRoutes.get("/tiers/duration", async (c) => {
  const prisma = c.get("prisma") as any;
  const defaults = [
    { minutes: 1, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 2, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 3, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 5, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 7, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 10, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 15, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
    { minutes: 30, cacheHitRate: 0, clipsGenerated: 0, storageCost: 0, usageFrequency: 0 },
  ];

  try {
    const config = await prisma.platformConfig.findUnique({
      where: { key: "tiers.duration" },
    });

    // Enrich with real clip stats
    const clipStats = await prisma.clip.groupBy({
      by: ["durationTier"],
      _count: true,
    });
    const clipMap = new Map(clipStats.map((s: any) => [s.durationTier, s._count]));

    const tiers = (config?.value as typeof defaults | null) ?? defaults;
    const enriched = tiers.map((t) => ({
      ...t,
      clipsGenerated: clipMap.get(t.minutes) ?? t.clipsGenerated,
    }));

    return c.json({ data: enriched });
  } catch {
    // PlatformConfig table may not exist
    return c.json({ data: defaults });
  }
});

// PUT /tiers/duration - Update duration tiers
configRoutes.put("/tiers/duration", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await c.req.json<{ tiers: unknown }>();

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key: "tiers.duration" } });

    if (existing) {
      await prisma.platformConfig.update({
        where: { key: "tiers.duration" },
        data: { value: body.tiers as any, updatedBy: auth?.userId ?? null },
      });
    } else {
      await prisma.platformConfig.create({
        data: {
          key: "tiers.duration",
          value: body.tiers as any,
          description: "Duration tier configuration",
          updatedBy: auth?.userId ?? null,
        },
      });
    }

    return c.json({ data: { success: true } });
  } catch {
    return c.json({ error: "Config not available" }, 503);
  }
});

// GET /features - Feature flags
configRoutes.get("/features", async (c) => {
  const prisma = c.get("prisma") as any;
  let features: any[] = [];
  try {
    features = await prisma.platformConfig.findMany({
      where: { key: { startsWith: "feature." } },
      orderBy: { key: "asc" },
    });
  } catch {
    // PlatformConfig table may not exist
    return c.json({ data: [] });
  }

  const data = features.map((f: any) => {
    const val = f.value as Record<string, unknown> | null;
    return {
      id: f.id,
      name: f.key.replace("feature.", ""),
      enabled: (val?.enabled as boolean) ?? false,
      rolloutPercentage: (val?.rolloutPercentage as number) ?? 100,
      planAvailability: (val?.planAvailability as string[]) ?? ["free", "pro", "pro-plus"],
      description: f.description,
    };
  });

  return c.json({ data });
});

// PUT /features/:id - Toggle a feature flag
configRoutes.put("/features/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await c.req.json<{
    enabled?: boolean;
    rolloutPercentage?: number;
    planAvailability?: string[];
    description?: string;
  }>();

  try {
    const feature = await prisma.platformConfig.findUnique({
      where: { id: c.req.param("id") },
    });

    if (!feature) return c.json({ error: "Feature not found" }, 404);

    const currentVal = (feature.value as Record<string, unknown>) ?? {};
    const newVal = {
      ...currentVal,
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.rolloutPercentage !== undefined && { rolloutPercentage: body.rolloutPercentage }),
      ...(body.planAvailability !== undefined && { planAvailability: body.planAvailability }),
    };

    const updated = await prisma.platformConfig.update({
      where: { id: feature.id },
      data: {
        value: newVal as any,
        ...(body.description !== undefined && { description: body.description }),
        updatedBy: auth?.userId ?? null,
      },
    });

    return c.json({
      data: {
        id: updated.id,
        name: updated.key.replace("feature.", ""),
        enabled: (newVal.enabled as boolean) ?? false,
        rolloutPercentage: (newVal.rolloutPercentage as number) ?? 100,
        planAvailability: (newVal.planAvailability as string[]) ?? ["free", "pro", "pro-plus"],
        description: updated.description,
      },
    });
  } catch {
    return c.json({ error: "Config not available" }, 503);
  }
});

export { configRoutes };
