/**
 * Editorial validators for Phase 4.0 hardened rules.
 *
 * These checks run server-side at the admin API surface. They produce a
 * structured ValidationReport so the admin UI can render warnings inline
 * (soft) and the publish endpoint can hard-block transitions that violate
 * the non-negotiable rules.
 */

export type Severity = "info" | "warn" | "error";

export interface ValidationFinding {
  rule: string;
  severity: Severity;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ValidationReport {
  ok: boolean;
  publishBlocking: ValidationFinding[];
  warnings: ValidationFinding[];
  computed: {
    wordCount: number;
    quotedWordCount: number;
    quoteCounts: Record<string, number>;
    ratio: number | null;
  };
}

export interface QuoteEntry {
  /** Source identifier (episodeId, URL, etc) — keys quoteCounts. */
  sourceId: string;
  /** Word count of this quoted span. */
  words: number;
}

export interface PostInput {
  title: string;
  body: string; // markdown body, excluding sources footer
  sourcesMarkdown?: string | null;
  status: string;
  mode: "HUMAN" | "AI_ASSISTED" | string;
  ratioCheckPassed: boolean;
  /** Per-quote spans the editor has marked. The admin UI tracks these
   *  manually — we don't try to extract from markdown automatically. */
  quotes?: QuoteEntry[];
  /** The `editor` joined record. Pass `{ status: "READY" | "NOT_READY" | "RETIRED" }` minimum. */
  editor?: { status: string } | null;
}

export const PULSE_WORD_FLOOR = 800;
export const PULSE_WORD_CEILING = 1500;
export const PULSE_RATIO_MIN = 3.0; // 3 words analysis : 1 word quoted
export const PULSE_PER_SOURCE_QUOTE_CAP = 50; // words

/**
 * Count words in a markdown body, excluding code blocks (``` fenced) and
 * the sources footer. The "## Sources" heading and below is stripped.
 *
 * This is intentionally rough — markdown links collapse to their visible
 * text, headings count, etc. The 800-1500 floor/ceiling is a soft target
 * so precision past whole words isn't worth the complexity.
 */
export function countMarkdownWords(body: string): number {
  if (!body) return 0;

  // Strip fenced code blocks.
  let stripped = body.replace(/```[\s\S]*?```/g, " ");

  // Strip the trailing Sources section if present in the body itself
  // (most posts will keep it in `sourcesMarkdown`, but be defensive).
  stripped = stripped.replace(/^##+\s*sources[\s\S]*$/im, "");

  // Replace markdown links with their visible text.
  stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Replace inline code spans with their content.
  stripped = stripped.replace(/`([^`]+)`/g, "$1");

  // Collapse whitespace and split.
  const tokens = stripped
    .replace(/[#*_>~|-]/g, " ")
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t));

  return tokens.length;
}

/**
 * Run all post-level rules and return findings. Caller decides whether
 * `publishBlocking` should hard-fail a state transition.
 */
export function validatePulsePost(input: PostInput): ValidationReport {
  const wordCount = countMarkdownWords(input.body);
  const quotes = input.quotes ?? [];

  const quoteCounts: Record<string, number> = {};
  let quotedWordCount = 0;
  for (const q of quotes) {
    if (!q?.sourceId || typeof q.words !== "number" || q.words <= 0) continue;
    quoteCounts[q.sourceId] = (quoteCounts[q.sourceId] ?? 0) + q.words;
    quotedWordCount += q.words;
  }

  const ratio = quotedWordCount > 0 ? (wordCount - quotedWordCount) / quotedWordCount : null;

  const publishBlocking: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  // ── Block at publish ──

  if (!input.title?.trim()) {
    publishBlocking.push({
      rule: "title.required",
      severity: "error",
      message: "Title is required.",
    });
  }

  if (!input.body?.trim()) {
    publishBlocking.push({
      rule: "body.required",
      severity: "error",
      message: "Body is required.",
    });
  }

  if (!input.sourcesMarkdown?.trim()) {
    publishBlocking.push({
      rule: "sources.required",
      severity: "error",
      message:
        "Sources footer (sourcesMarkdown) is required at publish — Phase 4.0 Rule 5.",
    });
  }

  if (input.editor && input.editor.status === "NOT_READY") {
    publishBlocking.push({
      rule: "editor.notReady",
      severity: "error",
      message:
        "Editor profile is NOT_READY. Complete bio + sameAs links before publishing — Phase 4.0 Rule 1.",
    });
  }
  if (input.editor && input.editor.status === "RETIRED") {
    publishBlocking.push({
      rule: "editor.retired",
      severity: "error",
      message: "Editor is RETIRED. Reassign to a READY editor before publishing.",
    });
  }

  // 50-word per-source cap — Phase 4.0 Rule 3 (fair-use).
  const overCap = Object.entries(quoteCounts).filter(
    ([, words]) => words > PULSE_PER_SOURCE_QUOTE_CAP
  );
  if (overCap.length > 0) {
    publishBlocking.push({
      rule: "quotes.perSourceCap",
      severity: "error",
      message: `Per-source quote cap exceeded (≤${PULSE_PER_SOURCE_QUOTE_CAP} words/source). Sources over cap: ${overCap
        .map(([s, w]) => `${s} (${w}w)`)
        .join(", ")}.`,
      meta: { cap: PULSE_PER_SOURCE_QUOTE_CAP, overCap },
    });
  }

  // 3:1 analysis-to-quotation ratio — Phase 4.0 Rule 2. This is publish-blocking
  // unless the editor has explicitly attested via ratioCheckPassed (the post may
  // legitimately be all-original prose with zero quoted material).
  if (ratio !== null && ratio < PULSE_RATIO_MIN) {
    publishBlocking.push({
      rule: "quotes.ratio",
      severity: "error",
      message: `Original-to-quoted ratio is ${ratio.toFixed(2)}:1. Phase 4.0 Rule 2 requires ≥${PULSE_RATIO_MIN}:1.`,
      meta: { ratio, min: PULSE_RATIO_MIN, wordCount, quotedWordCount },
    });
  }
  if (!input.ratioCheckPassed) {
    publishBlocking.push({
      rule: "ratio.attestation",
      severity: "error",
      message:
        "Editor must attest the 3:1 ratio check (ratioCheckPassed) before publishing.",
    });
  }

  // ── Soft warnings (visible in UI; do not block publish) ──

  if (wordCount > 0 && wordCount < PULSE_WORD_FLOOR) {
    warnings.push({
      rule: "wordCount.floor",
      severity: "warn",
      message: `Word count ${wordCount} below floor of ${PULSE_WORD_FLOOR}. Phase 4.0 Rule 4 — anything shorter reads as filler.`,
      meta: { wordCount, floor: PULSE_WORD_FLOOR },
    });
  }
  if (wordCount > PULSE_WORD_CEILING) {
    warnings.push({
      rule: "wordCount.ceiling",
      severity: "warn",
      message: `Word count ${wordCount} above ceiling of ${PULSE_WORD_CEILING}.`,
      meta: { wordCount, ceiling: PULSE_WORD_CEILING },
    });
  }

  return {
    ok: publishBlocking.length === 0,
    publishBlocking,
    warnings,
    computed: { wordCount, quotedWordCount, quoteCounts, ratio },
  };
}
