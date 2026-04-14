import { Hono } from "hono";
import type { Env } from "../../types";
import { getAuth } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit-log";
import { encryptKey, decryptKey, maskKey } from "../../lib/service-key-crypto";
import { runHealthCheck } from "../../lib/service-key-health";
import {
  SERVICE_KEY_CONTEXTS,
  getContextsByGroup,
  getContextDef,
} from "../../lib/service-key-registry";
import { getConfig } from "../../lib/config";

const serviceKeysRoutes = new Hono<{ Bindings: Env }>();

serviceKeysRoutes.get("/health", (c) => c.json({ status: "ok" }));

// ── Helpers ──

function getActorId(c: any): string {
  const apiKeyUserId = c.get("apiKeyUserId") as string | undefined;
  if (apiKeyUserId) return apiKeyUserId;
  try {
    return getAuth(c)?.userId ?? "unknown";
  } catch {
    return "unknown";
  }
}

function requireEncryptionKey(env: Env): string {
  const key = env.SERVICE_KEY_ENCRYPTION_KEY;
  if (!key) throw new Error("SERVICE_KEY_ENCRYPTION_KEY not configured");
  return key;
}

// ── GET / — List all service keys ──

serviceKeysRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;

  try {
    const keys = await prisma.serviceKey.findMany({
      orderBy: [{ provider: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        provider: true,
        envKey: true,
        maskedPreview: true,
        isPrimary: true,
        lastValidated: true,
        lastValidatedOk: true,
        lastRotated: true,
        rotateAfterDays: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Compute rotation overdue status
    const now = Date.now();
    const enriched = keys.map((k: any) => ({
      ...k,
      rotationOverdue:
        k.rotateAfterDays && k.lastRotated
          ? now - new Date(k.lastRotated).getTime() >
            k.rotateAfterDays * 86400000
          : false,
    }));

    return c.json({ data: enriched });
  } catch (err) {
    // Table may not exist yet
    return c.json({ data: [] });
  }
});

// ── POST / — Create a service key ──

serviceKeysRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const env = c.env;
  const masterKey = requireEncryptionKey(env);

  const body = await c.req.json<{
    name: string;
    provider: string;
    envKey: string;
    value: string;
    isPrimary?: boolean;
    rotateAfterDays?: number;
    notes?: string;
  }>();

  if (!body.name || !body.provider || !body.envKey || !body.value) {
    return c.json(
      { error: "name, provider, envKey, and value are required" },
      400
    );
  }

  // Encrypt the key value
  const { encrypted, iv } = await encryptKey(body.value, masterKey);
  const masked = maskKey(body.value);

  // If marking as primary, unset any existing primary for this envKey
  if (body.isPrimary) {
    await prisma.serviceKey.updateMany({
      where: { envKey: body.envKey, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const sk = await prisma.serviceKey.create({
    data: {
      name: body.name,
      provider: body.provider,
      envKey: body.envKey,
      encryptedValue: encrypted,
      iv,
      maskedPreview: masked,
      isPrimary: body.isPrimary ?? false,
      lastRotated: new Date(),
      rotateAfterDays: body.rotateAfterDays ?? null,
      notes: body.notes ?? null,
    },
  });

  // Sync to CF Workers secret if primary
  if (body.isPrimary) {
    await syncToCfSecret(env, body.envKey, body.value).catch((err) => {
      console.error(
        JSON.stringify({
          level: "error",
          action: "cf_secret_sync_failed",
          envKey: body.envKey,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    });
  }

  writeAuditLog(prisma, {
    actorId: getActorId(c),
    action: "service_key.create",
    entityType: "ServiceKey",
    entityId: sk.id,
    metadata: { provider: body.provider, envKey: body.envKey, isPrimary: body.isPrimary },
  }).catch(() => {});

  return c.json(
    {
      data: {
        id: sk.id,
        name: sk.name,
        provider: sk.provider,
        envKey: sk.envKey,
        maskedPreview: sk.maskedPreview,
        isPrimary: sk.isPrimary,
        createdAt: sk.createdAt,
      },
    },
    201
  );
});

// ── PUT /:id — Update a key's value ──

serviceKeysRoutes.put("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const env = c.env;
  const masterKey = requireEncryptionKey(env);
  const id = c.req.param("id");

  const existing = await prisma.serviceKey.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Service key not found" }, 404);

  const body = await c.req.json<{
    value?: string;
    name?: string;
    isPrimary?: boolean;
    rotateAfterDays?: number;
    notes?: string;
  }>();

  const updateData: any = {};

  if (body.value) {
    const { encrypted, iv } = await encryptKey(body.value, masterKey);
    updateData.encryptedValue = encrypted;
    updateData.iv = iv;
    updateData.maskedPreview = maskKey(body.value);
    updateData.lastRotated = new Date();
  }
  if (body.name !== undefined) updateData.name = body.name;
  if (body.rotateAfterDays !== undefined)
    updateData.rotateAfterDays = body.rotateAfterDays;
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (body.isPrimary !== undefined) {
    updateData.isPrimary = body.isPrimary;
    if (body.isPrimary) {
      // Unset other primaries for this envKey
      await prisma.serviceKey.updateMany({
        where: { envKey: existing.envKey, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }
  }

  const updated = await prisma.serviceKey.update({
    where: { id },
    data: updateData,
  });

  // Sync to CF if this is (or became) the primary key and value changed
  if (updated.isPrimary && body.value) {
    await syncToCfSecret(env, existing.envKey, body.value).catch((err) => {
      console.error(
        JSON.stringify({
          level: "error",
          action: "cf_secret_sync_failed",
          envKey: existing.envKey,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    });
  }

  writeAuditLog(prisma, {
    actorId: getActorId(c),
    action: "service_key.update",
    entityType: "ServiceKey",
    entityId: id,
    before: { maskedPreview: existing.maskedPreview },
    after: { maskedPreview: updated.maskedPreview },
  }).catch(() => {});

  return c.json({
    data: {
      id: updated.id,
      name: updated.name,
      maskedPreview: updated.maskedPreview,
      isPrimary: updated.isPrimary,
      cfSynced: updated.isPrimary && !!body.value,
    },
  });
});

// ── DELETE /:id — Delete a key ──

serviceKeysRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const existing = await prisma.serviceKey.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Service key not found" }, 404);

  // Check if any context assignments reference this key
  const assignments = await prisma.platformConfig.findMany({
    where: {
      key: { startsWith: "serviceKey.assignment." },
      value: id,
    },
  });
  if (assignments.length > 0) {
    const contexts = assignments.map((a: any) =>
      a.key.replace("serviceKey.assignment.", "")
    );
    return c.json(
      {
        error: `Cannot delete: key is assigned to contexts: ${contexts.join(", ")}`,
      },
      409
    );
  }

  await prisma.serviceKey.delete({ where: { id } });

  writeAuditLog(prisma, {
    actorId: getActorId(c),
    action: "service_key.delete",
    entityType: "ServiceKey",
    entityId: id,
    metadata: { provider: existing.provider, envKey: existing.envKey },
  }).catch(() => {});

  return c.json({ data: { id, deleted: true } });
});

// ── POST /:id/validate — Health check a single key ──

serviceKeysRoutes.post("/:id/validate", async (c) => {
  const prisma = c.get("prisma") as any;
  const env = c.env;
  const masterKey = requireEncryptionKey(env);
  const id = c.req.param("id");

  const sk = await prisma.serviceKey.findUnique({ where: { id } });
  if (!sk) return c.json({ error: "Service key not found" }, 404);

  const plaintext = await decryptKey(sk.encryptedValue, sk.iv, masterKey);

  // For Podcast Index, also need the secret
  let extra: { secret?: string; projectId?: string } | undefined;
  if (sk.provider === "podcast-index") {
    // Find the PODCAST_INDEX_SECRET key for this provider
    const secretKey = await prisma.serviceKey.findFirst({
      where: { envKey: "PODCAST_INDEX_SECRET" },
      orderBy: { isPrimary: "desc" },
    });
    const secret = secretKey
      ? await decryptKey(secretKey.encryptedValue, secretKey.iv, masterKey)
      : (env.PODCAST_INDEX_SECRET as string);
    extra = { secret };
  } else if (sk.provider === "neon") {
    extra = { projectId: env.NEON_PROJECT_ID ?? "" };
  }

  const resultPromise = runHealthCheck(sk.provider, plaintext, extra);
  if (!resultPromise) {
    return c.json({
      data: { valid: null, message: "No health check available for this provider" },
    });
  }

  const result = await resultPromise;

  // Persist result
  await prisma.serviceKey.update({
    where: { id },
    data: {
      lastValidated: new Date(),
      lastValidatedOk: result.valid,
    },
  });

  return c.json({ data: result });
});

// ── POST /validate-all — Batch health check ──

serviceKeysRoutes.post("/validate-all", async (c) => {
  const prisma = c.get("prisma") as any;
  const env = c.env;
  const masterKey = requireEncryptionKey(env);

  const keys = await prisma.serviceKey.findMany();
  const results: Array<{
    id: string;
    name: string;
    provider: string;
    result: { valid: boolean; latencyMs: number; error?: string } | null;
  }> = [];

  await Promise.allSettled(
    keys.map(async (sk: any) => {
      const plaintext = await decryptKey(
        sk.encryptedValue,
        sk.iv,
        masterKey
      );

      let extra: { secret?: string; projectId?: string } | undefined;
      if (sk.provider === "podcast-index") {
        const secretKey = await prisma.serviceKey.findFirst({
          where: { envKey: "PODCAST_INDEX_SECRET" },
          orderBy: { isPrimary: "desc" },
        });
        const secret = secretKey
          ? await decryptKey(secretKey.encryptedValue, secretKey.iv, masterKey)
          : (env.PODCAST_INDEX_SECRET as string);
        extra = { secret };
      } else if (sk.provider === "neon") {
        extra = { projectId: env.NEON_PROJECT_ID ?? "" };
      }

      const resultPromise = runHealthCheck(sk.provider, plaintext, extra);
      const result = resultPromise ? await resultPromise : null;

      // Persist
      if (result) {
        await prisma.serviceKey.update({
          where: { id: sk.id },
          data: {
            lastValidated: new Date(),
            lastValidatedOk: result.valid,
          },
        });
      }

      results.push({
        id: sk.id,
        name: sk.name,
        provider: sk.provider,
        result,
      });
    })
  );

  return c.json({ data: results });
});

// ── GET /:id/usage — Usage/cost data for a key ──

serviceKeysRoutes.get("/:id/usage", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const sk = await prisma.serviceKey.findUnique({
    where: { id },
    select: { provider: true, envKey: true },
  });
  if (!sk) return c.json({ error: "Service key not found" }, 404);

  // Find which contexts this key is assigned to, or infer from envKey
  const matchingContexts = SERVICE_KEY_CONTEXTS.filter(
    (ctx) => ctx.envKey === sk.envKey && ctx.usageTrackable
  );

  if (matchingContexts.length === 0) {
    return c.json({
      data: { totalCost: 0, totalRequests: 0, dailyBreakdown: [] },
    });
  }

  const stages = [
    ...new Set(matchingContexts.flatMap((ctx) => ctx.pipelineStages ?? [])),
  ];

  if (stages.length === 0) {
    return c.json({
      data: { totalCost: 0, totalRequests: 0, dailyBreakdown: [] },
    });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  try {
    const dailyRows: Array<{
      day: string;
      total_cost: number;
      requests: number;
      input_tokens: number;
      output_tokens: number;
    }> = await prisma.$queryRawUnsafe(
      `SELECT DATE("completedAt") as day,
              COALESCE(SUM(cost), 0)::float as total_cost,
              COUNT(*)::int as requests,
              COALESCE(SUM("inputTokens"), 0)::int as input_tokens,
              COALESCE(SUM("outputTokens"), 0)::int as output_tokens
       FROM "PipelineStep"
       WHERE stage = ANY($1::text[])
         AND "completedAt" >= $2
         AND status = 'COMPLETED'
       GROUP BY DATE("completedAt")
       ORDER BY day DESC`,
      stages,
      thirtyDaysAgo
    );

    const totalCost = dailyRows.reduce((s, r) => s + r.total_cost, 0);
    const totalRequests = dailyRows.reduce((s, r) => s + r.requests, 0);

    return c.json({
      data: {
        totalCost: Math.round(totalCost * 10000) / 10000,
        totalRequests,
        dailyBreakdown: dailyRows.map((r) => ({
          date: r.day,
          cost: Math.round(r.total_cost * 10000) / 10000,
          requests: r.requests,
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
        })),
      },
    });
  } catch {
    return c.json({
      data: { totalCost: 0, totalRequests: 0, dailyBreakdown: [] },
    });
  }
});

// ── PATCH /:id/config — Update rotation policy and notes ──

serviceKeysRoutes.patch("/:id/config", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const existing = await prisma.serviceKey.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Service key not found" }, 404);

  const body = await c.req.json<{
    rotateAfterDays?: number | null;
    notes?: string | null;
  }>();

  const updateData: any = {};
  if (body.rotateAfterDays !== undefined)
    updateData.rotateAfterDays = body.rotateAfterDays;
  if (body.notes !== undefined) updateData.notes = body.notes;

  const updated = await prisma.serviceKey.update({
    where: { id },
    data: updateData,
  });

  return c.json({
    data: {
      id: updated.id,
      rotateAfterDays: updated.rotateAfterDays,
      notes: updated.notes,
    },
  });
});

// ── GET /contexts — List all available usage contexts with registered providers ──

serviceKeysRoutes.get("/contexts", async (c) => {
  const prisma = c.get("prisma") as any;
  const groups = getContextsByGroup();

  // For AI Pipeline contexts, fetch registered providers from the model registry
  // so the UI can show a key slot per provider per stage
  const STAGE_TO_AI_STAGE: Record<string, string> = {
    "pipeline.distillation": "distillation",
    "pipeline.narrative": "narrative",
    "pipeline.tts": "tts",
    "pipeline.stt": "stt",
    "catalog.geo-classification": "distillation",
  };

  let registeredProviders: Record<string, string[]> = {};
  try {
    // Get all active model providers grouped by stage
    const models = await prisma.aiModel.findMany({
      where: { isActive: true },
      select: {
        stages: true,
        providers: {
          where: { isAvailable: true },
          select: { provider: true },
        },
      },
    });

    // Build stage → provider[] map
    const stageProviders: Record<string, Set<string>> = {};
    for (const model of models) {
      for (const stage of (model.stages as string[])) {
        if (!stageProviders[stage]) stageProviders[stage] = new Set();
        for (const p of model.providers) {
          stageProviders[stage].add(p.provider);
        }
      }
    }

    // Map context identifiers to their registered providers
    for (const [ctx, aiStage] of Object.entries(STAGE_TO_AI_STAGE)) {
      const providers = stageProviders[aiStage];
      if (providers) {
        registeredProviders[ctx] = [...providers].sort();
      }
    }
  } catch {
    // Model registry may not be populated yet
  }

  return c.json({ data: groups, registeredProviders });
});

// ── GET /assignments — Get all context→key assignments ──

serviceKeysRoutes.get("/assignments", async (c) => {
  const prisma = c.get("prisma") as any;

  try {
    const configs = await prisma.platformConfig.findMany({
      where: { key: { startsWith: "serviceKey.assignment." } },
    });

    const assignments: Record<string, string> = {};
    for (const cfg of configs) {
      const context = cfg.key.replace("serviceKey.assignment.", "");
      assignments[context] = cfg.value;
    }

    return c.json({ data: assignments });
  } catch {
    return c.json({ data: {} });
  }
});

// ── PUT /assignments/:context — Set context key assignment ──
// Supports both simple (context) and provider-scoped (context.provider) assignments.
// For pipeline stages, use provider-scoped: PUT /assignments/pipeline.distillation.anthropic

serviceKeysRoutes.put("/assignments/:context", async (c) => {
  const prisma = c.get("prisma") as any;
  const rawContext = c.req.param("context");

  // Parse context — may be "pipeline.distillation.anthropic" (provider-scoped)
  // or "billing.stripe" (simple)
  const parts = rawContext.split(".");
  const baseContext = parts.length >= 3 && parts[0] === "pipeline"
    ? `${parts[0]}.${parts[1]}`
    : parts.length >= 3 && parts[0] === "catalog"
      ? `${parts[0]}.${parts[1]}`
      : rawContext;

  // Validate the base context exists in the registry
  const ctxDef = getContextDef(baseContext);
  if (!ctxDef) {
    return c.json({ error: `Unknown context: ${baseContext}` }, 400);
  }

  const body = await c.req.json<{ serviceKeyId: string | null }>();
  const configKey = `serviceKey.assignment.${rawContext}`;

  if (body.serviceKeyId === null) {
    // Remove assignment (revert to env default)
    await prisma.platformConfig
      .delete({ where: { key: configKey } })
      .catch(() => {});
  } else {
    // Verify the key exists
    const sk = await prisma.serviceKey.findUnique({
      where: { id: body.serviceKeyId },
    });
    if (!sk) return c.json({ error: "Service key not found" }, 404);

    // Upsert the assignment
    await prisma.platformConfig.upsert({
      where: { key: configKey },
      update: { value: body.serviceKeyId },
      create: { key: configKey, value: body.serviceKeyId },
    });
  }

  writeAuditLog(prisma, {
    actorId: getActorId(c),
    action: "service_key.assign",
    entityType: "ServiceKeyAssignment",
    entityId: rawContext,
    metadata: { serviceKeyId: body.serviceKeyId },
  }).catch(() => {});

  return c.json({ data: { context: rawContext, serviceKeyId: body.serviceKeyId } });
});

// ── CF Secret Sync ──

async function syncToCfSecret(
  env: Env,
  secretName: string,
  secretValue: string
): Promise<void> {
  const cfToken = env.CF_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  const scriptName = env.WORKER_SCRIPT_NAME;

  if (!cfToken || !accountId || !scriptName) {
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "cf_secret_sync_skipped",
        reason: "CF_API_TOKEN, CF_ACCOUNT_ID, or WORKER_SCRIPT_NAME not configured",
        secretName,
        ts: new Date().toISOString(),
      })
    );
    return;
  }

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: secretName,
        text: secretValue,
        type: "secret_text",
      }),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`CF API ${resp.status}: ${body.slice(0, 500)}`);
  }
}

export { serviceKeysRoutes };
