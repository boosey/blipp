/**
 * Voice preset resolution and configuration extraction.
 *
 * VoicePreset.config is a JSON blob shaped like:
 *   { openai: { voice, instructions, speed }, groq: { voice }, cloudflare: {} }
 *
 * Resolution order:
 *   1. Subscription-level override (voicePresetId on Subscription)
 *   2. User-level default (defaultVoicePresetId on User)
 *   3. System default (null — uses DEFAULT_VOICE / DEFAULT_INSTRUCTIONS from tts.ts)
 */

/** System default voice ID (matches DEFAULT_VOICE in tts.ts). */
export const SYSTEM_DEFAULT_VOICE = "coral";

/** System default TTS instructions (matches DEFAULT_INSTRUCTIONS in tts.ts). */
export const SYSTEM_DEFAULT_INSTRUCTIONS =
  "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
  "Maintain a steady, engaging pace. Pause naturally between topics.";

/** Per-provider config extracted from a VoicePreset.config blob. */
export interface ProviderVoiceConfig {
  voice: string;
  instructions?: string;
  speed?: number;
}

/**
 * Resolves the effective voicePresetId for a user+podcast combination.
 *
 * @returns The preset ID, or null if the user should use system defaults.
 */
export async function resolveVoicePresetId(
  prisma: any,
  userId: string,
  podcastId: string
): Promise<string | null> {
  // 1. Check subscription-level override
  const sub = await prisma.subscription.findUnique({
    where: { userId_podcastId: { userId, podcastId } },
    select: { voicePresetId: true },
  });
  if (sub?.voicePresetId) return sub.voicePresetId;

  // 2. Check user-level default
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultVoicePresetId: true },
  });
  if (user?.defaultVoicePresetId) return user.defaultVoicePresetId;

  // 3. System default
  return null;
}

/**
 * Checks if a voice preset is accessible for a given plan.
 * System presets are always accessible. Non-system presets require the plan's allowedVoicePresetIds to include them.
 * Returns null if allowed, or an error string if denied.
 */
export async function checkVoicePresetAccess(
  prisma: any,
  planId: string,
  voicePresetId: string | null | undefined
): Promise<string | null> {
  if (!voicePresetId) return null; // null = system default, always OK

  const preset = await prisma.voicePreset.findUnique({
    where: { id: voicePresetId },
    select: { isSystem: true, isActive: true, name: true },
  });
  if (!preset) return "Voice preset not found";
  if (!preset.isActive) return "Voice preset is not active";
  if (preset.isSystem) return null; // system presets always accessible

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { allowedVoicePresetIds: true },
  });
  const allowedIds: string[] = plan?.allowedVoicePresetIds ?? [];
  if (!allowedIds.includes(voicePresetId)) {
    return `Voice "${preset.name}" is not available on your current plan`;
  }
  return null;
}

/**
 * Loads the full config JSON for a voice preset.
 *
 * @returns The parsed config object, or null if the preset doesn't exist or is inactive.
 */
export async function loadPresetConfig(
  prisma: any,
  voicePresetId: string
): Promise<Record<string, any> | null> {
  const preset = await prisma.voicePreset.findUnique({
    where: { id: voicePresetId },
    select: { config: true, isActive: true },
  });
  if (!preset || !preset.isActive) return null;
  return preset.config as Record<string, any>;
}

/**
 * Extracts provider-specific voice config from a preset's config blob.
 *
 * Falls back to system defaults for any missing fields.
 */
export function extractProviderConfig(
  presetConfig: Record<string, any> | null,
  provider: string
): ProviderVoiceConfig {
  if (!presetConfig) {
    return {
      voice: SYSTEM_DEFAULT_VOICE,
      instructions: SYSTEM_DEFAULT_INSTRUCTIONS,
      speed: undefined,
    };
  }

  const providerConf = presetConfig[provider];
  if (!providerConf || typeof providerConf !== "object") {
    if (provider === "openai" || provider === "groq") {
      console.warn(`[voice-presets] Preset config has no mapping for provider "${provider}" — falling back to system defaults`);
    }
    return {
      voice: SYSTEM_DEFAULT_VOICE,
      instructions: SYSTEM_DEFAULT_INSTRUCTIONS,
      speed: undefined,
    };
  }

  return {
    voice: providerConf.voice || SYSTEM_DEFAULT_VOICE,
    instructions: providerConf.instructions || SYSTEM_DEFAULT_INSTRUCTIONS,
    speed: typeof providerConf.speed === "number" ? providerConf.speed : undefined,
  };
}
