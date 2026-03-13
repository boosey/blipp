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

export type AlignOp =
  | { op: "match"; hypIdx: number; refIdx: number }
  | { op: "substitute"; hypIdx: number; refIdx: number }
  | { op: "insert"; hypIdx: number }
  | { op: "delete"; refIdx: number };

/**
 * Hirschberg's algorithm: compute the optimal word-level alignment between
 * hypothesis and reference word arrays, using O(min(n,m)) memory.
 *
 * Returns an array of edit operations in order.
 */
export function hirschbergAlign(
  hyp: string[],
  ref: string[],
): AlignOp[] {
  return hirschbergRecurse(hyp, 0, ref, 0);
}

function hirschbergRecurse(
  hyp: string[],
  hypOffset: number,
  ref: string[],
  refOffset: number,
): AlignOp[] {
  const n = hyp.length;
  const m = ref.length;

  // Base cases
  if (n === 0) {
    return ref.map((_, i) => ({ op: "delete" as const, refIdx: refOffset + i }));
  }
  if (m === 0) {
    return hyp.map((_, i) => ({ op: "insert" as const, hypIdx: hypOffset + i }));
  }
  if (n === 1) {
    return alignSingleHyp(hyp[0], hypOffset, ref, refOffset);
  }
  if (m === 1) {
    return alignSingleRef(hyp, hypOffset, ref[0], refOffset);
  }

  // Divide: split hypothesis in half
  const mid = Math.floor(n / 2);
  const hypLeft = hyp.slice(0, mid);
  const hypRight = hyp.slice(mid);

  // Forward pass: last row of NW score for hyp[0..mid] vs ref[0..m]
  const scoreL = nwLastRow(hypLeft, ref);
  // Reverse pass: last row of NW score for hyp[mid..n] reversed vs ref reversed
  const scoreR = nwLastRow([...hypRight].reverse(), [...ref].reverse());

  // Find optimal split point on reference
  let best = -1;
  let bestScore = Infinity;
  for (let j = 0; j <= m; j++) {
    const total = scoreL[j] + scoreR[m - j];
    if (total < bestScore) {
      bestScore = total;
      best = j;
    }
  }

  // Conquer: recurse on each half
  const left = hirschbergRecurse(hypLeft, hypOffset, ref.slice(0, best), refOffset);
  const right = hirschbergRecurse(hypRight, hypOffset + mid, ref.slice(best), refOffset + best);

  return left.concat(right);
}

/** Compute the last row of the Needleman-Wunsch distance matrix. O(m) space. */
function nwLastRow(hyp: string[], ref: string[]): Uint32Array {
  const m = ref.length;
  let prev = new Uint32Array(m + 1);
  let curr = new Uint32Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 0; i < hyp.length; i++) {
    curr[0] = i + 1;
    for (let j = 1; j <= m; j++) {
      const cost = hyp[i] === ref[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j - 1] + cost,  // match/substitute
        prev[j] + 1,         // deletion
        curr[j - 1] + 1,     // insertion
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev;
}

/** Align a single hypothesis word against the full reference. */
function alignSingleHyp(
  word: string,
  hypOffset: number,
  ref: string[],
  refOffset: number,
): AlignOp[] {
  const ops: AlignOp[] = [];
  const matchIdx = ref.indexOf(word);

  if (matchIdx === -1) {
    // No match — substitute first ref word, delete rest
    ops.push({ op: "substitute", hypIdx: hypOffset, refIdx: refOffset });
    for (let i = 1; i < ref.length; i++) {
      ops.push({ op: "delete", refIdx: refOffset + i });
    }
  } else {
    for (let i = 0; i < matchIdx; i++) {
      ops.push({ op: "delete", refIdx: refOffset + i });
    }
    ops.push({ op: "match", hypIdx: hypOffset, refIdx: refOffset + matchIdx });
    for (let i = matchIdx + 1; i < ref.length; i++) {
      ops.push({ op: "delete", refIdx: refOffset + i });
    }
  }
  return ops;
}

/** Align the full hypothesis against a single reference word. */
function alignSingleRef(
  hyp: string[],
  hypOffset: number,
  word: string,
  refOffset: number,
): AlignOp[] {
  const ops: AlignOp[] = [];
  const matchIdx = hyp.indexOf(word);

  if (matchIdx === -1) {
    ops.push({ op: "substitute", hypIdx: hypOffset, refIdx: refOffset });
    for (let i = 1; i < hyp.length; i++) {
      ops.push({ op: "insert", hypIdx: hypOffset + i });
    }
  } else {
    for (let i = 0; i < matchIdx; i++) {
      ops.push({ op: "insert", hypIdx: hypOffset + i });
    }
    ops.push({ op: "match", hypIdx: hypOffset + matchIdx, refIdx: refOffset });
    for (let i = matchIdx + 1; i < hyp.length; i++) {
      ops.push({ op: "insert", hypIdx: hypOffset + i });
    }
  }
  return ops;
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
