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
    // Strip HTML/XML tags (speaker labels, timestamps, etc.)
    .replace(/<[^>]*>/g, " ")
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
 * Remove large contiguous blocks of inserted words (ads, intros, outros)
 * from the hypothesis before WER calculation.
 *
 * Uses Hirschberg alignment to find the optimal word mapping, then
 * identifies runs of consecutive insertions (hypothesis words with no
 * reference match) that exceed `minBlockSize` words. Those runs are
 * stripped from the hypothesis.
 *
 * @param hypWords  Normalized hypothesis word array
 * @param refWords  Normalized reference word array
 * @param minBlockSize  Minimum consecutive insertion words to strip (default 50)
 * @returns Cleaned hypothesis word array with large insertion blocks removed
 */
export function stripInsertionBlocks(
  hypWords: string[],
  refWords: string[],
  minBlockSize: number = 50,
): string[] {
  if (hypWords.length === 0 || refWords.length === 0) return hypWords;

  const ops = hirschbergAlign(hypWords, refWords);

  // Collect indices of hypothesis words that are insertions
  const insertionIndices = new Set<number>();
  let run: number[] = [];

  for (const op of ops) {
    if (op.op === "insert") {
      run.push(op.hypIdx);
    } else {
      if (run.length >= minBlockSize) {
        for (const idx of run) insertionIndices.add(idx);
      }
      run = [];
    }
  }
  // Handle trailing run
  if (run.length >= minBlockSize) {
    for (const idx of run) insertionIndices.add(idx);
  }

  return hypWords.filter((_, i) => !insertionIndices.has(i));
}

/**
 * Fuzzy sliding-window search: find the position in `corpus` where `anchor`
 * has the highest word overlap. Uses bag-of-words (multiset) scoring so that
 * word-count differences (e.g. spelled-out numbers vs digits) don't break
 * alignment.
 *
 * Returns the index in `corpus` where the best match starts.
 */
export function fuzzyFindAnchor(
  anchor: string[],
  corpus: string[],
  searchStart: number = 0,
  searchEnd: number = corpus.length,
  preferLast: boolean = false,
): { position: number; score: number } {
  const len = anchor.length;
  if (len === 0) return { position: searchStart, score: 0 };

  const end = Math.min(searchEnd, corpus.length);
  const start = Math.max(0, searchStart);

  // Build anchor word bag (multiset)
  const anchorBag = new Map<string, number>();
  for (const word of anchor) {
    anchorBag.set(word, (anchorBag.get(word) || 0) + 1);
  }

  if (end - start < len) {
    // Search range smaller than anchor — score with bag overlap
    const windowBag = new Map<string, number>();
    for (let j = start; j < end; j++) {
      windowBag.set(corpus[j], (windowBag.get(corpus[j]) || 0) + 1);
    }
    let matches = 0;
    for (const [word, needed] of anchorBag) {
      matches += Math.min(needed, windowBag.get(word) || 0);
    }
    return { position: start, score: matches / len };
  }

  // Sliding window with bag-of-words scoring.
  // Track how many anchor words are satisfied by the current window.
  const windowBag = new Map<string, number>();
  let currentMatches = 0;

  const addWord = (word: string) => {
    const cnt = (windowBag.get(word) || 0) + 1;
    windowBag.set(word, cnt);
    const needed = anchorBag.get(word) || 0;
    if (needed > 0 && cnt <= needed) currentMatches++;
  };

  const removeWord = (word: string) => {
    const cnt = windowBag.get(word)!;
    const needed = anchorBag.get(word) || 0;
    if (needed > 0 && cnt <= needed) currentMatches--;
    if (cnt === 1) windowBag.delete(word);
    else windowBag.set(word, cnt - 1);
  };

  // Initialize first window
  for (let j = start; j < start + len; j++) {
    addWord(corpus[j]);
  }

  let bestPos = start;
  let bestMatches = currentMatches;

  if (bestMatches === len) {
    return { position: bestPos, score: 1 };
  }

  // Slide window one word at a time.
  // When preferLast is true, ties prefer the rightmost position (useful for
  // start-anchor search to skip past trailing ad words at the boundary).
  for (let i = start + 1; i <= end - len; i++) {
    removeWord(corpus[i - 1]);
    addWord(corpus[i + len - 1]);
    const dominated = preferLast
      ? currentMatches >= bestMatches
      : currentMatches > bestMatches;
    if (dominated) {
      bestMatches = currentMatches;
      bestPos = i;
      if (bestMatches === len && !preferLast) break;
    }
  }

  return { position: bestPos, score: bestMatches / len };
}

/**
 * Align hypothesis and reference transcripts to the same content window.
 *
 * Problem: hypothesis covers ~15 min of audio (possibly with leading ads),
 * reference covers the full episode. We need to find the overlapping window.
 *
 * Strategy:
 * - START: Take first `anchorSize` words of REFERENCE, find in HYPOTHESIS.
 *   This skips any leading ads in the audio that aren't in the official transcript.
 * - END: Take last `anchorSize` words of HYPOTHESIS, find in REFERENCE.
 *   This finds where the transcribed audio ends in the reference.
 *
 * Returns trimmed hypothesis and reference covering the same content span.
 */
export function alignTranscriptWindow(
  hypWords: string[],
  refWords: string[],
  anchorSize: number = 25,
): { trimmedHyp: string[]; trimmedRef: string[] } {
  // Minimum words needed to form a meaningful anchor
  const MIN_ANCHOR = 8;

  // If either input is too small for even a minimal anchor, skip alignment
  if (hypWords.length < MIN_ANCHOR || refWords.length < MIN_ANCHOR) {
    return { trimmedHyp: hypWords, trimmedRef: refWords };
  }

  // Adapt anchor size to available data — use the requested size but cap to
  // half of the shorter input so the anchor doesn't consume the whole text.
  const effectiveAnchor = Math.min(
    anchorSize,
    Math.floor(refWords.length / 2),
    Math.floor(hypWords.length / 2),
  );

  // If adapted anchor is too small, skip — not enough signal for reliable matching
  if (effectiveAnchor < MIN_ANCHOR) {
    return { trimmedHyp: hypWords, trimmedRef: refWords };
  }

  // --- START: find where reference content begins in hypothesis ---
  // Take first `effectiveAnchor` words of reference, search in hypothesis
  const startAnchor = refWords.slice(0, effectiveAnchor);
  // Search the full hypothesis — bag-of-words scoring on distinctive words
  // makes false positives negligible, and short transcripts with long pre-roll
  // ads can have content starting well past 50%.
  const startSearchEnd = hypWords.length;
  const startResult = fuzzyFindAnchor(startAnchor, hypWords, 0, startSearchEnd, true);

  // Only trim if we found a reasonable match (>40% overlap)
  const hypStart = startResult.score > 0.4 ? startResult.position : 0;

  // --- END: find where hypothesis content ends in reference ---
  // Take last `effectiveAnchor` words of hypothesis, search in reference
  const trimmedHypForEnd = hypWords.slice(hypStart);
  const endAnchor = trimmedHypForEnd.slice(-effectiveAnchor);
  // Search from the middle of reference onward (end should be in the second portion)
  const endSearchStart = Math.max(0, Math.floor(refWords.length * 0.1));
  const endResult = fuzzyFindAnchor(endAnchor, refWords, endSearchStart, refWords.length);

  // Reference ends at the end of the matched anchor
  const refEnd = endResult.score > 0.4
    ? Math.min(refWords.length, endResult.position + effectiveAnchor)
    : refWords.length;

  return {
    trimmedHyp: hypWords.slice(hypStart),
    trimmedRef: refWords.slice(0, refEnd),
  };
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
