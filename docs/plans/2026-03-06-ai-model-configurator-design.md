# AI Model Configurator Design

## Problem

AI models are hardcoded across 4 pipeline stages. The admin UI has an AI Models panel that displays model info but the "Change" button is a no-op, and the pipeline never reads from PlatformConfig. Switching models requires a code change and redeploy.

## Goal

Make AI models configurable through the admin interface so operators can switch models (e.g., Sonnet to Haiku for cost savings) without redeploying.

## Config Keys

Four `PlatformConfig` entries, one per AI stage. Each stores a JSON object:

```
ai.stt.model          -> { provider: "openai", model: "whisper-1" }
ai.distillation.model -> { provider: "anthropic", model: "claude-sonnet-4-20250514" }
ai.narrative.model    -> { provider: "anthropic", model: "claude-sonnet-4-20250514" }
ai.tts.model          -> { provider: "openai", model: "gpt-4o-mini-tts" }
```

## Model Registry

Static constant shared between frontend display and backend validation:

```typescript
const AI_MODELS = {
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
```

## Backend Changes

### New file: `worker/lib/ai-models.ts`

- Model registry constant (source of truth)
- `getModelConfig(prisma, stage, fallback)` helper that reads from PlatformConfig via `getConfig()` and returns `{ provider, model }`
- Fallback defaults match current hardcoded values so nothing breaks if config keys don't exist yet

### Modified: `worker/lib/distillation.ts`

- `extractClaims()` accepts a `model` string parameter instead of hardcoding
- `generateNarrative()` accepts a `model` string parameter instead of hardcoding

### Modified: `worker/lib/tts.ts`

- `generateSpeech()` accepts a `model` string parameter instead of using the `TTS_MODEL` constant

### Modified: Queue handlers

- `worker/queues/distillation.ts` — calls `getModelConfig(prisma, "distillation")`, passes model to `extractClaims()`
- `worker/queues/clip-generation.ts` — calls `getModelConfig()` for both narrative and TTS stages, passes to respective functions
- `worker/queues/transcription.ts` — calls `getModelConfig(prisma, "stt")`, passes to Whisper

## Frontend Changes

### Modified: `src/pages/admin/configuration.tsx`

The `AIModelsPanel` gets an edit flow:
- "Change" button opens a `<Select>` dropdown populated from the model registry
- Coming-soon entries are visible but disabled in the dropdown
- On selection, immediately PATCHes `ai.<stage>.model` via existing config endpoint
- Same UX pattern as pipeline toggle switches (instant save, no separate save button)

## What Stays the Same

- No new API endpoints — uses existing `PATCH /api/admin/config/:key`
- No schema changes — uses existing `PlatformConfig` table
- `getConfig()` 60s TTL cache means changes apply to next job naturally
- Current hardcoded values become fallback defaults — zero-downtime migration

## Propagation

Changes take effect within 60 seconds (getConfig TTL). Only affects new pipeline jobs; in-flight jobs keep the model they started with.
