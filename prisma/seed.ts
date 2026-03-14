import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.plan.upsert({
    where: { tier: "FREE" },
    update: {},
    create: {
      tier: "FREE",
      name: "Free",
      priceCents: 0,
      stripePriceId: null,
      stripeProductId: null,
      features: [
        "3 briefings per week",
        "Up to 5 min briefings",
        "3 podcast subscriptions",
      ],
      highlighted: false,
      sortOrder: 0,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "PRO" },
    update: {},
    create: {
      tier: "PRO",
      name: "Pro",
      priceCents: 999,
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
      stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID ?? null,
      features: [
        "Unlimited briefings",
        "Up to 15 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
      ],
      highlighted: true,
      sortOrder: 1,
    },
  });

  await prisma.plan.upsert({
    where: { tier: "PRO_PLUS" },
    update: {},
    create: {
      tier: "PRO_PLUS",
      name: "Pro+",
      priceCents: 1999,
      stripePriceId: process.env.STRIPE_PRO_PLUS_PRICE_ID ?? null,
      stripeProductId: process.env.STRIPE_PRO_PLUS_PRODUCT_ID ?? null,
      features: [
        "Unlimited briefings",
        "Up to 30 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
        "Early access to new features",
      ],
      highlighted: false,
      sortOrder: 2,
    },
  });

  console.log("Seeded plans.");

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
        { provider: "openai", providerModelId: "whisper-1", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.006 },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo", developer: "openai",
      notes: "Best value STT. Multilingual, near-v3 accuracy at 3-4x speed. Excellent on CF (cheapest) and Groq (fastest). Recommended default.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/openai/whisper-large-v3-turbo", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerMinute: 0.0005 },
        { provider: "groq", providerModelId: "whisper-large-v3-turbo", providerLabel: "Groq", pricePerMinute: 0.000667 },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3", label: "Whisper Large v3", developer: "openai",
      notes: "Highest accuracy Whisper variant. Multilingual. Slower than turbo but better on accents and noisy audio. Use for quality-critical transcription.",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667 },
      ],
    },
    {
      stage: "stt", modelId: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 (EN)", developer: "openai",
      notes: "English-only, distilled for speed. ~2x faster than full v3 with minimal accuracy loss. Cheapest option. Not suitable for multilingual content.",
      providers: [
        { provider: "groq", providerModelId: "distil-whisper-large-v3-en", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.0002 },
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
        { provider: "cloudflare", providerModelId: "@cf/deepgram/nova-3", providerLabel: "Cloudflare Workers AI", pricePerMinute: 0.0052 },
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
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.015 },
      ],
    },
    {
      stage: "tts", modelId: "tts-1", label: "TTS-1", developer: "openai",
      notes: "Standard quality, low latency. 6 voices. No instruction control. Noticeable artifacts on longer text. Cheaper than gpt-4o-mini-tts but audibly worse.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 15.0 },
      ],
    },
    {
      stage: "tts", modelId: "tts-1-hd", label: "TTS-1 HD", developer: "openai",
      notes: "High-definition variant of TTS-1. 6 voices. Smoother output, fewer artifacts. No instruction control. 2x cost of standard — marginal improvement.",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 30.0 },
      ],
    },
    {
      stage: "tts", modelId: "orpheus-v1-english", label: "Orpheus v1 English", developer: "canopylabs",
      notes: "Expressive TTS with emotion tags ([cheerful], [whisper]). English-only. 6 voices. Ultra-cheap on Groq. Great value but less natural than GPT-4o-mini.",
      providers: [
        { provider: "groq", providerModelId: "canopylabs/orpheus-v1-english", providerLabel: "Groq", isDefault: true, pricePerKChars: 0.022 },
      ],
    },
    {
      stage: "tts", modelId: "melotts", label: "MeloTTS", developer: "myshell-ai",
      notes: "Multilingual (EN, ES, FR, ZH, JP, KR). Extremely cheap on CF. Robotic quality — acceptable for testing or non-English content, not for production podcasts.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/myshell-ai/melotts", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerMinute: 0.000205 },
      ],
    },
    {
      stage: "tts", modelId: "aura-1", label: "Aura 1", developer: "deepgram",
      notes: "Deepgram's first-gen TTS. English-only. Natural conversational tone. Low latency via CF. Good value mid-tier option.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-1", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.015 },
      ],
    },
    {
      stage: "tts", modelId: "aura-2-en", label: "Aura 2 English", developer: "deepgram",
      notes: "Deepgram's latest TTS. English-only. Improved naturalness and prosody over Aura 1. Multiple voices. Good quality at reasonable cost via CF.",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/deepgram/aura-2-en", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerKChars: 0.030 },
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
