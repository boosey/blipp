# Blipp: Business & Cost Analysis

**Date:** 2026-02-26
**Status:** Pre-build cost modeling. Clip caching architecture and tier structure were implemented as described. Platform costs are lower than projected (Cloudflare Workers vs. Vercel). See [architecture.md](../architecture.md) for the actual stack.

---

## Revenue Model

Blipp operates a **freemium + ad-supported hybrid** model.

### Subscription Tiers

| Tier | Price | Limits | Ads |
|------|-------|--------|-----|
| **Free** | $0 | 3 briefings/week, 5-min max | Pre-roll ads before each clip |
| **Pro** | $9.99/mo | Unlimited briefings, 30-min max, research mode | Ad-free |
| **Pro+** | $19.99/mo | Cross-podcast synthesis, Q&A, speaker voice TTS | Ad-free |

### Pre-Roll Ad Structure (Free Tier)

Each briefing is assembled from individual clips. Free-tier users hear an ad before each clip:

| Clip Duration | Ad Length | Ad-to-Content Ratio |
|---------------|-----------|---------------------|
| <5 min (1, 2, 3 min tiers) | 10 sec | 5–17% |
| 5–10 min (5, 7 min tiers) | 15 sec | 2.5–5% |
| >10 min (10, 15 min tiers) | 20 sec | 2–3% |

One ad impression = one ad played before one clip. A 5-clip briefing = 5 impressions per free user per day.

---

## Clip Caching: The Key Cost Lever

### How It Works

A **clip** is uniquely identified by `(podcast, episode, duration_tier)`. Once generated (distilled + TTS'd), a clip is stored in R2 and never regenerated. Two users who subscribe to the same podcast get the **same cached clip**, concatenated with their different second/third/etc. podcast clips.

Duration tiers are quantized: **1, 2, 3, 5, 7, 10, 15 minutes**. A user's proportional time allocation rounds to the nearest tier.

### Why This Matters

Without caching, costs scale with `users × episodes/day` (every user's briefing triggers fresh TTS). With clip caching, costs scale with `new episodes/day × requested duration tiers` — user count barely affects generation costs. Concatenation (the per-user step) is near-zero cost.

---

## Cost Model

### Per-Clip Generation Cost

| Operation | Cost | Notes |
|-----------|------|-------|
| Claims extraction (Claude, per episode) | ~$0.08 | One-time per episode, shared across all duration tiers |
| Narrative generation (Claude, per clip) | ~$0.04 | Per duration tier |
| TTS (OpenAI gpt-4o-mini-tts, per clip) | $0.015/min of speech | Varies by duration tier |

**Per new episode, assuming 3 duration tiers requested:**
- Claims: $0.08
- 3 narratives: 3 × $0.04 = $0.12
- 3 TTS (avg 3 min): 3 × $0.045 = $0.135
- **Total: ~$0.335 per episode**

### Generation Cost at Scale

Assumes top 200 podcasts, ~120 new episodes/day.

| | Without Clip Caching | With Clip Caching | Savings |
|---|---|---|---|
| **1K DAU** | ~$13,000/mo | ~$1,200/mo | **11x** |
| **10K DAU** | ~$128,000/mo | ~$2,100/mo | **61x** |
| **50K DAU** | ~$640,000/mo | ~$3,500/mo | **183x** |

The cost flattens dramatically because user growth only increases concatenation (free) and cache hits, not generation.

### Platform Cost at Scale (implemented on Cloudflare)

| Service | 1K DAU | 10K DAU | 50K DAU |
|---------|--------|---------|---------|
| Cloudflare Workers + Queues ($5/mo base) | $5 | $8 | $20 |
| Neon PostgreSQL (via Hyperdrive) | Free | $15 | $30 |
| Cloudflare R2 (storage + zero egress) | Free | $1 | $5 |
| Clerk Auth (50K MRU free) | Free | Free | Free |
| Stripe | 2.9% + $0.30/txn | same | same |
| **Platform subtotal** | **$5** | **$24** | **$55** |

> These estimates proved accurate. The Cloudflare-native architecture eliminated Vercel hosting costs entirely.

### R2 Storage Growth

| Timeframe | Clips Stored | Storage | R2 Cost/mo |
|-----------|-------------|---------|------------|
| 1 month | ~10,800 | ~30 GB | ~$0.30 |
| 6 months | ~65,000 | ~180 GB | ~$2.70 |
| 1 year | ~130,000 | ~360 GB | ~$5.40 |

Old clips can be pruned after they age out of relevance (nobody requests a 6-month-old episode's briefing clip).

---

## Revenue Projections

### Assumptions
- 10% Pro conversion rate
- 90% free tier with ads
- 5 clips per briefing average = 5 ad impressions per free user per day
- Programmatic ad CPM: $8 (conservative)
- Direct-sales ad CPM: $25 (later stage)

### Programmatic Ads ($8 CPM)

| DAU | Free Users | Impressions/Day | Ad Revenue/Mo | Sub Revenue/Mo | Total Revenue/Mo |
|-----|-----------|----------------|---------------|----------------|-----------------|
| 1,000 | 900 | 4,500 | $1,080 | $999 | **$2,079** |
| 10,000 | 9,000 | 45,000 | $10,800 | $9,990 | **$20,790** |
| 50,000 | 45,000 | 225,000 | $54,000 | $49,950 | **$103,950** |

### Direct-Sales Ads ($25 CPM, later stage)

| DAU | Ad Revenue/Mo | Sub Revenue/Mo | Total Revenue/Mo |
|-----|---------------|----------------|-----------------|
| 1,000 | $3,375 | $999 | **$4,374** |
| 10,000 | $33,750 | $9,990 | **$43,740** |
| 50,000 | $168,750 | $49,950 | **$218,700** |

---

## Unit Economics Summary

| DAU | Total Revenue (prog. ads) | Total Cost | Profit | Margin |
|-----|--------------------------|------------|--------|--------|
| 600 | ~$1,250 | ~$1,205 | ~$45 | **Break-even** |
| 1,000 | $2,079 | $1,205 | +$874 | 42% |
| 10,000 | $20,790 | $2,124 | +$18,666 | 90% |
| 50,000 | $103,950 | $3,555 | +$100,395 | 97% |

**Break-even at ~600 DAU.** Margins improve rapidly because clip caching keeps generation costs nearly flat as users grow. The dominant cost (Claude + TTS) is bounded by podcast catalog size, not user count.

---

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low transcript availability (<1% via RSS) | Can't distill without transcripts | Phase 0: curate catalog of podcasts with transcripts. Phase 1: add STT (Whisper/Deepgram at $0.006/min) |
| OpenAI TTS price increase | Direct cost increase | TTS provider abstraction; swap to Google WaveNet ($0.24/15min) or ElevenLabs for Pro+ |
| Claude API price increase | Direct cost increase | Distillation can use any LLM; Sonnet is replaceable |
| Low ad CPMs early | Revenue below projections | House ads (promote Pro tier) until scale justifies programmatic |
| Cache invalidation complexity | Stale clips served | Clips are immutable by design — an episode's content doesn't change. New episodes = new clips |
