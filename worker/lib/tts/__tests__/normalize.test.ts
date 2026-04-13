import { describe, it, expect } from "vitest";
import { normalizeForTts } from "../normalize";

describe("normalizeForTts", () => {
  // -----------------------------------------------------------------------
  // Abbreviations
  // -----------------------------------------------------------------------
  describe("abbreviations", () => {
    it("expands common time abbreviations", () => {
      expect(normalizeForTts("21 yrs old")).toBe("21 years old");
      expect(normalizeForTts("about 3 hrs")).toBe("about 3 hours");
      expect(normalizeForTts("in 5 mins")).toBe("in 5 minutes");
    });

    it("expands measurement abbreviations", () => {
      expect(normalizeForTts("60 mph wind")).toBe("60 miles per hour wind");
      expect(normalizeForTts("150 lbs")).toBe("150 pounds");
    });

    it("expands general abbreviations", () => {
      expect(normalizeForTts("govt policy")).toBe("government policy");
      expect(normalizeForTts("approx 50")).toBe("approximately 50");
      expect(normalizeForTts("Red vs Blue")).toBe("Red versus Blue");
    });

    it("handles case insensitively", () => {
      expect(normalizeForTts("Govt")).toBe("government");
      expect(normalizeForTts("APPROX")).toBe("approximately");
    });

    it("does not expand partial word matches", () => {
      expect(normalizeForTts("environment")).toBe("environment");
      expect(normalizeForTts("information")).toBe("information");
      expect(normalizeForTts("minimum")).toBe("minimum");
    });

    it("does not expand abbreviations followed by hyphens or slashes", () => {
      // "dev-ops" should not become "development-ops"
      expect(normalizeForTts("dev-ops")).toBe("dev-ops");
    });
  });

  // -----------------------------------------------------------------------
  // Decade numbers
  // -----------------------------------------------------------------------
  describe("decades", () => {
    it("expands four-digit decades", () => {
      expect(normalizeForTts("the 1960s were")).toBe("the the nineteen sixties were");
      expect(normalizeForTts("in the 1850s")).toBe("in the the eighteen fifties");
      expect(normalizeForTts("the 2020s")).toBe("the the twenty twenties");
    });

    it("expands two-digit decades", () => {
      expect(normalizeForTts("the '90s")).toBe("the the nineties");
      expect(normalizeForTts("back in the 60s")).toBe("back in the the sixties");
    });

    it("does not expand non-decade numbers with s", () => {
      // "1965s" is not a decade — only multiples of 10
      expect(normalizeForTts("1965s")).toBe("1965s");
    });

    it("does not touch plain years", () => {
      expect(normalizeForTts("in 1960 the")).toBe("in 1960 the");
      expect(normalizeForTts("since 2020")).toBe("since 2020");
    });
  });

  // -----------------------------------------------------------------------
  // Hyphenated acronyms
  // -----------------------------------------------------------------------
  describe("hyphenated acronyms", () => {
    it("removes hyphens after uppercase acronyms", () => {
      expect(normalizeForTts("SDF-Alpha")).toBe("SDF Alpha");
      expect(normalizeForTts("NATO-led forces")).toBe("NATO led forces");
      expect(normalizeForTts("AI-powered tools")).toBe("AI powered tools");
    });

    it("preserves normal hyphenation", () => {
      expect(normalizeForTts("well-known")).toBe("well-known");
      expect(normalizeForTts("twenty-five")).toBe("twenty-five");
      expect(normalizeForTts("re-examine")).toBe("re-examine");
    });

    it("handles em-dash and en-dash after acronyms", () => {
      expect(normalizeForTts("NASA–funded")).toBe("NASA funded");
      expect(normalizeForTts("FBI—led")).toBe("FBI led");
    });
  });

  // -----------------------------------------------------------------------
  // Dollar shorthand
  // -----------------------------------------------------------------------
  describe("dollar shorthand", () => {
    it("expands dollar millions", () => {
      expect(normalizeForTts("raised $1.5M")).toBe("raised 1.5 million dollars");
    });

    it("expands dollar billions", () => {
      expect(normalizeForTts("worth $3B")).toBe("worth 3 billion dollars");
    });

    it("expands dollar thousands", () => {
      expect(normalizeForTts("costs $50K")).toBe("costs 50 thousand dollars");
    });

    it("handles lowercase k", () => {
      expect(normalizeForTts("$200k salary")).toBe("200 thousand dollars salary");
    });

    it("handles space before magnitude", () => {
      expect(normalizeForTts("$1.5 M")).toBe("1.5 million dollars");
    });

    it("does not mangle plain dollar amounts", () => {
      expect(normalizeForTts("costs $50")).toBe("costs $50");
      expect(normalizeForTts("$1,500")).toBe("$1,500");
    });
  });

  // -----------------------------------------------------------------------
  // Percent
  // -----------------------------------------------------------------------
  describe("percent", () => {
    it("expands percent sign", () => {
      expect(normalizeForTts("grew 50%")).toBe("grew 50 percent");
      expect(normalizeForTts("a 3.5% increase")).toBe("a 3.5 percent increase");
    });
  });

  // -----------------------------------------------------------------------
  // Ordinals
  // -----------------------------------------------------------------------
  describe("ordinals", () => {
    it("expands single-digit ordinals", () => {
      expect(normalizeForTts("the 1st time")).toBe("the first time");
      expect(normalizeForTts("2nd place")).toBe("second place");
      expect(normalizeForTts("3rd attempt")).toBe("third attempt");
    });

    it("expands teen ordinals", () => {
      expect(normalizeForTts("the 11th hour")).toBe("the eleventh hour");
      expect(normalizeForTts("12th century")).toBe("twelfth century");
    });

    it("expands two-digit ordinals", () => {
      expect(normalizeForTts("21st century")).toBe("twenty-first century");
      expect(normalizeForTts("the 50th anniversary")).toBe("the fiftieth anniversary");
      expect(normalizeForTts("her 33rd birthday")).toBe("her thirty-third birthday");
    });

    it("does not expand three-digit ordinals (too ambiguous)", () => {
      expect(normalizeForTts("the 100th time")).toBe("the 100th time");
    });
  });

  // -----------------------------------------------------------------------
  // Plus sign
  // -----------------------------------------------------------------------
  describe("plus sign", () => {
    it("expands trailing plus after numbers", () => {
      expect(normalizeForTts("50+ countries")).toBe("50 plus countries");
    });

    it("does not affect plus without trailing space", () => {
      expect(normalizeForTts("C++")).toBe("C++");
    });
  });

  // -----------------------------------------------------------------------
  // Ampersand
  // -----------------------------------------------------------------------
  describe("ampersand", () => {
    it("expands spaced ampersands to 'and'", () => {
      expect(normalizeForTts("news & politics")).toBe("news and politics");
    });

    it("preserves ampersands inside acronyms/names", () => {
      expect(normalizeForTts("R&D")).toBe("R&D");
      expect(normalizeForTts("AT&T")).toBe("AT&T");
    });
  });

  // -----------------------------------------------------------------------
  // Combined / real-world examples
  // -----------------------------------------------------------------------
  describe("real-world narratives", () => {
    it("handles a mixed sentence", () => {
      const input = "The govt invested $1.5M in AI-powered tech for 3 yrs, achieving a 25% improvement by the 21st century.";
      const expected = "The government invested 1.5 million dollars in AI powered technology for 3 years, achieving a 25 percent improvement by the twenty-first century.";
      expect(normalizeForTts(input)).toBe(expected);
    });

    it("handles decade references in context", () => {
      const input = "Popular in the 1960s and '90s, the style resurfaced.";
      const expected = "Popular in the the nineteen sixties and the nineties, the style resurfaced.";
      expect(normalizeForTts(input)).toBe(expected);
    });

    it("passes through clean text unchanged", () => {
      const clean = "The committee met on Tuesday to discuss the new proposal.";
      expect(normalizeForTts(clean)).toBe(clean);
    });

    it("handles empty string", () => {
      expect(normalizeForTts("")).toBe("");
    });
  });
});
