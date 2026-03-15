import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import { writeAuditLog } from "../../lib/audit-log";

const adsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET / — Returns all ads.* config entries from PlatformConfig.
 */
adsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  try {
    const configs = await prisma.platformConfig.findMany({
      where: { key: { startsWith: "ads." } },
      orderBy: { key: "asc" },
    });

    const data = configs.map((cfg: any) => ({
      id: cfg.id,
      key: cfg.key,
      value: cfg.value,
      description: cfg.description,
      updatedAt: cfg.updatedAt.toISOString(),
      updatedBy: cfg.updatedBy,
    }));

    return c.json({ data });
  } catch {
    return c.json({ data: [] });
  }
});

/**
 * PUT / — Upserts an ad config entry.
 * Body: { key: "ads.preroll.vastUrl", value: "..." }
 */
adsRoutes.put("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await c.req.json<{ key: string; value: unknown; description?: string }>();

  if (!body.key || !body.key.startsWith("ads.")) {
    return c.json({ error: "Key must start with 'ads.'" }, 400);
  }

  try {
    const existing = await prisma.platformConfig.findUnique({
      where: { key: body.key },
    });

    if (existing) {
      const updated = await prisma.platformConfig.update({
        where: { key: body.key },
        data: {
          value: body.value as any,
          ...(body.description !== undefined && { description: body.description }),
          updatedBy: auth?.userId ?? null,
        },
      });

      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "ads.config.update",
        entityType: "PlatformConfig",
        entityId: body.key,
        before: { value: existing.value },
        after: { value: body.value },
      }).catch(() => {});

      return c.json({ data: { id: updated.id, key: updated.key, value: updated.value } });
    } else {
      const created = await prisma.platformConfig.create({
        data: {
          key: body.key,
          value: body.value as any,
          description: body.description,
          updatedBy: auth?.userId ?? null,
        },
      });

      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "ads.config.create",
        entityType: "PlatformConfig",
        entityId: body.key,
        after: { value: body.value },
      }).catch(() => {});

      return c.json({ data: { id: created.id, key: created.key, value: created.value } }, 201);
    }
  } catch {
    return c.json({ error: "Config not available" }, 503);
  }
});

/**
 * POST /test-vast — Validates a VAST tag URL by fetching it and checking for valid XML.
 * Body: { url: "..." }
 */
adsRoutes.post("/test-vast", async (c) => {
  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ valid: false, error: "Invalid request body" });
  }

  if (!body.url) {
    return c.json({ valid: false, error: "URL is required" });
  }

  try {
    const parsed = new URL(body.url);
    if (parsed.protocol !== "https:") {
      return c.json({ valid: false, error: "URL must use HTTPS" });
    }
  } catch {
    return c.json({ valid: false, error: "Invalid URL format" });
  }

  try {
    const response = await fetch(body.url, {
      headers: { Accept: "application/xml, text/xml" },
    });

    if (!response.ok) {
      return c.json({
        valid: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const text = await response.text();
    const hasVastTag = text.includes("<VAST") || text.includes("<vast");

    if (!hasVastTag) {
      return c.json({
        valid: false,
        error: "Response does not contain a VAST tag",
      });
    }

    return c.json({ valid: true });
  } catch (err) {
    return c.json({
      valid: false,
      error: err instanceof Error ? err.message : "Failed to fetch VAST URL",
    });
  }
});

export { adsRoutes };
