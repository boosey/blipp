import type { Env } from "../types";

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

export type AudioInput = { url: string } | { buffer: ArrayBuffer; filename: string };

/**
 * An STT provider implementation — one per API vendor.
 * The providerModelId (from DB) tells the implementation which model to request.
 */
export interface SttProvider {
  name: string;
  provider: string;
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

const OpenAIProvider: SttProvider = {
  name: "OpenAI",
  provider: "openai",

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const { blob: audioBlob, filename } = await resolveAudioBlob(audio);

    const form = new FormData();
    form.append("file", new File([audioBlob], filename, { type: audioBlob.type || "audio/mpeg" }));
    form.append("model", providerModelId);

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenAI Whisper API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { text: string };
    return { transcript: data.text, costDollars: null, latencyMs: Date.now() - start };
  },
};

// ---------------------------------------------------------------------------
// Deepgram — serves nova-2, nova-3 via their listen API
// ---------------------------------------------------------------------------

const DeepgramProvider: SttProvider = {
  name: "Deepgram",
  provider: "deepgram",

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
      console.error(`[Deepgram] ${resp.status}: ${body}`);
      throw new Error(`Deepgram API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as {
      results: { channels: { alternatives: { transcript: string }[] }[] };
    };

    const transcript = data.results.channels[0]?.alternatives[0]?.transcript ?? "";
    return { transcript, costDollars: null, latencyMs: Date.now() - start };
  },
};

// ---------------------------------------------------------------------------
// AssemblyAI — async provider, requires polling
// ---------------------------------------------------------------------------

const AssemblyAIProvider: SttProvider = {
  name: "AssemblyAI",
  provider: "assemblyai",

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, _providerModelId: string): Promise<SttResult> {
    const start = Date.now();

    let audioUrl: string;
    if ("url" in audio) {
      audioUrl = audio.url;
    } else {
      const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: {
          Authorization: env.ASSEMBLYAI_API_KEY,
          "Content-Type": "application/octet-stream",
        },
        body: audio.buffer,
      });
      if (!uploadResp.ok) {
        const body = await uploadResp.text();
        throw new Error(`AssemblyAI upload error ${uploadResp.status}: ${body}`);
      }
      const uploadData = (await uploadResp.json()) as { upload_url: string };
      audioUrl = uploadData.upload_url;
    }

    const resp = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl, language_code: "en", speech_models: ["universal-3-pro"] }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`AssemblyAI API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { id: string; status: string };
    return {
      transcript: "",
      costDollars: null,
      latencyMs: Date.now() - start,
      async: { jobId: data.id },
    };
  },

  async poll(jobId: string, env: Env): Promise<SttPollResult> {
    const resp = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
      headers: { Authorization: env.ASSEMBLYAI_API_KEY },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`AssemblyAI poll error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { status: string; text?: string; error?: string };

    if (data.status === "completed") {
      return { done: true, transcript: data.text ?? "" };
    }
    if (data.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${data.error ?? "unknown"}`);
    }

    return { done: false };
  },
};

// ---------------------------------------------------------------------------
// Google Cloud STT (Chirp) — async provider, requires polling
// ---------------------------------------------------------------------------

const GoogleSttProvider: SttProvider = {
  name: "Google Cloud STT",
  provider: "google",

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();

    const audioBuffer = await resolveAudioBuffer(audio);
    const base64Audio = btoa(
      new Uint8Array(audioBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), ""),
    );

    const resp = await fetch(
      `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${env.GOOGLE_STT_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            encoding: "MP3",
            sampleRateHertz: 16000,
            languageCode: "en-US",
            model: providerModelId || "chirp",
          },
          audio: { content: base64Audio },
        }),
      },
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Google STT API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { name: string };
    return {
      transcript: "",
      costDollars: null,
      latencyMs: Date.now() - start,
      async: { jobId: data.name },
    };
  },

  async poll(jobId: string, env: Env): Promise<SttPollResult> {
    const resp = await fetch(
      `https://speech.googleapis.com/v1/operations/${jobId}?key=${env.GOOGLE_STT_API_KEY}`,
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Google STT poll error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as {
      done?: boolean;
      response?: {
        results?: { alternatives?: { transcript: string }[] }[];
      };
    };

    if (data.done) {
      const transcript =
        data.response?.results
          ?.map((r) => r.alternatives?.[0]?.transcript ?? "")
          .join(" ") ?? "";
      return { done: true, transcript };
    }

    return { done: false };
  },
};

// ---------------------------------------------------------------------------
// Groq — OpenAI-compatible API, serves whisper models
// ---------------------------------------------------------------------------

const GroqProvider: SttProvider = {
  name: "Groq",
  provider: "groq",

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const { blob: audioBlob, filename } = await resolveAudioBlob(audio);

    const form = new FormData();
    form.append("file", new File([audioBlob], filename, { type: audioBlob.type || "audio/mpeg" }));
    form.append("model", providerModelId);

    const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Groq API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { text: string };
    return { transcript: data.text, costDollars: null, latencyMs: Date.now() - start };
  },
};

// ---------------------------------------------------------------------------
// Cloudflare Workers AI — serves @cf/* models via AI binding
// ---------------------------------------------------------------------------

const CloudflareProvider: SttProvider = {
  name: "Cloudflare Workers AI",
  provider: "cloudflare",

  async transcribe(audio: AudioInput, _durationSeconds: number, env: Env, providerModelId: string): Promise<SttResult> {
    const start = Date.now();
    const audioBuffer = await resolveAudioBuffer(audio);
    const isDeepgram = providerModelId.includes("deepgram");

    if (isDeepgram) {
      // Deepgram models expect { audio: { body: ReadableStream, contentType } }
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

      // Deepgram response: { transcripts: [{ transcript }] } or { results: { channels: [...] } }
      const res = result as any;
      const transcript =
        res?.transcripts?.[0]?.transcript ??
        res?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        res?.text ??
        "";
      return { transcript, costDollars: null, latencyMs: Date.now() - start };
    }

    // Whisper models — base64 input, chunked at 5MB
    const CF_CHUNK_SIZE = 5 * 1024 * 1024;
    const chunks: string[] = [];

    for (let offset = 0; offset < audioBuffer.byteLength; offset += CF_CHUNK_SIZE) {
      const slice = audioBuffer.slice(offset, Math.min(offset + CF_CHUNK_SIZE, audioBuffer.byteLength));
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
          result = await env.AI.run(providerModelId as any, { audio: base64 });
        } else {
          throw err;
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
  AssemblyAIProvider,
  GoogleSttProvider,
  GroqProvider,
  CloudflareProvider,
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
