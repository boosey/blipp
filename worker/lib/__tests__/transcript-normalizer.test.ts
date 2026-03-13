import { describe, it, expect } from "vitest";
import {
  intToWords,
  expandNumbers,
  normalizeCompounds,
  correctSpelling,
  preWerNormalize,
} from "../transcript-normalizer";

// ── intToWords ──

describe("intToWords", () => {
  it("converts small numbers", () => {
    expect(intToWords(0)).toBe("zero");
    expect(intToWords(1)).toBe("one");
    expect(intToWords(13)).toBe("thirteen");
    expect(intToWords(42)).toBe("forty two");
    expect(intToWords(100)).toBe("one hundred");
    expect(intToWords(199)).toBe("one hundred ninety nine");
    expect(intToWords(500)).toBe("five hundred");
  });

  it("converts thousands", () => {
    expect(intToWords(1000)).toBe("one thousand");
    expect(intToWords(5280)).toBe("five thousand two hundred eighty");
    expect(intToWords(10000)).toBe("ten thousand");
    expect(intToWords(123456)).toBe("one hundred twenty three thousand four hundred fifty six");
  });

  it("converts years in spoken form", () => {
    expect(intToWords(1776)).toBe("seventeen seventy six");
    expect(intToWords(1900)).toBe("nineteen hundred");
    expect(intToWords(1999)).toBe("nineteen ninety nine");
    expect(intToWords(2000)).toBe("two thousand");
    expect(intToWords(2001)).toBe("two thousand one");
    expect(intToWords(2024)).toBe("twenty twenty four");
    expect(intToWords(2026)).toBe("twenty twenty six");
    expect(intToWords(1100)).toBe("eleven hundred");
  });

  it("converts millions", () => {
    expect(intToWords(1000000)).toBe("one million");
    expect(intToWords(2500000)).toBe("two million five hundred thousand");
  });
});

// ── expandNumbers ──

describe("expandNumbers", () => {
  it("expands digit tokens", () => {
    expect(expandNumbers(["the", "year", "1900", "was", "great"])).toEqual(
      ["the", "year", "nineteen", "hundred", "was", "great"]
    );
  });

  it("expands ordinals", () => {
    expect(expandNumbers(["the", "1st", "place"])).toEqual(
      ["the", "first", "place"]
    );
    expect(expandNumbers(["on", "the", "3rd"])).toEqual(
      ["on", "the", "third"]
    );
  });

  it("expands decimals", () => {
    expect(expandNumbers(["about", "3.5", "million"])).toEqual(
      ["about", "three", "point", "five", "million"]
    );
  });

  it("leaves non-numeric words alone", () => {
    expect(expandNumbers(["hello", "world"])).toEqual(["hello", "world"]);
  });

  it("handles mixed tokens", () => {
    expect(expandNumbers(["chapter", "12", "verse", "3"])).toEqual(
      ["chapter", "twelve", "verse", "three"]
    );
  });
});

// ── normalizeCompounds ──

describe("normalizeCompounds", () => {
  it("merges split compound to match ref", () => {
    const ref = ["went", "to", "the", "curbside"];
    const hyp = ["went", "to", "the", "curb", "side"];
    expect(normalizeCompounds(ref, hyp)).toEqual(
      ["went", "to", "the", "curbside"]
    );
  });

  it("splits compound to match ref bigram", () => {
    const ref = ["the", "air", "port", "was", "busy"];
    const hyp = ["the", "airport", "was", "busy"];
    expect(normalizeCompounds(ref, hyp)).toEqual(
      ["the", "air", "port", "was", "busy"]
    );
  });

  it("leaves already-matching words alone", () => {
    const ref = ["the", "quick", "brown", "fox"];
    const hyp = ["the", "quick", "brown", "fox"];
    expect(normalizeCompounds(ref, hyp)).toEqual(
      ["the", "quick", "brown", "fox"]
    );
  });

  it("does not merge when merged form is not in ref", () => {
    const ref = ["the", "brown", "fox"];
    const hyp = ["the", "bro", "wn", "fox"];
    // "brown" is in ref but "bro" is also not in ref — merge only if joined form is in refSet
    // "brown" IS in ref and "bro" is NOT in ref, so it should merge
    expect(normalizeCompounds(ref, hyp)).toEqual(
      ["the", "brown", "fox"]
    );
  });
});

// ── correctSpelling ──

describe("correctSpelling", () => {
  it("corrects misspelling to match ref vocabulary", () => {
    const ref = ["the", "restaurant", "was", "excellent"];
    const hyp = ["the", "restaraunt", "was", "excellent"];
    expect(correctSpelling(ref, hyp)).toEqual(
      ["the", "restaurant", "was", "excellent"]
    );
  });

  it("does not correct short words (< 4 chars)", () => {
    const ref = ["the", "cat", "sat"];
    const hyp = ["teh", "cat", "sat"];
    // "teh" is 3 chars — too short to correct
    expect(correctSpelling(ref, hyp)).toEqual(["teh", "cat", "sat"]);
  });

  it("does not correct when distance exceeds threshold", () => {
    const ref = ["algorithm"];
    const hyp = ["aligator"];
    // very different words — distance > 2, should NOT correct
    expect(correctSpelling(ref, hyp)).toEqual(["aligator"]);
  });

  it("corrects within threshold for longer words", () => {
    const ref = ["transcription"];
    const hyp = ["transcrption"];
    // missing 'i' — distance 1
    expect(correctSpelling(ref, hyp)).toEqual(["transcription"]);
  });
});

// ── preWerNormalize (integration) ──

describe("preWerNormalize", () => {
  it("normalizes numbers + compounds + spelling together", () => {
    const ref = ["in", "nineteen", "hundred", "the", "curbside", "restaurant", "opened"];
    const hyp = ["in", "1900", "the", "curb", "side", "restaraunt", "opened"];
    const { normalizedRef, normalizedHyp } = preWerNormalize(ref, hyp);
    expect(normalizedRef).toEqual(
      ["in", "nineteen", "hundred", "the", "curbside", "restaurant", "opened"]
    );
    expect(normalizedHyp).toEqual(
      ["in", "nineteen", "hundred", "the", "curbside", "restaurant", "opened"]
    );
  });

  it("handles hypothesis that already matches reference", () => {
    const words = ["the", "quick", "brown", "fox"];
    const { normalizedRef, normalizedHyp } = preWerNormalize(words, [...words]);
    expect(normalizedRef).toEqual(words);
    expect(normalizedHyp).toEqual(words);
  });
});
