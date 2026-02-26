# Blipp: Podcast Distillation Platform — Design Document

**Date:** 2026-02-26
**Status:** Approved for implementation planning

---

## 1. Product Vision

Blipp is a podcast intelligence platform that distills long-form podcast content into audio experiences that fit the listener's available time. The core promise: *you choose the time, Blipp delivers the value.*

**Tagline:** "Every podcast, in the time you have."

### Target Personas

| Persona | Description | Core Need |
|---------|-------------|-----------|
| **Busy Professional** | Commuters, executives, time-constrained listeners | "Give me today's 5 podcasts in 20 minutes" |
| **Researcher/Learner** | Students, journalists, analysts | "Extract specific insights and let me verify sources" |
| **Casual Browser** | Discovery-oriented listeners | "Show me the most interesting podcast moments right now" |

### Three Operating Modes

| Mode | Persona | Experience |
|------|---------|-----------|
| **Briefing** | Busy Professional | Single stitched audio briefing, fit to your time slot, delivered daily |
| **Research** | Researcher/Learner | Structured outlines with drill-down, source clips, cross-episode search, export to notes |
| **Discover** | Casual Browser | Swipeable feed of high-energy moments, social mechanics, topic channels |

---

## 2. Content Models (9 Total)

### User-Proposed Models

| # | Name | Description |
|---|------|-------------|
| 1 | **Transcript Distillation** | Ingest existing web transcripts, distill to target duration, TTS output |
| 2 | **Creator Clip Platform** | Creators publish their own clips/distillations (marketplace model) |
| 3 | **Full Audio Pipeline** | STT + speaker recognition -> transcript -> distill/clip -> TTS with speaker impersonation |

### Agent-Team-Generated Models

| # | Name | Description |
|---|------|-------------|
| 4 | **Cross-Podcast Synthesis ("The Mashup Engine")** | Aggregate content from multiple episodes across shows on a single topic into one unified briefing. "What did 5 podcasts say about AI regulation this week?" |
| 5 | **Interactive Q&A ("Ask the Episode")** | RAG-powered voice/text conversation with an AI that ingested the episode. User asks: "What did the guest say about interest rates?" |
| 6 | **Community-Curated Highlights ("The Clip Collective")** | Listeners mark/upvote highlights, platform assembles crowd-sourced "best of" reels using human collective intelligence |
| 7 | **Real-Time Live Distillation ("The Live Wire")** | Streaming STT on just-published episodes, rolling distillation ready within minutes. Push notification: "Your 5-min version is ready." |
| 8 | **Personalized Daily Briefing ("My Morning Blipp")** | AI assembles a single continuous personalized audio briefing from all your feeds, fit to your exact commute time, learning from skip/replay behavior |
| 9 | **Multimodal Companion ("Beyond Audio")** | Key-point cards, structured notes (export to Notion/Obsidian), auto-generated audiograms for social sharing, newsletter digests |

### Persona-Model Matrix

```
                 Model 1          Model 2          Model 3
                 Transcript->TTS  Creator Clips    STT->Distill->TTS
 -----------------------------------------------------------------------
 Professional    PRIMARY          Low              Nice-to-have
                 Fast, cheap,     No time to       Speaker voice adds
                 fits briefing    browse creator    little value here
                 format           content

 Researcher      Supplement       High             PRIMARY
                 Good for text    Curated expert   Source verification
                 summaries        clips = trusted  and attribution are
                                  starting points  essential

 Casual Browser  Irrelevant       PRIMARY          PRIMARY
                 TTS kills the    Best cold-start  Real voices and
                 vibe             content source   moments are the
                                                   entire product
```

---

## 3. Architecture

### Core Principle

One shared distillation engine produces a rich intermediate representation. Each mode is a view over that data.

### Ingestion Layer (shared)

Three input pipelines:

- **Transcript Import** — Pull existing transcripts from web services (Podscribe, podcast RSS `<podcast:transcript>` tags, YouTube captions)
- **STT Pipeline** — Whisper-based speech-to-text with speaker diarization (pyannote or equivalent) for podcasts without transcripts
- **Creator Upload** — API/portal for creators to submit clips with metadata

### Distillation Engine (shared core)

For every episode, the engine produces a universal intermediate representation:

| Output | Description |
|--------|-------------|
| **Topic segments** | Time-bounded sections with topic labels and importance scores |
| **Key claims** | Discrete assertions attributed to speakers, scored for novelty/importance |
| **Moment scores** | Per-segment scores: emotional intensity, humor, surprise, controversy |
| **Argument maps** | Claim -> evidence -> counter-argument chains |
| **Entity/concept index** | Named entities and concepts for search |
| **Audio clip references** | Start/end timestamps for every extracted element |

### Presentation Layers

| Layer | Selects From Engine | Renders As |
|-------|---------------------|-----------|
| **Briefing** | Top-N claims by importance, filtered by user topic preferences | Narrative prose -> TTS with transitions between episodes |
| **Research** | Full topic segments, all claims with attribution, argument maps | Hierarchical outline with expandable sections + source clips |
| **Discover** | Top moments by emotion/humor/surprise scores | Short original-audio clips in scrollable feed |

### Time-Fitting Algorithm

The core differentiator. When a user says "I have 15 minutes":

1. Score all available content (from subscribed feeds, new episodes)
2. Rank by relevance to user preferences
3. Pack content into the time budget using a knapsack-style algorithm (maximize value within time constraint)
4. Generate transition narration between segments
5. Render to a single audio file

### Audio Output Strategy

- **Briefing Mode:** Consistent AI narrator voice (polished, signals "curated briefing"). Hybrid approach with original audio clips for key quotes where available.
- **Research Mode:** Original audio clips for source verification, AI narration for summaries and transitions.
- **Discover Mode:** Original audio only. Real voices, real energy. No TTS.
- **Speaker impersonation:** Nice-to-have for later phases, not core to launch.

---

## 4. Business Model

### Freemium + Ad-Supported Hybrid

| Tier | Price | Features |
|------|-------|----------|
| **Free (Ad-Supported)** | $0 | 3 briefings/week, discovery feed with ads, 5-min max distillation length, standard TTS voice |
| **Blipp Pro** | ~$9.99/mo | Unlimited briefings, no ads, up to 30-min distillations, research mode, multiple TTS voices, export to notes apps |
| **Blipp Pro+** | ~$19.99/mo | Everything in Pro + cross-podcast synthesis, interactive Q&A, speaker-voice TTS, priority processing of user-submitted feeds |

### Revenue Drivers

- Subscription upgrades (free users hit limits on frequency and length)
- Audio ads in free tier (similar to podcast ad model)
- Creator partnerships (revenue share for clips on platform)
- B2B API access (future: media companies, newsletter writers, research firms)

### Unit Economics

- Primary cost: LLM inference for distillation + TTS generation
- Model 1 (transcript-based) is cheapest — no STT costs
- Model 3 (full audio pipeline) is most expensive — STT + diarization + speaker TTS
- Phased rollout aligns cost with revenue: launch with cheapest model, add expensive models as paying users fund them

---

## 5. Content Strategy

### Hybrid Catalog: Curated + User-Supplied

**Curated Catalog (Launch)**
- ~500-1000 popular podcasts with existing transcripts
- Focus categories: news/politics, business, tech, science, health
- Quality-controlled transcript verification

**User-Supplied (Phase 1+)**
- Users paste RSS feed URLs to add any podcast
- System runs STT pipeline (Model 3) on-demand
- Pro/Pro+ feature
- Popular user-submitted podcasts graduate to curated catalog

**Creator Platform (Phase 2+)**
- Self-serve portal for podcasters to submit clips
- Analytics dashboard: views, saves, click-throughs to full episodes
- Creator incentive: distribution + new audience funnel

### Content Rights

- Distillation under fair use / transformative use doctrine
- Always link back to original episode with clear attribution
- Creator opt-out mechanism
- Creator opt-in incentives (verified accounts, analytics, promotion)

---

## 6. Competitive Positioning

### Market Whitespace

No one offers a consumer audio product that intelligently compresses podcast content to a user-specified duration. Every competitor either:

- Produces text, not audio (Snipd, Podwise, ChatGPT)
- Requires manual effort (ChatGPT, NotebookLM)
- Offers fixed-length output (everyone)
- Has structural conflict of interest with time reduction (Spotify, YouTube maximize listen time)

### Positioning Against Competitors

| Competitor | Blipp's Counter-Position |
|---|---|
| Speed controls (2x playback) | "2x is a blunt instrument. Blipp is a scalpel." |
| Snipd / Podwise | "They give you notes. Blipp gives you audio." |
| ChatGPT / Claude | "They require effort. Blipp is press-play." |
| NotebookLM | "They're a research tool. Blipp is a listening experience." |
| TikTok clips | "Clips are random moments. Blipp is the whole story, shorter." |
| Spotify/YouTube | "They want your time. Blipp respects it." |

### Moat Opportunities

| Moat | Durability |
|------|-----------|
| Proprietary distillation model fine-tuned for podcast audio | Medium |
| Cross-episode knowledge graph (what was said across millions of episodes) | High |
| User preference data (skip/replay behavior improves personalization) | High |
| Creator partnerships with top podcast networks | High if achieved |
| Habit formation (morning briefing becomes daily routine) | Very high |

---

## 7. Phased Build Roadmap

### Phase 0 — MVP (Months 1-3): "The Daily Briefing"

**Target:** Busy Professional via Model 1 + Model 8

**Core features:**
- Pick podcasts from curated catalog (~500 shows with existing transcripts)
- Set daily briefing length (10 / 15 / 20 / 25 / 30 min slider)
- Single stitched audio briefing each morning covering new episodes
- One polished AI narrator voice
- Simple player: play/pause, skip segment, "save for later"
- Free tier: 3 briefings/week, 10-min max
- Pro tier: unlimited, up to 30 min

**Tech stack (initial):**
- Transcript ingestion from existing sources
- LLM distillation (Claude API for summarization)
- TTS (ElevenLabs or equivalent)
- Time-fitting algorithm
- Mobile-first web app (PWA) + basic native wrapper

### Phase 1 (Months 3-6): "The Research Layer"

**Target:** Add Researcher/Learner via Models 1+3+5

**Added features:**
- Episode outlines with expandable sections
- Key claim extraction with speaker attribution
- Semantic search across all distilled content
- "Source clip" playback — tap any claim to hear original audio
- Interactive Q&A mode (Model 5) — ask questions about episodes
- Export to Notion/Obsidian/Readwise
- STT pipeline goes live (Model 3) for podcasts without transcripts

### Phase 2 (Months 6-12): "The Discovery Feed"

**Target:** Add Casual Browser via Models 2+3+6

**Added features:**
- Swipeable clip feed ranked by moment scores (emotion, humor, surprise)
- Topic-based channels ("AI", "True Crime", "Comedy Moments")
- Creator upload portal with analytics (Model 2)
- Community highlights — users mark favorite moments (Model 6)
- Social features: follow topics, save, share
- Audiogram generation for social sharing (Model 9)

### Phase 3 (Months 12+): "The Intelligence Platform"

**Added features:**
- Cross-podcast synthesis (Model 4) — "What did everyone say about X?"
- Speaker-voice TTS for briefings (Model 3 enhancement)
- Real-time processing for breaking content (Model 7)
- Full multimodal output (Model 9) — newsletter digests, key-point cards
- Advanced personalization — interest learning from behavior
- B2B API for media companies and researchers

---

## 8. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Copyright/fair use challenges | Podcasters or networks object to distillation | Creator opt-out, attribution, link-back, transformative use framing, creator partnerships |
| Spotify/Apple build this in | Market compression | They have structural conflict (maximize listen time). Move fast, build habit + cross-show synthesis moat |
| LLM distillation quality | Bad summaries erode trust | Human QA for curated catalog, user feedback loops, confidence scoring |
| TTS quality feels robotic | Users prefer real audio | Premium TTS voices, hybrid approach (AI narration + original clips) |
| Cold start for discovery feed | No content = no users | Phase behind briefing launch, seed with creator partnerships |
| High compute costs | Margins squeezed | Start with Model 1 (cheapest), phase in expensive models as revenue scales |

---

## 9. Success Criteria

### MVP (Phase 0)
- Users can generate a daily briefing from 3+ podcasts in under 60 seconds
- Time-fitting algorithm produces coherent audio within 10% of target duration
- Distillation quality rated 4+/5 by test users
- 1000+ users in first month, 10%+ conversion to Pro

### Phase 1
- Research mode used by 20%+ of active users
- Interactive Q&A answers 80%+ of questions accurately (grounded in transcript)
- Export feature used weekly by researchers

### Phase 2
- Discovery feed DAU/MAU ratio > 30% (healthy engagement)
- Creator platform onboards 100+ podcasters in first quarter
- Viral coefficient > 0.5 from social sharing

### Phase 3
- Cross-podcast synthesis becomes top-cited feature in user surveys
- B2B API generates 20%+ of revenue
- Platform processes 10,000+ episodes per day
