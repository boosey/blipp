import { describe, it, expect } from "vitest";
import { hirschbergAlign, normalizeText, stripInsertionBlocks, calculateWer, fuzzyFindAnchor, alignTranscriptWindow } from "../stt/wer";

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

describe("fuzzyFindAnchor", () => {
  it("finds exact match at start", () => {
    const corpus = ["the", "cat", "sat", "on", "the", "mat"];
    const anchor = ["the", "cat", "sat"];
    const result = fuzzyFindAnchor(anchor, corpus);
    expect(result.position).toBe(0);
    expect(result.score).toBe(1);
  });

  it("finds exact match at offset", () => {
    const corpus = ["buy", "now", "the", "cat", "sat", "on", "the", "mat"];
    const anchor = ["the", "cat", "sat"];
    const result = fuzzyFindAnchor(anchor, corpus);
    expect(result.position).toBe(2);
    expect(result.score).toBe(1);
  });

  it("finds fuzzy match with partial overlap", () => {
    const corpus = ["buy", "now", "the", "dog", "sat", "on", "the", "mat"];
    const anchor = ["the", "cat", "sat"];
    const result = fuzzyFindAnchor(anchor, corpus);
    // "the ? sat" matches at pos 2 with 2/3 overlap
    expect(result.position).toBe(2);
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it("respects searchStart and searchEnd bounds", () => {
    const corpus = ["the", "cat", "sat", "then", "the", "cat", "sat", "again"];
    const anchor = ["the", "cat", "sat"];
    // Restrict search to second half
    const result = fuzzyFindAnchor(anchor, corpus, 3, 8);
    expect(result.position).toBe(4);
    expect(result.score).toBe(1);
  });

  it("returns searchStart with score 0 for empty anchor", () => {
    const corpus = ["the", "cat"];
    const result = fuzzyFindAnchor([], corpus, 5);
    expect(result.position).toBe(5);
    expect(result.score).toBe(0);
  });

  it("handles search range smaller than anchor", () => {
    const corpus = ["the", "cat"];
    const anchor = ["the", "cat", "sat", "down"];
    const result = fuzzyFindAnchor(anchor, corpus);
    expect(result.position).toBe(0);
    expect(result.score).toBe(0.5); // 2 of 4 match
  });
});

describe("alignTranscriptWindow", () => {
  // Helper: generate filler words
  const filler = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`);

  it("skips leading ad in hypothesis using reference start anchor", () => {
    const adWords = filler("ad", 30);
    const content = filler("word", 120);
    const refFull = [...content, ...filler("extra", 200)];

    const hyp = [...adWords, ...content];
    const { trimmedHyp } = alignTranscriptWindow(hyp, refFull);

    // Hypothesis should start at the content, not the ad
    expect(trimmedHyp[0]).toBe("word0");
    expect(trimmedHyp.length).toBe(content.length);
  });

  it("trims reference to match hypothesis end", () => {
    const content = filler("word", 80);
    const refTail = filler("tail", 300);
    const refFull = [...content, ...refTail];

    const { trimmedRef } = alignTranscriptWindow(content, refFull);

    // Reference should be trimmed — not include all 380 words
    expect(trimmedRef.length).toBeLessThan(refFull.length);
    // Should end around where the content ends
    expect(trimmedRef.length).toBeLessThanOrEqual(content.length + 25);
  });

  it("handles both leading ad AND long reference tail", () => {
    const ad = filler("ad", 30);
    const content = filler("word", 80);
    const refTail = filler("tail", 200);
    const refFull = [...content, ...refTail];

    const hyp = [...ad, ...content];
    const { trimmedHyp, trimmedRef } = alignTranscriptWindow(hyp, refFull);

    // Ad should be skipped
    expect(trimmedHyp[0]).toBe("word0");
    // Reference should be trimmed
    expect(trimmedRef.length).toBeLessThan(refFull.length);
  });

  it("returns inputs unchanged when both are short", () => {
    const hyp = ["the", "cat", "sat"];
    const ref = ["the", "cat", "sat", "on", "mat"];
    const { trimmedHyp, trimmedRef } = alignTranscriptWindow(hyp, ref);
    expect(trimmedHyp).toEqual(hyp);
    expect(trimmedRef).toEqual(ref);
  });

  it("does not trim when hypothesis has no leading ad", () => {
    const content = filler("word", 80);
    const refFull = [...content, ...filler("extra", 200)];

    const { trimmedHyp } = alignTranscriptWindow(content, refFull);

    // No ad to skip — hypothesis starts at beginning
    expect(trimmedHyp[0]).toBe("word0");
    expect(trimmedHyp.length).toBe(content.length);
  });

  it("aligns correctly when reference has spelled-out numbers vs hypothesis digits", () => {
    // Real-world case: reference transcript spells out numbers, STT outputs digits.
    // The word count difference used to break positional anchor matching.
    const ad = "running a business is hard enough dont make it harder with a dozen apps that dont talk to each other one for sales another for inventory a separate one for accounting thats software overload odoo is the all in one platform that replaces them all crm accounting inventory ecommerce hr fully integrated easy to use and built to grow with your business thousands have already made the switch why not you try odoo for free at odoocom thats odoocom".split(" ");
    const contentHyp = "this is episode 199 of the christian research journal reads podcast irenaeus and christian orthodoxy by bradley nassif this article first appeared in the print edition of the christian research journal volume 43 number 1 in 2020 and the following content continues for a while with many more words to make this long enough for alignment to work properly we need at least fifty words of actual content here so lets keep going with some more filler text about the podcast episode".split(" ");
    const contentRef = "this is episode one hundred and ninety nine of the christian research journal reads podcast irenaeus and christian orthodoxy by bradley nassef this article first appeared in the print edition of the christian research journal volume forty three number one in twenty twenty and the following content continues for a while with many more words to make this long enough for alignment to work properly we need at least fifty words of actual content here so lets keep going with some more filler text about the podcast episode and even more reference text beyond what was transcribed".split(" ");

    const hyp = [...ad, ...contentHyp];
    const { trimmedHyp } = alignTranscriptWindow(hyp, contentRef);

    // The ad should be stripped — trimmedHyp should start near the content
    expect(trimmedHyp[0]).toBe("this");
    expect(trimmedHyp[1]).toBe("is");
    expect(trimmedHyp[2]).toBe("episode");
    // Should NOT start with "running" (ad)
    expect(trimmedHyp).not.toContain("odoo");
  });

  it("aligns correctly with short reference transcript and long ad prefix", () => {
    // Real case: 27-word reference, 163-word hypothesis with 136 ad words.
    // Previously failed because anchorSize*2 guard skipped alignment entirely.
    const refText = "you're listening to the adventure sports podcast thanks for adventuring with us as we discover what incredible athletes and outdoor enthusiasts are doing all over the world";
    const adText = "this is the new weight watchers built for real life and real results no matter what mode you're in join the millions of members and lose weight with the number one doctor recommended weight loss program lose more at weightwatchers dot com this spring escape to alabamas beaches with spectrum resorts turquoise place and the beach club offer easy all in one vacations with pools dining and family fun book direct for perks and a worry free stay";
    const contentText = refText; // hypothesis content matches reference

    const refWords = refText.split(" ");
    const hypWords = [...adText.split(" "), ...contentText.split(" ")];

    const { trimmedHyp } = alignTranscriptWindow(hypWords, refWords);

    // Ad should be stripped — trimmedHyp should be the content
    expect(trimmedHyp.slice(0, 5).join(" ")).toBe("you're listening to the adventure");
    expect(trimmedHyp.length).toBeLessThan(hypWords.length);
  });

  it("uses custom anchorSize", () => {
    const ad = filler("ad", 30);
    const content = filler("word", 80);
    const refFull = [...content, ...filler("extra", 200)];

    const hyp = [...ad, ...content];
    const { trimmedHyp } = alignTranscriptWindow(hyp, refFull, 20);

    expect(trimmedHyp[0]).toBe("word0");
  });
});

describe("end-to-end: ad stripping + WER", () => {
  it("WER improves after stripping a large ad prefix", () => {
    const adText = Array.from({ length: 80 }, (_, i) => `advertisement${i}`).join(" ");
    const realContent = "the quick brown fox jumps over the lazy dog near the river bank on a sunny day";
    const hypothesis = `${adText} ${realContent}`;
    const reference = realContent;

    // Raw WER: very high because of 80 inserted ad words against 16 ref words
    const rawWer = calculateWer(hypothesis, reference);
    expect(rawWer.wer).toBeGreaterThan(3);

    // Clean WER: should be near 0 since content matches
    const hypWords = normalizeText(hypothesis);
    const refWords = normalizeText(reference);
    const cleaned = stripInsertionBlocks(hypWords, refWords);
    const cleanWer = calculateWer(cleaned.join(" "), reference);
    expect(cleanWer.wer).toBeLessThan(0.1);
  });
});
