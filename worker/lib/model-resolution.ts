import { getModelConfig, STAGE_LABELS } from "./ai-models";
import { getConfig } from "./config";
import { getModelPricing, type ModelPricing } from "./ai-usage";
import { checkCircuit, CircuitOpenError } from "./circuit-breaker";
import type { AIStage } from "./ai-models";

export interface ResolvedModel {
  provider: string;
  model: string;
  providerModelId: string;
  pricing: ModelPricing | null;
  limits: Record<string, unknown> | null;
}

/**
 * Resolves the AI model configuration for a pipeline stage.
 * Combines the 4-step lookup (config -> pricing -> provider row -> providerModelId)
 * into a single call.
 *
 * If the primary provider's circuit breaker is open, attempts failover to an
 * alternative provider for the same stage.
 */
export async function resolveStageModel(
  prisma: any,
  stage: AIStage
): Promise<ResolvedModel> {
  const config = await getModelConfig(prisma, stage);
  if (!config) {
    throw new Error(
      `No AI model configured for ${STAGE_LABELS[stage]} stage -- configure one in Admin > Configuration`
    );
  }

  const { provider, model } = config;

  // Check circuit breaker for primary provider
  try {
    checkCircuit(provider);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // Try to find an alternative provider for this stage
      const alternative = await findAlternativeProvider(prisma, stage, provider);
      if (alternative) {
        console.log(
          JSON.stringify({
            level: "warn",
            action: "provider_failover",
            stage,
            from: provider,
            to: alternative.provider,
            ts: new Date().toISOString(),
          })
        );
        return alternative;
      }
      // No alternative -- let the circuit error propagate
      throw err;
    }
    throw err;
  }

  const pricing = await getModelPricing(prisma, model, provider);

  const dbProvider = await prisma.aiModelProvider.findFirst({
    where: { provider, model: { modelId: model } },
  });
  const providerModelId = dbProvider?.providerModelId ?? model;
  const limits = (dbProvider?.limits as Record<string, unknown>) ?? null;

  return { provider, model, providerModelId, pricing, limits };
}

/**
 * Resolves an ordered list of STT models to try: primary, secondary, tertiary.
 * Config keys: ai.stt.model, ai.stt.model.secondary, ai.stt.model.tertiary
 * Skips entries with open circuit breakers. Returns at least one if primary exists.
 */
export async function resolveSttModelChain(
  prisma: any
): Promise<ResolvedModel[]> {
  const keys = ["ai.stt.model", "ai.stt.model.secondary", "ai.stt.model.tertiary"];
  const chain: ResolvedModel[] = [];

  for (const key of keys) {
    const suffix = key === "ai.stt.model" ? "stt" : key.replace("ai.stt.model.", "stt.");
    const config = await getConfig<{ provider: string; model: string } | null>(prisma, key, null);
    if (!config?.provider || !config?.model) continue;

    try {
      checkCircuit(config.provider);
    } catch (err) {
      if (err instanceof CircuitOpenError) continue;
      throw err;
    }

    const pricing = await getModelPricing(prisma, config.model, config.provider);
    const dbProvider = await prisma.aiModelProvider.findFirst({
      where: { provider: config.provider, model: { modelId: config.model } },
    });

    chain.push({
      provider: config.provider,
      model: config.model,
      providerModelId: dbProvider?.providerModelId ?? config.model,
      pricing,
      limits: (dbProvider?.limits as Record<string, unknown>) ?? null,
    });
  }

  return chain;
}

/**
 * Find an alternative provider for a stage when the primary is circuit-broken.
 */
async function findAlternativeProvider(
  prisma: any,
  stage: AIStage,
  excludeProvider: string
): Promise<ResolvedModel | null> {
  // Look for other available providers for this stage
  const stageModels = await prisma.aiModel.findMany({
    where: {
      stage,
      isActive: true,
      providers: {
        some: { isAvailable: true, provider: { not: excludeProvider } },
      },
    },
    include: {
      providers: {
        where: { isAvailable: true, provider: { not: excludeProvider } },
        take: 1,
      },
    },
    take: 1,
  });

  if (stageModels.length === 0 || stageModels[0].providers.length === 0) {
    return null;
  }

  const altModel = stageModels[0];
  const altProvider = altModel.providers[0];

  // Check circuit for alternative too
  try {
    checkCircuit(altProvider.provider);
  } catch {
    return null; // Alternative also circuit-broken
  }

  const pricing = await getModelPricing(
    prisma,
    altModel.modelId,
    altProvider.provider
  );

  return {
    provider: altProvider.provider,
    model: altModel.modelId,
    providerModelId: altProvider.providerModelId ?? altModel.modelId,
    pricing,
    limits: (altProvider.limits as Record<string, unknown>) ?? null,
  };
}
