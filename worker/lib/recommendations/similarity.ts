export interface CategoryWeights {
  [category: string]: number;
}

// Cosine similarity between two category weight objects
export function cosineSimilarity(a: CategoryWeights, b: CategoryWeights): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const key of keys) {
    const va = a[key] || 0;
    const vb = b[key] || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Jaccard similarity between two string arrays
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Compute Jaccard overlap between a candidate podcast's subscribers and the user's co-subscribers. */
export function subscriberOverlap(
  candidateSubscribers: Set<string>,
  userSubscribedPodcastIds: string[],
  subscriberSets: Map<string, Set<string>>,
): number {
  if (candidateSubscribers.size === 0 || userSubscribedPodcastIds.length === 0) return 0;
  // Union of all subscribers across user's subscribed podcasts
  const userCoSubscribers = new Set<string>();
  for (const pid of userSubscribedPodcastIds) {
    const subs = subscriberSets.get(pid);
    if (subs) for (const uid of subs) userCoSubscribers.add(uid);
  }
  if (userCoSubscribers.size === 0) return 0;
  // Jaccard: |intersection| / |union|
  let intersection = 0;
  for (const uid of candidateSubscribers) {
    if (userCoSubscribers.has(uid)) intersection++;
  }
  const union = new Set([...candidateSubscribers, ...userCoSubscribers]).size;
  return union > 0 ? intersection / union : 0;
}
