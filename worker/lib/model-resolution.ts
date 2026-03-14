import { getModelConfig, STAGE_LABELS } from "./ai-models";
import { getModelPricing, type ModelPricing } from "./ai-usage";
import type { AIStage } from "./ai-models";

export interface ResolvedModel {
  provider: string;
  model: string;
  providerModelId: string;
  pricing: ModelPricing | null;
}

/**
 * Resolves the AI model configuration for a pipeline stage.
 * Combines the 4-step lookup (config -> pricing -> provider row -> providerModelId)
 * into a single call.
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
  const pricing = await getModelPricing(prisma, model, provider);

  const dbProvider = await prisma.aiModelProvider.findFirst({
    where: { provider, model: { modelId: model } },
  });
  const providerModelId = dbProvider?.providerModelId ?? model;

  return { provider, model, providerModelId, pricing };
}
