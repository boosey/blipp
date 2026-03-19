import { describe, it, expect, vi } from "vitest";
import {
  cosineSimilarityVec,
  averageEmbeddings,
  buildEmbeddingText,
  computeEmbedding,
} from "../embeddings";

describe("cosineSimilarityVec", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarityVec(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarityVec([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns null for mismatched dimensions", () => {
    expect(cosineSimilarityVec([1, 2], [1, 2, 3])).toBeNull();
  });

  it("returns null for empty arrays", () => {
    expect(cosineSimilarityVec([], [])).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(cosineSimilarityVec(null as any, [1, 2])).toBeNull();
    expect(cosineSimilarityVec([1, 2], null as any)).toBeNull();
  });
});

describe("averageEmbeddings", () => {
  it("computes element-wise mean for multiple embeddings", () => {
    const result = averageEmbeddings([
      [1, 2, 3],
      [3, 4, 5],
    ]);
    expect(result).toEqual([2, 3, 4]);
  });

  it("returns null for empty array", () => {
    expect(averageEmbeddings([])).toBeNull();
  });

  it("returns the embedding itself for a single input", () => {
    const v = [0.5, 0.6, 0.7];
    expect(averageEmbeddings([v])).toEqual(v);
  });
});

describe("buildEmbeddingText", () => {
  it("combines title, description, and topics", () => {
    const result = buildEmbeddingText("My Title", "My description", [
      "tech",
      "ai",
    ]);
    expect(result).toBe("My Title My description tech ai");
  });

  it("handles null description", () => {
    const result = buildEmbeddingText("Title", null, ["topic"]);
    expect(result).toBe("Title topic");
  });

  it("truncates to 512 characters", () => {
    const longTitle = "x".repeat(600);
    const result = buildEmbeddingText(longTitle, null, []);
    expect(result.length).toBe(512);
  });
});

describe("computeEmbedding", () => {
  it("returns 768-dim embedding on success", async () => {
    const embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
    const ai = {
      run: vi.fn().mockResolvedValue({ data: [embedding] }),
    };
    const result = await computeEmbedding(ai as any, "test text");
    expect(result).toEqual(embedding);
    expect(ai.run).toHaveBeenCalledWith("@cf/baai/bge-base-en-v1.5", {
      text: ["test text"],
    });
  });

  it("returns null on failure", async () => {
    const ai = {
      run: vi.fn().mockRejectedValue(new Error("AI failed")),
    };
    const result = await computeEmbedding(ai as any, "test text");
    expect(result).toBeNull();
  });
});
