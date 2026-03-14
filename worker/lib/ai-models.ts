import { getConfig } from "./config";
export type { AIStage } from "../../src/lib/ai-models";
export { STAGE_LABELS } from "../../src/lib/ai-models";
import type { AIStage } from "../../src/lib/ai-models";

export interface AIModelConfig {
  provider: string;
  model: string;
}

const DEFAULTS: Record<AIStage, AIModelConfig> = {
  stt: { provider: "cloudflare", model: "whisper-large-v3-turbo" },
  distillation: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  narrative: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  tts: { provider: "openai", model: "gpt-4o-mini-tts" },
};

export async function getModelConfig(
  prisma: any,
  stage: AIStage
): Promise<AIModelConfig> {
  return getConfig(prisma, `ai.${stage}.model`, DEFAULTS[stage]);
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
