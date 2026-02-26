# Blipp: Persona-Model Matrix & UX Strategy

**Date:** 2026-02-26
**Source:** UX Strategist Agent

---

## 1. Persona Deep Dive

### 1.1 Busy Professional

**Core job-to-be-done:** "Keep me informed on everything that matters to me, in the time I have, with zero friction."

| Dimension | Ideal Specification |
|---|---|
| **Format** | Narrative briefing (like a personal news anchor). NOT bullet points — they are listening while driving/walking. Bullets are a visual format. Audio needs connective tissue: "Meanwhile, on the Lex Fridman podcast, Sam Altman revealed..." |
| **Length** | Fixed and predictable. They are filling a TIME SLOT (20-min commute, 15-min lunch). The system must fit content TO the slot, not the other way around. |
| **Depth** | Surface-to-mid. They want to know WHAT was said and WHY it matters, not the full reasoning chain. Think "executive summary" — enough to hold a conversation about it, not enough to write a paper. |
| **Interaction** | Passive-first with a "bookmark for later" escape hatch. They cannot tap a screen while driving. Voice commands at most: "Save that," "Skip," "Tell me more later." |
| **Delight features** | (a) "Briefing builder" — select 5 podcasts, get a unified 20-min briefing stitched together with transitions. (b) "Catch me up" — missed 3 days? One 25-min mega-briefing. (c) Calendar-aware timing: "You have 12 minutes before your next meeting." |

**Best model fit:**
- **Model 1 (web transcripts -> distill -> TTS)** is the **fastest path to value** here. Busy professionals care about the information, not the original voices. A polished, consistent TTS narrator voice is actually preferable — it signals "curated briefing," not "chopped up podcast."
- **Model 3 (STT -> distill -> speaker TTS)** is overkill for this persona. Speaker impersonation adds production complexity without clear value.
- **Model 2 (creator clips)** is supplementary at best. Professionals do not want to browse; they want the system to decide for them.

### 1.2 Researcher/Learner

**Core job-to-be-done:** "Help me find the specific needle in this haystack of long-form content, and let me verify it against the source."

| Dimension | Ideal Specification |
|---|---|
| **Format** | Structured/segmented: topic-indexed chapters, key claims extracted as discrete items, Q&A format ("What did the guest say about X?"). They need to be able to CITE and NAVIGATE, not just passively absorb. A hybrid of bullet-point outlines (visual, when reading) + audio deep-dives on selected sections. |
| **Length** | Variable and user-controlled. Sometimes they want the 2-min "is this episode even relevant?" scan. Sometimes they want the full 15-min detailed distillation. The key is THEY choose, per episode, per section. |
| **Depth** | Deep. They want the reasoning, the evidence, the nuance. "Guest argued X because of Y, citing Z study, but host pushed back noting..." Lossy compression that drops the argumentation structure is useless to them. |
| **Interaction** | Highly interactive. Drill-down is the core interaction: outline -> expand section -> hear original clip -> read full transcript segment -> save to notes. This persona will use the app with a screen, not just headphones. |
| **Delight features** | (a) "Source verify" — tap any claim to hear the original 30-second clip where it was said. (b) Cross-episode synthesis: "What have the last 5 AI podcasts said about regulation?" (c) Export to Notion/Obsidian with timestamps and citations. (d) Semantic search across all distilled content. |

**Best model fit:**
- **Model 3 (STT -> distill -> clips)** is **essential** here. Researchers need the connection back to original audio. Speaker diarization lets you attribute claims to specific people.
- **Model 1 (web transcripts -> distill)** is a useful **fallback/supplement** for podcasts that already have good transcripts.
- **Model 2 (creator clips)** is **highly valuable** here as curated expert clips carry implicit authority.

### 1.3 Casual Browser

**Core job-to-be-done:** "Entertain me with interesting moments I would never have found on my own. Make discovery effortless and fun."

| Dimension | Ideal Specification |
|---|---|
| **Format** | Actual audio/video clips — real voices, real energy, real moments. This persona wants the EXPERIENCE of the podcast, compressed. A TTS summary kills the vibe entirely. Think "best 90 seconds of a 3-hour conversation." |
| **Length** | Short and variable: 30 sec to 3 min per clip, served in an infinite scroll/autoplay feed. Total session length is emergent (they scroll until they stop), not planned. |
| **Depth** | Surface. Context is optional — they want the punchline, the hot take, the surprising moment, the funny exchange. If they want depth, they tap through to the full episode (conversion funnel to the original podcast). |
| **Interaction** | Swipe/scroll feed with social mechanics: like, share, save, "hear more from this episode," follow topics/shows. Low cognitive load, high dopamine. |
| **Delight features** | (a) "Moment detection" — AI identifies the most emotionally intense, surprising, or funny moments automatically. (b) Topic-based feeds: "Show me clips about AI," "Show me debate moments." (c) Social proof: "Trending clips," "Most saved this week." (d) One-tap share to Instagram/TikTok with audiogram generation. |

**Best model fit:**
- **Model 3 (STT -> speaker recognition -> clip extraction)** is **non-negotiable**. This persona needs real audio with real voices.
- **Model 2 (creator clips)** is the **ideal complement** — creator-curated highlights are inherently high-quality and solve the cold-start problem.
- **Model 1 (web transcripts -> TTS)** is **nearly useless** for this persona. A TTS summary of a funny podcast moment misses the point entirely.

---

## 2. The Persona-Model Matrix

```
                    Model 1            Model 2            Model 3
                    Transcript->TTS    Creator Clips      STT->Distill->TTS
 -------------------------------------------------------------------------------
 BUSY               PRIMARY            Low                Nice-to-have
 PROFESSIONAL       Fast, cheap, fits  No time to browse  Speaker voice adds
                    briefing format    creator content    little value here
                    perfectly
 -------------------------------------------------------------------------------
 RESEARCHER /       Supplement         High               PRIMARY
 LEARNER            Good for text      Curated expert     Source verification
                    summaries when no  clips = trusted    and attribution are
                    audio needed       starting points    essential
 -------------------------------------------------------------------------------
 CASUAL             Irrelevant         PRIMARY            PRIMARY
 BROWSER            TTS kills the vibe Best cold-start    Real voices and
                                       content source     moments are the
                                                          entire product
```

---

## 3. The Unified Architecture: One Engine, Three Presentation Layers

The critical insight: the distillation engine can be shared, but the presentation layer must be radically different per persona.

```
                         +---------------------------+
                         |      INGESTION LAYER      |
                         |    (shared across all)    |
                         +---------------------------+
                         | - Web transcript import   | <- Model 1
                         | - Creator clip upload     | <- Model 2
                         | - STT + diarization       | <- Model 3
                         +-------------+-------------+
                                       |
                         +-------------v-------------+
                         |   DISTILLATION ENGINE     |
                         |     (shared core)         |
                         +---------------------------+
                         | - Topic segmentation      |
                         | - Key claim extraction    |
                         | - Moment scoring          |
                         |   (emotion, surprise,     |
                         |    importance, humor)      |
                         | - Speaker attribution     |
                         | - Argument structure      |
                         |   mapping                 |
                         +-------------+-------------+
                                       |
                    +------------------+------------------+
                    |                  |                  |
         +----------v---+    +--------v--------+   +-----v-----------+
         |  BRIEFING    |    |  RESEARCH       |   |  DISCOVERY      |
         |  LAYER       |    |  LAYER          |   |  LAYER          |
         +--------------+    +-----------------+   +-----------------+
         | Narrative     |    | Structured      |   | Clip feed       |
         | stitching     |    | outline +       |   | with moment     |
         | across        |    | drill-down      |   | scoring +       |
         | episodes      |    | + source        |   | social          |
         | -> TTS        |    | clips           |   | mechanics       |
         +--------------+    +-----------------+   +-----------------+
```

**What the distillation engine produces for every episode (universal intermediate representation):**

1. **Topic segments** with timestamps and importance scores
2. **Key claims** attributed to speakers, with confidence and novelty scores
3. **Moment scores** per segment: emotional intensity, humor, surprise, controversy
4. **Argument maps**: claim -> evidence -> counter-argument chains
5. **Named entities and concepts** for search indexing
6. **Original audio clip references** (start/end timestamps) for every extracted element

Then each presentation layer selects and reformats from this shared representation:

| Presentation Layer | Selects from engine | Reformats as |
|---|---|---|
| **Briefing** (Professional) | Top-N claims by importance score, filtered by user's topic preferences | Narrative prose -> TTS with transitions between episodes |
| **Research** (Learner) | Full topic segments, all claims with attribution, argument maps | Hierarchical outline with expandable sections, linked source clips |
| **Discovery** (Browser) | Top moments by emotion/humor/surprise scores | Short audio clips in a scrollable feed with topic tags |

---

## 4. Launch Prioritization Recommendation

### Phase 1: Launch MVP (Months 1-3)

**Target persona: Busy Professional via Model 1**

Rationale:
- Model 1 is the simplest to build (no STT, no speaker modeling, no creator marketplace)
- Busy Professionals have the highest willingness-to-pay and lowest patience for imperfection
- A daily briefing product has natural retention mechanics (daily habit)
- Web transcripts are abundant for popular podcasts
- TTS quality from providers like ElevenLabs/OpenAI is already excellent for narration
- This generates revenue and validates the core distillation engine

**MVP feature set:**
- Pick your podcasts (from catalog of transcript-available shows)
- Set your briefing length (10 / 15 / 20 / 25 min)
- Get a daily audio briefing covering new episodes
- "Save for later" via voice or tap
- One consistent, high-quality narrator voice

### Phase 2: Research Layer (Months 3-6)

**Target persona: Researcher/Learner via Model 1 + early Model 3**

**Added features:**
- Episode outlines with expandable sections
- Claim extraction with speaker attribution
- Search across distilled content
- "Source clip" playback for key moments (requires Model 3 pipeline)
- Export to notes apps

### Phase 3: Discovery Feed + Creator Platform (Months 6-12)

**Target persona: Casual Browser via Model 2 + Model 3**

**Added features:**
- Swipe feed of best moments
- Creator upload portal with analytics
- Social features: follow, like, share
- Audiogram generation for social sharing
- Topic-based discovery channels

### Phase 4: Full Convergence (Months 12+)

- Speaker-voice TTS for Busy Professional briefings
- Cross-episode synthesis for Researchers
- Personalized discovery algorithm for Casual Browsers
- Hybrid persona support: users move between modes depending on context

---

## 5. Key Strategic Tensions to Resolve

**Tension 1: Consistent narrator voice vs. original speaker voices.**
The Busy Professional benefits from a single polished narrator. The Casual Browser needs original voices. Build two separate audio rendering paths and let the presentation layer choose.

**Tension 2: Fixed length vs. variable length.**
The Professional wants exactly 20 minutes. The Researcher wants everything about topic X regardless of length. The Browser wants endless short clips. Design the engine's API around three query modes from day one: time-budget compression, topic-filtered extraction, and moment-ranked clip selection.

**Tension 3: Passive consumption vs. interactive exploration.**
These require fundamentally different client interfaces. The briefing mode is a podcast player. The research mode is a document viewer with audio embeds. The discovery mode is a social feed. Build three distinct "modes" with a shared backend.

**Tension 4: Model 2 (creator platform) is a marketplace problem, not a technology problem.**
Models 1 and 3 are technology bets. Model 2 is a go-to-market bet. Defer it until the technology is proven and you have user traction to attract creators.
