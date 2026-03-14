import { getConfig } from "./config";
export type { AIStage } from "../../src/lib/ai-models";
export { STAGE_LABELS } from "../../src/lib/ai-models";
import type { AIStage } from "../../src/lib/ai-models";

export interface AIModelConfig {
  provider: string;
  model: string;
}

export async function getModelConfig(
  prisma: any,
  stage: AIStage
): Promise<AIModelConfig | null> {
  return getConfig<AIModelConfig | null>(prisma, `ai.${stage}.model`, null);
}

export async function getModelRegistry(
  prisma: any,
  stage?: AIStage
): Promise<any[]> {
  return prisma.aiModel.findMany({
    where: { isActive: true, ...(stage ? { stage } : {}) },
    include: { providers: { where: { isAvailable: true }, orderBy: { isDefault: "desc" } } },
    orderBy: { label: "asc" },
  });
}
