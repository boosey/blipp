/**
 * Pricing updater — called from the daily cron gate in the scheduled handler.
 * Each provider function returns current known prices. These are static for now;
 * replace with HTTP calls when providers expose pricing APIs.
 */

interface ProviderPrice {
  modelId: string;
  provider: string;
  pricePerMinute?: number;
  priceInputPerMToken?: number;
  priceOutputPerMToken?: number;
  pricePerKChars?: number;
}

/**
 * Returns current known prices for all tracked model/provider combos.
 * Extend this function when providers add pricing APIs.
 */
function getKnownPrices(): ProviderPrice[] {
  return [
    { modelId: "whisper-1", provider: "openai",      pricePerMinute: 0.006 },
    { modelId: "whisper-1", provider: "cloudflare",  pricePerMinute: 0.0005 },
    { modelId: "whisper-1", provider: "groq",        pricePerMinute: 0.000667 },
    { modelId: "nova-2",    provider: "deepgram",    pricePerMinute: 0.0043 },
    { modelId: "nova-3",    provider: "deepgram",    pricePerMinute: 0.0077 },
    { modelId: "nova-3",    provider: "cloudflare",  pricePerMinute: 0.0052 },
    { modelId: "assemblyai-best", provider: "assemblyai", pricePerMinute: 0.015 },
    { modelId: "google-chirp",    provider: "google",     pricePerMinute: 0.024 },
    { modelId: "claude-sonnet-4-20250514", provider: "anthropic", priceInputPerMToken: 3.0,  priceOutputPerMToken: 15.0 },
    { modelId: "claude-haiku-4-5-20251001", provider: "anthropic", priceInputPerMToken: 0.8, priceOutputPerMToken: 4.0 },
    { modelId: "claude-opus-4-20250514",   provider: "anthropic", priceInputPerMToken: 15.0, priceOutputPerMToken: 75.0 },
    { modelId: "gpt-4o-mini-tts", provider: "openai", pricePerMinute: 0.015 },
    { modelId: "tts-1",    provider: "openai", pricePerKChars: 15.0 },
    { modelId: "tts-1-hd", provider: "openai", pricePerKChars: 30.0 },
  ];
}

export async function refreshPricing(prisma: any): Promise<{ updated: number }> {
  const prices = getKnownPrices();
  const now = new Date();
  let updated = 0;

  for (const p of prices) {
    // Find the AiModelProvider rows for this modelId + provider combo
    const providers = await prisma.aiModelProvider.findMany({
      where: { provider: p.provider, model: { modelId: p.modelId } },
      include: { model: true },
    });

    for (const row of providers) {
      await prisma.aiModelProvider.update({
        where: { id: row.id },
        data: {
          pricePerMinute: p.pricePerMinute ?? null,
          priceInputPerMToken: p.priceInputPerMToken ?? null,
          priceOutputPerMToken: p.priceOutputPerMToken ?? null,
          pricePerKChars: p.pricePerKChars ?? null,
          priceUpdatedAt: now,
        },
      });
      updated++;
    }
  }

  return { updated };
}
