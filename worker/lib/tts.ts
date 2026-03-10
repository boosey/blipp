import type OpenAI from "openai";
import type { AiUsage } from "./ai-usage";

/** Default TTS voice for briefing narration. */
export const DEFAULT_VOICE = "coral";

/** OpenAI TTS model optimized for speed. */
export const TTS_MODEL = "gpt-4o-mini-tts";

/**
 * Generates spoken audio from text using OpenAI's TTS API.
 *
 * Uses the gpt-4o-mini-tts model with a warm, professional tone suitable
 * for daily podcast briefings. Returns raw MP3 audio as an ArrayBuffer.
 *
 * @param client - OpenAI SDK client instance
 * @param text - Narrative text to convert to speech
 * @param voice - OpenAI voice ID (defaults to "coral")
 * @returns MP3 audio data as ArrayBuffer
 * @throws If the OpenAI API call fails
 */
export async function generateSpeech(
  client: OpenAI,
  text: string,
  voice: string = DEFAULT_VOICE,
  model: string = TTS_MODEL
): Promise<{ audio: ArrayBuffer; usage: AiUsage }> {
  const response = await client.audio.speech.create({
    model,
    voice: voice as any,
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
      "Maintain a steady, engaging pace. Pause naturally between topics.",
  });

  const audio = await response.arrayBuffer();

  const usage: AiUsage = {
    model,
    inputTokens: text.length,
    outputTokens: 0,
    cost: null,
  };

  return { audio, usage };
}
