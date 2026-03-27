/**
 * Pre-WER transcript normalization.
 *
 * Applied to both ref and hyp word arrays AFTER basic normalizeText()
 * (lowercase, strip punctuation) but BEFORE alignment + WER scoring.
 *
 * 1. Numbers → word form (digits to spoken English)
 * 2. Compound words (hyp adjusted to match ref word boundaries)
 * 3. Spelling correction (close edit-distance words unified)
 */

// ── Number-to-words ──

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

const ORDINAL_SUFFIXED: Record<string, string> = {
  "1st": "first", "2nd": "second", "3rd": "third",
  "4th": "fourth", "5th": "fifth", "6th": "sixth",
  "7th": "seventh", "8th": "eighth", "9th": "ninth",
  "10th": "tenth", "11th": "eleventh", "12th": "twelfth",
  "13th": "thirteenth", "14th": "fourteenth", "15th": "fifteenth",
  "16th": "sixteenth", "17th": "seventeenth", "18th": "eighteenth",
  "19th": "nineteenth", "20th": "twentieth", "21st": "twenty first",
  "30th": "thirtieth", "31st": "thirty first",
};

function smallNumberToWords(n: number): string {
  if (n < 0) return "negative " + smallNumberToWords(-n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t} ${ONES[o]}` : t;
  }
  if (n < 1000) {
    const h = ONES[Math.floor(n / 100)] + " hundred";
    const rem = n % 100;
    return rem ? `${h} ${smallNumberToWords(rem)}` : h;
  }
  return "";
}

/**
 * Convert an integer to spoken English words.
 * Uses "year form" for 4-digit numbers that look like years (1100-2099).
 */
export function intToWords(n: number): string {
  if (n === 0) return "zero";

  // Year-style: "nineteen hundred", "twenty twenty six"
  if (n >= 1100 && n <= 2099 && Number.isInteger(n)) {
    const hi = Math.floor(n / 100);
    const lo = n % 100;
    if (n >= 2000 && n <= 2009) {
      return lo === 0 ? "two thousand" : `two thousand ${ONES[lo]}`;
    }
    if (n >= 2010 && n <= 2099) {
      return `twenty ${smallNumberToWords(lo)}`;
    }
    // 1100-1999: "eleven hundred" through "nineteen ninety nine"
    const hiWords = smallNumberToWords(hi);
    return lo === 0 ? `${hiWords} hundred` : `${hiWords} ${smallNumberToWords(lo)}`;
  }

  // General form
  if (n < 1000) return smallNumberToWords(n);

  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    const t = smallNumberToWords(thousands) + " thousand";
    return rem ? `${t} ${smallNumberToWords(rem)}` : t;
  }

  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rem = n % 1_000_000;
    const m = smallNumberToWords(millions) + " million";
    return rem ? `${m} ${intToWords(rem)}` : m;
  }

  // Fallback: leave large numbers as-is (rare in podcasts)
  return String(n);
}

/**
 * Convert a single word token that may contain digits into word form.
 * Returns an array of words (since "1900" → ["nineteen", "hundred"]).
 */
function convertToken(token: string): string[] {
  // Ordinals: 1st, 2nd, 3rd, etc.
  const ordLower = token.toLowerCase();
  if (ORDINAL_SUFFIXED[ordLower]) {
    return ORDINAL_SUFFIXED[ordLower].split(" ");
  }
  // General ordinal: <digits>th/st/nd/rd
  const ordMatch = ordLower.match(/^(\d+)(st|nd|rd|th)$/);
  if (ordMatch) {
    const n = parseInt(ordMatch[1], 10);
    if (!isNaN(n) && n < 1_000_000) {
      return intToWords(n).split(" ");
    }
  }

  // Pure integer
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10);
    if (!isNaN(n) && n < 1_000_000_000) {
      return intToWords(n).split(" ");
    }
  }

  // Decimal: 3.5 → "three point five"
  const decMatch = token.match(/^(\d+)\.(\d+)$/);
  if (decMatch) {
    const whole = parseInt(decMatch[1], 10);
    const fracDigits = decMatch[2];
    if (!isNaN(whole) && whole < 1_000_000_000) {
      const wholeWords = whole === 0 ? "zero" : intToWords(whole);
      // Read decimal digits individually: 3.14 → "three point one four"
      const fracWords = fracDigits.split("").map((d) => ONES[parseInt(d, 10)] || d);
      return [...wholeWords.split(" "), "point", ...fracWords];
    }
  }

  // Not a number
  return [token];
}

/**
 * Expand all digit tokens in a word array to their word forms.
 */
export function expandNumbers(words: string[]): string[] {
  const result: string[] = [];
  for (const w of words) {
    result.push(...convertToken(w));
  }
  return result.filter((w) => w.length > 0);
}

// ── Compound word normalization ──

/**
 * Adjust hypothesis word boundaries to match reference.
 * - If ref has "curbside" and hyp has "curb" + "side", merge them in hyp.
 * - If ref has "curb" + "side" and hyp has "curbside", split it in hyp.
 * Reference is the authority for word boundaries.
 */
export function normalizeCompounds(
  refWords: string[],
  hypWords: string[],
): string[] {
  const refSet = new Set(refWords);
  // Build set of consecutive ref bigrams as joined strings
  const refBigrams = new Set<string>();
  for (let i = 0; i < refWords.length - 1; i++) {
    refBigrams.add(refWords[i] + refWords[i + 1]);
  }

  const result: string[] = [];
  let i = 0;
  while (i < hypWords.length) {
    // Try merge: hyp[i]+hyp[i+1] matches a ref word?
    if (i + 1 < hypWords.length) {
      const merged = hypWords[i] + hypWords[i + 1];
      if (refSet.has(merged) && !refSet.has(hypWords[i])) {
        result.push(merged);
        i += 2;
        continue;
      }
    }

    // Try split: hyp[i] can be split into two consecutive ref words?
    if (hypWords[i].length >= 4 && !refSet.has(hypWords[i])) {
      let split = false;
      for (let k = 2; k < hypWords[i].length - 1; k++) {
        const left = hypWords[i].slice(0, k);
        const right = hypWords[i].slice(k);
        if (refBigrams.has(hypWords[i]) && refSet.has(left) && refSet.has(right)) {
          result.push(left, right);
          split = true;
          break;
        }
      }
      if (split) { i++; continue; }
    }

    result.push(hypWords[i]);
    i++;
  }

  return result;
}

// ── Spelling correction ──

/**
 * Levenshtein edit distance between two strings.
 */
function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

/**
 * For each hypothesis word not found in the reference vocabulary,
 * find the closest reference word by edit distance. If within threshold,
 * replace the hypothesis word. Reference is the authority.
 */
export function correctSpelling(
  refWords: string[],
  hypWords: string[],
): string[] {
  // Build ref vocabulary with frequency for tie-breaking
  const refVocab = new Map<string, number>();
  for (const w of refWords) {
    refVocab.set(w, (refVocab.get(w) || 0) + 1);
  }
  const refSet = new Set(refWords);

  // Cache corrections to avoid redundant distance computations
  const correctionCache = new Map<string, string>();

  return hypWords.map((w) => {
    if (refSet.has(w)) return w; // already matches
    if (w.length < 4) return w;  // too short — high false-positive risk

    if (correctionCache.has(w)) return correctionCache.get(w)!;

    // Max edit distance scales with word length
    const maxDist = w.length <= 5 ? 1 : 2;

    let bestWord = w;
    let bestDist = maxDist + 1;
    let bestFreq = 0;

    for (const [refWord, freq] of refVocab) {
      // Quick length filter
      if (Math.abs(refWord.length - w.length) > maxDist) continue;

      const d = editDistance(w, refWord);
      if (d < bestDist || (d === bestDist && freq > bestFreq)) {
        bestDist = d;
        bestWord = refWord;
        bestFreq = freq;
      }
    }

    correctionCache.set(w, bestWord);
    return bestWord;
  });
}

// ── Main entry point ──

/**
 * Apply all pre-WER normalizations to both transcripts.
 * Returns normalized word arrays ready for alignment + WER.
 *
 * Order:
 * 1. Expand numbers to word form (both)
 * 2. Normalize compound words (hyp adjusted to ref boundaries)
 * 3. Correct spelling (hyp adjusted toward ref vocabulary)
 */
export function preWerNormalize(
  refWords: string[],
  hypWords: string[],
): { normalizedRef: string[]; normalizedHyp: string[] } {
  // 1. Numbers → words
  const refExpanded = expandNumbers(refWords);
  let hypExpanded = expandNumbers(hypWords);

  // 2. Compound words (hyp → ref boundaries)
  hypExpanded = normalizeCompounds(refExpanded, hypExpanded);

  // 3. Spelling correction (hyp → ref vocabulary)
  hypExpanded = correctSpelling(refExpanded, hypExpanded);

  return { normalizedRef: refExpanded, normalizedHyp: hypExpanded };
}
