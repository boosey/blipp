/**
 * Word Error Rate (WER) calculation using Wagner-Fischer dynamic programming.
 *
 * WER = (substitutions + insertions + deletions) / reference_word_count
 *
 * Uses a rolling 2-row approach to keep memory O(n) instead of O(n*m),
 * since transcripts can be 10k+ words.
 */

/**
 * Normalize text for WER comparison: lowercase, strip punctuation
 * (keeping apostrophes in contractions), collapse whitespace, split to words.
 */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    // Remove punctuation except apostrophes that are between letters (contractions)
    .replace(/(?<![a-z])'|'(?![a-z])/g, "")
    .replace(/[^\w\s']/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
}

/**
 * Calculate Word Error Rate between hypothesis (STT output) and reference
 * (official transcript).
 *
 * Uses the Wagner-Fischer DP algorithm with a rolling 2-row optimization
 * for O(n) memory usage.
 *
 * WER can legitimately exceed 1.0 if the hypothesis has many insertions
 * relative to the reference length, so we do not cap it.
 */
export function calculateWer(
  hypothesis: string,
  reference: string,
): { wer: number; wordCount: number; refWordCount: number } {
  const hypWords = normalizeText(hypothesis);
  const refWords = normalizeText(reference);

  const hypLen = hypWords.length;
  const refLen = refWords.length;

  if (refLen === 0) {
    return { wer: hypLen === 0 ? 0 : 1, wordCount: hypLen, refWordCount: 0 };
  }

  // Rolling 2-row DP: prev and curr represent rows of the edit distance matrix.
  // Rows = reference words (+ 1), Columns = hypothesis words (+ 1).
  // We iterate over reference words (rows) and keep a rolling pair.
  let prev = new Uint32Array(hypLen + 1);
  let curr = new Uint32Array(hypLen + 1);

  // Initialize first row: inserting 0..hypLen hypothesis words with 0 reference words
  for (let j = 0; j <= hypLen; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= refLen; i++) {
    curr[0] = i; // deleting i reference words with 0 hypothesis words
    for (let j = 1; j <= hypLen; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(
          prev[j - 1], // substitution
          prev[j],     // deletion (reference word not in hypothesis)
          curr[j - 1], // insertion (extra word in hypothesis)
        );
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  // After the loop, result is in prev[hypLen] (due to the swap)
  const editDistance = prev[hypLen];
  const wer = editDistance / refLen;

  return { wer, wordCount: hypLen, refWordCount: refLen };
}
