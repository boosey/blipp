import { Hono } from "hono";
import { z } from "zod/v4";
import { getAuth } from "../../middleware/auth";
import type { Env } from "../../types";
import { writeAuditLog } from "../../lib/audit-log";
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";
import { validateBody } from "../../lib/validation";
import { generateSpeech } from "../../lib/tts/tts";
import { getTtsProviderImpl } from "../../lib/tts/providers";
import { resolveModelChain } from "../../lib/model-resolution";

const PREVIEW_DEFAULT_TEXT = "Here's a quick preview of how this voice sounds for your daily briefing.";
const PREVIEW_MAX_CHARS = 200;

const PreviewSchema = z.object({
  provider: z.string().min(1),
  voice: z.string().min(1),
  instructions: z.string().max(500).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  text: z.string().max(PREVIEW_MAX_CHARS).optional(),
});

// In-memory rate limit: admin ID -> { count, resetAt }
const adminPreviewLimits = new Map<string, { count: number; resetAt: number }>();

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isSystem: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  voiceCharacteristics: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const voicePresetsRoutes = new Hono<{ Bindings: Env }>();

/** GET /tts-chain — Return the active TTS provider/model chain. */
voicePresetsRoutes.get("/tts-chain", async (c) => {
  const prisma = c.get("prisma") as any;
  const chain = await resolveModelChain(prisma, "tts");
  return c.json({
    data: chain.map((m) => ({
      provider: m.provider,
      model: m.model,
      providerModelId: m.providerModelId,
    })),
  });
});

/** GET / — List all voice presets with pagination and sorting. */
voicePresetsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c, "name", ["name", "createdAt", "updatedAt", "isSystem", "isActive"]);

  const where: any = {};
  const q = c.req.query("q")?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  const active = c.req.query("active");
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const [presets, total] = await Promise.all([
    prisma.voicePreset.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        _count: { select: { clips: true, subscriptions: true, users: true } },
      },
    }),
    prisma.voicePreset.count({ where }),
  ]);

  const data = presets.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isSystem: p.isSystem,
    isActive: p.isActive,
    config: p.config,
    clipCount: p._count.clips,
    subscriptionCount: p._count.subscriptions,
    defaultUserCount: p._count.users,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return c.json(paginatedResponse(data, total, page, pageSize));
});

/** GET /:id — Get a single voice preset by ID. */
voicePresetsRoutes.get("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");

  const preset = await prisma.voicePreset.findUnique({
    where: { id },
    include: {
      _count: { select: { clips: true, subscriptions: true, users: true } },
    },
  });

  if (!preset) return c.json({ error: "Voice preset not found" }, 404);

  return c.json({
    data: {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      isSystem: preset.isSystem,
      isActive: preset.isActive,
      config: preset.config,
      clipCount: preset._count.clips,
      subscriptionCount: preset._count.subscriptions,
      defaultUserCount: preset._count.users,
      createdAt: preset.createdAt.toISOString(),
      updatedAt: preset.updatedAt.toISOString(),
    },
  });
});

/** POST / — Create a new voice preset. */
voicePresetsRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const body = await validateBody(c, CreateSchema);

  const preset = await prisma.voicePreset.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      isSystem: body.isSystem ?? false,
      isActive: body.isActive ?? true,
      config: body.config,
    },
  });

  writeAuditLog(prisma, {
    actorId: auth?.userId ?? "unknown",
    action: "voice_preset.create",
    entityType: "VoicePreset",
    entityId: preset.id,
    after: { name: preset.name, isSystem: preset.isSystem },
  }).catch(() => {});

  return c.json({ data: preset }, 201);
});

/** PATCH /:id — Update a voice preset. */
voicePresetsRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const id = c.req.param("id");
  const body = await validateBody(c, UpdateSchema);

  const existing = await prisma.voicePreset.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Voice preset not found" }, 404);

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.config !== undefined) data.config = body.config;
  if (body.voiceCharacteristics !== undefined) data.voiceCharacteristics = body.voiceCharacteristics;

  const preset = await prisma.voicePreset.update({ where: { id }, data });

  writeAuditLog(prisma, {
    actorId: auth?.userId ?? "unknown",
    action: "voice_preset.update",
    entityType: "VoicePreset",
    entityId: id,
    before: { name: existing.name, isActive: existing.isActive },
    after: { name: preset.name, isActive: preset.isActive },
  }).catch(() => {});

  return c.json({ data: preset });
});

/** DELETE /:id — Delete a voice preset. System presets cannot be deleted. */
voicePresetsRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const id = c.req.param("id");

  const existing = await prisma.voicePreset.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Voice preset not found" }, 404);

  if (existing.isSystem) {
    return c.json({ error: "System voice presets cannot be deleted" }, 403);
  }

  // Clear references: subscriptions and users that point to this preset
  await Promise.all([
    prisma.subscription.updateMany({
      where: { voicePresetId: id },
      data: { voicePresetId: null },
    }),
    prisma.user.updateMany({
      where: { defaultVoicePresetId: id },
      data: { defaultVoicePresetId: null },
    }),
  ]);

  await prisma.voicePreset.delete({ where: { id } });

  writeAuditLog(prisma, {
    actorId: auth?.userId ?? "unknown",
    action: "voice_preset.delete",
    entityType: "VoicePreset",
    entityId: id,
    before: { name: existing.name, isSystem: existing.isSystem },
  }).catch(() => {});

  return c.json({ data: { deleted: true } });
});

/** POST /preview — Generate a TTS audio preview for a voice configuration. */
voicePresetsRoutes.post("/preview", async (c) => {
  const prisma = c.get("prisma") as any;
  const auth = getAuth(c);
  const adminId = auth?.userId ?? "unknown";

  // Rate limit: 10 per admin per minute
  const now = Date.now();
  const limit = adminPreviewLimits.get(adminId);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 10) {
      return c.json({ error: "Rate limit exceeded — max 10 previews per minute" }, 429);
    }
    limit.count++;
  } else {
    adminPreviewLimits.set(adminId, { count: 1, resetAt: now + 60_000 });
  }

  const body = await validateBody(c, PreviewSchema);
  const text = body.text || PREVIEW_DEFAULT_TEXT;

  // Find a TTS model matching the requested provider
  const chain = await resolveModelChain(prisma, "tts");
  const resolved = chain.find((m) => m.provider === body.provider);
  if (!resolved) {
    return c.json({ error: `No TTS model configured for provider: ${body.provider}` }, 400);
  }

  const tts = getTtsProviderImpl(body.provider);
  const { audio } = await generateSpeech(
    tts,
    text,
    body.voice,
    resolved.providerModelId,
    c.env,
    resolved.pricing,
    body.instructions,
    body.speed,
  );

  return c.body(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.byteLength),
    },
  });
});
