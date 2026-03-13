import type { Env } from "../types";

export interface SttResult {
  transcript: string;
  costDollars: number;
  latencyMs: number;
  async?: { jobId: string };
}

export interface SttPollResult {
  done: boolean;
  transcript?: string;
  costDollars?: number;
}

export type AudioInput = { url: string } | { buffer: ArrayBuffer; filename: string };

export interface SttProvider {
  name: string;
  modelId: string;
  provider: string;
  transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult>;
  poll?(jobId: string, env: Env): Promise<SttPollResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch audio bytes + filename from a URL. */
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

/** Resolve AudioInput to a Blob and filename. */
async function resolveAudioBlob(audio: AudioInput): Promise<{ blob: Blob; filename: string }> {
  if ("url" in audio) {
    return fetchAudioFromUrl(audio.url);
  }
  return { blob: new Blob([audio.buffer], { type: "audio/mpeg" }), filename: audio.filename };
}

/** Resolve AudioInput to an ArrayBuffer. */
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
// Whisper (OpenAI)
// ---------------------------------------------------------------------------

const WhisperProvider: SttProvider = {
  name: "OpenAI Whisper",
  modelId: "whisper-1",
  provider: "openai",

  async transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult> {
    const start = Date.now();

    const { blob: audioBlob, filename } = await resolveAudioBlob(audio);

    // Build multipart form data
    const form = new FormData();
    form.append("file", new File([audioBlob], filename, { type: audioBlob.type || "audio/mpeg" }));
    form.append("model", "whisper-1");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Whisper API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { text: string };
    const latencyMs = Date.now() - start;
    const costDollars = (durationSeconds / 60) * 0.006;

    return { transcript: data.text, costDollars, latencyMs };
  },
};

// ---------------------------------------------------------------------------
// Deepgram Nova-2
// ---------------------------------------------------------------------------

const DeepgramProvider: SttProvider = {
  name: "Deepgram Nova-2",
  modelId: "nova-2",
  provider: "deepgram",

  async transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult> {
    const start = Date.now();
    const keyPresent = !!env.DEEPGRAM_API_KEY;
    const keyPrefix = env.DEEPGRAM_API_KEY?.slice(0, 8) ?? "MISSING";
    console.log(`[Deepgram] key present: ${keyPresent}, prefix: ${keyPrefix}..., auth header: "Token ${env.DEEPGRAM_API_KEY}", audio type: ${"url" in audio ? "url" : "buffer"}`);

    // Deepgram accepts either a URL (JSON body) or raw audio bytes
    let resp: Response;
    if ("url" in audio) {
      resp = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
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
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
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

    const latencyMs = Date.now() - start;
    const costDollars = (durationSeconds / 60) * 0.0043;
    const transcript = data.results.channels[0]?.alternatives[0]?.transcript ?? "";

    return { transcript, costDollars, latencyMs };
  },
};

// ---------------------------------------------------------------------------
// Deepgram Nova-3
// ---------------------------------------------------------------------------

const DeepgramNova3Provider: SttProvider = {
  name: "Deepgram Nova-3",
  modelId: "nova-3",
  provider: "deepgram",

  async transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult> {
    const start = Date.now();

    let resp: Response;
    if ("url" in audio) {
      resp = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
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
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
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
      console.error(`[Deepgram Nova-3] ${resp.status}: ${body}`);
      throw new Error(`Deepgram API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as {
      results: { channels: { alternatives: { transcript: string }[] }[] };
    };

    const latencyMs = Date.now() - start;
    const costDollars = (durationSeconds / 60) * 0.0043;
    const transcript = data.results.channels[0]?.alternatives[0]?.transcript ?? "";

    return { transcript, costDollars, latencyMs };
  },
};

// ---------------------------------------------------------------------------
// AssemblyAI
// ---------------------------------------------------------------------------

const AssemblyAIProvider: SttProvider = {
  name: "AssemblyAI Best",
  modelId: "assemblyai-best",
  provider: "assemblyai",

  async transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult> {
    const start = Date.now();
    const keyPresent = !!env.ASSEMBLYAI_API_KEY;
    const keyPrefix = env.ASSEMBLYAI_API_KEY?.slice(0, 8) ?? "MISSING";
    console.log(`[AssemblyAI] key present: ${keyPresent}, prefix: ${keyPrefix}..., auth header: "${env.ASSEMBLYAI_API_KEY}", audio type: ${"url" in audio ? "url" : "buffer"}`);

    // AssemblyAI requires a URL. If we have a buffer, upload it first.
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
        console.error(`[AssemblyAI] upload ${uploadResp.status}: ${body}`);
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
    const latencyMs = Date.now() - start;
    const costDollars = (durationSeconds / 60) * 0.015;

    return {
      transcript: "",
      costDollars,
      latencyMs,
      async: { jobId: data.id },
    };
  },

  async poll(jobId: string, env: Env): Promise<SttPollResult> {
    const resp = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY,
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`AssemblyAI poll error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { status: string; text?: string; error?: string };
    console.log(`[AssemblyAI poll] jobId=${jobId}, status=${data.status}, hasText=${!!data.text}, textLen=${data.text?.length ?? 0}, error=${data.error ?? "none"}`);

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
// Google Cloud STT (Chirp)
// ---------------------------------------------------------------------------

const GoogleSttProvider: SttProvider = {
  name: "Google Chirp",
  modelId: "google-chirp",
  provider: "google",

  async transcribe(audio: AudioInput, durationSeconds: number, env: Env): Promise<SttResult> {
    const start = Date.now();

    // Fetch audio and base64-encode it (longrunningrecognize requires GCS URI or inline content)
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
            model: "chirp",
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
    const latencyMs = Date.now() - start;
    const costDollars = (durationSeconds / 60) * 0.024;

    return {
      transcript: "",
      costDollars,
      latencyMs,
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
// Registry
// ---------------------------------------------------------------------------

export const STT_PROVIDERS: SttProvider[] = [
  WhisperProvider,
  DeepgramProvider,
  DeepgramNova3Provider,
  AssemblyAIProvider,
  GoogleSttProvider,
];

const providerMap = new Map<string, SttProvider>(
  STT_PROVIDERS.map((p) => [p.modelId, p]),
);

export function getProvider(modelId: string): SttProvider {
  const provider = providerMap.get(modelId);
  if (!provider) {
    throw new Error(`Unknown STT provider for model: ${modelId}`);
  }
  return provider;
}
