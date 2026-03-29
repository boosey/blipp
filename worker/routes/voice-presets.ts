import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { checkVoicePresetAccess, loadPresetConfig, extractProviderConfig } from "../lib/voice-presets";
import { generateSpeech } from "../lib/tts/tts";
import { getTtsProviderImpl } from "../lib/tts/providers";
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

/** POST /:id/preview — Generate a TTS audio preview using a voice preset. */
voicePresets.post("/:id/preview", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);
  const presetId = c.req.param("id");

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

  // Hash all inputs that affect audio output so cache auto-invalidates on changes
  const hashInput = JSON.stringify({
    text: PREVIEW_TEXT,
    model: resolved.providerModelId,
    voice: voiceConfig.voice,
    instructions: voiceConfig.instructions ?? null,
    speed: voiceConfig.speed ?? null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const cacheKey = `voice-previews/${presetId}/${hash}.audio`;
  const cached = await c.env.R2.get(cacheKey);
  if (cached) {
    const contentType = cached.httpMetadata?.contentType ?? "audio/mpeg";
    return c.body(await cached.arrayBuffer(), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(cached.size),
        "X-Cache": "HIT",
      },
    });
  }

  const tts = getTtsProviderImpl(resolved.provider);
  try {
    const { audio, contentType } = await generateSpeech(
      tts,
      PREVIEW_TEXT,
      voiceConfig.voice,
      resolved.providerModelId,
      c.env,
      resolved.pricing,
      voiceConfig.instructions,
      voiceConfig.speed,
    );

    // Cache in R2 for future requests
    c.executionCtx.waitUntil(
      c.env.R2.put(cacheKey, audio, {
        httpMetadata: { contentType },
      })
    );

    return c.body(audio, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(audio.byteLength),
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[voice-preset-preview]", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `TTS preview failed: ${message}` }, 500);
  }
});
