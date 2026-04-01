import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth } from "../middleware/auth";
import { getCurrentUser } from "../lib/admin-helpers";
import { resolveVoicePresetId } from "../lib/voice-presets";

export const blipps = new Hono<{ Bindings: Env }>();

blipps.use("*", requireAuth);

/**
 * GET /availability?episodeId={id}&durationTier={tier}
 *
 * Checks whether a blipp (clip) already exists for the given episode+duration,
 * using tiered matching: exact voice -> any voice (if user opted in) -> unavailable.
 */
blipps.get("/availability", async (c) => {
  const prisma = c.get("prisma") as any;
  const user = await getCurrentUser(c, prisma);

  const episodeId = c.req.query("episodeId");
  const durationTierRaw = c.req.query("durationTier");

  if (!episodeId || !durationTierRaw) {
    return c.json({ error: "episodeId and durationTier are required" }, 400);
  }

  const durationTier = parseInt(durationTierRaw, 10);
  if (isNaN(durationTier)) {
    return c.json({ error: "durationTier must be a number" }, 400);
  }

  // Resolve the episode's podcast for voice resolution
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: { podcastId: true },
  });
  if (!episode) {
    return c.json({ error: "Episode not found" }, 404);
  }

  const resolvedVoicePresetId = await resolveVoicePresetId(
    prisma,
    user.id,
    episode.podcastId
  );

  // 1. Check for exact match (user's resolved voice)
  const exactClip = await prisma.clip.findFirst({
    where: {
      episodeId,
      durationTier,
      voicePresetId: resolvedVoicePresetId,
      status: "COMPLETED",
    },
    select: { id: true, voicePreset: { select: { name: true } } },
  });

  if (exactClip) {
    return c.json({
      available: true,
      matchType: "exact",
      estimatedWaitSeconds: null,
      voicePresetName: exactClip.voicePreset?.name ?? null,
    });
  }

  // 2. If user accepts any voice, check for any completed clip
  if (user.acceptAnyVoice) {
    const anyVoiceClip = await prisma.clip.findFirst({
      where: {
        episodeId,
        durationTier,
        status: "COMPLETED",
      },
      select: { id: true, voicePreset: { select: { name: true } } },
    });

    if (anyVoiceClip) {
      return c.json({
        available: true,
        matchType: "any_voice",
        estimatedWaitSeconds: null,
        voicePresetName: anyVoiceClip.voicePreset?.name ?? null,
      });
    }
  }

  // 3. Not available — estimate wait based on pipeline progress
  const inProgressClip = await prisma.clip.findFirst({
    where: {
      episodeId,
      durationTier,
      status: { in: ["PENDING", "GENERATING_NARRATIVE", "GENERATING_AUDIO"] },
    },
    select: { status: true },
  });

  const distillation = await prisma.distillation.findUnique({
    where: { episodeId },
    select: { status: true },
  });

  let estimatedWaitSeconds: number;
  if (inProgressClip) {
    // Clip is already being processed
    estimatedWaitSeconds =
      inProgressClip.status === "GENERATING_AUDIO" ? 30 : 60;
  } else if (distillation?.status === "COMPLETED") {
    // Transcript/claims ready, just needs narrative + TTS
    estimatedWaitSeconds = 90;
  } else {
    // Full pipeline needed
    estimatedWaitSeconds = 180;
  }

  return c.json({
    available: false,
    matchType: null,
    estimatedWaitSeconds,
    voicePresetName: null,
  });
});
