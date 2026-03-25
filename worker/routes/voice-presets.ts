import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { checkVoicePresetAccess, loadPresetConfig, extractProviderConfig } from "../lib/voice-presets";
import { generateSpeech } from "../lib/tts";
import { getTtsProviderImpl } from "../lib/tts-providers";
import { resolveModelChain } from "../lib/model-resolution";

/**
 * Public voice presets route — returns active presets available to the user's plan.
 * System default preset is always included regardless of plan.
 */
export const voicePresets = new Hono<{ Bindings: Env }>();

voicePresets.use("*", requireAuth);

/** GET / — List voice presets available to the current user's plan. */
voicePresets.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  // Load user's plan to get allowedVoicePresetIds
  const plan = await prisma.plan.findUnique({
    where: { id: user.planId },
    select: { allowedVoicePresetIds: true },
  });
  const allowedIds: string[] = plan?.allowedVoicePresetIds ?? [];

  // System presets are always available; non-system presets require plan access
  const presets = await prisma.voicePreset.findMany({
    where: {
      isActive: true,
      OR: [
        { isSystem: true },
        ...(allowedIds.length > 0 ? [{ id: { in: allowedIds } }] : []),
      ],
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
    },
  });

  return c.json({ data: presets });
});

const PREVIEW_TEXT = "Here's a quick preview of how this voice sounds for your daily briefing.";

// In-memory rate limit: userId -> { count, resetAt }
const userPreviewLimits = new Map<string, { count: number; resetAt: number }>();

/** POST /:id/preview — Generate a TTS audio preview using a voice preset. */
voicePresets.post("/:id/preview", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const presetId = c.req.param("id");

  // Rate limit: 5 per user per minute
  const now = Date.now();
  const limit = userPreviewLimits.get(user.id);
  if (limit && now < limit.resetAt) {
    if (limit.count >= 5) {
      return c.json({ error: "Rate limit exceeded — max 5 previews per minute" }, 429);
    }
    limit.count++;
  } else {
    userPreviewLimits.set(user.id, { count: 1, resetAt: now + 60_000 });
  }

  // Check plan access
  const accessError = await checkVoicePresetAccess(prisma, user.planId, presetId);
  if (accessError) return c.json({ error: accessError }, 403);

  // Load preset config and resolve TTS model
  const presetConfig = await loadPresetConfig(prisma, presetId);
  if (!presetConfig) return c.json({ error: "Voice preset not found or inactive" }, 404);

  const chain = await resolveModelChain(prisma, "tts");
  if (chain.length === 0) {
    return c.json({ error: "No TTS model configured" }, 500);
  }
  const resolved = chain[0];

  const voiceConfig = extractProviderConfig(presetConfig, resolved.provider);
  const tts = getTtsProviderImpl(resolved.provider);
  const { audio } = await generateSpeech(
    tts,
    PREVIEW_TEXT,
    voiceConfig.voice,
    resolved.providerModelId,
    c.env,
    resolved.pricing,
    voiceConfig.instructions,
    voiceConfig.speed,
  );

  return c.body(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.byteLength),
    },
  });
});
