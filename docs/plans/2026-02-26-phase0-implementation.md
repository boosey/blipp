# Blipp Phase 0: "The Daily Briefing" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a launch-ready MVP where users subscribe to podcasts, set a briefing length, and receive a daily audio briefing distilled from new episodes.

**Architecture:** Next.js 15 full-stack app with Prisma/PostgreSQL for data, Inngest for background jobs, Anthropic Claude for distillation, OpenAI TTS for audio generation, and S3-compatible storage for audio files. RSS feeds and Podcast Index API for podcast discovery and transcript ingestion.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS + shadcn/ui, Prisma, PostgreSQL (Neon), Inngest, Anthropic SDK, OpenAI SDK, fluent-ffmpeg, S3 (Cloudflare R2 or AWS), NextAuth.js v5

---

## Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Step 1: Initialize Next.js project**

Run: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`

Expected: Project scaffolded with App Router, TypeScript, Tailwind

**Step 2: Install core dependencies**

Run:
```bash
npm install @anthropic-ai/sdk openai @prisma/client rss-parser inngest fluent-ffmpeg ffmpeg-static @aws-sdk/client-s3 @aws-sdk/lib-storage next-auth@beta zod
npm install -D prisma @types/fluent-ffmpeg
```

**Step 3: Create .env.example**

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/blipp"

# Auth
NEXTAUTH_SECRET="generate-a-secret"
NEXTAUTH_URL="http://localhost:3000"

# Anthropic (distillation)
ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (TTS)
OPENAI_API_KEY="sk-..."

# Podcast Index
PODCAST_INDEX_KEY="your-key"
PODCAST_INDEX_SECRET="your-secret"

# S3-compatible storage (R2 or AWS)
S3_ENDPOINT="https://your-account.r2.cloudflarestorage.com"
S3_ACCESS_KEY_ID="your-key"
S3_SECRET_ACCESS_KEY="your-secret"
S3_BUCKET_NAME="blipp-audio"
S3_PUBLIC_URL="https://audio.blipp.app"

# Inngest
INNGEST_EVENT_KEY="your-key"
INNGEST_SIGNING_KEY="your-signing-key"
```

**Step 4: Add shadcn/ui**

Run: `npx shadcn@latest init`

Select: New York style, Zinc base color, CSS variables

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with core dependencies"
```

---

## Task 2: Database Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

**Step 1: Write the Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Blipp-specific
  briefingLengthMinutes Int      @default(15)
  briefingTime          String   @default("07:00") // HH:MM in user's timezone
  timezone              String   @default("America/New_York")
  tier                  UserTier @default(FREE)

  accounts      Account[]
  sessions      Session[]
  subscriptions Subscription[]
  briefings     Briefing[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

enum UserTier {
  FREE
  PRO
  PRO_PLUS
}

model Podcast {
  id              String   @id @default(cuid())
  title           String
  description     String?
  feedUrl         String   @unique
  imageUrl        String?
  podcastIndexId  String?  @unique
  author          String?
  categories      String[] // stored as array of category strings
  lastFetchedAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  episodes      Episode[]
  subscriptions Subscription[]
}

model Episode {
  id              String   @id @default(cuid())
  podcastId       String
  title           String
  description     String?
  audioUrl        String   // original episode audio URL
  publishedAt     DateTime
  durationSeconds Int?     // original episode duration
  guid            String   // RSS guid, unique per podcast
  transcriptUrl   String?  // URL to transcript if available
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  podcast       Podcast       @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  distillation  Distillation?

  @@unique([podcastId, guid])
}

model Distillation {
  id              String             @id @default(cuid())
  episodeId       String             @unique
  status          DistillationStatus @default(PENDING)
  transcript      String?            // full transcript text
  claimsJson      Json?              // extracted claims with scores
  segmentsJson    Json?              // distilled segments at various word counts
  errorMessage    String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  episode         Episode            @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  briefingSegments BriefingSegment[]
}

enum DistillationStatus {
  PENDING
  FETCHING_TRANSCRIPT
  DISTILLING
  COMPLETED
  FAILED
}

model Subscription {
  id        String   @id @default(cuid())
  userId    String
  podcastId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  podcast Podcast @relation(fields: [podcastId], references: [id], onDelete: Cascade)

  @@unique([userId, podcastId])
}

model Briefing {
  id              String         @id @default(cuid())
  userId          String
  status          BriefingStatus @default(PENDING)
  targetMinutes   Int
  actualSeconds   Int?           // actual duration after TTS generation
  audioUrl        String?        // URL to the generated audio file
  audioKey        String?        // S3 key for the audio file
  generatedAt     DateTime?
  errorMessage    String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  segments BriefingSegment[]
}

enum BriefingStatus {
  PENDING
  BUILDING
  GENERATING_AUDIO
  COMPLETED
  FAILED
}

model BriefingSegment {
  id              String @id @default(cuid())
  briefingId      String
  distillationId  String
  orderIndex      Int    // position in the briefing
  allocatedWords  Int    // word budget for this segment
  narrativeText   String // the distilled text for TTS
  transitionText  String // "Next, from podcast X..."

  briefing     Briefing     @relation(fields: [briefingId], references: [id], onDelete: Cascade)
  distillation Distillation @relation(fields: [distillationId], references: [id], onDelete: Cascade)
}
```

**Step 2: Create Prisma client singleton**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Step 3: Generate client and push schema**

Run:
```bash
npx prisma generate
npx prisma db push
```

Expected: Schema synced to database, Prisma Client generated

**Step 4: Commit**

```bash
git add prisma/schema.prisma src/lib/db.ts
git commit -m "feat: add database schema for podcasts, episodes, distillations, briefings"
```

---

## Task 3: Podcast Index API Client

**Files:**
- Create: `src/lib/podcast-index.ts`
- Test: `src/lib/__tests__/podcast-index.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/podcast-index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PodcastIndexClient } from '../podcast-index';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PodcastIndexClient', () => {
  let client: PodcastIndexClient;

  beforeEach(() => {
    client = new PodcastIndexClient('test-key', 'test-secret');
    mockFetch.mockReset();
  });

  it('should search podcasts by term', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        feeds: [
          { id: 1, title: 'Test Podcast', url: 'https://example.com/feed.xml' }
        ]
      })
    });

    const results = await client.searchByTerm('test');
    expect(results.feeds).toHaveLength(1);
    expect(results.feeds[0].title).toBe('Test Podcast');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should fetch episodes by feed ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 100,
            title: 'Episode 1',
            enclosureUrl: 'https://example.com/ep1.mp3',
            transcriptUrl: 'https://example.com/ep1.vtt',
            datePublished: 1700000000,
          }
        ]
      })
    });

    const results = await client.episodesByFeedId(1, { max: 10 });
    expect(results.items).toHaveLength(1);
    expect(results.items[0].transcriptUrl).toBe('https://example.com/ep1.vtt');
  });

  it('should include correct auth headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ feeds: [] })
    });

    await client.searchByTerm('test');

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['X-Auth-Key']).toBe('test-key');
    expect(headers['User-Agent']).toContain('Blipp');
    expect(headers['Authorization']).toBeDefined();
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    await expect(client.searchByTerm('test')).rejects.toThrow('401');
  });
});
```

**Step 2: Install vitest and run test to verify it fails**

Run:
```bash
npm install -D vitest
npx vitest run src/lib/__tests__/podcast-index.test.ts
```

Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/podcast-index.ts
import crypto from 'crypto';

const BASE_URL = 'https://api.podcastindex.org/api/1.0';

interface PodcastFeed {
  id: number;
  title: string;
  url: string;
  description?: string;
  author?: string;
  image?: string;
  categories?: Record<string, string>;
}

interface PodcastEpisode {
  id: number;
  title: string;
  description?: string;
  enclosureUrl: string;
  enclosureLength?: number;
  duration?: number;
  datePublished: number;
  transcriptUrl?: string;
  feedId: number;
  feedTitle?: string;
  guid?: string;
}

interface SearchResult {
  feeds: PodcastFeed[];
  count: number;
}

interface EpisodesResult {
  items: PodcastEpisode[];
  count: number;
}

export class PodcastIndexClient {
  constructor(
    private apiKey: string,
    private apiSecret: string,
  ) {}

  private getHeaders(): Record<string, string> {
    const authDate = Math.floor(Date.now() / 1000);
    const hash = crypto
      .createHash('sha1')
      .update(this.apiKey + this.apiSecret + authDate)
      .digest('hex');

    return {
      'User-Agent': 'Blipp/1.0',
      'X-Auth-Key': this.apiKey,
      'X-Auth-Date': `${authDate}`,
      'Authorization': hash,
    };
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Podcast Index API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async searchByTerm(term: string, options: { max?: number } = {}): Promise<SearchResult> {
    return this.request<SearchResult>('/search/byterm', {
      q: term,
      ...(options.max && { max: String(options.max) }),
    });
  }

  async episodesByFeedId(feedId: number, options: { max?: number; since?: number } = {}): Promise<EpisodesResult> {
    return this.request<EpisodesResult>('/episodes/byfeedid', {
      id: String(feedId),
      ...(options.max && { max: String(options.max) }),
      ...(options.since && { since: String(options.since) }),
    });
  }

  async episodesByFeedUrl(feedUrl: string, options: { max?: number } = {}): Promise<EpisodesResult> {
    return this.request<EpisodesResult>('/episodes/byfeedurl', {
      url: feedUrl,
      ...(options.max && { max: String(options.max) }),
    });
  }

  async podcastByFeedUrl(feedUrl: string): Promise<{ feed: PodcastFeed }> {
    return this.request<{ feed: PodcastFeed }>('/podcasts/byfeedurl', {
      url: feedUrl,
    });
  }

  async trending(options: { max?: number; cat?: string } = {}): Promise<SearchResult> {
    return this.request<SearchResult>('/podcasts/trending', {
      ...(options.max && { max: String(options.max) }),
      ...(options.cat && { cat: options.cat }),
    });
  }
}

// Singleton instance
export const podcastIndex = new PodcastIndexClient(
  process.env.PODCAST_INDEX_KEY ?? '',
  process.env.PODCAST_INDEX_SECRET ?? '',
);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/podcast-index.test.ts`

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/lib/podcast-index.ts src/lib/__tests__/podcast-index.test.ts vitest.config.ts
git commit -m "feat: add Podcast Index API client with tests"
```

---

## Task 4: Transcript Fetcher

**Files:**
- Create: `src/lib/transcript.ts`
- Test: `src/lib/__tests__/transcript.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/transcript.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchTranscript, parseVTT, parseSRT } from '../transcript';

describe('parseVTT', () => {
  it('should parse WebVTT into plain text', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello and welcome to the show.

00:00:05.000 --> 00:00:10.000
Today we're talking about AI.`;

    const result = parseVTT(vtt);
    expect(result).toBe('Hello and welcome to the show.\nToday we\'re talking about AI.');
  });

  it('should strip speaker labels from VTT', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
<v Host>Hello and welcome.

00:00:05.000 --> 00:00:10.000
<v Guest>Thanks for having me.`;

    const result = parseVTT(vtt);
    expect(result).toContain('Hello and welcome.');
    expect(result).toContain('Thanks for having me.');
  });
});

describe('parseSRT', () => {
  it('should parse SRT into plain text', () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
Hello and welcome.

2
00:00:05,000 --> 00:00:10,000
Today we discuss AI.`;

    const result = parseSRT(srt);
    expect(result).toBe('Hello and welcome.\nToday we discuss AI.');
  });
});

describe('fetchTranscript', () => {
  it('should fetch and parse a VTT transcript', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello world.`,
      headers: new Headers({ 'content-type': 'text/vtt' }),
    });
    global.fetch = mockFetch;

    const result = await fetchTranscript('https://example.com/ep.vtt');
    expect(result).toBe('Hello world.');
  });

  it('should fetch plain text transcripts directly', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => 'This is a plain transcript.',
      headers: new Headers({ 'content-type': 'text/plain' }),
    });
    global.fetch = mockFetch;

    const result = await fetchTranscript('https://example.com/ep.txt');
    expect(result).toBe('This is a plain transcript.');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/transcript.test.ts`

Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/transcript.ts

/**
 * Parse WebVTT format into plain text.
 */
export function parseVTT(vtt: string): string {
  const lines = vtt.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    // Skip WEBVTT header, timestamps, empty lines, and NOTE lines
    if (
      line.startsWith('WEBVTT') ||
      line.includes('-->') ||
      line.trim() === '' ||
      line.startsWith('NOTE') ||
      /^\d+$/.test(line.trim())
    ) {
      continue;
    }

    // Strip VTT speaker tags like <v Host>
    const cleaned = line.replace(/<v\s+[^>]+>/g, '').replace(/<\/v>/g, '').trim();
    if (cleaned) {
      textLines.push(cleaned);
    }
  }

  return textLines.join('\n');
}

/**
 * Parse SRT format into plain text.
 */
export function parseSRT(srt: string): string {
  const lines = srt.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    // Skip sequence numbers, timestamps, and empty lines
    if (
      /^\d+$/.test(line.trim()) ||
      line.includes('-->') ||
      line.trim() === ''
    ) {
      continue;
    }

    textLines.push(line.trim());
  }

  return textLines.join('\n');
}

/**
 * Parse JSON transcript format (Podcasting 2.0 JSON).
 */
function parseJSONTranscript(json: string): string {
  const data = JSON.parse(json);
  if (Array.isArray(data.segments)) {
    return data.segments.map((s: { body?: string; text?: string }) => s.body ?? s.text ?? '').join(' ');
  }
  if (Array.isArray(data)) {
    return data.map((s: { body?: string; text?: string }) => s.body ?? s.text ?? '').join(' ');
  }
  return '';
}

/**
 * Detect transcript format from content type or URL extension.
 */
function detectFormat(url: string, contentType?: string): 'vtt' | 'srt' | 'json' | 'text' {
  if (contentType?.includes('text/vtt') || url.endsWith('.vtt')) return 'vtt';
  if (contentType?.includes('application/x-subrip') || url.endsWith('.srt')) return 'srt';
  if (contentType?.includes('application/json') || url.endsWith('.json')) return 'json';
  return 'text';
}

/**
 * Fetch a transcript from a URL and return plain text.
 */
export async function fetchTranscript(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const format = detectFormat(url, contentType);

  switch (format) {
    case 'vtt':
      return parseVTT(text);
    case 'srt':
      return parseSRT(text);
    case 'json':
      return parseJSONTranscript(text);
    default:
      return text.trim();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/transcript.test.ts`

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/transcript.ts src/lib/__tests__/transcript.test.ts
git commit -m "feat: add transcript fetcher with VTT/SRT/JSON parsing"
```

---

## Task 5: Distillation Engine

**Files:**
- Create: `src/lib/distill.ts`
- Test: `src/lib/__tests__/distill.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/distill.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildDistillationPrompt, parseDistillationResponse, allocateWordBudget } from '../distill';

describe('buildDistillationPrompt', () => {
  it('should include target word count in prompt', () => {
    const prompt = buildDistillationPrompt({
      transcript: 'Some transcript text here.',
      podcastTitle: 'Test Podcast',
      episodeTitle: 'Episode 1',
      targetWordCount: 450,
    });

    expect(prompt).toContain('450');
    expect(prompt).toContain('Test Podcast');
    expect(prompt).toContain('Episode 1');
    expect(prompt).toContain('Some transcript text here.');
  });
});

describe('allocateWordBudget', () => {
  it('should allocate proportionally based on transcript length', () => {
    const episodes = [
      { transcriptWordCount: 10000 },
      { transcriptWordCount: 5000 },
    ];

    const allocations = allocateWordBudget(episodes, 15);

    // 15 min * 150 wpm = 2250 total
    // overhead: 30 intro + 15 outro + 2*15 transitions = 75
    // content budget: 2175
    // proportional: 10000/15000 = 2/3 and 5000/15000 = 1/3
    expect(allocations[0]).toBeGreaterThan(allocations[1]);
    expect(allocations[0] + allocations[1]).toBeLessThanOrEqual(2250);
  });

  it('should enforce minimum segment length', () => {
    const episodes = [
      { transcriptWordCount: 100000 },
      { transcriptWordCount: 100 },
    ];

    const allocations = allocateWordBudget(episodes, 5);

    // Even tiny transcript gets minimum 150 words
    expect(allocations[1]).toBeGreaterThanOrEqual(150);
  });

  it('should handle single episode', () => {
    const episodes = [{ transcriptWordCount: 8000 }];
    const allocations = allocateWordBudget(episodes, 10);

    // 10 min * 150 = 1500 total, minus overhead (30+15+15=60) = 1440
    expect(allocations[0]).toBeLessThanOrEqual(1500);
    expect(allocations[0]).toBeGreaterThan(0);
  });
});

describe('parseDistillationResponse', () => {
  it('should extract claims from JSON response', () => {
    const response = JSON.stringify([
      { claim: 'AI will transform education', speaker: 'Guest', importance: 9, novelty: 7 },
      { claim: 'Regulation is lagging behind', speaker: 'Host', importance: 8, novelty: 5 },
    ]);

    const claims = parseDistillationResponse(response);
    expect(claims).toHaveLength(2);
    expect(claims[0].claim).toBe('AI will transform education');
    expect(claims[0].importance).toBe(9);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/distill.test.ts`

Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/distill.ts
import Anthropic from '@anthropic-ai/sdk';

const WORDS_PER_MINUTE = 150;
const INTRO_WORDS = 30;
const OUTRO_WORDS = 15;
const TRANSITION_WORDS_PER_SEGMENT = 15;
const MIN_SEGMENT_WORDS = 150;

export interface DistillationInput {
  transcript: string;
  podcastTitle: string;
  episodeTitle: string;
  targetWordCount: number;
}

export interface ExtractedClaim {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
}

export function buildDistillationPrompt(input: DistillationInput): string {
  return `You are a podcast distillation engine for a daily audio briefing product. Distill this podcast episode into a concise spoken narrative.

## Constraints
- Target length: EXACTLY ${input.targetWordCount} words (±10%). This is critical — word count maps to audio duration at ~150 words/minute.
- Write for the EAR, not the eye. Short sentences. No parentheticals or visual formatting.
- Use spoken transitions: "Here's the key insight...", "The most surprising point was..."
- Maintain original speakers' key arguments and specific data points, quotes, or examples.
- Attribute claims to speakers by name: "As [Guest] put it..."

## Structure
1. Opening hook (1-2 sentences): The single most compelling insight from this episode.
2. Context (1 sentence): Who was on the show and the topic.
3. Body: The 3-5 most important points, in logical order.
4. Closing (1 sentence): The key takeaway.

## Source
Podcast: ${input.podcastTitle}
Episode: ${input.episodeTitle}

## Transcript
${input.transcript}

## Output
Write the distilled narrative now. Target: ${input.targetWordCount} words.`;
}

export function buildClaimExtractionPrompt(transcript: string): string {
  return `Analyze this podcast transcript. Extract the top 10 most important claims, insights, or arguments.

For each, provide as a JSON array:
- claim: one-sentence summary
- speaker: who said it (use "Host" or "Guest" if names unknown)
- importance: 1-10 (10 = groundbreaking insight)
- novelty: 1-10 (10 = unique to this episode)

Return ONLY the JSON array, no other text.

Transcript:
${transcript}`;
}

export function parseDistillationResponse(response: string): ExtractedClaim[] {
  // Strip markdown code fences if present
  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as ExtractedClaim[];
}

export function allocateWordBudget(
  episodes: { transcriptWordCount: number }[],
  targetMinutes: number,
): number[] {
  const totalBudget = targetMinutes * WORDS_PER_MINUTE;
  const overhead = INTRO_WORDS + OUTRO_WORDS + (episodes.length * TRANSITION_WORDS_PER_SEGMENT);
  const contentBudget = totalBudget - overhead;

  const totalSourceWords = episodes.reduce((sum, ep) => sum + ep.transcriptWordCount, 0);

  const allocations = episodes.map((ep) => {
    const proportion = ep.transcriptWordCount / totalSourceWords;
    return Math.max(MIN_SEGMENT_WORDS, Math.floor(contentBudget * proportion));
  });

  // Normalize if we exceeded budget (from MIN_SEGMENT_WORDS clamping)
  const totalAllocated = allocations.reduce((sum, a) => sum + a, 0);
  if (totalAllocated > contentBudget) {
    const scale = contentBudget / totalAllocated;
    for (let i = 0; i < allocations.length; i++) {
      allocations[i] = Math.max(MIN_SEGMENT_WORDS, Math.floor(allocations[i] * scale));
    }
  }

  return allocations;
}

export async function distillTranscript(
  input: DistillationInput,
  anthropic: Anthropic,
): Promise<string> {
  const prompt = buildDistillationPrompt(input);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.ceil(input.targetWordCount * 2),
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return text;
}

export async function extractClaims(
  transcript: string,
  anthropic: Anthropic,
): Promise<ExtractedClaim[]> {
  const prompt = buildClaimExtractionPrompt(transcript);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return parseDistillationResponse(text);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateMinutes(wordCount: number): number {
  return wordCount / WORDS_PER_MINUTE;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/distill.test.ts`

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/distill.ts src/lib/__tests__/distill.test.ts
git commit -m "feat: add distillation engine with word budget allocation and claim extraction"
```

---

## Task 6: TTS Provider & Audio Stitching

**Files:**
- Create: `src/lib/tts.ts`
- Create: `src/lib/audio.ts`
- Test: `src/lib/__tests__/tts.test.ts`
- Test: `src/lib/__tests__/audio.test.ts`

**Step 1: Write the TTS provider abstraction**

```typescript
// src/lib/tts.ts
import OpenAI from 'openai';
import fs from 'fs';

export interface TTSProvider {
  generate(text: string, outputPath: string): Promise<void>;
}

export class OpenAITTSProvider implements TTSProvider {
  private client: OpenAI;
  private voice: string;

  constructor(voice: string = 'coral') {
    this.client = new OpenAI();
    this.voice = voice;
  }

  async generate(text: string, outputPath: string): Promise<void> {
    const response = await this.client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: this.voice as 'coral',
      input: text,
      response_format: 'mp3',
      instructions: 'Speak in a warm, professional broadcast tone. Natural pacing with slight pauses at topic transitions.',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(outputPath, buffer);
  }
}
```

**Step 2: Write the audio stitching module**

```typescript
// src/lib/audio.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TTSProvider } from './tts';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

export interface BriefingContent {
  segments: {
    podcastTitle: string;
    episodeTitle: string;
    narrativeText: string;
    transitionText: string;
  }[];
}

/**
 * Concatenate multiple audio files into one using ffmpeg concat demuxer.
 */
export async function concatenateAudio(
  segmentPaths: string[],
  outputPath: string,
): Promise<void> {
  const listPath = outputPath + '.list.txt';
  const listContent = segmentPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');

  await fs.promises.writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(outputPath)
      .on('end', () => {
        fs.promises.unlink(listPath).catch(() => {});
        resolve();
      })
      .on('error', reject)
      .run();
  });
}

/**
 * Get audio file duration in seconds using ffprobe.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

/**
 * Build a complete briefing audio file from distilled segments.
 */
export async function buildBriefingAudio(
  content: BriefingContent,
  outputPath: string,
  tts: TTSProvider,
): Promise<{ durationSeconds: number }> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'blipp-'));
  const audioParts: string[] = [];

  try {
    // Generate intro
    const introPath = path.join(tempDir, '00-intro.mp3');
    const introText = `Good morning. Here's your Blipp briefing, covering ${content.segments.length} podcast${content.segments.length === 1 ? '' : 's'}.`;
    await tts.generate(introText, introPath);
    audioParts.push(introPath);

    // Generate each segment with transition
    for (let i = 0; i < content.segments.length; i++) {
      const seg = content.segments[i];
      const prefix = String(i + 1).padStart(2, '0');

      // Transition
      const transPath = path.join(tempDir, `${prefix}-trans.mp3`);
      await tts.generate(seg.transitionText, transPath);
      audioParts.push(transPath);

      // Content
      const contentPath = path.join(tempDir, `${prefix}-content.mp3`);
      await tts.generate(seg.narrativeText, contentPath);
      audioParts.push(contentPath);
    }

    // Generate outro
    const outroPath = path.join(tempDir, '99-outro.mp3');
    await tts.generate("That's your Blipp briefing. Have a great day.", outroPath);
    audioParts.push(outroPath);

    // Concatenate all parts
    await concatenateAudio(audioParts, outputPath);

    const durationSeconds = await getAudioDuration(outputPath);
    return { durationSeconds };
  } finally {
    // Clean up temp files
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

**Step 3: Write tests**

```typescript
// src/lib/__tests__/audio.test.ts
import { describe, it, expect } from 'vitest';
import { BriefingContent } from '../audio';

describe('BriefingContent structure', () => {
  it('should accept valid briefing content', () => {
    const content: BriefingContent = {
      segments: [
        {
          podcastTitle: 'AI Today',
          episodeTitle: 'The Future of LLMs',
          narrativeText: 'The most striking claim from this episode...',
          transitionText: 'First up, from AI Today: The Future of LLMs.',
        },
      ],
    };
    expect(content.segments).toHaveLength(1);
  });
});
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/audio.test.ts src/lib/__tests__/tts.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/tts.ts src/lib/audio.ts src/lib/__tests__/audio.test.ts
git commit -m "feat: add TTS provider abstraction and audio stitching pipeline"
```

---

## Task 7: S3 Storage Client

**Files:**
- Create: `src/lib/storage.ts`

**Step 1: Write the storage module**

```typescript
// src/lib/storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

const BUCKET = process.env.S3_BUCKET_NAME ?? 'blipp-audio';
const PUBLIC_URL = process.env.S3_PUBLIC_URL ?? '';

/**
 * Upload an audio file to S3 and return the public URL.
 */
export async function uploadAudio(
  filePath: string,
  key: string,
): Promise<{ url: string; key: string }> {
  const fileStream = fs.createReadStream(filePath);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    },
  });

  await upload.done();

  return {
    url: `${PUBLIC_URL}/${key}`,
    key,
  };
}

/**
 * Delete an audio file from S3.
 */
export async function deleteAudio(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

/**
 * Generate a storage key for a briefing audio file.
 */
export function briefingAudioKey(userId: string, briefingId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `briefings/${userId}/${date}/${briefingId}.mp3`;
}
```

**Step 2: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: add S3 storage client for audio file uploads"
```

---

## Task 8: Inngest Background Jobs

**Files:**
- Create: `src/inngest/client.ts`
- Create: `src/inngest/functions/distill-episode.ts`
- Create: `src/inngest/functions/build-briefing.ts`
- Create: `src/inngest/functions/poll-feeds.ts`
- Create: `src/app/api/inngest/route.ts`

**Step 1: Set up Inngest client**

```typescript
// src/inngest/client.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'blipp' });
```

**Step 2: Create the feed polling function**

```typescript
// src/inngest/functions/poll-feeds.ts
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [
      ['podcast:transcript', 'podcastTranscript', { keepArray: true }],
    ],
  },
});

export const pollFeeds = inngest.createFunction(
  { id: 'poll-feeds', retries: 2 },
  { cron: '0 */2 * * *' }, // Every 2 hours
  async ({ step }) => {
    const podcasts = await step.run('get-podcasts', async () => {
      return prisma.podcast.findMany({
        select: { id: true, feedUrl: true, lastFetchedAt: true },
      });
    });

    for (const podcast of podcasts) {
      await step.run(`fetch-feed-${podcast.id}`, async () => {
        const feed = await parser.parseURL(podcast.feedUrl);

        for (const item of feed.items ?? []) {
          if (!item.guid || !item.enclosureUrl) continue;

          // Extract transcript URL from podcast:transcript tag or other sources
          const transcriptUrl = extractTranscriptUrl(item);

          await prisma.episode.upsert({
            where: {
              podcastId_guid: { podcastId: podcast.id, guid: item.guid },
            },
            create: {
              podcastId: podcast.id,
              title: item.title ?? 'Untitled',
              description: item.contentSnippet ?? item.content ?? null,
              audioUrl: item.enclosureUrl,
              publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
              durationSeconds: parseDuration(item.itunes?.duration),
              guid: item.guid,
              transcriptUrl,
            },
            update: {
              title: item.title ?? 'Untitled',
              transcriptUrl: transcriptUrl ?? undefined,
            },
          });
        }

        await prisma.podcast.update({
          where: { id: podcast.id },
          data: { lastFetchedAt: new Date() },
        });
      });
    }

    return { polled: podcasts.length };
  },
);

function extractTranscriptUrl(item: any): string | null {
  // Check podcast:transcript tag
  if (item.podcastTranscript) {
    const transcripts = Array.isArray(item.podcastTranscript)
      ? item.podcastTranscript
      : [item.podcastTranscript];
    for (const t of transcripts) {
      if (typeof t === 'string') return t;
      if (t?.$ && t.$.url) return t.$.url;
    }
  }
  return null;
}

function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  // Handle "HH:MM:SS" or "MM:SS" or seconds
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1 && !isNaN(parts[0])) return parts[0];
  return null;
}
```

**Step 3: Create the episode distillation function**

```typescript
// src/inngest/functions/distill-episode.ts
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { fetchTranscript } from '@/lib/transcript';
import { extractClaims, countWords } from '@/lib/distill';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export const distillEpisode = inngest.createFunction(
  { id: 'distill-episode', retries: 2, concurrency: { limit: 5 } },
  { event: 'episode/distill' },
  async ({ event, step }) => {
    const { episodeId } = event.data;

    // Create or get distillation record
    const distillation = await step.run('init-distillation', async () => {
      return prisma.distillation.upsert({
        where: { episodeId },
        create: { episodeId, status: 'FETCHING_TRANSCRIPT' },
        update: { status: 'FETCHING_TRANSCRIPT', errorMessage: null },
        include: { episode: { include: { podcast: true } } },
      });
    });

    // Fetch transcript
    const transcript = await step.run('fetch-transcript', async () => {
      const episode = distillation.episode;
      if (!episode.transcriptUrl) {
        throw new Error('No transcript URL available');
      }

      const text = await fetchTranscript(episode.transcriptUrl);
      if (!text || countWords(text) < 100) {
        throw new Error('Transcript too short or empty');
      }

      await prisma.distillation.update({
        where: { id: distillation.id },
        data: { transcript: text, status: 'DISTILLING' },
      });

      return text;
    });

    // Extract claims
    const claims = await step.run('extract-claims', async () => {
      const result = await extractClaims(transcript, anthropic);
      return result;
    });

    // Save results
    await step.run('save-distillation', async () => {
      await prisma.distillation.update({
        where: { id: distillation.id },
        data: {
          claimsJson: claims as any,
          status: 'COMPLETED',
        },
      });
    });

    return { distillationId: distillation.id, claimCount: claims.length };
  },
);
```

**Step 4: Create the briefing builder function**

```typescript
// src/inngest/functions/build-briefing.ts
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { allocateWordBudget, distillTranscript, countWords } from '@/lib/distill';
import { buildBriefingAudio } from '@/lib/audio';
import { OpenAITTSProvider } from '@/lib/tts';
import { uploadAudio, briefingAudioKey } from '@/lib/storage';
import Anthropic from '@anthropic-ai/sdk';
import os from 'os';
import path from 'path';
import fs from 'fs';

const anthropic = new Anthropic();

export const buildBriefing = inngest.createFunction(
  { id: 'build-briefing', retries: 1, concurrency: { limit: 3 } },
  { event: 'briefing/build' },
  async ({ event, step }) => {
    const { userId, briefingId } = event.data;

    // Get briefing and user's subscribed episodes with distillations
    const briefing = await step.run('load-briefing-data', async () => {
      const b = await prisma.briefing.update({
        where: { id: briefingId },
        data: { status: 'BUILDING' },
        include: { user: true },
      });

      // Get recent distilled episodes from subscribed podcasts
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const episodes = await prisma.episode.findMany({
        where: {
          podcast: {
            subscriptions: { some: { userId } },
          },
          publishedAt: { gte: oneDayAgo },
          distillation: { status: 'COMPLETED' },
        },
        include: {
          podcast: true,
          distillation: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 10,
      });

      return { briefing: b, episodes };
    });

    if (briefing.episodes.length === 0) {
      await step.run('no-episodes', async () => {
        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: 'FAILED', errorMessage: 'No new episodes to include in briefing' },
        });
      });
      return { status: 'no-episodes' };
    }

    // Allocate word budgets
    const episodesWithWordCounts = briefing.episodes.map((ep) => ({
      ...ep,
      transcriptWordCount: countWords(ep.distillation?.transcript ?? ''),
    }));

    const wordBudgets = allocateWordBudget(
      episodesWithWordCounts,
      briefing.briefing.targetMinutes,
    );

    // Distill each episode to its word budget
    const segments = await step.run('distill-segments', async () => {
      const results = [];

      for (let i = 0; i < briefing.episodes.length; i++) {
        const ep = briefing.episodes[i];
        const targetWords = wordBudgets[i];

        const narrative = await distillTranscript(
          {
            transcript: ep.distillation!.transcript!,
            podcastTitle: ep.podcast.title,
            episodeTitle: ep.title,
            targetWordCount: targetWords,
          },
          anthropic,
        );

        const transitionText = i === 0
          ? `First up, from ${ep.podcast.title}: ${ep.title}.`
          : `Next, from ${ep.podcast.title}: ${ep.title}.`;

        results.push({
          distillationId: ep.distillation!.id,
          podcastTitle: ep.podcast.title,
          episodeTitle: ep.title,
          narrativeText: narrative,
          transitionText,
          allocatedWords: targetWords,
          orderIndex: i,
        });
      }

      return results;
    });

    // Generate audio
    const audioResult = await step.run('generate-audio', async () => {
      await prisma.briefing.update({
        where: { id: briefingId },
        data: { status: 'GENERATING_AUDIO' },
      });

      const tts = new OpenAITTSProvider('coral');
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'blipp-briefing-'));
      const outputPath = path.join(tempDir, 'briefing.mp3');

      const { durationSeconds } = await buildBriefingAudio(
        { segments },
        outputPath,
        tts,
      );

      // Upload to S3
      const key = briefingAudioKey(userId, briefingId);
      const { url } = await uploadAudio(outputPath, key);

      // Cleanup
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return { url, key, durationSeconds };
    });

    // Save briefing segments and finalize
    await step.run('finalize-briefing', async () => {
      // Create briefing segments
      for (const seg of segments) {
        await prisma.briefingSegment.create({
          data: {
            briefingId,
            distillationId: seg.distillationId,
            orderIndex: seg.orderIndex,
            allocatedWords: seg.allocatedWords,
            narrativeText: seg.narrativeText,
            transitionText: seg.transitionText,
          },
        });
      }

      // Update briefing status
      await prisma.briefing.update({
        where: { id: briefingId },
        data: {
          status: 'COMPLETED',
          audioUrl: audioResult.url,
          audioKey: audioResult.key,
          actualSeconds: Math.round(audioResult.durationSeconds),
          generatedAt: new Date(),
        },
      });
    });

    return {
      briefingId,
      segments: segments.length,
      durationSeconds: audioResult.durationSeconds,
    };
  },
);
```

**Step 5: Create the Inngest API route**

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { pollFeeds } from '@/inngest/functions/poll-feeds';
import { distillEpisode } from '@/inngest/functions/distill-episode';
import { buildBriefing } from '@/inngest/functions/build-briefing';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pollFeeds, distillEpisode, buildBriefing],
});
```

**Step 6: Commit**

```bash
git add src/inngest/ src/app/api/inngest/
git commit -m "feat: add Inngest background jobs for feed polling, distillation, and briefing generation"
```

---

## Task 9: Auth Setup (NextAuth.js)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Step 1: Configure NextAuth with Prisma adapter**

Run: `npm install @auth/prisma-adapter`

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { prisma } from './db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
```

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

**Step 2: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/
git commit -m "feat: add NextAuth.js with Google and GitHub providers"
```

---

## Task 10: Core API Routes

**Files:**
- Create: `src/app/api/podcasts/search/route.ts`
- Create: `src/app/api/podcasts/subscribe/route.ts`
- Create: `src/app/api/briefings/route.ts`
- Create: `src/app/api/briefings/[id]/route.ts`

**Step 1: Podcast search API**

```typescript
// src/app/api/podcasts/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { podcastIndex } from '@/lib/podcast-index';
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().min(1).max(200),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = searchSchema.safeParse({ q: searchParams.get('q') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
  }

  const results = await podcastIndex.searchByTerm(parsed.data.q, { max: 20 });

  return NextResponse.json({
    podcasts: results.feeds.map((feed) => ({
      podcastIndexId: String(feed.id),
      title: feed.title,
      feedUrl: feed.url,
      description: feed.description,
      author: feed.author,
      imageUrl: feed.image,
    })),
  });
}
```

**Step 2: Subscribe/unsubscribe API**

```typescript
// src/app/api/podcasts/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inngest } from '@/inngest/client';
import { z } from 'zod';

const subscribeSchema = z.object({
  feedUrl: z.string().url(),
  title: z.string(),
  podcastIndexId: z.string().optional(),
  imageUrl: z.string().optional(),
  author: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Upsert the podcast
  const podcast = await prisma.podcast.upsert({
    where: { feedUrl: parsed.data.feedUrl },
    create: {
      title: parsed.data.title,
      feedUrl: parsed.data.feedUrl,
      podcastIndexId: parsed.data.podcastIndexId,
      imageUrl: parsed.data.imageUrl,
      author: parsed.data.author,
    },
    update: {},
  });

  // Create subscription
  await prisma.subscription.upsert({
    where: {
      userId_podcastId: {
        userId: session.user.id,
        podcastId: podcast.id,
      },
    },
    create: {
      userId: session.user.id,
      podcastId: podcast.id,
    },
    update: {},
  });

  return NextResponse.json({ subscribed: true, podcastId: podcast.id });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { podcastId } = body;

  await prisma.subscription.deleteMany({
    where: { userId: session.user.id, podcastId },
  });

  return NextResponse.json({ unsubscribed: true });
}
```

**Step 3: Briefing request API**

```typescript
// src/app/api/briefings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Create briefing record
  const briefing = await prisma.briefing.create({
    data: {
      userId: session.user.id,
      targetMinutes: user.briefingLengthMinutes,
      status: 'PENDING',
    },
  });

  // Trigger Inngest background job
  await inngest.send({
    name: 'briefing/build',
    data: {
      userId: session.user.id,
      briefingId: briefing.id,
    },
  });

  return NextResponse.json({ briefingId: briefing.id, status: 'PENDING' });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const briefings = await prisma.briefing.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      segments: {
        include: {
          distillation: {
            include: { episode: { include: { podcast: true } } },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  return NextResponse.json({ briefings });
}
```

```typescript
// src/app/api/briefings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const briefing = await prisma.briefing.findFirst({
    where: { id, userId: session.user.id },
    include: {
      segments: {
        include: {
          distillation: {
            include: { episode: { include: { podcast: true } } },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!briefing) {
    return NextResponse.json({ error: 'Briefing not found' }, { status: 404 });
  }

  return NextResponse.json({ briefing });
}
```

**Step 4: Commit**

```bash
git add src/app/api/podcasts/ src/app/api/briefings/
git commit -m "feat: add API routes for podcast search, subscription, and briefing management"
```

---

## Task 11: Frontend — Landing Page & Layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/nav.tsx`

**Step 1: Build the landing page and app shell**

This task uses the frontend-design skill. The landing page should:
- Hero section with tagline "Every podcast, in the time you have."
- Time slider visual showing the core concept
- Sign in with Google/GitHub buttons
- Mobile-first, dark theme

The dashboard should:
- List subscribed podcasts
- Time slider to set briefing length
- "Generate Briefing" button
- List of recent briefings with play button

**Step 2: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add landing page and dashboard UI"
```

---

## Task 12: Frontend — Audio Player

**Files:**
- Create: `src/components/audio-player.tsx`
- Create: `src/hooks/use-audio-player.ts`

**Step 1: Build the audio player**

A persistent bottom-bar audio player that:
- Shows current briefing title and progress
- Play/pause, skip segment, progress scrubber
- Shows which podcast segment is currently playing
- "Save for later" button on current segment

**Step 2: Commit**

```bash
git add src/components/audio-player.tsx src/hooks/
git commit -m "feat: add audio player component with segment tracking"
```

---

## Task 13: Frontend — Podcast Search & Subscribe

**Files:**
- Create: `src/app/(app)/podcasts/page.tsx`
- Create: `src/components/podcast-search.tsx`
- Create: `src/components/podcast-card.tsx`

**Step 1: Build the podcast discovery UI**

- Search bar that queries `/api/podcasts/search`
- Results displayed as cards with podcast art, title, author
- Subscribe/unsubscribe toggle button per card
- Shows current subscriptions at top

**Step 2: Commit**

```bash
git add src/app/(app)/podcasts/ src/components/podcast-*.tsx
git commit -m "feat: add podcast search and subscription UI"
```

---

## Task 14: Settings Page

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/app/api/settings/route.ts`

**Step 1: Build settings UI**

- Briefing length slider (5-30 minutes)
- Preferred briefing time picker
- Timezone selector
- Account tier display

**Step 2: Commit**

```bash
git add src/app/(app)/settings/ src/app/api/settings/
git commit -m "feat: add user settings page with briefing preferences"
```

---

## Task 15: Integration Testing & Polish

**Step 1: Write an end-to-end test for the core flow**

Test the flow: subscribe to podcast -> trigger distillation -> build briefing -> verify audio URL exists.

**Step 2: Add error boundaries and loading states**

**Step 3: Add proper SEO metadata to layout**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: add integration tests, error handling, and polish"
```

---

## Summary

| Task | Component | Estimated Complexity |
|------|-----------|---------------------|
| 1 | Project scaffolding | Low |
| 2 | Database schema | Medium |
| 3 | Podcast Index client | Medium |
| 4 | Transcript fetcher | Medium |
| 5 | Distillation engine | High |
| 6 | TTS & audio stitching | High |
| 7 | S3 storage | Low |
| 8 | Inngest background jobs | High |
| 9 | Auth setup | Low |
| 10 | API routes | Medium |
| 11 | Landing page & dashboard | Medium |
| 12 | Audio player | Medium |
| 13 | Podcast search UI | Medium |
| 14 | Settings page | Low |
| 15 | Integration testing | Medium |

**Total tasks: 15**
**Critical path: Tasks 1-8 (backend pipeline), then Tasks 9-14 (frontend), then Task 15 (polish)**
