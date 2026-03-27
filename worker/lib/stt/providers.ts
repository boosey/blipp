import type { Env } from "../../types";
import { AiProviderError } from "../ai-errors";

export interface SttResult {
  transcript: string;
  costDollars: number | null;
  latencyMs: number;
  async?: { jobId: string };
}

export interface SttPollResult {
  done: boolean;
  transcript?: string;
  costDollars?: number;
}

export type AudioInput = { url: string } | { buffer: ArrayBuffer; filename: string; sourceUrl?: string };

/**
 * An STT provider implementation — one per API vendor.
 * The providerModelId (from DB) tells the implementation which model to request.
 */
export interface SttProvider {
  name: string;
  provider: string;
  /** Whether this provider can accept a URL directly (no audio download needed). */
  supportsUrl: boolean;
  transcribe(audio: AudioInput, durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult>;
  poll?(jobId: string, env: Env): Promise<SttPollResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAudioFromUrl(url: string): Promise<{ blob: Blob; filename: string }> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch audio: ${resp.status} ${resp.statusText}`);
  }
  const blob = await resp.blob();
  const urlPath = new URL(url).pathname;
  const filename = urlPath.split("/").pop() || "audio.mp3";
  return { blob, filename };
}

async function resolveAudioBlob(audio: AudioInput): Promise<{ blob: Blob; filename: string }> {
  if ("url" in audio) {
    return fetchAudioFromUrl(audio.url);
  }
  return { blob: new Blob([audio.buffer], { type: "audio/mpeg" }), filename: audio.filename };
}

async function resolveAudioBuffer(audio: AudioInput): Promise<ArrayBuffer> {
  if ("buffer" in audio) {
    return audio.buffer;
  }
  const resp = await fetch(audio.url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch audio: ${resp.status} ${resp.statusText}`);
  }
  return resp.arrayBuffer();
}

// ---------------------------------------------------------------------------
// OpenAI — serves whisper-1 via their transcriptions API
// ---------------------------------------------------------------------------

/** OpenAI/Groq upload limit: 25MB; chunk at 15MB to leave safe margin */
const WHISPER_CHUNK_SIZE = 15 * 1024 * 1024;

const OpenAIProvider: SttProvider = {
  name: "OpenAI",
  provider: "openai",
  supportsUrl: false,

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const audioBuffer = await resolveAudioBuffer(audio);
    const filename = "buffer" in audio ? audio.filename : "audio.mp3";

    if (audioBuffer.byteLength <= WHISPER_CHUNK_SIZE) {
      return openaiSingleRequest(audioBuffer, filename, env, providerModelId, start);
    }

    const totalBytes = audioBuffer.byteLength;
    const totalChunks = Math.ceil(totalBytes / WHISPER_CHUNK_SIZE);
    const chunks: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * WHISPER_CHUNK_SIZE;
      const slice = audioBuffer.slice(offset, Math.min(offset + WHISPER_CHUNK_SIZE, totalBytes));
      try {
        const result = await openaiSingleRequest(slice, `chunk-${i + 1}.mp3`, env, providerModelId, start);
        if (result.transcript) chunks.push(result.transcript);
      } catch (chunkErr) {
        const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
        throw new AiProviderError({
          message: `OpenAI STT chunk ${i + 1}/${totalChunks} failed (bytes ${offset}-${Math.min(offset + WHISPER_CHUNK_SIZE, totalBytes) - 1}): ${msg.slice(0, 500)}`,
          provider: "openai",
          model: providerModelId,
          httpStatus: (chunkErr as any)?.httpStatus,
          rawResponse: (chunkErr as any)?.rawResponse,
          requestDurationMs: Date.now() - start,
        });
      }
    }

    return { transcript: chunks.join(" "), costDollars: null, latencyMs: Date.now() - start };
  },
};

async function openaiSingleRequest(
  buffer: ArrayBuffer,
  filename: string,
  env: Env,
  providerModelId: string,
  start: number,
): Promise<SttResult> {
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: "audio/mpeg" }));
  form.append("model", providerModelId);

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new AiProviderError({
      message: `OpenAI Whisper API error ${resp.status}: ${body.slice(0, 500)}`,
      provider: "openai",
      model: providerModelId,
      httpStatus: resp.status,
      rawResponse: body.slice(0, 2048),
      requestDurationMs: Date.now() - start,
    });
  }

  const data = (await resp.json()) as { text: string };
  return { transcript: data.text, costDollars: null, latencyMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Deepgram — serves nova-2, nova-3 via their listen API
// ---------------------------------------------------------------------------

const DeepgramProvider: SttProvider = {
  name: "Deepgram",
  provider: "deepgram",
  supportsUrl: true,

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();

    let resp: Response;
    if ("url" in audio) {
      resp = await fetch(
        `https://api.deepgram.com/v1/listen?model=${providerModelId}&smart_format=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: audio.url }),
        },
      );
    } else {
      resp = await fetch(
        `https://api.deepgram.com/v1/listen?model=${providerModelId}&smart_format=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
            "Content-Type": "audio/mpeg",
          },
          body: audio.buffer,
        },
      );
    }

    if (!resp.ok) {
      const body = await resp.text();
      throw new AiProviderError({
        message: `Deepgram API error ${resp.status}: ${body.slice(0, 500)}`,
        provider: "deepgram",
        model: providerModelId,
        httpStatus: resp.status,
        rawResponse: body.slice(0, 2048),
        requestDurationMs: Date.now() - start,
      });
    }

    const data = (await resp.json()) as {
      results: { channels: { alternatives: { transcript: string }[] }[] };
    };

    const transcript = data.results.channels[0]?.alternatives[0]?.transcript ?? "";
    return { transcript, costDollars: null, latencyMs: Date.now() - start };
  },
};

// ---------------------------------------------------------------------------
// Groq — OpenAI-compatible API, serves whisper models
// ---------------------------------------------------------------------------

const GroqProvider: SttProvider = {
  name: "Groq",
  provider: "groq",
  supportsUrl: true,

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();

    // URL-based transcription (handler passes { url } when appropriate)
    if ("url" in audio) {
      return groqUrlRequest(audio.url, env, providerModelId, start);
    }

    // Buffer-based transcription (handler passes { buffer } chunks)
    return groqSingleRequest(audio.buffer, audio.filename, env, providerModelId, start);
  },
};

async function groqUrlRequest(
  url: string,
  env: Env,
  providerModelId: string,
  start: number,
): Promise<SttResult> {
  const form = new FormData();
  form.append("url", url);
  form.append("model", providerModelId);

  const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new AiProviderError({
      message: `Groq STT URL-based API error ${resp.status}: ${body.slice(0, 500)}`,
      provider: "groq",
      model: providerModelId,
      httpStatus: resp.status,
      rawResponse: body.slice(0, 2048),
      requestDurationMs: Date.now() - start,
    });
  }

  const data = (await resp.json()) as { text: string };
  return { transcript: data.text, costDollars: null, latencyMs: Date.now() - start };
}

async function groqSingleRequest(
  buffer: ArrayBuffer,
  filename: string,
  env: Env,
  providerModelId: string,
  start: number,
): Promise<SttResult> {
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: "audio/mpeg" }));
  form.append("model", providerModelId);

  const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new AiProviderError({
      message: `Groq STT API error ${resp.status}: ${body.slice(0, 500)}`,
      provider: "groq",
      model: providerModelId,
      httpStatus: resp.status,
      rawResponse: body.slice(0, 2048),
      requestDurationMs: Date.now() - start,
    });
  }

  const data = (await resp.json()) as { text: string };
  return { transcript: data.text, costDollars: null, latencyMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI — serves @cf/* models via AI binding
// ---------------------------------------------------------------------------

const CloudflareDeepgramProvider: SttProvider = {
  name: "Cloudflare Deepgram",
  provider: "cloudflare-deepgram",
  supportsUrl: false,

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const audioBuffer = await resolveAudioBuffer(audio);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(audioBuffer));
        controller.close();
      },
    });
    const result = await env.AI.run(providerModelId as any, {
      audio: { body: stream, contentType: "audio/mpeg" },
      detect_language: true,
    } as any);

    const res = result as any;
    const transcript =
      res?.transcripts?.[0]?.transcript ??
      res?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
      res?.text ??
      "";
    return { transcript, costDollars: null, latencyMs: Date.now() - start };
  },
};

const CloudflareWhisperProvider: SttProvider = {
  name: "Cloudflare Whisper",
  provider: "cloudflare",
  supportsUrl: false,

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const audioBuffer = await resolveAudioBuffer(audio);

    const CF_CHUNK_SIZE = 5 * 1024 * 1024;
    const totalBytes = audioBuffer.byteLength;
    const totalChunks = Math.ceil(totalBytes / CF_CHUNK_SIZE);
    const chunks: string[] = [];

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const offset = chunkIdx * CF_CHUNK_SIZE;
      const slice = audioBuffer.slice(offset, Math.min(offset + CF_CHUNK_SIZE, totalBytes));
      const bytes = new Uint8Array(slice);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Retry once on transient CF errors (1031, 504)
      let result: any;
      try {
        result = await env.AI.run(providerModelId as any, { audio: base64 });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("1031") || msg.includes("504") || msg.includes("timeout")) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            result = await env.AI.run(providerModelId as any, { audio: base64 });
          } catch (retryErr: any) {
            throw new AiProviderError({
              message: `Cloudflare AI STT chunk ${chunkIdx + 1}/${totalChunks} retry failed (bytes ${offset}-${Math.min(offset + CF_CHUNK_SIZE, totalBytes) - 1}): ${retryErr?.message ?? String(retryErr)}`,
              provider: "cloudflare",
              model: providerModelId,
              requestDurationMs: Date.now() - start,
              rawResponse: retryErr?.message ?? String(retryErr),
            });
          }
        } else {
          throw new AiProviderError({
            message: `Cloudflare AI STT chunk ${chunkIdx + 1}/${totalChunks} failed (bytes ${offset}-${Math.min(offset + CF_CHUNK_SIZE, totalBytes) - 1}): ${msg}`,
            provider: "cloudflare",
            model: providerModelId,
            requestDurationMs: Date.now() - start,
            rawResponse: msg,
          });
        }
      }
      const text = (result as any)?.text?.trim() ?? "";
      if (text) chunks.push(text);
    }

    const transcript = chunks.join(" ");
    return { transcript, costDollars: null, latencyMs: Date.now() - start };
  },
};

// ---------------------------------------------------------------------------
// Registry — keyed by provider name
// ---------------------------------------------------------------------------

const PROVIDERS: SttProvider[] = [
  OpenAIProvider,
  DeepgramProvider,
  GroqProvider,
  CloudflareWhisperProvider,
  CloudflareDeepgramProvider,
];

const providerMap = new Map<string, SttProvider>(
  PROVIDERS.map((p) => [p.provider, p]),
);

/**
 * Look up an STT provider implementation by provider name.
 * The caller should pass the providerModelId from the DB to transcribe().
 */
export function getProviderImpl(provider: string): SttProvider {
  const impl = providerMap.get(provider);
  if (!impl) {
    throw new Error(`No STT implementation for provider: ${provider}`);
  }
  return impl;
}
