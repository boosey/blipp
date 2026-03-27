import { Hono } from "hono";
import type { Env } from "../../types";

// Maps AiModel.stage (AiStage) to PipelineStep.stage (PipelineStage)
const STAGE_TO_PIPELINE: Record<string, string> = {
  stt: "TRANSCRIPTION",
  distillation: "DISTILLATION",
  narrative: "NARRATIVE_GENERATION",
  tts: "AUDIO_GENERATION",
};

// STT stores inputTokens as bytes/STT_BYTES_PER_TOKEN; to get audio minutes:
// audioMinutes = inputTokens * STT_BYTES_PER_TOKEN / BITRATE / 60
const STT_BYTES_PER_TOKEN = 16000;
const BITRATE_BPS = 16000; // 128kbps

// TTS stores inputTokens as character count; to estimate audio minutes from chars:
// ~150 words/min spoken, ~5 chars/word => ~750 chars/min
const TTS_CHARS_PER_MINUTE = 750;

export const aiModelsRoutes = new Hono<{ Bindings: Env }>();

// GET / — list models with providers, optional ?stage= and ?includeInactive=true filters
aiModelsRoutes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const stage = c.req.query("stage");
  const includeInactive = c.req.query("includeInactive") === "true";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch models and per-stage workload aggregates in parallel
  const [models, stageWorkloads, firstStep] = await Promise.all([
    prisma.aiModel.findMany({
      where: {
        ...(stage ? { stage } : {}),
        ...(!includeInactive && { isActive: true }),
      },
      include: { providers: { orderBy: { isDefault: "desc" } } },
      orderBy: [{ stage: "asc" }, { label: "asc" }],
    }),
    // Aggregate total workload per pipeline stage over last 30 days
    prisma.pipelineStep.groupBy({
      by: ["stage"],
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: "COMPLETED",
      },
      _sum: { inputTokens: true, outputTokens: true, audioSeconds: true, charCount: true },
    }),
    // Find the earliest completed step to normalize partial data periods
    prisma.pipelineStep.findFirst({
      where: { createdAt: { gte: thirtyDaysAgo }, status: "COMPLETED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  // Calculate how many days of data we have (for monthly normalization)
  const daysOfData = firstStep?.createdAt
    ? Math.max(1, (Date.now() - firstStep.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : 30;
  const monthlyMultiplier = 30 / Math.min(30, daysOfData);

  // Build workload map: PipelineStage -> aggregated workload
  const workloadMap = new Map<string, { inputTokens: number; outputTokens: number; audioSeconds: number | null; charCount: number | null }>();
  for (const r of stageWorkloads) {
    workloadMap.set(r.stage, {
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      audioSeconds: r._sum.audioSeconds ?? null,
      charCount: r._sum.charCount ?? null,
    });
  }

  const data = models.map((m: any) => {
    const pipelineStage = STAGE_TO_PIPELINE[m.stage];
    const workload = pipelineStage ? workloadMap.get(pipelineStage) : null;
    let estMonthlyCost: number | null = null;

    if (workload && m.providers.length > 0) {
      // Use the default provider's pricing, or first available
      const prov = m.providers.find((p: any) => p.isDefault) ?? m.providers[0];
      const rawCost = calculateModelCostForWorkload(m.stage, prov, workload);
      if (rawCost != null) {
        estMonthlyCost = Math.round(rawCost * monthlyMultiplier * 100) / 100;
      }
    }

    return { ...m, estMonthlyCost };
  });

  return c.json({ data });
});

/**
 * Calculate what a model's provider would cost for a given stage workload.
 * Returns the raw cost (not yet normalized to monthly).
 *
 * Uses real audioSeconds/charCount columns when available, falls back to
 * reverse-engineering from inputTokens for historical data that predates
 * those columns. TODO(May 2026): remove reverse-engineering fallbacks once
 * we have ~2 months of real production data.
 */
function calculateModelCostForWorkload(
  aiStage: string,
  provider: any,
  workload: { inputTokens: number; outputTokens: number; audioSeconds: number | null; charCount: number | null }
): number | null {
  switch (aiStage) {
    case "stt": {
      if (provider.pricePerMinute == null) return null;
      // Prefer real audioSeconds; fall back to reverse-engineering from inputTokens
      const audioMinutes = workload.audioSeconds != null
        ? workload.audioSeconds / 60
        : (workload.inputTokens * STT_BYTES_PER_TOKEN) / BITRATE_BPS / 60;
      return audioMinutes * provider.pricePerMinute;
    }
    case "distillation":
    case "narrative": {
      if (provider.priceInputPerMToken == null || provider.priceOutputPerMToken == null) return null;
      return (
        (workload.inputTokens / 1_000_000) * provider.priceInputPerMToken +
        (workload.outputTokens / 1_000_000) * provider.priceOutputPerMToken
      );
    }
    case "tts": {
      // Prefer real charCount; fall back to inputTokens (which stores chars)
      const chars = workload.charCount ?? workload.inputTokens;
      if (provider.pricePerKChars != null) {
        return (chars / 1000) * provider.pricePerKChars;
      }
      if (provider.pricePerMinute != null) {
        // Prefer real audioSeconds; fall back to estimating from chars
        const audioMinutes = workload.audioSeconds != null
          ? workload.audioSeconds / 60
          : chars / TTS_CHARS_PER_MINUTE;
        return audioMinutes * provider.pricePerMinute;
      }
      return null;
    }
    default:
      return null;
  }
}

// POST / — create a new model
aiModelsRoutes.post("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const body = await c.req.json();
  const { stage, modelId, label, developer, notes } = body;
  if (!stage || !modelId || !label || !developer) {
    return c.json({ error: "stage, modelId, label, and developer are required" }, 400);
  }
  const data = await prisma.aiModel.create({
    data: { stage, modelId, label, developer, notes: notes ?? null },
    include: { providers: true },
  });
  return c.json({ data }, 201);
});

// POST /:id/providers — add a provider to a model
aiModelsRoutes.post("/:id/providers", async (c) => {
  const prisma = c.get("prisma") as any;
  const aiModelId = c.req.param("id");
  const body = await c.req.json();
  const { provider, providerLabel, pricePerMinute, priceInputPerMToken,
          priceOutputPerMToken, pricePerKChars, isDefault, limits } = body;
  if (!provider || !providerLabel) {
    return c.json({ error: "provider and providerLabel are required" }, 400);
  }
  const data = await prisma.aiModelProvider.create({
    data: {
      aiModelId, provider, providerLabel,
      pricePerMinute: pricePerMinute ?? null,
      priceInputPerMToken: priceInputPerMToken ?? null,
      priceOutputPerMToken: priceOutputPerMToken ?? null,
      pricePerKChars: pricePerKChars ?? null,
      isDefault: isDefault ?? false,
      ...(limits !== undefined && { limits }),
    },
  });
  return c.json({ data }, 201);
});

// PATCH /:id — toggle isActive on a model
aiModelsRoutes.patch("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = await prisma.aiModel.update({
    where: { id },
    data: {
      ...("isActive" in body && { isActive: body.isActive }),
      ...("notes" in body && { notes: body.notes }),
    },
    include: { providers: true },
  });
  return c.json({ data });
});

// PATCH /:id/providers/:providerId — update pricing or availability
aiModelsRoutes.patch("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("providerId");
  const body = await c.req.json();
  const data = await prisma.aiModelProvider.update({
    where: { id },
    data: {
      ...("providerLabel" in body && { providerLabel: body.providerLabel }),
      ...("pricePerMinute" in body && { pricePerMinute: body.pricePerMinute }),
      ...("priceInputPerMToken" in body && { priceInputPerMToken: body.priceInputPerMToken }),
      ...("priceOutputPerMToken" in body && { priceOutputPerMToken: body.priceOutputPerMToken }),
      ...("pricePerKChars" in body && { pricePerKChars: body.pricePerKChars }),
      ...("isDefault" in body && { isDefault: body.isDefault }),
      ...("isAvailable" in body && { isAvailable: body.isAvailable }),
      ...("limits" in body && { limits: body.limits }),
    },
  });
  return c.json({ data });
});

// DELETE /:id — delete a model and all its providers (cascade)
aiModelsRoutes.delete("/:id", async (c) => {
  const prisma = c.get("prisma") as any;
  const id = c.req.param("id");
  await prisma.aiModel.delete({ where: { id } });
  return c.json({ success: true });
});

// DELETE /:id/providers/:providerId — remove a provider
aiModelsRoutes.delete("/:id/providers/:providerId", async (c) => {
  const prisma = c.get("prisma") as any;
  const modelId = c.req.param("id");
  const id = c.req.param("providerId");
  await prisma.aiModelProvider.delete({ where: { id } });
  const remainingProviders = await prisma.aiModelProvider.count({ where: { aiModelId: modelId } });
  return c.json({ success: true, remainingProviders });
});
