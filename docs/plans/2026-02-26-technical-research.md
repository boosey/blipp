# Blipp: Technical Research — Podcast Sources, TTS, & Distillation Pipeline

**Date:** 2026-02-26
**Source:** Technical Research Agents

---

## 1. Podcast RSS & Transcript Sources

### RSS Feed Parsing

**Recommended: `rss-parser`**
- `npm install rss-parser`
- TypeScript support with generics for custom fields
- Supports custom namespace fields (crucial for `itunes:*` and `podcast:transcript` tags)

```typescript
import Parser from 'rss-parser';

type CustomFeed = { 'itunes:author': string };
type CustomItem = {
  'itunes:duration': string;
  'itunes:episode': string;
  'podcast:transcript': string;
};

const parser: Parser<CustomFeed, CustomItem> = new Parser({
  customFields: {
    feed: ['itunes:author'],
    item: [
      ['itunes:duration', 'itunes:duration'],
      ['podcast:transcript', 'podcast:transcript', { keepArray: true }],
    ]
  }
});

const feed = await parser.parseURL('https://example.com/podcast.rss');
feed.items.forEach(item => {
  console.log(item.title, item['itunes:duration']);
});
```

### Podcast Index API

- **Completely free.** No paid tiers. Sign up at: https://api.podcastindex.org
- 4M+ podcasts indexed
- Supports Podcasting 2.0 including `podcast:transcript` tag awareness

**Authentication:**

```typescript
import crypto from 'crypto';

const apiKey = process.env.PODCAST_INDEX_KEY!;
const apiSecret = process.env.PODCAST_INDEX_SECRET!;
const apiHeaderTime = Math.floor(Date.now() / 1000);

const hash = crypto
  .createHash('sha1')
  .update(apiKey + apiSecret + apiHeaderTime)
  .digest('hex');

const headers = {
  'User-Agent': 'Blipp/1.0',
  'X-Auth-Key': apiKey,
  'X-Auth-Date': `${apiHeaderTime}`,
  'Authorization': hash,
};
```

**Key Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /search/byterm?q=...` | Search podcasts by keyword |
| `GET /podcasts/trending` | Get trending podcasts |
| `GET /episodes/byfeedid?id=...` | Get episodes for a podcast |
| `GET /episodes/byfeedurl?url=...` | Get episodes by RSS URL |
| `GET /search/byperson?q=...` | Search episodes by person name |

**Critical Limitation:** Transcript coverage is very low — less than 1% of episodes have creator-provided transcripts via the `podcast:transcript` tag.

### Transcript Sources

| Source | Access Method | Cost | Coverage |
|--------|-------------|------|----------|
| `<podcast:transcript>` RSS tag | Parse RSS feed | Free | Very low (<1%) |
| Podcast Index `transcriptUrl` | API field | Free | Low |
| Taddy API | GraphQL API | Free tier, $75+/mo | Built-in transcripts for many episodes |
| YouTube Captions | `youtube-captions-scraper` npm | Free | Video podcasts only |
| OpenAI Whisper API | REST API | $0.006/min | Any audio (Phase 1+) |
| Deepgram | REST API | $0.0043/min | Any audio + speaker diarization |
| AssemblyAI | REST API | $0.006/min ($50 free credits) | Any audio + speaker diarization + entities |

### Phase 0 Transcript Strategy

1. **Primary:** Parse RSS feeds for `podcast:transcript` tags (free, when available)
2. **Secondary:** Use Podcast Index API `transcriptUrl` field
3. **Tertiary:** For curated catalog (~500 podcasts), pre-identify which have transcripts and supplement with Taddy or one-time STT batch
4. **Fallback:** Skip episodes without transcripts in Phase 0

---

## 2. TTS Provider Comparison

### Cost Per 15-Minute Briefing (~15,000 characters)

| Provider | Model | Cost per 15 min | Quality | Notes |
|----------|-------|-----------------|---------|-------|
| **OpenAI** | tts-1 | **$0.225** | Good | Cheapest good-quality option |
| **OpenAI** | gpt-4o-mini-tts | **~$0.225** | Very Good | Steerable via instructions |
| **Azure** | Neural | **$0.225** | Good | Per-word timestamps available |
| **Google** | Standard | **$0.06** | Fair | Cheapest overall, lowest quality |
| **Google** | WaveNet | **$0.24** | Good | Good free tier |
| **OpenAI** | tts-1-hd | **$0.45** | Very Good | 2x cost of tts-1 |
| **ElevenLabs** | Multilingual v2 | **$3.60-$4.50** | Excellent | 10-20x more expensive |
| **Google** | Studio/Chirp | **$0.45** | Very Good | Matches OpenAI HD |

### MVP Recommendation: OpenAI `gpt-4o-mini-tts`

Best price-to-quality ratio. Steerable instructions feature is uniquely valuable — you can prompt it to adopt the tone of a "polished daily briefing narrator." At $0.225 per briefing, serving 1,000 daily users costs ~$202/month in TTS. Consider ElevenLabs for Pro+ tier later.

### OpenAI TTS Code Example

```typescript
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI();

async function generateSpeech(text: string, outputPath: string): Promise<void> {
  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: text,
    response_format: "mp3",
    instructions: "Speak in a warm, professional tone suitable for a daily podcast briefing. Use natural pacing with brief pauses between topics.",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(outputPath, buffer);
}
```

### ElevenLabs Code Example

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

async function generateSpeech(text: string, outputPath: string): Promise<void> {
  const audio = await client.textToSpeech.convert("JBFqnCBsd6RMb", {
    text,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
  });
  const writeStream = createWriteStream(outputPath);
  await pipeline(audio, writeStream);
}
```

### TTS Provider Abstraction

```typescript
interface TTSProvider {
  generate(text: string, outputPath: string): Promise<void>;
}
```

Implement per provider so you can swap easily.

---

## 3. LLM Distillation Strategy

### Core Principle

~150 words per minute of spoken audio. A 15-minute briefing needs ~2,250 words.

### Two-Pass Distillation (Recommended)

**Pass 1: Extract and score key claims**

```typescript
const scoringPrompt = `Analyze this podcast transcript. Extract the top 10 most important claims, insights, or arguments. For each, provide:
- claim: one-sentence summary
- speaker: who said it
- importance: 1-10
- novelty: 1-10

Return as JSON array.

Transcript:
${transcript}`;
```

**Pass 2: Write narrative from scored claims**

```typescript
const narrativePrompt = `Write a ${targetWordCount}-word spoken narrative for an audio briefing.

Build the narrative around these key claims (ranked by importance):
${JSON.stringify(claims, null, 2)}

Rules:
- Write for spoken delivery (short sentences, natural transitions)
- Hit ${targetWordCount} words +/-5%
- Include specific data points, names, and quotes
- Flow as a single coherent story, not a bullet-point list`;
```

### Word Count Enforcement

LLMs are imprecise on word counts. Mitigation:
- Ask for the target, accept +/-10%
- Programmatic word-count check + one retry if out of range
- Calibrate WORDS_PER_MINUTE constant empirically with your TTS provider

### Chunking Strategy (for very long transcripts)

Most individual transcripts (8,000-12,000 words) fit in Claude's 200K context. Chunking only needed for:
- Cross-podcast synthesis (Model 4)
- Transcripts longer than ~150K tokens

Use hierarchical map-reduce:
1. MAP: Summarize each chunk independently (100-200 words per chunk)
2. REDUCE: Combine summaries into final narrative at target word count

---

## 4. Audio Stitching

### Dependencies

```bash
npm install fluent-ffmpeg ffmpeg-static
```

### Concatenation (Lossless)

```typescript
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegStatic as string);

async function concatenateAudio(
  segmentPaths: string[],
  outputPath: string
): Promise<void> {
  const listPath = outputPath + ".txt";
  const listContent = segmentPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  await fs.promises.writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .output(outputPath)
      .on("end", () => {
        fs.promises.unlink(listPath).catch(() => {});
        resolve();
      })
      .on("error", reject)
      .run();
  });
}
```

### Crossfade Transitions

Use 0.3s crossfade between segments for polished output. Requires re-encoding but sounds professional.

### Briefing Assembly Pipeline

```
Intro TTS -> [Transition TTS -> Content TTS] x N -> Outro TTS -> Concatenate -> Final MP3
```

Each segment (intro, transition, content, outro) is generated separately as TTS, then stitched together.

---

## 5. Time-Fitting Algorithm

### The Math

- Speech rate: ~150 words/minute
- Target 15 minutes = 2,250 words total
- Overhead: intro (~30 words) + outro (~15 words) + transitions (~15 words each)
- For 5 podcasts: overhead = 120 words
- Available for content: 2,130 words across 5 segments

### Proportional Allocation (MVP)

```typescript
const WORDS_PER_MINUTE = 150;
const INTRO_WORDS = 30;
const OUTRO_WORDS = 15;
const TRANSITION_WORDS_PER_SEGMENT = 15;
const MIN_SEGMENT_WORDS = 150; // 1 minute minimum

function allocateWordBudget(
  episodes: { transcriptWordCount: number }[],
  targetMinutes: number
): number[] {
  const totalBudget = targetMinutes * WORDS_PER_MINUTE;
  const overhead = INTRO_WORDS + OUTRO_WORDS +
    (episodes.length * TRANSITION_WORDS_PER_SEGMENT);
  const contentBudget = totalBudget - overhead;

  const totalSourceWords = episodes.reduce(
    (sum, ep) => sum + ep.transcriptWordCount, 0
  );

  return episodes.map((ep) => {
    const proportion = ep.transcriptWordCount / totalSourceWords;
    return Math.max(MIN_SEGMENT_WORDS, Math.floor(contentBudget * proportion));
  });
}
```

### Post-Generation Duration Verification

Use ffprobe to verify actual audio duration matches target within 10%.

---

## 6. Recommended Tech Stack (Phase 0 MVP)

### Core

| Layer | Technology | Why |
|-------|-----------|-----|
| Web App | Next.js 15 (App Router) | Full-stack, SSR, API routes |
| Language | TypeScript | Type safety across the stack |
| Styling | Tailwind CSS + shadcn/ui | Fast MVP UI development |
| Auth | NextAuth.js v5 or Clerk | Drop-in auth with OAuth |

### Data

| Layer | Technology | Why |
|-------|-----------|-----|
| Database | PostgreSQL (Neon/Supabase) | Reliable, free tiers available |
| ORM | Prisma | Type-safe queries, easy migrations |
| File Storage | S3-compatible (AWS S3, R2, Supabase Storage) | Store generated audio files |

### Background Jobs

**Inngest (recommended for MVP)**
- No infrastructure to manage, serverless-native
- Free tier (5,000 runs/mo)
- Works on Vercel
- Define jobs as functions, Inngest invokes via HTTP

### External Services

| Service | Purpose | Cost |
|---------|---------|------|
| Podcast Index API | Podcast search, metadata, transcripts | Free |
| Anthropic Claude API | Transcript distillation | ~$3/M input, $15/M output (Sonnet) |
| OpenAI TTS API | TTS generation | ~$0.225 per 15-min briefing |
| Vercel | Hosting | Free tier / $20/mo Pro |
| Neon / Supabase | Managed PostgreSQL | Free tier |
| Inngest | Background jobs | Free tier (5k runs/mo) |

### Estimated Monthly Costs (1,000 DAU)

| Service | Cost |
|---------|------|
| TTS (1,000 briefings/day) | ~$202/mo |
| LLM distillation | ~$150/mo |
| Hosting (Vercel Pro) | $20/mo |
| Database (Neon) | Free-$25/mo |
| S3 storage | ~$10/mo |
| Inngest | Free tier |
| **Total** | **~$400-$410/mo** |

At $9.99/mo Pro subscription with 10% conversion = 100 paying users = $999/mo revenue. **Unit economics work from day one.**
