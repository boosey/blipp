/** Config keys for all prompts. */
export const PROMPT_CONFIG_KEYS = {
  claimsSystem: "prompt.claims.system",
  narrativeSystemWithExcerpts: "prompt.narrative.system.with_excerpts",
  narrativeSystemNoExcerpts: "prompt.narrative.system.no_excerpts",
  narrativeUserTemplate: "prompt.narrative.user_template",
  narrativeMetadataIntro: "prompt.narrative.metadata_intro",
} as const;

/** Prompt keys grouped by stage — used for atomic stage-level versioning. */
export const PROMPT_STAGES: Record<string, string[]> = {
  distillation: [PROMPT_CONFIG_KEYS.claimsSystem],
  narrative: [
    PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts,
    PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts,
    PROMPT_CONFIG_KEYS.narrativeUserTemplate,
    PROMPT_CONFIG_KEYS.narrativeMetadataIntro,
  ],
};

/** Prompt metadata for admin display. */
export const PROMPT_METADATA: Record<string, { label: string; description: string; stage: string }> = {
  [PROMPT_CONFIG_KEYS.claimsSystem]: {
    label: "Claims Extraction — System Prompt",
    description: "Instructs the LLM how to extract claims from a podcast transcript. Used in Stage 2 (Distillation).",
    stage: "distillation",
  },
  [PROMPT_CONFIG_KEYS.narrativeSystemWithExcerpts]: {
    label: "Narrative Generation — System Prompt (with excerpts)",
    description: "Instructs the LLM how to write the spoken narrative from claims + excerpts. Used in Stage 3 (Narrative Generation).",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeSystemNoExcerpts]: {
    label: "Narrative Generation — System Prompt (no excerpts)",
    description: "Fallback system prompt when claims lack excerpt data. Used in Stage 3.",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeUserTemplate]: {
    label: "Narrative Generation — User Prompt Template",
    description: "Template for the user message sent to the LLM. Variables: {{targetWords}}, {{durationMinutes}}, {{wpm}}, {{metadataBlock}}, {{claimsLabel}}, {{claimsJson}}",
    stage: "narrative",
  },
  [PROMPT_CONFIG_KEYS.narrativeMetadataIntro]: {
    label: "Narrative Generation — Metadata Intro",
    description: "Instructions for the episode intro line (podcast name + episode title). Injected into the user prompt via {{metadataBlock}}.",
    stage: "narrative",
  },
};
