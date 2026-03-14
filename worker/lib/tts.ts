import type { TtsProvider } from "./tts-providers";
import { calculateAudioCost, calculateCharCost, type AiUsage, type ModelPricing } from "./ai-usage";

/** Default TTS voice for briefing narration. */
export const DEFAULT_VOICE = "coral";

/** Default TTS instructions. */
export const DEFAULT_INSTRUCTIONS =
  "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
  "Maintain a steady, engaging pace. Pause naturally between topics.";

/**
 * Generates spoken audio from text using a TTS provider.
 *
 * @param tts - TTS provider implementation
 * @param text - Narrative text to convert to speech
 * @param voice - Voice ID (defaults to "coral")
 * @param providerModelId - Provider-specific model ID from DB
 * @param env - Worker environment bindings
 * @param pricing - Pricing from DB for cost calculation
 * @returns MP3 audio data as ArrayBuffer
 */
export async function generateSpeech(
  tts: TtsProvider,
  text: string,
  voice: string = DEFAULT_VOICE,
  providerModelId: string,
  env: any,
  pricing: ModelPricing | null = null
): Promise<{ audio: ArrayBuffer; usage: AiUsage }> {
  const result = await tts.synthesize(
    text,
    voice,
    providerModelId,
    DEFAULT_INSTRUCTIONS,
    env
  );

  // TTS pricing: try per-minute first (based on output audio), fall back to per-char
  const estimatedSeconds = result.audio.byteLength / (128 * 1000 / 8);
  const cost =
    calculateAudioCost(pricing, estimatedSeconds) ??
    calculateCharCost(pricing, text.length);

  const usage: AiUsage = {
    model: providerModelId,
    inputTokens: text.length,
    outputTokens: 0,
    cost,
  };

  return { audio: result.audio, usage };
}
