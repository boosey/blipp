/**
 * Canonical stage identifiers and display labels.
 * Model data is now DB-backed — fetch from GET /api/admin/ai-models.
 */

export type AIStage = "stt" | "distillation" | "narrative" | "tts";

export const STAGE_LABELS: Record<AIStage, string> = {
  stt: "Transcription",
  distillation: "Distillation",
  narrative: "Narrative Generation",
  tts: "Audio Generation",
};
