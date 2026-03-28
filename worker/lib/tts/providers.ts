import OpenAI from "openai";
import type { Env } from "../../types";
import { AiProviderError } from "../ai-errors";

/** Provider-agnostic TTS synthesis result. */
export interface TtsResult {
  audio: ArrayBuffer;
  contentType: string;
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
    env: Env,
    speed?: number
  ): Promise<TtsResult>;
}

// ---------------------------------------------------------------------------
// OpenAI — gpt-4o-mini-tts, tts-1, tts-1-hd
// ---------------------------------------------------------------------------

const OpenAITtsProvider: TtsProvider = {
  name: "OpenAI",
  provider: "openai",

  async synthesize(text, voice, providerModelId, instructions, env, speed) {
    const start = Date.now();
    try {
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await client.audio.speech.create({
        model: providerModelId,
        voice: voice as any,
        input: text,
        response_format: "mp3",
        ...(instructions ? { instructions } : {}),
        ...(speed != null ? { speed } : {}),
      });

      const audio = await response.arrayBuffer();
      return { audio, contentType: "audio/mpeg" };
    } catch (err) {
      const status = (err as any)?.status ?? (err as any)?.statusCode;
      throw new AiProviderError({
        message: `OpenAI TTS error${status ? ` ${status}` : ""}: ${err instanceof Error ? err.message : String(err)}`,
        provider: "openai",
        model: providerModelId,
        httpStatus: typeof status === "number" ? status : undefined,
        rawResponse: err instanceof Error ? err.message : String(err),
        requestDurationMs: Date.now() - start,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Groq — OpenAI-compatible TTS API (Orpheus models, returns WAV)
// ---------------------------------------------------------------------------

const GroqTtsProvider: TtsProvider = {
  name: "Groq",
  provider: "groq",

  async synthesize(text, voice, providerModelId, _instructions, env) {
    const start = Date.now();
    const resp = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModelId,
        input: text,
        voice: voice || "austin",
        response_format: "wav",
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new AiProviderError({
        message: `Groq TTS API error ${resp.status}: ${body.slice(0, 500)}`,
        provider: "groq",
        model: providerModelId,
        httpStatus: resp.status,
        rawResponse: body.slice(0, 2048),
        requestDurationMs: Date.now() - start,
      });
    }

    const audio = await resp.arrayBuffer();
    return { audio, contentType: "audio/wav" };
  },
};

// ---------------------------------------------------------------------------
// Cloudflare Workers AI — @cf/* TTS models via AI binding
// ---------------------------------------------------------------------------

const CloudflareTtsProvider: TtsProvider = {
  name: "Cloudflare Workers AI",
  provider: "cloudflare",

  async synthesize(text, voice, providerModelId, _instructions, env) {
    const start = Date.now();
    try {
      const result = (await env.AI.run(providerModelId as any, {
        text,
        speaker: voice || "angus",
      })) as any;

      // CF TTS models return audio data directly or in a structured response
      const audio: ArrayBuffer = result instanceof ArrayBuffer
        ? result
        : result?.audio ?? new ArrayBuffer(0);
      return { audio, contentType: "audio/mpeg" };
    } catch (err) {
      throw new AiProviderError({
        message: `Cloudflare TTS error: ${err instanceof Error ? err.message : String(err)}`,
        provider: "cloudflare",
        model: providerModelId,
        requestDurationMs: Date.now() - start,
        rawResponse: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Registry — keyed by provider name
// ---------------------------------------------------------------------------

const PROVIDERS: TtsProvider[] = [OpenAITtsProvider, GroqTtsProvider, CloudflareTtsProvider];

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
