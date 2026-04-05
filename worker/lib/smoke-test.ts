import type { Env } from "../types";
import { getLlmProviderImpl } from "./llm-providers";
import { getProviderImpl as getSttProviderImpl } from "./stt/providers";
import { getTtsProviderImpl } from "./tts/providers";

export interface SmokeTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  detail?: string;
}

/**
 * Generates a minimal valid WAV file (~1s of silence at 16kHz mono 16-bit).
 */
function generateSilentWav(): ArrayBuffer {
  const sampleRate = 16000;
  const numSamples = sampleRate; // 1 second
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  // samples are all zeros (silence) by default

  return buffer;
}

/**
 * Extracts an actionable error message from a caught error.
 */
function extractError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Surface HTTP status codes prominently
    const statusMatch = msg.match(/(\d{3})/);
    if (statusMatch) {
      const code = parseInt(statusMatch[1]);
      if (code === 401 || code === 403) return `${code} Unauthorized — check API key`;
      if (code === 404) return `${code} Not Found — check model ID or endpoint`;
      if (code === 429) return `${code} Rate Limited — try again later`;
      if (code >= 500) return `${code} Server Error — provider issue`;
    }
    return msg;
  }
  return String(err);
}

const SMOKE_TEST_VOICES: Record<string, string> = {
  openai: "coral",
  groq: "austin",
  cloudflare: "default",
};

/**
 * Run a smoke test for a specific AI model provider.
 * Sends a minimal request to verify the provider is reachable and configured correctly.
 */
export async function runSmokeTest(
  stage: string,
  provider: string,
  providerModelId: string,
  env: Env
): Promise<SmokeTestResult> {
  const start = Date.now();

  try {
    switch (stage) {
      case "stt": {
        const impl = getSttProviderImpl(provider);
        const wav = generateSilentWav();
        await impl.transcribe(
          { buffer: wav, filename: "smoke-test.wav" },
          1, // 1 second duration
          env,
          providerModelId
        );
        break;
      }

      case "distillation":
      case "narrative": {
        const impl = getLlmProviderImpl(provider);
        await impl.complete(
          [{ role: "user", content: "Say hello." }],
          providerModelId,
          10,
          env
        );
        break;
      }

      case "tts": {
        const impl = getTtsProviderImpl(provider);
        const voice = SMOKE_TEST_VOICES[provider] ?? "default";
        await impl.synthesize("Hello.", voice, providerModelId, undefined, env);
        break;
      }

      default:
        return { success: false, latencyMs: 0, error: `Unknown stage: ${stage}` };
    }

    return { success: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: extractError(err),
    };
  }
}
