/**
 * Embedding utilities for episode recommendations.
 * Uses Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5) for 768-dim embeddings.
 */

export function cosineSimilarityVec(
  a: number[] | null,
  b: number[] | null
): number | null {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return null;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return null;
  return dot / denom;
}

export function averageEmbeddings(
  embeddings: number[][]
): number[] | null {
  if (embeddings.length === 0) return null;
  if (embeddings.length === 1) return embeddings[0];

  const dim = embeddings[0].length;
  const sum = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i];
    }
  }
  return sum.map((v) => v / embeddings.length);
}

export function buildEmbeddingText(
  title: string,
  description: string | null,
  topics: string[]
): string {
  const parts = [title];
  if (description) parts.push(description);
  parts.push(...topics);
  const joined = parts.join(" ");
  return joined.length > 512 ? joined.slice(0, 512) : joined;
}

export async function computeEmbedding(
  ai: Ai,
  text: string
): Promise<number[] | null> {
  try {
    const result = await ai.run("@cf/baai/bge-base-en-v1.5" as any, {
      text: [text],
    });
    return (result as any).data[0];
  } catch {
    return null;
  }
}
