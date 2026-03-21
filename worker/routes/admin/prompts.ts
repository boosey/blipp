import { Hono } from "hono";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import { writeAuditLog } from "../../lib/audit-log";
import {
  PROMPT_CONFIG_KEYS,
  PROMPT_METADATA,
  PROMPT_STAGES,
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

const VALID_STAGES = new Set(Object.keys(PROMPT_STAGES));

async function getNextStageVersion(prisma: any, stage: string): Promise<number> {
  const latest = await prisma.promptVersion.findFirst({
    where: { stage },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

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

/** POST /stages/:stage — Save all prompts for a stage and create one grouped version. */
promptsRoutes.post("/stages/:stage", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const stage = c.req.param("stage");
  const body = await c.req.json<{ values: Record<string, string>; label?: string }>();

  if (!VALID_STAGES.has(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }

  const stageKeys = PROMPT_STAGES[stage];
  if (!body.values || typeof body.values !== "object") {
    return c.json({ error: "values must be a Record<string, string>" }, 400);
  }

  // Validate all provided keys belong to this stage
  for (const key of Object.keys(body.values)) {
    if (!stageKeys.includes(key)) {
      return c.json({ error: `Key "${key}" does not belong to stage "${stage}"` }, 400);
    }
    if (typeof body.values[key] !== "string" || body.values[key].trim().length === 0) {
      return c.json({ error: `Value for "${key}" must be a non-empty string` }, 400);
    }
  }

  try {
    // Upsert each PlatformConfig entry
    for (const key of stageKeys) {
      const value = body.values[key];
      if (!value) continue; // skip keys not provided (keep current)

      const meta = PROMPT_METADATA[key];
      const existing = await prisma.platformConfig.findUnique({ where: { key } });

      if (existing) {
        await prisma.platformConfig.update({
          where: { key },
          data: {
            value,
            description: meta?.description,
            updatedBy: auth?.userId ?? null,
          },
        });
      } else {
        await prisma.platformConfig.create({
          data: {
            key,
            value,
            description: meta?.description,
            updatedBy: auth?.userId ?? null,
          },
        });
      }
    }

    // Build the full snapshot: for keys not in body.values, use the current config or default
    const fullValues: Record<string, string> = {};
    for (const key of stageKeys) {
      if (body.values[key]) {
        fullValues[key] = body.values[key];
      } else {
        const config = await prisma.platformConfig.findUnique({ where: { key } });
        fullValues[key] = config ? (config.value as string) : DEFAULTS[key];
      }
    }

    // Create one grouped version
    const nextVersion = await getNextStageVersion(prisma, stage);
    await prisma.promptVersion.create({
      data: {
        stage,
        version: nextVersion,
        values: fullValues,
        label: body.label ?? null,
        createdBy: auth?.userId ?? null,
      },
    });

    writeAuditLog(prisma, {
      actorId: auth?.userId ?? "unknown",
      action: "prompt.save_stage",
      entityType: "PromptVersion",
      entityId: `${stage}:v${nextVersion}`,
      after: { stage, version: nextVersion, keys: Object.keys(fullValues) },
    }).catch(() => {});

    return c.json({ data: { stage, version: nextVersion, values: fullValues } });
  } catch {
    return c.json({ error: "Failed to save prompts" }, 503);
  }
});

/** DELETE /stages/:stage — Reset all prompts in a stage to defaults. */
promptsRoutes.delete("/stages/:stage", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const stage = c.req.param("stage");

  if (!VALID_STAGES.has(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }

  const stageKeys = PROMPT_STAGES[stage];

  try {
    for (const key of stageKeys) {
      const existing = await prisma.platformConfig.findUnique({ where: { key } });
      if (existing) {
        await prisma.platformConfig.delete({ where: { key } });
      }
    }

    writeAuditLog(prisma, {
      actorId: auth?.userId ?? "unknown",
      action: "prompt.reset_stage",
      entityType: "PlatformConfig",
      entityId: stage,
      after: { stage, keys: stageKeys, values: "DEFAULTS" },
    }).catch(() => {});

    const defaults: Record<string, string> = {};
    for (const key of stageKeys) defaults[key] = DEFAULTS[key];

    return c.json({ data: { stage, values: defaults, isDefault: true } });
  } catch {
    return c.json({ error: "Failed to reset prompts" }, 503);
  }
});

/** GET /stages/:stage/versions — List all grouped versions for a stage. */
promptsRoutes.get("/stages/:stage/versions", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.param("stage");

  if (!VALID_STAGES.has(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }

  const versions = await prisma.promptVersion.findMany({
    where: { stage },
    orderBy: { version: "desc" },
  });

  // Determine active: compare current config values to each version's values
  const stageKeys = PROMPT_STAGES[stage];
  const currentValues: Record<string, string> = {};
  for (const key of stageKeys) {
    const config = await prisma.platformConfig.findUnique({ where: { key } });
    currentValues[key] = config ? (config.value as string) : DEFAULTS[key];
  }

  const data = versions.map((v: any) => {
    const versionValues = v.values as Record<string, string>;
    const isActive = stageKeys.every((key) => versionValues[key] === currentValues[key]);
    return {
      id: v.id,
      stage: v.stage,
      version: v.version,
      label: v.label,
      values: versionValues,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
      isActive,
    };
  });

  return c.json({ data });
});

/** PATCH /stages/:stage/versions/:id/activate — Activate a grouped version (restore all prompt values). */
promptsRoutes.patch("/stages/:stage/versions/:id/activate", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const stage = c.req.param("stage");
  const versionId = c.req.param("id");

  if (!VALID_STAGES.has(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.stage !== stage) {
    return c.json({ error: "Version not found" }, 404);
  }

  const versionValues = version.values as Record<string, string>;

  for (const [key, value] of Object.entries(versionValues)) {
    const meta = PROMPT_METADATA[key];
    await prisma.platformConfig.upsert({
      where: { key },
      create: {
        key,
        value,
        description: meta?.description,
        updatedBy: auth?.userId ?? null,
      },
      update: {
        value,
        description: meta?.description,
        updatedBy: auth?.userId ?? null,
      },
    });
  }

  writeAuditLog(prisma, {
    actorId: auth?.userId ?? "unknown",
    action: "prompt.activate_version",
    entityType: "PromptVersion",
    entityId: versionId,
    after: { stage, version: version.version },
  }).catch(() => {});

  return c.json({ data: { stage, versionId, version: version.version } });
});

/** PATCH /stages/:stage/versions/:id/notes — Update notes on a grouped version. */
promptsRoutes.patch("/stages/:stage/versions/:id/notes", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.param("stage");
  const versionId = c.req.param("id");
  const body = await c.req.json<{ notes: string }>();

  if (!VALID_STAGES.has(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.stage !== stage) {
    return c.json({ error: "Version not found" }, 404);
  }

  await prisma.promptVersion.update({
    where: { id: versionId },
    data: { notes: body.notes },
  });

  return c.json({ data: { id: versionId, notes: body.notes } });
});

export { promptsRoutes };
