import { getConfig } from "./config";
export type { AIStage, AIModelEntry, AIModelConfig } from "../../src/lib/ai-models";
export { STAGE_LABELS, AI_MODELS } from "../../src/lib/ai-models";
import type { AIStage, AIModelConfig } from "../../src/lib/ai-models";
import { AI_MODELS } from "../../src/lib/ai-models";

const DEFAULTS: Record<AIStage, AIModelConfig> = {
  stt: { provider: "openai", model: "whisper-1" },
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
