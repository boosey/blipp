/**
 * Pre-TTS text normalization.
 *
 * Applies deterministic, conservative transformations so the TTS engine
 * pronounces numbers, abbreviations, and acronyms naturally. Only handles
 * high-confidence, unambiguous patterns — the narrative LLM prompt is the
 * primary defence; this is the safety net.
 */

// ---------------------------------------------------------------------------
// Abbreviation dictionary — common shorthand that TTS reads letter-by-letter
// ---------------------------------------------------------------------------

const ABBREVIATIONS: Record<string, string> = {
  // Time
  yrs: "years",
  yr: "year",
  hrs: "hours",
  hr: "hour",
  mins: "minutes",
  min: "minutes",
  secs: "seconds",
  sec: "seconds",
  mo: "month",
  mos: "months",
  wk: "week",
  wks: "weeks",

  // Measurement
  ft: "feet",
  lbs: "pounds",
  lb: "pound",
  oz: "ounces",
  km: "kilometers",
  mph: "miles per hour",
  kph: "kilometers per hour",

  // General
  govt: "government",
  approx: "approximately",
  dept: "department",
  est: "established",
  avg: "average",
  mgmt: "management",
  info: "information",
  tech: "technology",
  dev: "development",
  devs: "developers",
  env: "environment",
  orig: "original",
  prev: "previous",
  vs: "versus",
};

// Pre-compile: match whole words, case-insensitive, preserve original casing context
const abbrPattern = new RegExp(
  `\\b(${Object.keys(ABBREVIATIONS).join("|")})\\b(?![-/])`,
  "gi"
);

// ---------------------------------------------------------------------------
// Decade numbers — "1960s" → "nineteen sixties", "90s" → "nineties"
// ---------------------------------------------------------------------------

const DECADE_WORDS: Record<string, string> = {
  "0": "hundreds",
  "10": "tens",
  "20": "twenties",
  "30": "thirties",
  "40": "forties",
  "50": "fifties",
  "60": "sixties",
  "70": "seventies",
  "80": "eighties",
  "90": "nineties",
};

const CENTURY_PREFIXES: Record<string, string> = {
  "18": "eighteen",
  "19": "nineteen",
  "20": "twenty",
  "21": "twenty-one",
};

// "1960s" "1850s" "2020s" — four-digit decades
function expandFullDecade(match: string, century: string, decade: string): string {
  const prefix = CENTURY_PREFIXES[century];
  const suffix = DECADE_WORDS[decade];
  if (!prefix || !suffix) return match; // unknown century — leave alone
  return `the ${prefix} ${suffix}`;
}

// "90s" "60s" — two-digit decades (with optional apostrophe: '90s)
function expandShortDecade(match: string, decade: string): string {
  const suffix = DECADE_WORDS[decade];
  if (!suffix) return match;
  return `the ${suffix}`;
}

// ---------------------------------------------------------------------------
// Ordinal numbers — "21st" → "twenty-first"
// ---------------------------------------------------------------------------

const ORDINAL_ONES: Record<string, string> = {
  "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth",
  "6": "sixth", "7": "seventh", "8": "eighth", "9": "ninth",
};

const ORDINAL_TEENS: Record<string, string> = {
  "10": "tenth", "11": "eleventh", "12": "twelfth", "13": "thirteenth",
  "14": "fourteenth", "15": "fifteenth", "16": "sixteenth", "17": "seventeenth",
  "18": "eighteenth", "19": "nineteenth",
};

const ORDINAL_TENS: Record<string, string> = {
  "2": "twenty", "3": "thirty", "4": "forty", "5": "fifty",
  "6": "sixty", "7": "seventy", "8": "eighty", "9": "ninety",
};

function numberToOrdinal(n: number): string | null {
  if (n < 1 || n > 99 || !Number.isInteger(n)) return null;

  if (n < 10) return ORDINAL_ONES[String(n)] ?? null;
  if (n < 20) return ORDINAL_TEENS[String(n)] ?? null;

  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensWord = ORDINAL_TENS[String(tens)];
  if (!tensWord) return null;

  if (ones === 0) {
    // "20th" → "twentieth" — replace trailing "y" with "ieth"
    return tensWord.replace(/y$/, "ieth");
  }
  return `${tensWord}-${ORDINAL_ONES[String(ones)]}`;
}

// ---------------------------------------------------------------------------
// Dollar shorthand — "$1.5M" → "1.5 million dollars"
// ---------------------------------------------------------------------------

const MAGNITUDE_WORDS: Record<string, string> = {
  K: "thousand",
  k: "thousand",
  M: "million",
  B: "billion",
  T: "trillion",
};

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeForTts(text: string): string {
  let result = text;

  // 1. Expand abbreviations (whole-word only)
  result = result.replace(abbrPattern, (match) => {
    const replacement = ABBREVIATIONS[match.toLowerCase()];
    return replacement ?? match;
  });

  // 2. Four-digit decades: "1960s" → "the nineteen sixties"
  //    Only match decades (ending in 0s) from known centuries
  result = result.replace(/\b(1[89]|2[01])(\d0)s\b/g, expandFullDecade);

  // 3. Two-digit decades: "'90s" or "90s" → "the nineties"
  result = result.replace(/(?:^|(?<=\s))['']?(\d0)s\b/g, expandShortDecade);

  // 4. Hyphenated acronyms: "SDF-Alpha" → "SDF Alpha"
  //    Only when left side is all-caps (2+ letters) to avoid breaking normal hyphenation
  result = result.replace(/\b([A-Z]{2,})[-–—]/g, "$1 ");

  // 5. Dollar/currency shorthand: "$1.5M" → "1.5 million dollars"
  result = result.replace(
    /\$(\d+(?:\.\d+)?)\s?([KkMBT])\b/g,
    (_match, amount: string, mag: string) => {
      const word = MAGNITUDE_WORDS[mag];
      return word ? `${amount} ${word} dollars` : _match;
    }
  );

  // 6. Bare percent: "50%" → "50 percent"
  result = result.replace(/(\d)%/g, "$1 percent");

  // 7. Ordinals (1st–99th) → words. Conservative: only 1–99.
  result = result.replace(
    /\b(\d{1,2})(st|nd|rd|th)\b/g,
    (match, numStr: string) => {
      const word = numberToOrdinal(parseInt(numStr, 10));
      return word ?? match;
    }
  );

  // 8. "+" between words/numbers: "50+ countries" → "50 plus countries"
  result = result.replace(/(\d)\+(\s)/g, "$1 plus$2");

  // 9. Ampersand: "R&D" is fine for TTS, but "news & politics" should be "and"
  //    Only replace ampersand when surrounded by spaces (not inside acronyms)
  result = result.replace(/\s&\s/g, " and ");

  return result;
}
