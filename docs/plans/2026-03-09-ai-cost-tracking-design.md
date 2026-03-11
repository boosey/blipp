# AI Cost Tracking Design

## Goal

Track AI model usage charges per pipeline step, with aggregated views per request, per stage, and per model over time.

## Data Model Changes

Add fields to existing `PipelineStep` model:

- `model` (String?) — model ID used (e.g., `claude-sonnet-4-20250514`)
- `inputTokens` (Int?) — from API response (character count for TTS)
- `outputTokens` (Int?) — from API response (null for TTS/STT)
- `cost` (Float?) — already exists, populate from API response or calculate for TTS

Skipped/cached steps remain null for all cost fields.

## Cost Capture

Modify AI call sites to extract usage from API responses and return it to the queue handler for storage on `PipelineStep`:

| Stage | AI Call | Cost Source |
|-------|---------|-------------|
| Transcription | OpenAI Whisper | API response usage (aggregate across chunks) |
| Distillation | Claude `extractClaims()` | `response.usage.input_tokens` / `output_tokens` |
| Clip Generation | Claude `generateNarrative()` | `response.usage.input_tokens` / `output_tokens` |
| Clip Generation | OpenAI TTS `generateSpeech()` | Calculate from character count × known rate |

Each helper returns cost/usage metadata alongside its current return value. The queue handler writes it to `PipelineStep` on completion.

## Admin Views

All views are query-time aggregations over `PipelineStep` data — no summary tables.

1. **Per-step** — Show model, tokens, cost on pipeline step detail
2. **Per-request** — Sum all steps for a `BriefingRequest` on admin request detail page
3. **Per-stage** — Group by stage name with time period filter
4. **Per-model** — Group by `model` field with time period filter

Enhance existing `/api/admin/analytics/costs` endpoint and admin analytics page. Support time period filters: today, 7d, 30d, custom.

## Out of Scope

- No pricing registry — costs from API responses directly
- No user-facing cost views
- No new database tables
- No real-time tracking — costs recorded after step completion
