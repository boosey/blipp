import { describe, it, expect } from "vitest";
import { hirschbergAlign, normalizeText, stripInsertionBlocks } from "../wer";

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

describe("stripInsertionBlocks", () => {
  it("strips a large insertion block at the start (ad prefix)", () => {
    const adWords = Array.from({ length: 60 }, (_, i) => `ad${i}`);
    const contentWords = ["the", "cat", "sat", "on", "the", "mat"];
    const hyp = [...adWords, ...contentWords];
    const ref = [...contentWords];

    const cleaned = stripInsertionBlocks(hyp, ref, 50);
    expect(cleaned).toEqual(contentWords);
  });

  it("strips a large insertion block in the middle", () => {
    const before = ["the", "cat", "sat"];
    const adWords = Array.from({ length: 60 }, (_, i) => `ad${i}`);
    const after = ["on", "the", "mat"];
    const hyp = [...before, ...adWords, ...after];
    const ref = [...before, ...after];

    const cleaned = stripInsertionBlocks(hyp, ref, 50);
    expect(cleaned).toEqual([...before, ...after]);
  });

  it("preserves small insertion runs below threshold", () => {
    const hyp = ["the", "um", "uh", "cat", "sat"];
    const ref = ["the", "cat", "sat"];

    const cleaned = stripInsertionBlocks(hyp, ref, 50);
    expect(cleaned).toEqual(hyp);
  });

  it("strips multiple large insertion blocks", () => {
    const ad1 = Array.from({ length: 55 }, (_, i) => `preroll${i}`);
    const content1 = ["hello", "world"];
    const ad2 = Array.from({ length: 55 }, (_, i) => `midroll${i}`);
    const content2 = ["foo", "bar"];
    const hyp = [...ad1, ...content1, ...ad2, ...content2];
    const ref = [...content1, ...content2];

    const cleaned = stripInsertionBlocks(hyp, ref, 50);
    expect(cleaned).toEqual([...content1, ...content2]);
  });

  it("returns hypothesis unchanged when no large insertions exist", () => {
    const words = ["the", "cat", "sat", "on", "the", "mat"];
    const cleaned = stripInsertionBlocks(words, words, 50);
    expect(cleaned).toEqual(words);
  });
});
