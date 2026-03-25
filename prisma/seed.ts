import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Plans ──

  await prisma.plan.upsert({
    where: { slug: "free" },
    update: {},
    create: {
      name: "Free",
      slug: "free",
      priceCentsMonthly: 0,
      briefingsPerWeek: 10,
      maxDurationMinutes: 5,
      maxPodcastSubscriptions: 0,
      pastEpisodesLimit: 5,
      onDemandRequestsPerWeek: 3,
      outputFormats: ["audio"],
      narrativeDepthTier: "standard",
      retryBudget: 1,
      concurrentPipelineJobs: 1,
      catalogAccess: "subscribed",
      maxStorageDays: 30,
      isDefault: true,
      features: [
        "10 briefings per week",
        "Up to 5 min briefings",
        "Standard depth summaries",
        "30 days audio storage",
      ],
      sortOrder: 0,
    },
  });

  await prisma.plan.upsert({
    where: { slug: "pro" },
    update: {},
    create: {
      name: "Pro",
      slug: "pro",
      priceCentsMonthly: 999,
      priceCentsAnnual: 9999,
      briefingsPerWeek: null,
      maxDurationMinutes: 15,
      maxPodcastSubscriptions: 5,
      pastEpisodesLimit: 50,
      onDemandRequestsPerWeek: null,
      outputFormats: ["audio", "text"],
      transcriptAccess: true,
      narrativeDepthTier: "deep",
      dailyDigest: true,
      aiModelTier: "standard",
      ttsModelTier: "standard",
      sttModelTier: "standard",
      retryBudget: 3,
      concurrentPipelineJobs: 3,
      adFree: true,
      customCollections: true,
      searchBriefings: true,
      catalogAccess: "full",
      tonePresets: true,
      focusTopics: true,
      skipTopics: true,
      briefingIntro: true,
      publicSharing: true,
      offlineAccess: true,
      features: [
        "Unlimited briefings",
        "Up to 15 min briefings",
        "Deep analysis summaries",
        "Daily digest",
        "Ad-free listening",
        "Transcript access",
        "Offline access",
      ],
      sortOrder: 1,
    },
  });

  await prisma.plan.upsert({
    where: { slug: "pro-plus" },
    update: {},
    create: {
      name: "Pro+",
      slug: "pro-plus",
      priceCentsMonthly: 1999,
      priceCentsAnnual: 17999,
      briefingsPerWeek: null,
      maxDurationMinutes: 30,
      maxPodcastSubscriptions: null,
      pastEpisodesLimit: null,
      onDemandRequestsPerWeek: null,
      outputFormats: ["audio", "text", "markdown"],
      transcriptAccess: true,
      refreshLatencyTier: "fast",
      dailyDigest: true,
      weeklyRecap: true,
      narrativeDepthTier: "deep",
      episodeHighlightClips: true,
      aiModelTier: "premium",
      ttsModelTier: "premium",
      sttModelTier: "premium",
      customInstructions: true,
      retryBudget: 5,
      concurrentPipelineJobs: 5,
      adFree: true,
      priorityProcessing: true,
      earlyAccess: true,
      researchMode: true,
      crossPodcastSynthesis: true,
      topicTracking: true,
      customCollections: true,
      searchBriefings: true,
      catalogAccess: "full",
      savedSearches: null,
      rssExport: true,
      apiAccess: true,
      tonePresets: true,
      languageSupport: ["en", "es", "fr", "de", "pt"],
      focusTopics: true,
      skipTopics: true,
      briefingIntro: true,
      maxStorageDays: null,
      offlineAccess: true,
      publicSharing: true,
      interactiveBriefing: true,
      features: [
        "Unlimited everything",
        "Up to 30 min briefings",
        "Deep analysis + highlight clips",
        "Premium AI models",
        "Custom instructions",
        "Daily digest + weekly recap",
        "Cross-podcast synthesis",
        "Interactive Q&A",
        "RSS export",
        "API access",
        "Multi-language support",
      ],
      sortOrder: 2,
    },
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
        groq: { voice: "austin" },
        cloudflare: {},
      },
    },
  });

  // ── Curated Personas ──

  await prisma.voicePreset.upsert({
    where: { name: "Nova" },
    update: {},
    create: {
      name: "Nova",
      description:
        "Bright and energetic — like your favorite morning show host. Great for daily news briefings.",
      isSystem: true,
      isActive: true,
      config: {
        openai: {
          voice: "nova",
          instructions:
            "Speak with bright, upbeat energy like a morning show host. " +
            "Keep the pace lively but clear. Add natural enthusiasm when introducing new topics.",
          speed: 1.05,
        },
        groq: { voice: "austin" },
        cloudflare: {},
      },
      voiceCharacteristics: { gender: "female", tone: "energetic", pace: "fast" },
    },
  });

  await prisma.voicePreset.upsert({
    where: { name: "Sage" },
    update: {},
    create: {
      name: "Sage",
      description:
        "Calm and authoritative — measured delivery for deep-dive analysis and long-form content.",
      isSystem: true,
      isActive: true,
      config: {
        openai: {
          voice: "onyx",
          instructions:
            "Speak in a calm, measured, authoritative tone. " +
            "Take your time with complex ideas. Pause thoughtfully between sections. " +
            "Convey gravitas without being monotone.",
          speed: 0.95,
        },
        groq: { voice: "austin" },
        cloudflare: {},
      },
      voiceCharacteristics: { gender: "male", tone: "authoritative", pace: "slow" },
    },
  });

  await prisma.voicePreset.upsert({
    where: { name: "Spark" },
    update: {},
    create: {
      name: "Spark",
      description:
        "Conversational and witty — casual tone perfect for entertainment and culture briefings.",
      isSystem: true,
      isActive: true,
      config: {
        openai: {
          voice: "shimmer",
          instructions:
            "Speak in a friendly, conversational tone with a hint of wit. " +
            "Sound like you're telling a friend about something interesting you just learned. " +
            "Keep it casual and engaging.",
          speed: 1.0,
        },
        groq: { voice: "austin" },
        cloudflare: {},
      },
      voiceCharacteristics: { gender: "female", tone: "conversational", pace: "medium" },
    },
  });

  // ── Backfill: add groq config to presets missing it ──

  const presetsToBackfill = await prisma.voicePreset.findMany({
    where: {
      OR: [
        { config: { path: ["groq"], equals: undefined as any } },
        { config: { path: ["groq"], equals: {} } },
      ],
    },
  });

  for (const preset of presetsToBackfill) {
    const cfg = preset.config as Record<string, unknown>;
    if (!cfg.groq || (typeof cfg.groq === "object" && Object.keys(cfg.groq as any).length === 0)) {
      await prisma.voicePreset.update({
        where: { id: preset.id },
        data: {
          config: { ...cfg, groq: { voice: "austin" } },
        },
      });
      console.log(`  Backfilled groq voice for preset "${preset.name}"`);
    }
  }

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
    stage: "stt" | "distillation" | "narrative" | "tts";
    modelId: string;
    label: string;
    developer: string;
    notes?: string;
    providers: ProviderSeed[];
  };

  const MODEL_SEEDS: ModelSeed[] = [
    // ── STT ──
    {
      stage: "stt", modelId: "whisper-1", label: "Whisper 1", developer: "openai",
      notes: "Legacy model. Multilingual. Adequate accuracy but superseded by v3 variants. High cost vs alternatives — only use if locked to OpenAI.",
      providers: [
        { provider: "openai", providerModelId: "whisper-1", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.006, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo", developer: "openai",
      notes: "Best value STT. Multilingual, near-v3 accuracy at 3-4x speed. Groq is fastest provider. Recommended default.",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3-turbo", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3", label: "Whisper Large v3", developer: "openai",
      notes: "Highest accuracy Whisper variant. Multilingual. Slower than turbo but better on accents and noisy audio. Use for quality-critical transcription.",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stage: "stt", modelId: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 (EN)", developer: "openai",
      notes: "English-only, distilled for speed. ~2x faster than full v3 with minimal accuracy loss. Cheapest option. Not suitable for multilingual content.",
      providers: [
        { provider: "groq", providerModelId: "distil-whisper-large-v3-en", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.0002, limits: { maxFileSizeBytes: 26214400 } },
      ],
    },
    {
      stage: "stt", modelId: "nova-2", label: "Deepgram Nova-2", developer: "deepgram",
      notes: "Strong commercial STT. Good punctuation and formatting. Multilingual. Solid value but not the cheapest — use if Deepgram ecosystem is preferred.",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0043 },
      ],
    },
    {
      stage: "stt", modelId: "nova-3", label: "Deepgram Nova-3", developer: "deepgram",
      notes: "Top-tier commercial accuracy. Multilingual, excellent speaker diarization and formatting. Premium cost. Best for high-stakes transcription.",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0077 },
      ],
    },
    {
      stage: "stt", modelId: "assemblyai-best", label: "AssemblyAI Best", developer: "assemblyai",
      notes: "High accuracy, async processing. Multilingual. Built-in speaker labels, chapters, sentiment. Expensive — best when extra features are needed.",
      providers: [
        { provider: "assemblyai", providerLabel: "AssemblyAI", isDefault: true, pricePerMinute: 0.015 },
      ],
    },
    {
      stage: "stt", modelId: "google-chirp", label: "Google Chirp", developer: "google",
      notes: "Google's latest STT. 100+ languages, async. Very expensive. Use only if GCP is required or for rare language support.",
      providers: [
        { provider: "google", providerLabel: "Google Cloud", isDefault: true, pricePerMinute: 0.024 },
      ],
    },
    // ── Distillation ──
    {
      stage: "distillation", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
      notes: "Recommended default. Excellent structured extraction and JSON adherence. Strong reasoning at moderate cost. Best balance for claim extraction.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
      ],
    },
    {
      stage: "distillation", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
      notes: "Fast and cheap. Good JSON output. Adequate for simple podcasts but may miss nuance in dense technical content. Great value for high volume.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
      ],
    },
    {
      stage: "distillation", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
      notes: "Top-tier reasoning. Catches subtle claims and complex arguments others miss. 5x Sonnet cost — use for premium content or quality audits only.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
      ],
    },
    {
      stage: "distillation", modelId: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", developer: "meta",
      notes: "Best open-source option for extraction. Strong JSON adherence via Groq. 5x cheaper than Sonnet. Good fallback — may struggle with ambiguous claims.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.3-70b-versatile", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.59, priceOutputPerMToken: 0.79 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.293, priceOutputPerMToken: 2.253 },
      ],
    },
    {
      stage: "distillation", modelId: "llama-3.1-8b-instant", label: "Llama 3.1 8B", developer: "meta",
      notes: "Ultra-cheap, ultra-fast. Acceptable for simple claim extraction. Will miss nuance and may produce malformed JSON on complex transcripts. Testing/budget use.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.1-8b-instant", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.05, priceOutputPerMToken: 0.08 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.045, priceOutputPerMToken: 0.384 },
      ],
    },
    {
      stage: "distillation", modelId: "gemma2-9b-it", label: "Gemma 2 9B", developer: "google",
      notes: "Compact and cheap. Decent structured output for its size. Comparable to Llama 8B but better instruction following. Budget alternative.",
      providers: [
        { provider: "groq", providerModelId: "gemma2-9b-it", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.20, priceOutputPerMToken: 0.20 },
      ],
    },
    {
      stage: "distillation", modelId: "mixtral-8x7b-32768", label: "Mixtral 8x7B", developer: "mistral",
      notes: "MoE architecture, 32K context. Good extraction quality for its cost. Handles long transcripts well. Solid mid-tier value option.",
      providers: [
        { provider: "groq", providerModelId: "mixtral-8x7b-32768", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.24, priceOutputPerMToken: 0.24 },
        { provider: "cloudflare", providerModelId: "@cf/mistral/mistral-7b-instruct-v0.1", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.110, priceOutputPerMToken: 0.190 },
      ],
    },
    {
      stage: "distillation", modelId: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B", developer: "deepseek",
      notes: "Reasoning-focused model. Excellent at identifying implicit claims and logical chains. Slower due to chain-of-thought. High CF output cost — prefer Groq.",
      providers: [
        { provider: "groq", providerModelId: "deepseek-r1-distill-llama-70b", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.75, priceOutputPerMToken: 0.99 },
        { provider: "cloudflare", providerModelId: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.497, priceOutputPerMToken: 4.881 },
      ],
    },
    // ── Narrative ──
    {
      stage: "narrative", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
      notes: "Recommended default. Produces natural, engaging podcast-style narratives. Good pacing and tone control. Best quality-to-cost ratio for narration.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
      ],
    },
    {
      stage: "narrative", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
      notes: "Fast and cheap. Narratives are serviceable but can feel formulaic. Good for high-volume, low-stakes briefings. May produce shorter output.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
      ],
    },
    {
      stage: "narrative", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
      notes: "Premium narrative quality. Rich transitions, varied sentence structure, editorial judgment. Very expensive — reserve for flagship content.",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
      ],
    },
    {
      stage: "narrative", modelId: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", developer: "meta",
      notes: "Best open-source for narration. Natural flow, good paragraph structure. 5x cheaper than Sonnet. Occasional repetition on longer briefings.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.3-70b-versatile", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.59, priceOutputPerMToken: 0.79 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.293, priceOutputPerMToken: 2.253 },
      ],
    },
    {
      stage: "narrative", modelId: "llama-3.1-8b-instant", label: "Llama 3.1 8B", developer: "meta",
      notes: "Ultra-cheap. Narratives tend to be flat and repetitive. Short output. Only for testing or extremely budget-constrained use.",
      providers: [
        { provider: "groq", providerModelId: "llama-3.1-8b-instant", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.05, priceOutputPerMToken: 0.08 },
        { provider: "cloudflare", providerModelId: "@cf/meta/llama-3.1-8b-instruct-fp8-fast", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.045, priceOutputPerMToken: 0.384 },
      ],
    },
    {
      stage: "narrative", modelId: "gemma2-9b-it", label: "Gemma 2 9B", developer: "google",
      notes: "Compact model. Produces readable but brief narratives. Better tone than Llama 8B. Reasonable budget choice for shorter briefings.",
      providers: [
        { provider: "groq", providerModelId: "gemma2-9b-it", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.20, priceOutputPerMToken: 0.20 },
      ],
    },
    {
      stage: "narrative", modelId: "mixtral-8x7b-32768", label: "Mixtral 8x7B", developer: "mistral",
      notes: "MoE architecture, 32K context. Good narrative flow for mid-tier cost. Handles long claim lists well. Occasionally verbose.",
      providers: [
        { provider: "groq", providerModelId: "mixtral-8x7b-32768", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.24, priceOutputPerMToken: 0.24 },
        { provider: "cloudflare", providerModelId: "@cf/mistral/mistral-7b-instruct-v0.1", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.110, priceOutputPerMToken: 0.190 },
      ],
    },
    {
      stage: "narrative", modelId: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B", developer: "deepseek",
      notes: "Reasoning model — not ideal for creative narration. May produce overly analytical, dry narratives. Better suited for distillation stage.",
      providers: [
        { provider: "groq", providerModelId: "deepseek-r1-distill-llama-70b", providerLabel: "Groq", isDefault: true, priceInputPerMToken: 0.75, priceOutputPerMToken: 0.99 },
        { provider: "cloudflare", providerModelId: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", providerLabel: "Cloudflare Workers AI", priceInputPerMToken: 0.497, priceOutputPerMToken: 4.881 },
      ],
    },
    // ── Audio Generation (TTS) ──
    {
      stage: "tts", modelId: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS", developer: "openai",
      notes: "Recommended default. Instruction-steerable voice (tone, pacing, emotion). 6 voices. Excellent podcast-quality output. Best overall TTS.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.015, limits: { maxInputChars: 7000 } },
      ],
    },
    {
      stage: "tts", modelId: "tts-1", label: "TTS-1", developer: "openai",
      notes: "Standard quality, low latency. 6 voices. No instruction control. Noticeable artifacts on longer text. Cheaper than gpt-4o-mini-tts but audibly worse.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 15.0, limits: { maxInputChars: 4096 } },
      ],
    },
    {
      stage: "tts", modelId: "tts-1-hd", label: "TTS-1 HD", developer: "openai",
      notes: "High-definition variant of TTS-1. 6 voices. Smoother output, fewer artifacts. No instruction control. 2x cost of standard — marginal improvement.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 30.0, limits: { maxInputChars: 4096 } },
      ],
    },
    {
      stage: "tts", modelId: "orpheus-v1-english", label: "Orpheus v1 English", developer: "canopylabs",
      notes: "Expressive TTS with emotion tags ([cheerful], [whisper]). English-only. 6 voices. Ultra-cheap on Groq. Great value but less natural than GPT-4o-mini.",
      providers: [
        { provider: "groq", providerModelId: "canopylabs/orpheus-v1-english", providerLabel: "Groq", isDefault: true, pricePerKChars: 0.022, limits: { maxInputChars: 4000 } },
      ],
    },
    {
      stage: "tts", modelId: "melotts", label: "MeloTTS", developer: "myshell-ai",
      notes: "Multilingual (EN, ES, FR, ZH, JP, KR). Extremely cheap on CF. Robotic quality — acceptable for testing or non-English content, not for production podcasts.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/myshell-ai/melotts", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerMinute: 0.000205, limits: { maxInputChars: 2000 } },
      ],
    },
    {
      stage: "tts", modelId: "aura-1", label: "Aura 1", developer: "deepgram",
      notes: "Deepgram's first-gen TTS. English-only. Natural conversational tone. Low latency via CF. Good value mid-tier option.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-1", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.015, limits: { maxInputChars: 2000 } },
      ],
    },
    {
      stage: "tts", modelId: "aura-2-en", label: "Aura 2 English", developer: "deepgram",
      notes: "Deepgram's latest TTS. English-only. Improved naturalness and prosody over Aura 1. Multiple voices. Good quality at reasonable cost via CF.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-2-en", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.030, limits: { maxInputChars: 2000 } },
      ],
    },
  ];

  for (const m of MODEL_SEEDS) {
    const aiModel = await prisma.aiModel.upsert({
      where: { stage_modelId: { stage: m.stage, modelId: m.modelId } },
      update: { label: m.label, developer: m.developer, notes: m.notes ?? null },
      create: { stage: m.stage, modelId: m.modelId, label: m.label, developer: m.developer, notes: m.notes ?? null },
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

  // Seed v1 defaults for each stage
  const {
    DEFAULT_CLAIMS_SYSTEM_PROMPT,
    DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
    DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
    DEFAULT_NARRATIVE_USER_TEMPLATE,
    DEFAULT_NARRATIVE_METADATA_INTRO,
    PROMPT_CONFIG_KEYS,
  } = await import("../worker/lib/prompt-defaults");

  const stageSeeds = [
    {
      stage: "distillation",
      values: {
        [PROMPT_CONFIG_KEYS.claimsSystem]: DEFAULT_CLAIMS_SYSTEM_PROMPT,
      },
    },
    {
      stage: "narrative",
      values: {
        [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_WITH_EXCERPTS,
        [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: DEFAULT_NARRATIVE_SYSTEM_PROMPT_NO_EXCERPTS,
        [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: DEFAULT_NARRATIVE_USER_TEMPLATE,
        [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: DEFAULT_NARRATIVE_METADATA_INTRO,
      },
    },
  ];

  for (const s of stageSeeds) {
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
  }

  console.log("Seeded prompt versions.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
