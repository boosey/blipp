# AI Cost Reduction Strategies

## Current AI Cost Centers

| Stage | Provider | Model | Cost Type |
|-------|----------|-------|-----------|
| STT (Whisper) | OpenAI | whisper-1 | Per-minute audio |
| Distillation (claims) | Anthropic | claude-sonnet-4 | Input/output tokens |
| Narrative generation | Anthropic | claude-sonnet-4 | Input/output tokens |
| TTS | OpenAI | gpt-4o-mini-tts | Per-character |

## Strategies

### 1. Use Cheaper Models Where Possible (implemented via model configurator)
- **Distillation**: Haiku handles structured JSON extraction well at ~10x lower cost than Sonnet
- **Narrative**: A/B test Haiku for shorter duration tiers
- Models now configurable via admin UI without redeploying

### 2. Truncate Transcripts Before Sending to Claude
- Full transcripts can be 10k-50k+ words
- Truncating to ~8,000 words or chunking + summarizing cuts input tokens dramatically
- Two-pass approach: chunk transcript, extract claims per chunk with Haiku, merge/deduplicate

### 3. Share Narratives Across Duration Tiers
- Generate the longest narrative once and trim programmatically for shorter tiers
- Saves one Claude call per additional duration tier on the same episode

### 4. Anthropic Prompt Caching
- System prompt and instructions are identical across episodes
- `cache_control` on system message gives 90% discount on cached prefix tokens
- Simple API change in `extractClaims()` and `generateNarrative()`

### 5. Batch API as Subscription Tier Feature
- Anthropic Batches API: 50% cost reduction, up to 24h latency
- **Free tier**: Use batch API for podcast subscriptions (users accept delay for free service)
- **Pro tier**: Real-time pipeline (current behavior)
- **Pro Plus**: Real-time + priority queue ordering
- Turns cost optimization into a value differentiator

### 6. Switch TTS Provider
- ElevenLabs Turbo v2.5 — competitive pricing, better voice quality
- Google Cloud TTS — significantly cheaper for standard voices
- Cloudflare Workers AI — free TTS models (already on the platform)
- Listed as "coming soon" in model configurator registry

### 7. Deduplicate Across Users
- Distillation and clips for (episode, durationTier) are already shared across users
- Verify briefing assembly reuses same audio clip from R2 rather than regenerating

### 8. TTL-Based Staleness Threshold
- Add `staleAfter` to work products
- If briefing generated <24h ago for same episode set, serve cached version

## Impact Ranking

| Strategy | Estimated Savings | Effort |
|----------|------------------|--------|
| Haiku for claim extraction | ~90% on distillation | Low (model configurator done) |
| Transcript truncation | 50-80% on distillation input tokens | Medium |
| Prompt caching | 90% on cached prefix tokens | Low |
| Batch API (free tier) | 50% on free-tier Claude costs | Medium |
| TTS provider switch | Variable | Medium-High |

**Combined impact of top 4**: 80-90% reduction in Claude API costs.
