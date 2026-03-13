/**
 * Canonical AI model registry — single source of truth for both worker and frontend.
 * No server-side imports; safe to use in any context.
 */

export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export const STAGE_LABELS: Record<AIStage, string> = {
  stt: "Transcription",
  distillation: "Distillation",
  narrative: "Narrative Generation",
  tts: "Audio Generation",
};

export interface AIModelEntry {
  provider: string;
  model: string;
  label: string;
  comingSoon?: boolean;
}

export interface AIModelConfig {
  provider: string;
  model: string;
}

export const AI_MODELS: Record<AIStage, AIModelEntry[]> = {
  stt: [
    { provider: "openai", model: "whisper-1", label: "Whisper v1" },
    { provider: "deepgram", model: "nova-2", label: "Deepgram Nova-2" },
    { provider: "deepgram", model: "nova-3", label: "Deepgram Nova-3" },
    { provider: "assemblyai", model: "assemblyai-best", label: "AssemblyAI Best" },
    { provider: "google", model: "google-chirp", label: "Google Chirp" },
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
