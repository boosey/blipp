import OpenAI from "openai";
import type { Env } from "../types";

/** Provider-agnostic TTS synthesis result. */
export interface TtsResult {
  audio: ArrayBuffer;
}

/**
 * A TTS provider implementation — one per API vendor.
 * The providerModelId (from DB) tells the implementation which model to request.
 */
export interface TtsProvider {
  name: string;
  provider: string;
  synthesize(
    text: string,
    voice: string,
    providerModelId: string,
    instructions: string | undefined,
    env: Env
  ): Promise<TtsResult>;
}

// ---------------------------------------------------------------------------
// OpenAI — gpt-4o-mini-tts, tts-1, tts-1-hd
// ---------------------------------------------------------------------------

const OpenAITtsProvider: TtsProvider = {
  name: "OpenAI",
  provider: "openai",

  async synthesize(text, voice, providerModelId, instructions, env) {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.audio.speech.create({
      model: providerModelId,
      voice: voice as any,
      input: text,
      response_format: "mp3",
      ...(instructions ? { instructions } : {}),
    });

    const audio = await response.arrayBuffer();
    return { audio };
  },
};

// ---------------------------------------------------------------------------
// Registry — keyed by provider name
// ---------------------------------------------------------------------------

const PROVIDERS: TtsProvider[] = [OpenAITtsProvider];

const providerMap = new Map<string, TtsProvider>(
  PROVIDERS.map((p) => [p.provider, p])
);

/** Look up a TTS provider implementation by provider name. */
export function getTtsProviderImpl(provider: string): TtsProvider {
  const impl = providerMap.get(provider);
  if (!impl) {
    throw new Error(`No TTS implementation for provider: ${provider}`);
  }
  return impl;
}
