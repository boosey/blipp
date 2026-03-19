import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import { writeAuditLog } from "../../lib/audit-log";
import {
  PROMPT_CONFIG_KEYS,
  PROMPT_METADATA,
  DEFAULT_CLAIMS_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  DEFAULT_NARRATIVE_USER_TEMPLATE,
  DEFAULT_NARRATIVE_METADATA_INTRO,
} from "../../lib/prompt-defaults";

const DEFAULTS: Record<string, string> = {
  [PROMPT_CONFIG_KEYS.claimsSystem]: DEFAULT_CLAIMS_SYSTEM_PROMPT,
  [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
  [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
  [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: DEFAULT_NARRATIVE_USER_TEMPLATE,
  [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: DEFAULT_NARRATIVE_METADATA_INTRO,
};

const VALID_KEYS = new Set(Object.values(PROMPT_CONFIG_KEYS));

const promptsRoutes = new Hono<{ Bindings: Env }>();

/** GET / — List all prompts with current values (from config or defaults). */
promptsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  const keys = Object.values(PROMPT_CONFIG_KEYS);
  let configs: any[] = [];
  try {
    configs = await prisma.platformConfig.findMany({
      where: { key: { in: keys } },
    });
  } catch {
    // Table may not exist
  }

  const configMap = new Map(configs.map((cfg: any) => [cfg.key, cfg]));

  const data = keys.map((key) => {
    const config = configMap.get(key);
    const meta = PROMPT_METADATA[key];
    return {
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? "",
      stage: meta?.stage ?? "unknown",
      value: config ? (config.value as string) : DEFAULTS[key],
      isDefault: !config,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
      updatedBy: config?.updatedBy ?? null,
    };
  });

  return c.json({ data });
});

/** PATCH /:key — Update a prompt. */
promptsRoutes.patch("/:key", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = decodeURIComponent(c.req.param("key"));
  const body = await c.req.json<{ value: string }>();

  if (!VALID_KEYS.has(key)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  if (typeof body.value !== "string" || body.value.trim().length === 0) {
    return c.json({ error: "Prompt value must be a non-empty string" }, 400);
  }

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key } });
    const meta = PROMPT_METADATA[key];

    if (existing) {
      await prisma.platformConfig.update({
        where: { key },
        data: {
          value: body.value,
          description: meta?.description,
          updatedBy: auth?.userId ?? null,
        },
      });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.update",
        entityType: "PlatformConfig",
        entityId: key,
        before: { value: (existing.value as string).slice(0, 200) + "..." },
        after: { value: body.value.slice(0, 200) + "..." },
      }).catch(() => {});
    } else {
      await prisma.platformConfig.create({
        data: {
          key,
          value: body.value,
          description: meta?.description,
          updatedBy: auth?.userId ?? null,
        },
      });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.create",
        entityType: "PlatformConfig",
        entityId: key,
        after: { value: body.value.slice(0, 200) + "..." },
      }).catch(() => {});
    }

    return c.json({ data: { key, value: body.value, isDefault: false } });
  } catch {
    return c.json({ error: "Failed to update prompt" }, 503);
  }
});

/** DELETE /:key — Reset prompt to default (deletes config entry). */
promptsRoutes.delete("/:key", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const key = decodeURIComponent(c.req.param("key"));

  if (!VALID_KEYS.has(key)) {
    return c.json({ error: "Unknown prompt key" }, 400);
  }

  try {
    const existing = await prisma.platformConfig.findUnique({ where: { key } });
    if (existing) {
      await prisma.platformConfig.delete({ where: { key } });
      writeAuditLog(prisma, {
        actorId: auth?.userId ?? "unknown",
        action: "prompt.reset",
        entityType: "PlatformConfig",
        entityId: key,
        before: { value: (existing.value as string).slice(0, 200) + "..." },
        after: { value: "DEFAULT" },
      }).catch(() => {});
    }

    return c.json({ data: { key, value: DEFAULTS[key], isDefault: true } });
  } catch {
    return c.json({ error: "Failed to reset prompt" }, 503);
  }
});

export { promptsRoutes };
