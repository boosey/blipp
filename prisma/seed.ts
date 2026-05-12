import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import { CRON_JOB_REGISTRY } from "../worker/lib/cron/registry";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Resolve voice preset IDs by name (IDs differ between environments) ──
  const voicePresets = await prisma.voicePreset.findMany({
    where: { name: { in: ["System Default", "Nova", "Sage", "Spark"] } },
    select: { id: true, name: true },
  });
  const vpId = (name: string) => voicePresets.find((v) => v.name === name)?.id;
  const allVpIds = voicePresets.map((v) => v.id);

  // ── Plans ──

  const freePlan = {
    name: "Free",
    slug: "free",
    priceCentsMonthly: 0,
    priceCentsAnnual: null as number | null,
    briefingsPerWeek: 10 as number | null,
    maxDurationMinutes: 5,
    maxPodcastSubscriptions: null as number | null,
    pastEpisodesLimit: 5 as number | null,
    transcriptAccess: false,
    dailyDigest: false,
    concurrentPipelineJobs: 5,
    adFree: false,
    priorityProcessing: false,
    earlyAccess: false,

    offlineAccess: false,
    publicSharing: true,
    isDefault: true,
    highlighted: false,
    active: true,
    features: [
      "10 briefings per week",
      "5 minute maximum",
      "5000+ podcasts",
      "Choice of 2 voices",
    ],
    allowedVoicePresetIds: [vpId("System Default"), vpId("Sage")].filter(Boolean) as string[],
    sortOrder: 0,
  };

  await prisma.plan.upsert({
    where: { slug: "free" },
    update: freePlan,
    create: freePlan,
  });

  const proPlan = {
    name: "Pro",
    slug: "pro",
    priceCentsMonthly: 799,
    priceCentsAnnual: 7999 as number | null,
    briefingsPerWeek: null as number | null,
    maxDurationMinutes: 15,
    maxPodcastSubscriptions: 5 as number | null,
    pastEpisodesLimit: null as number | null,
    transcriptAccess: false,
    dailyDigest: false,
    concurrentPipelineJobs: 15,
    adFree: true,
    priorityProcessing: false,
    earlyAccess: false,

    offlineAccess: false,
    publicSharing: true,
    isDefault: false,
    highlighted: true,
    active: true,
    features: [
      "Unlimited briefings",
      "15 minute maximum",
      "5000+ podcasts",
      "Choice of 4 voices",
      "Ad-free",
    ],
    allowedVoicePresetIds: allVpIds,
    sortOrder: 1,
  };

  await prisma.plan.upsert({
    where: { slug: "pro" },
    update: proPlan,
    create: proPlan,
  });

  const proPlusPlan = {
    name: "Pro+",
    slug: "pro-plus",
    priceCentsMonthly: 1499,
    priceCentsAnnual: 13999 as number | null,
    briefingsPerWeek: null as number | null,
    maxDurationMinutes: 30,
    maxPodcastSubscriptions: null as number | null,
    pastEpisodesLimit: null as number | null,
    transcriptAccess: true,
    dailyDigest: true,
    concurrentPipelineJobs: 50,
    adFree: true,
    priorityProcessing: true,
    earlyAccess: true,

    offlineAccess: true,
    publicSharing: true,
    isDefault: false,
    highlighted: false,
    active: true,
    features: [
      "Unlimited briefings",
      "30 minute maximum",
      "5000+ podcasts",
      "Choice of 10 voices",
      "Ad-free",
      "Offline listening",
      "Priority Processing",
      "Early access to new episodes",
    ],
    allowedVoicePresetIds: allVpIds,
    sortOrder: 2,
  };

  await prisma.plan.upsert({
    where: { slug: "pro-plus" },
    update: proPlusPlan,
    create: proPlusPlan,
  });

  console.log("Seeded plans.");

  // ── Voice Presets ──

  await prisma.voicePreset.upsert({
    where: { name: "System Default" },
    update: {},
    create: {
      name: "System Default",
      description: "The default Blipp voice — warm, professional podcast briefing tone.",
      isSystem: true,
      isActive: true,
      config: {
        openai: {
          voice: "coral",
          instructions:
            "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
            "Maintain a steady, engaging pace. Pause naturally between topics.",
          speed: 1.0,
        },
        groq: { voice: "diana" },
        cloudflare: { voice: "luna" },
      },
    },
  });

  // ── Curated Personas ──

  const novaPreset = {
    description: "Bright and energetic — like your favorite morning show host. Great for daily news briefings.",
    isSystem: true,
    isActive: true,
    config: {
      openai: {
        voice: "nova",
        instructions: "Speak with bright, upbeat energy like a morning show host. Keep the pace lively but clear. Add natural enthusiasm when introducing new topics.",
        speed: 1.05,
      },
      groq: { voice: "autumn" },
      cloudflare: { voice: "electra" },
    },
    voiceCharacteristics: { gender: "female", tone: "energetic", pace: "fast" },
  };
  await prisma.voicePreset.upsert({ where: { name: "Nova" }, update: novaPreset, create: { name: "Nova", ...novaPreset } });

  const sagePreset = {
    description: "Calm and authoritative — measured delivery for deep-dive analysis and long-form content.",
    isSystem: true,
    isActive: true,
    config: {
      openai: {
        voice: "onyx",
        instructions: "Speak in a calm, measured, authoritative tone. Take your time with complex ideas. Pause thoughtfully between sections. Convey gravitas without being monotone.",
        speed: 0.95,
      },
      groq: { voice: "daniel" },
      cloudflare: { voice: "orpheus" },
    },
    voiceCharacteristics: { gender: "male", tone: "authoritative", pace: "slow" },
  };
  await prisma.voicePreset.upsert({ where: { name: "Sage" }, update: sagePreset, create: { name: "Sage", ...sagePreset } });

  const sparkPreset = {
    description: "Conversational and witty — casual tone perfect for entertainment and culture briefings.",
    isSystem: true,
    isActive: true,
    config: {
      openai: {
        voice: "shimmer",
        instructions: "Speak in a friendly, conversational tone with a hint of wit. Sound like you're telling a friend about something interesting you just learned. Keep it casual and engaging.",
        speed: 1.0,
      },
      groq: { voice: "hannah" },
      cloudflare: { voice: "thalia" },
    },
    voiceCharacteristics: { gender: "female", tone: "conversational", pace: "medium" },
  };
  await prisma.voicePreset.upsert({ where: { name: "Spark" }, update: sparkPreset, create: { name: "Spark", ...sparkPreset } });

  const echoPreset = {
    description: "Smooth and confident — an easygoing male voice for laid-back, everyday briefings.",
    isSystem: true,
    isActive: true,
    config: {
      openai: {
        voice: "echo",
        instructions: "Speak in a smooth, confident, relaxed tone. Keep things easy and natural — like a trusted friend catching you up on what you missed. Don't rush.",
        speed: 1.0,
      },
      groq: { voice: "austin" },
      cloudflare: { voice: "apollo" },
    },
    voiceCharacteristics: { gender: "male", tone: "calm", pace: "medium" },
  };
  await prisma.voicePreset.upsert({ where: { name: "Echo" }, update: echoPreset, create: { name: "Echo", ...echoPreset } });

  const atlasPreset = {
    description: "Deep and warm — a trustworthy baritone for serious topics and long-form content.",
    isSystem: true,
    isActive: true,
    config: {
      openai: {
        voice: "ash",
        instructions: "Speak with a deep, warm, trustworthy tone. You have gravitas and presence. Deliver information with quiet confidence and steady pacing. Let the content speak for itself.",
        speed: 0.95,
      },
      groq: { voice: "troy" },
      cloudflare: { voice: "zeus" },
    },
    voiceCharacteristics: { gender: "male", tone: "warm", pace: "slow" },
  };
  await prisma.voicePreset.upsert({ where: { name: "Atlas" }, update: atlasPreset, create: { name: "Atlas", ...atlasPreset } });

  console.log("Seeded voice presets.");

  // ── Platform Config ──

  console.log("Seeded platform config.");

  // ── AI Model Registry seed ──

  type ProviderSeed = {
    provider: string;
    providerModelId?: string;
    providerLabel: string;
    isDefault?: boolean;
    pricePerMinute?: number;
    priceInputPerMToken?: number;
    priceOutputPerMToken?: number;
    pricePerKChars?: number;
    limits?: Record<string, unknown>;
  };

  type ModelSeed = {
    stages: ("stt" | "distillation" | "narrative" | "tts")[];
    modelId: string;
    label: string;
    developer: string;
    notes?: string;
    providers: ProviderSeed[];
  };

  const MODEL_SEEDS: ModelSeed[] = [
    // ── STT ──
    {
      stages: ["stt"], modelId: "whisper-1", label: "Whisper 1", developer: "openai",
      notes: "Legacy model. Multilingual. Adequate accuracy but superseded by v3 variants. High cost vs alternatives — only use if locked to OpenAI.",
      providers: [
        { provider: "openai", providerModelId: "whisper-1", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.006, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stages: ["stt"], modelId: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo", developer: "openai",
      notes: "Best value STT. Multilingual, near-v3 accuracy at 3-4x speed. Groq is fastest provider. Recommended default.",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3-turbo", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stages: ["stt"], modelId: "whisper-large-v3", label: "Whisper Large v3", developer: "openai",
      notes: "Highest accuracy Whisper variant. Multilingual. Slower than turbo but better on accents and noisy audio. Use for quality-critical transcription.",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stages: ["stt"], modelId: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 (EN)", developer: "openai",
      notes: "English-only, distilled for speed. ~2x faster than full v3 with minimal accuracy loss. Cheapest option. Not suitable for multilingual content.",
      providers: [
        { provider: "groq", providerModelId: "distil-whisper-large-v3-en", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.0002, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stages: ["stt"], modelId: "nova-2", label: "Deepgram Nova-2", developer: "deepgram",
      notes: "Strong commercial STT. Good punctuation and formatting. Multilingual. Solid value but not the cheapest — use if Deepgram ecosystem is preferred.",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0043 },
      ],
    },
    {
      stages: ["stt"], modelId: "nova-3", label: "Deepgram Nova-3", developer: "deepgram",
      notes: "Top-tier commercial accuracy. Multilingual, excellent speaker diarization and formatting. Premium cost. Best for high-stakes transcription.",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0077 },
      ],
    },
    {
      stages: ["stt"], modelId: "assemblyai-best", label: "AssemblyAI Best", developer: "assemblyai",
      notes: "High accuracy, async processing. Multilingual. Built-in speaker labels, chapters, sentiment. Expensive — best when extra features are needed.",
      providers: [
        { provider: "assemblyai", providerLabel: "AssemblyAI", isDefault: true, pricePerMinute: 0.015 },
      ],
    },
    {
      stages: ["stt"], modelId: "google-chirp", label: "Google Chirp", developer: "google",
      notes: "Google's latest STT. 100+ languages, async. Very expensive. Use only if GCP is required or for rare language support.",
      providers: [
        { provider: "google", providerLabel: "Google Cloud", isDefault: true, pricePerMinute: 0.024 },
      ],
    },
    // ── Distillation ──
    {
      stages: ["distillation", "narrative"], modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
      notes: "Recommended default for both distillation and narrative. Excellent structured extraction, natural narration, strong reasoning at moderate cost.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
      notes: "Fast and cheap. Good JSON output and serviceable narratives. Adequate for simple podcasts. Great value for high volume.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
      notes: "Top-tier reasoning and premium narrative quality. Catches subtle claims, rich transitions. 5x Sonnet cost — reserve for flagship content.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", developer: "meta",
      notes: "Best open-source option. Strong JSON adherence and natural narrative flow. 5x cheaper than Sonnet. Occasional repetition on longer briefings.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.3-70b-versatile", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.59, priceOutputPerMToken: 0.79 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.293, priceOutputPerMToken: 2.253 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "llama-3.1-8b-instant", label: "Llama 3.1 8B", developer: "meta",
      notes: "Ultra-cheap, ultra-fast. Acceptable for simple extraction. Flat narratives. May produce malformed JSON on complex transcripts. Testing/budget use.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.1-8b-instant", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.05, priceOutputPerMToken: 0.08 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.045, priceOutputPerMToken: 0.384 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "gemma2-9b-it", label: "Gemma 2 9B", developer: "google",
      notes: "Compact and cheap. Decent structured output and readable narratives. Better instruction following than Llama 8B. Budget alternative.",
      providers: [
        { provider: "groq", providerModelId: "gemma2-9b-it", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.20, priceOutputPerMToken: 0.20 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "mixtral-8x7b-32768", label: "Mixtral 8x7B", developer: "mistral",
      notes: "MoE architecture, 32K context. Good extraction and narrative quality. Handles long content well. Solid mid-tier value option.",
      providers: [
        { provider: "groq", providerModelId: "mixtral-8x7b-32768", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.24, priceOutputPerMToken: 0.24 },
        { provider: "cloudflare", providerModelId: "@cf/mistral/mistral-7b-instruct-v0.1", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.110, priceOutputPerMToken: 0.190 },
      ],
    },
    {
      stages: ["distillation", "narrative"], modelId: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B", developer: "deepseek",
      notes: "Reasoning-focused model. Excellent at identifying implicit claims. Narratives can be overly analytical. Slower due to chain-of-thought.",
      providers: [
        { provider: "groq", providerModelId: "deepseek-r1-distill-llama-70b", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.75, priceOutputPerMToken: 0.99 },
        { provider: "cloudflare", providerModelId: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.497, priceOutputPerMToken: 4.881 },
      ],
    },
    // ── Audio Generation (TTS) ──
    {
      stages: ["tts"], modelId: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS", developer: "openai",
      notes: "Recommended default. Instruction-steerable voice (tone, pacing, emotion). 6 voices. Excellent podcast-quality output. Best overall TTS.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.015, limits: { maxInputChars: 7000 } },
      ],
    },
    {
      stages: ["tts"], modelId: "tts-1", label: "TTS-1", developer: "openai",
      notes: "Standard quality, low latency. 6 voices. No instruction control. Noticeable artifacts on longer text. Cheaper than gpt-4o-mini-tts but audibly worse.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 15.0, limits: { maxInputChars: 4096 } },
      ],
    },
    {
      stages: ["tts"], modelId: "tts-1-hd", label: "TTS-1 HD", developer: "openai",
      notes: "High-definition variant of TTS-1. 6 voices. Smoother output, fewer artifacts. No instruction control. 2x cost of standard — marginal improvement.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 30.0, limits: { maxInputChars: 4096 } },
      ],
    },
    {
      stages: ["tts"], modelId: "orpheus-v1-english", label: "Orpheus v1 English", developer: "canopylabs",
      notes: "Expressive TTS with emotion tags ([cheerful], [whisper]). English-only. 6 voices. Ultra-cheap on Groq. Great value but less natural than GPT-4o-mini.",
      providers: [
        { provider: "groq", providerModelId: "canopylabs/orpheus-v1-english", providerLabel: "Groq", isDefault: true, pricePerKChars: 0.022, limits: { maxInputChars: 4000 } },
      ],
    },
    {
      stages: ["tts"], modelId: "melotts", label: "MeloTTS", developer: "myshell-ai",
      notes: "Multilingual (EN, ES, FR, ZH, JP, KR). Extremely cheap on CF. Robotic quality — acceptable for testing or non-English content, not for production podcasts.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/myshell-ai/melotts", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerMinute: 0.000205, limits: { maxInputChars: 2000 } },
      ],
    },
    {
      stages: ["tts"], modelId: "aura-1", label: "Aura 1", developer: "deepgram",
      notes: "Deepgram's first-gen TTS. English-only. Natural conversational tone. Low latency via CF. Good value mid-tier option.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-1", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.015, limits: { maxInputChars: 2000 } },
      ],
    },
    {
      stages: ["tts"], modelId: "aura-2-en", label: "Aura 2 English", developer: "deepgram",
      notes: "Deepgram's latest TTS. English-only. Improved naturalness and prosody over Aura 1. Multiple voices. Good quality at reasonable cost via CF.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-2-en", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.030, limits: { maxInputChars: 2000 } },
      ],
    },
  ];

  for (const m of MODEL_SEEDS) {
    const aiModel = await prisma.aiModel.upsert({
      where: { modelId: m.modelId },
      update: { stages: m.stages, label: m.label, developer: m.developer, notes: m.notes ?? null },
      create: { stages: m.stages, modelId: m.modelId, label: m.label, developer: m.developer, notes: m.notes ?? null },
    });
    for (const p of m.providers) {
      await prisma.aiModelProvider.upsert({
        where: { aiModelId_provider: { aiModelId: aiModel.id, provider: p.provider } },
        update: {
          providerModelId: p.providerModelId ?? null,
          providerLabel: p.providerLabel,
          limits: p.limits ?? undefined,
          pricePerMinute: p.pricePerMinute ?? null,
          priceInputPerMToken: p.priceInputPerMToken ?? null,
          priceOutputPerMToken: p.priceOutputPerMToken ?? null,
          pricePerKChars: p.pricePerKChars ?? null,
          isDefault: p.isDefault ?? false,
        },
        create: {
          aiModelId: aiModel.id,
          provider: p.provider,
          providerModelId: p.providerModelId ?? null,
          providerLabel: p.providerLabel,
          limits: p.limits ?? undefined,
          pricePerMinute: p.pricePerMinute ?? null,
          priceInputPerMToken: p.priceInputPerMToken ?? null,
          priceOutputPerMToken: p.priceOutputPerMToken ?? null,
          pricePerKChars: p.pricePerKChars ?? null,
          isDefault: p.isDefault ?? false,
        },
      });
    }
  }

  console.log("Seeded AI model registry.");

  // ── Prompt Versions (stage-level) ──
  // Clean up any old per-key prompt versions (pre-stage schema)
  await prisma.promptVersion.deleteMany({
    where: { stage: "" },
  });

  // Seed v1 defaults for each stage — prompt text lives here and in the DB only, not in runtime code
  const { PROMPT_CONFIG_KEYS } = await import("../worker/lib/prompt-defaults");

  const SEED_CLAIMS_SYSTEM = `You are a podcast analyst. Extract all significant factual claims, insights, arguments, and notable statements from podcast transcripts.

For each claim, include:
- "claim": the factual assertion (one clear sentence)
- "speaker": who made the claim (use "Host" or "Guest" if name unknown)
- "importance": 1-10 rating (10 = critical takeaway, 1 = minor detail)
- "novelty": 1-10 rating (10 = surprising/counterintuitive, 1 = common knowledge)
- "excerpt": the verbatim passage from the transcript that contains or supports this claim — include enough surrounding context that someone could write a detailed summary from the excerpt alone (may be one sentence or a full exchange)
- "notable_quote": (optional) if the claim contains a particularly vivid, memorable, or authoritative direct quote from a speaker, include it here verbatim. Not every claim needs one — only when the speaker's exact words add impact or authority. Omit this field entirely if no quote stands out.

Guidelines:
- Extract every claim worth preserving — do NOT limit to a fixed number
- A dense 3-hour episode may yield 30-40 claims; a light 20-minute episode may yield 8-12
- EXCLUDE ALL ADVERTISEMENTS: Skip any sponsored segments, ad reads, product promotions, discount codes, affiliate pitches, or endorsements of sponsors. If a host says "this episode is brought to you by..." or promotes a product/service as part of a sponsorship, exclude ALL claims from that segment. Do not extract claims about sponsor products, services, or offers even if they sound factual.
- Skip filler, repetition, and off-topic tangents
- Excerpts must be VERBATIM from the transcript, not paraphrased
- Sort by importance descending

Return ONLY a JSON array. No markdown fences, no commentary.`;

  const SEED_NARRATIVE_WITH_EXCERPTS = `You are writing a spoken audio summary for a podcast briefing app. You are a narrator giving listeners the highlights of a podcast episode. Refer to the show and its hosts/guests by name.

Rules:
- Write in a conversational, engaging tone suitable for audio — this should sound like a podcast recap, not a news report
- Introduce the episode naturally by naming the show and who's on it (e.g. "This is the Joe Rogan Experience. Joe's guest is Jordan Peterson." or "On today's episode of The Daily, Michael Barbaro talks with...")
- Do NOT say "I am your host" or role-play as the host — you are a narrator summarizing the episode
- Attribute statements to the actual speakers by name (e.g. "Rogan asked about...", "Peterson argued that...")
- Cover claims in rough order of importance, but group related topics
- Use the EXCERPT text for accurate detail and context — do NOT invent facts beyond what the excerpts contain
- When a claim includes a notable_quote, weave it into the narrative as a direct quote attributed to the speaker. Use sparingly — 2-3 direct quotes max per briefing to keep it natural.
- Use natural transitions between topics
- For shorter briefings (1-3 minutes), focus only on the highest-impact claims
- For longer briefings (10+ minutes), include supporting context and nuance from excerpts
- Do NOT include stage directions, speaker labels, or markdown

SPECIAL CASE — Book readings and serialized storytelling:
If the podcast episode is a reading or dramatization of a book, short story, or other narrative work (not a discussion about the book, but an actual telling of the story), do NOT summarize it as bullet-point takeaways. Instead, retell the story in a condensed form — preserve the narrative arc, key scenes, character moments, and emotional beats. The output should feel like a shorter telling of the same story, not a book report.

- Output ONLY the narrative text`;

  const SEED_NARRATIVE_NO_EXCERPTS = `You are writing a spoken audio summary for a podcast briefing app. You are a narrator giving listeners the highlights of a podcast episode. Refer to the show and its hosts/guests by name.

Rules:
- Write in a conversational, engaging tone suitable for audio
- Introduce the episode naturally by naming the show and who's on it
- Do NOT say "I am your host" or role-play as the host — you are a narrator summarizing the episode
- Attribute statements to the actual speakers by name
- Cover the most important claims first
- When a claim includes a notable_quote, weave it in as a direct quote
- Use natural transitions between topics
- Do NOT include stage directions, speaker labels, or markdown

SPECIAL CASE — Book readings and serialized storytelling:
If the episode is a reading/dramatization of a narrative work, retell the story in condensed form — preserve the narrative arc, key scenes, and emotional beats rather than summarizing as takeaways.

- Output ONLY the narrative text`;

  const SEED_NARRATIVE_USER_TEMPLATE = `TARGET: approximately {{targetWords}} words ({{durationMinutes}} minutes at {{wpm}} wpm).
{{metadataBlock}}
{{claimsLabel}}:
{{claimsJson}}`;

  const SEED_NARRATIVE_METADATA_INTRO = `Begin the narrative with a brief spoken introduction naming the show and who's on it.

Examples:
- "This is the Joe Rogan Experience. Joe's guest today is Jordan Peterson."
- "From The Daily — The Election Results. Michael Barbaro reports."
- "On Huberman Lab, Andrew Huberman breaks down the science of sleep."

Then proceed directly into the content.`;

  const stageSeeds = [
    {
      stage: "distillation",
      values: {
        [PROMPT_CONFIG_KEYS.claimsSystem]: SEED_CLAIMS_SYSTEM,
      },
    },
    {
      stage: "narrative",
      values: {
        [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: SEED_NARRATIVE_WITH_EXCERPTS,
        [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: SEED_NARRATIVE_NO_EXCERPTS,
        [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: SEED_NARRATIVE_USER_TEMPLATE,
        [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: SEED_NARRATIVE_METADATA_INTRO,
      },
    },
  ];

  for (const s of stageSeeds) {
    // Seed PromptVersion v1
    const existing = await prisma.promptVersion.findUnique({
      where: { stage_version: { stage: s.stage, version: 1 } },
    });
    if (!existing) {
      await prisma.promptVersion.create({
        data: {
          stage: s.stage,
          version: 1,
          label: "Default",
          values: s.values,
          notes: "Initial default prompts",
        },
      });
    }

    // Seed PlatformConfig entries (runtime reads from here)
    for (const [key, value] of Object.entries(s.values)) {
      const existingConfig = await prisma.platformConfig.findUnique({ where: { key } });
      if (!existingConfig) {
        await prisma.platformConfig.create({
          data: { key, value, description: `Seed default for ${key}` },
        });
      }
    }
  }

  console.log("Seeded prompt versions and config.");

  // ── Sports Leagues, Divisions & Teams ──

  const nfl = await prisma.sportsLeague.upsert({
    where: { name: "NFL" },
    update: {},
    create: { name: "NFL", sport: "football", country: "us" },
  });

  // Conferences (top-level divisions)
  const afc = await prisma.sportsDivision.upsert({
    where: { leagueId_name: { leagueId: nfl.id, name: "AFC" } },
    update: {},
    create: { leagueId: nfl.id, name: "AFC" },
  });
  const nfc = await prisma.sportsDivision.upsert({
    where: { leagueId_name: { leagueId: nfl.id, name: "NFC" } },
    update: {},
    create: { leagueId: nfl.id, name: "NFC" },
  });

  // Divisions
  const divisions: Record<string, { parentId: string; name: string }> = {
    afcEast:  { parentId: afc.id, name: "AFC East" },
    afcNorth: { parentId: afc.id, name: "AFC North" },
    afcSouth: { parentId: afc.id, name: "AFC South" },
    afcWest:  { parentId: afc.id, name: "AFC West" },
    nfcEast:  { parentId: nfc.id, name: "NFC East" },
    nfcNorth: { parentId: nfc.id, name: "NFC North" },
    nfcSouth: { parentId: nfc.id, name: "NFC South" },
    nfcWest:  { parentId: nfc.id, name: "NFC West" },
  };
  const divIds: Record<string, string> = {};
  for (const [key, d] of Object.entries(divisions)) {
    const div = await prisma.sportsDivision.upsert({
      where: { leagueId_name: { leagueId: nfl.id, name: d.name } },
      update: {},
      create: { leagueId: nfl.id, name: d.name, parentId: d.parentId },
    });
    divIds[key] = div.id;
  }

  type TeamSeed = {
    name: string; city: string; nickname: string; abbreviation: string;
    keywords: string[]; division: string; markets: { city: string; state: string }[];
  };

  const nflTeams: TeamSeed[] = [
    // AFC East
    { name: "Buffalo Bills",          city: "Buffalo",       nickname: "Bills",       abbreviation: "BUF", division: "afcEast",  markets: [{ city: "Buffalo", state: "New York" }],             keywords: ["Buffalo Bills", "Bills"] },
    { name: "Miami Dolphins",         city: "Miami",         nickname: "Dolphins",    abbreviation: "MIA", division: "afcEast",  markets: [{ city: "Miami", state: "Florida" }],                keywords: ["Miami Dolphins", "Dolphins"] },
    { name: "New England Patriots",   city: "New England",   nickname: "Patriots",    abbreviation: "NE",  division: "afcEast",  markets: [{ city: "Boston", state: "Massachusetts" }],          keywords: ["New England Patriots", "Patriots", "Pats"] },
    { name: "New York Jets",          city: "New York",      nickname: "Jets",        abbreviation: "NYJ", division: "afcEast",  markets: [{ city: "New York", state: "New York" }],             keywords: ["New York Jets", "NY Jets", "Jets"] },
    // AFC North
    { name: "Baltimore Ravens",       city: "Baltimore",     nickname: "Ravens",      abbreviation: "BAL", division: "afcNorth", markets: [{ city: "Baltimore", state: "Maryland" }],             keywords: ["Baltimore Ravens", "Ravens"] },
    { name: "Cincinnati Bengals",     city: "Cincinnati",    nickname: "Bengals",     abbreviation: "CIN", division: "afcNorth", markets: [{ city: "Cincinnati", state: "Ohio" }],                keywords: ["Cincinnati Bengals", "Bengals", "Who Dey"] },
    { name: "Cleveland Browns",       city: "Cleveland",     nickname: "Browns",      abbreviation: "CLE", division: "afcNorth", markets: [{ city: "Cleveland", state: "Ohio" }],                 keywords: ["Cleveland Browns", "Browns"] },
    { name: "Pittsburgh Steelers",    city: "Pittsburgh",    nickname: "Steelers",    abbreviation: "PIT", division: "afcNorth", markets: [{ city: "Pittsburgh", state: "Pennsylvania" }],         keywords: ["Pittsburgh Steelers", "Steelers"] },
    // AFC South
    { name: "Houston Texans",         city: "Houston",       nickname: "Texans",      abbreviation: "HOU", division: "afcSouth", markets: [{ city: "Houston", state: "Texas" }],                  keywords: ["Houston Texans", "Texans"] },
    { name: "Indianapolis Colts",     city: "Indianapolis",  nickname: "Colts",       abbreviation: "IND", division: "afcSouth", markets: [{ city: "Indianapolis", state: "Indiana" }],            keywords: ["Indianapolis Colts", "Colts"] },
    { name: "Jacksonville Jaguars",   city: "Jacksonville",  nickname: "Jaguars",     abbreviation: "JAX", division: "afcSouth", markets: [{ city: "Jacksonville", state: "Florida" }],            keywords: ["Jacksonville Jaguars", "Jaguars", "Jags"] },
    { name: "Tennessee Titans",       city: "Nashville",     nickname: "Titans",      abbreviation: "TEN", division: "afcSouth", markets: [{ city: "Nashville", state: "Tennessee" }],             keywords: ["Tennessee Titans", "Titans"] },
    // AFC West
    { name: "Denver Broncos",         city: "Denver",        nickname: "Broncos",     abbreviation: "DEN", division: "afcWest",  markets: [{ city: "Denver", state: "Colorado" }],                 keywords: ["Denver Broncos", "Broncos"] },
    { name: "Kansas City Chiefs",     city: "Kansas City",   nickname: "Chiefs",      abbreviation: "KC",  division: "afcWest",  markets: [{ city: "Kansas City", state: "Missouri" }],            keywords: ["Kansas City Chiefs", "Chiefs", "KC Chiefs"] },
    { name: "Las Vegas Raiders",      city: "Las Vegas",     nickname: "Raiders",     abbreviation: "LV",  division: "afcWest",  markets: [{ city: "Las Vegas", state: "Nevada" }],                keywords: ["Las Vegas Raiders", "Raiders"] },
    { name: "Los Angeles Chargers",   city: "Los Angeles",   nickname: "Chargers",    abbreviation: "LAC", division: "afcWest",  markets: [{ city: "Los Angeles", state: "California" }],          keywords: ["Los Angeles Chargers", "LA Chargers", "Chargers"] },
    // NFC East
    { name: "Dallas Cowboys",         city: "Dallas",        nickname: "Cowboys",     abbreviation: "DAL", division: "nfcEast",  markets: [{ city: "Dallas", state: "Texas" }],                    keywords: ["Dallas Cowboys", "Cowboys"] },
    { name: "New York Giants",        city: "New York",      nickname: "Giants",      abbreviation: "NYG", division: "nfcEast",  markets: [{ city: "New York", state: "New York" }],               keywords: ["New York Giants", "NY Giants", "Giants"] },
    { name: "Philadelphia Eagles",    city: "Philadelphia",  nickname: "Eagles",      abbreviation: "PHI", division: "nfcEast",  markets: [{ city: "Philadelphia", state: "Pennsylvania" }],       keywords: ["Philadelphia Eagles", "Eagles"] },
    { name: "Washington Commanders",  city: "Washington",    nickname: "Commanders",  abbreviation: "WAS", division: "nfcEast",  markets: [{ city: "Washington", state: "District of Columbia" }], keywords: ["Washington Commanders", "Commanders"] },
    // NFC North
    { name: "Chicago Bears",          city: "Chicago",       nickname: "Bears",       abbreviation: "CHI", division: "nfcNorth", markets: [{ city: "Chicago", state: "Illinois" }],                keywords: ["Chicago Bears", "Bears", "Da Bears"] },
    { name: "Detroit Lions",          city: "Detroit",       nickname: "Lions",       abbreviation: "DET", division: "nfcNorth", markets: [{ city: "Detroit", state: "Michigan" }],                 keywords: ["Detroit Lions", "Lions"] },
    { name: "Green Bay Packers",      city: "Green Bay",     nickname: "Packers",     abbreviation: "GB",  division: "nfcNorth", markets: [{ city: "Green Bay", state: "Wisconsin" }, { city: "Milwaukee", state: "Wisconsin" }], keywords: ["Green Bay Packers", "Packers"] },
    { name: "Minnesota Vikings",      city: "Minneapolis",   nickname: "Vikings",     abbreviation: "MIN", division: "nfcNorth", markets: [{ city: "Minneapolis", state: "Minnesota" }],           keywords: ["Minnesota Vikings", "Vikings"] },
    // NFC South
    { name: "Atlanta Falcons",        city: "Atlanta",       nickname: "Falcons",     abbreviation: "ATL", division: "nfcSouth", markets: [{ city: "Atlanta", state: "Georgia" }],                 keywords: ["Atlanta Falcons", "Falcons"] },
    { name: "Carolina Panthers",      city: "Charlotte",     nickname: "Panthers",    abbreviation: "CAR", division: "nfcSouth", markets: [{ city: "Charlotte", state: "North Carolina" }],        keywords: ["Carolina Panthers", "Panthers"] },
    { name: "New Orleans Saints",     city: "New Orleans",   nickname: "Saints",      abbreviation: "NO",  division: "nfcSouth", markets: [{ city: "New Orleans", state: "Louisiana" }],           keywords: ["New Orleans Saints", "Saints", "Who Dat"] },
    { name: "Tampa Bay Buccaneers",   city: "Tampa",         nickname: "Buccaneers",  abbreviation: "TB",  division: "nfcSouth", markets: [{ city: "Tampa", state: "Florida" }],                   keywords: ["Tampa Bay Buccaneers", "Buccaneers", "Bucs"] },
    // NFC West
    { name: "Arizona Cardinals",      city: "Phoenix",       nickname: "Cardinals",   abbreviation: "ARI", division: "nfcWest",  markets: [{ city: "Phoenix", state: "Arizona" }],                 keywords: ["Arizona Cardinals", "Cardinals"] },
    { name: "Los Angeles Rams",       city: "Los Angeles",   nickname: "Rams",        abbreviation: "LAR", division: "nfcWest",  markets: [{ city: "Los Angeles", state: "California" }],          keywords: ["Los Angeles Rams", "LA Rams", "Rams"] },
    { name: "San Francisco 49ers",    city: "San Francisco", nickname: "49ers",       abbreviation: "SF",  division: "nfcWest",  markets: [{ city: "San Francisco", state: "California" }],        keywords: ["San Francisco 49ers", "49ers", "Niners"] },
    { name: "Seattle Seahawks",       city: "Seattle",       nickname: "Seahawks",    abbreviation: "SEA", division: "nfcWest",  markets: [{ city: "Seattle", state: "Washington" }],              keywords: ["Seattle Seahawks", "Seahawks"] },
  ];

  for (const t of nflTeams) {
    const team = await prisma.sportsTeam.upsert({
      where: { leagueId_abbreviation: { leagueId: nfl.id, abbreviation: t.abbreviation } },
      update: { name: t.name, city: t.city, nickname: t.nickname, keywords: t.keywords, divisionId: divIds[t.division] },
      create: { name: t.name, city: t.city, nickname: t.nickname, abbreviation: t.abbreviation, keywords: t.keywords, leagueId: nfl.id, divisionId: divIds[t.division] },
    });
    for (const market of t.markets) {
      await prisma.sportsTeamMarket.upsert({
        where: { teamId_city_state: { teamId: team.id, city: market.city, state: market.state } },
        update: {},
        create: { teamId: team.id, city: market.city, state: market.state },
      });
    }
  }

  console.log("Seeded sports leagues, divisions, and teams.");

  // ── Cron Jobs ──
  // Single source of truth lives in worker/lib/cron/registry.ts so the runtime
  // auto-registration path and this seed can never drift.
  for (const job of CRON_JOB_REGISTRY) {
    await prisma.cronJob.upsert({
      where: { jobKey: job.jobKey },
      update: { label: job.label, description: job.description, defaultIntervalMinutes: job.defaultIntervalMinutes },
      create: {
        jobKey: job.jobKey,
        label: job.label,
        description: job.description,
        defaultIntervalMinutes: job.defaultIntervalMinutes,
        intervalMinutes: job.defaultIntervalMinutes,
        runAtHour: job.runAtHour,
      },
    });
  }

  // Migrate any existing PlatformConfig cron overrides into CronJob rows (one-time)
  const cronConfigs = await prisma.platformConfig.findMany({
    where: { key: { startsWith: "cron." } },
  });
  for (const cfg of cronConfigs) {
    const match = cfg.key.match(/^cron\.(.+)\.(enabled|intervalMinutes|lastRunAt)$/);
    if (!match) continue;
    const [, jobKey, field] = match;
    const cronJob = await prisma.cronJob.findUnique({ where: { jobKey } });
    if (!cronJob) continue;

    const data: Record<string, unknown> = {};
    if (field === "enabled" && typeof cfg.value === "boolean") {
      data.enabled = cfg.value;
    } else if (field === "enabled" && typeof cfg.value === "string") {
      data.enabled = cfg.value === "true";
    } else if (field === "intervalMinutes") {
      data.intervalMinutes = Number(cfg.value);
    } else if (field === "lastRunAt" && cfg.value && !cronJob.lastRunAt) {
      data.lastRunAt = new Date(cfg.value as string);
    }

    if (Object.keys(data).length > 0) {
      await prisma.cronJob.update({ where: { jobKey }, data });
    }
  }
  console.log("Seeded cron jobs.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
