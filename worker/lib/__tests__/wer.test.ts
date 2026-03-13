import { describe, it, expect } from "vitest";
import { hirschbergAlign, normalizeText } from "../wer";

describe("hirschbergAlign", () => {
  it("returns all matches for identical sequences", () => {
    const words = ["the", "cat", "sat"];
    const ops = hirschbergAlign(words, words);
    expect(ops).toEqual([
      { op: "match", hypIdx: 0, refIdx: 0 },
      { op: "match", hypIdx: 1, refIdx: 1 },
      { op: "match", hypIdx: 2, refIdx: 2 },
    ]);
  });

  it("returns all insertions when reference is empty", () => {
    const ops = hirschbergAlign(["ad", "words"], []);
    expect(ops).toEqual([
      { op: "insert", hypIdx: 0 },
      { op: "insert", hypIdx: 1 },
    ]);
  });

  it("returns all deletions when hypothesis is empty", () => {
    const ops = hirschbergAlign([], ["ref", "words"]);
    expect(ops).toEqual([
      { op: "delete", refIdx: 0 },
      { op: "delete", refIdx: 1 },
    ]);
  });

  it("detects insertion block at start (ad prefix)", () => {
    const hyp = ["buy", "our", "product", "the", "cat", "sat"];
    const ref = ["the", "cat", "sat"];
    const ops = hirschbergAlign(hyp, ref);

    const insertions = ops.filter((o) => o.op === "insert");
    const matches = ops.filter((o) => o.op === "match");
    expect(insertions.length).toBe(3); // "buy our product"
    expect(matches.length).toBe(3); // "the cat sat"
  });

  it("detects insertion block in the middle", () => {
    const hyp = ["the", "cat", "buy", "now", "today", "sat", "down"];
    const ref = ["the", "cat", "sat", "down"];
    const ops = hirschbergAlign(hyp, ref);

    const insertions = ops.filter((o) => o.op === "insert");
    expect(insertions.length).toBe(3); // "buy now today"
  });

  it("handles substitutions", () => {
    const hyp = ["the", "dog", "sat"];
    const ref = ["the", "cat", "sat"];
    const ops = hirschbergAlign(hyp, ref);
    expect(ops[1]).toEqual({ op: "substitute", hypIdx: 1, refIdx: 1 });
  });
});
