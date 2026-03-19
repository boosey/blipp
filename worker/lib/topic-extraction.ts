import type { Claim } from "./distillation";

export interface WeightedTopic {
  topic: string;
  weight: number;
}

const MAX_TOPICS = 20;
const MIN_TOKEN_LENGTH = 3;

// Common English stopwords to filter out
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "its", "as", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "shall",
  "can", "this", "that", "these", "those", "not", "no", "nor", "so",
  "if", "then", "than", "too", "very", "just", "about", "above", "after",
  "again", "all", "also", "am", "any", "because", "before", "between",
  "both", "each", "few", "further", "get", "got", "here", "how", "into",
  "more", "most", "much", "must", "my", "new", "now", "only", "other",
  "our", "out", "own", "same", "she", "some", "such", "there", "they",
  "through", "under", "until", "up", "us", "we", "what", "when", "where",
  "which", "while", "who", "whom", "why", "you", "your", "he", "her",
  "him", "his", "me", "over", "down", "off", "once", "during", "every",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

function extractBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/**
 * Extract weighted topics from podcast episode claims.
 * Tokenizes claim text, filters stopwords, extracts unigrams + bigrams,
 * weights by claim importance, and returns top 20 topics.
 */
export function extractTopicsFromClaims(claims: Claim[]): WeightedTopic[] {
  if (claims.length === 0) return [];

  const weights = new Map<string, number>();

  for (const claim of claims) {
    const importance = claim.importance || 1;
    const tokens = tokenize(claim.claim);

    // Accumulate unigram weights
    for (const token of tokens) {
      weights.set(token, (weights.get(token) || 0) + importance);
    }

    // Accumulate bigram weights (slightly higher to prefer phrases)
    const bigrams = extractBigrams(tokens);
    for (const bigram of bigrams) {
      weights.set(bigram, (weights.get(bigram) || 0) + importance * 1.5);
    }
  }

  // Sort by weight descending and take top N
  const sorted = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOPICS);

  return sorted.map(([topic, weight]) => ({ topic, weight }));
}

/**
 * Normalize topics: lowercase, collapse hyphens to spaces, deduplicate.
 */
export function normalizeTopics(topics: WeightedTopic[]): WeightedTopic[] {
  const merged = new Map<string, number>();

  for (const { topic, weight } of topics) {
    const normalized = topic.toLowerCase().replace(/-/g, " ").trim();
    if (normalized.length === 0) continue;
    merged.set(normalized, (merged.get(normalized) || 0) + weight);
  }

  return [...merged.entries()]
    .map(([topic, weight]) => ({ topic, weight }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Full pipeline: extract topics from claims, then normalize.
 */
export function fingerprint(claims: Claim[]): WeightedTopic[] {
  if (claims.length === 0) return [];
  const raw = extractTopicsFromClaims(claims);
  return normalizeTopics(raw);
}
