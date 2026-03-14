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
    providers: ProviderSeed[];
  };

  const MODEL_SEEDS: ModelSeed[] = [
    // ── STT ──
    {
      stage: "stt", modelId: "whisper-1", label: "Whisper 1", developer: "openai",
      providers: [
        { provider: "openai", providerModelId: "whisper-1", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.006 },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo", developer: "openai",
      providers: [
        { provider: "cloudflare", providerModelId: "@cf/openai/whisper-large-v3-turbo", providerLabel: "Cloudflare Workers AI", isDefault: true, pricePerMinute: 0.0005 },
        { provider: "groq", providerModelId: "whisper-large-v3-turbo", providerLabel: "Groq", pricePerMinute: 0.000667 },
      ],
    },
    {
      stage: "stt", modelId: "whisper-large-v3", label: "Whisper Large v3", developer: "openai",
      providers: [
        { provider: "groq", providerModelId: "whisper-large-v3", providerLabel: "Groq", isDefault: true, pricePerMinute: 0.000667 },
      ],
    },
    {
      stage: "stt", modelId: "nova-2", label: "Deepgram Nova-2", developer: "deepgram",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0043 },
      ],
    },
    {
      stage: "stt", modelId: "nova-3", label: "Deepgram Nova-3", developer: "deepgram",
      providers: [
        { provider: "deepgram", providerLabel: "Deepgram", isDefault: true, pricePerMinute: 0.0077 },
        { provider: "cloudflare", providerModelId: "@cf/deepgram/nova-3", providerLabel: "Cloudflare Workers AI", pricePerMinute: 0.0052 },
      ],
    },
    {
      stage: "stt", modelId: "assemblyai-best", label: "AssemblyAI Best", developer: "assemblyai",
      providers: [
        { provider: "assemblyai", providerLabel: "AssemblyAI", isDefault: true, pricePerMinute: 0.015 },
      ],
    },
    {
      stage: "stt", modelId: "google-chirp", label: "Google Chirp", developer: "google",
      providers: [
        { provider: "google", providerLabel: "Google Cloud", isDefault: true, pricePerMinute: 0.024 },
      ],
    },
    // ── Distillation ──
    {
      stage: "distillation", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
      ],
    },
    {
      stage: "distillation", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
      ],
    },
    {
      stage: "distillation", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
      ],
    },
    // ── Narrative ──
    {
      stage: "narrative", modelId: "claude-sonnet-4-20250514", label: "Sonnet 4", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 3.0, priceOutputPerMToken: 15.0 },
      ],
    },
    {
      stage: "narrative", modelId: "claude-haiku-4-5-20251001", label: "Haiku 4.5", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
      ],
    },
    {
      stage: "narrative", modelId: "claude-opus-4-20250514", label: "Opus 4", developer: "anthropic",
      providers: [
        { provider: "anthropic", providerLabel: "Anthropic", isDefault: true, priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
      ],
    },
    // ── Audio Generation (TTS) ──
    {
      stage: "tts", modelId: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS", developer: "openai",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerMinute: 0.015 },
      ],
    },
    {
      stage: "tts", modelId: "tts-1", label: "TTS-1", developer: "openai",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 15.0 },
      ],
    },
    {
      stage: "tts", modelId: "tts-1-hd", label: "TTS-1 HD", developer: "openai",
      providers: [
        { provider: "openai", providerLabel: "OpenAI", isDefault: true, pricePerKChars: 30.0 },
      ],
    },
  ];

  for (const m of MODEL_SEEDS) {
    const aiModel = await prisma.aiModel.upsert({
      where: { stage_modelId: { stage: m.stage, modelId: m.modelId } },
      update: { label: m.label, developer: m.developer },
      create: { stage: m.stage, modelId: m.modelId, label: m.label, developer: m.developer },
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
