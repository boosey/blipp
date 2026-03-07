/**
 * Frontend-safe AI model registry.
 * Mirrors worker/lib/ai-models.ts types and constants without server imports.
 */

export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export interface AIModelEntry {
  provider: string;
  model: string;
  label: string;
  comingSoon?: boolean;
}

export const AI_MODELS: Record<AIStage, AIModelEntry[]> = {
  stt: [
    { provider: "openai", model: "whisper-1", label: "Whisper v1" },
  ],
  distillation: [
    { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Sonnet 4" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { provider: "anthropic", model: "claude-opus-4-20250514", label: "Opus 4" },
  ],
  narrative: [
    { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Sonnet 4" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    { provider: "anthropic", model: "claude-opus-4-20250514", label: "Opus 4" },
  ],
  tts: [
    { provider: "openai", model: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS" },
    { provider: "openai", model: "tts-1", label: "TTS-1" },
    { provider: "openai", model: "tts-1-hd", label: "TTS-1 HD" },
    { provider: "elevenlabs", model: "eleven_turbo_v2_5", label: "ElevenLabs Turbo v2.5", comingSoon: true },
    { provider: "google", model: "standard", label: "Google Cloud TTS", comingSoon: true },
    { provider: "cloudflare", model: "workers-ai", label: "Cloudflare Workers AI", comingSoon: true },
  ],
};
