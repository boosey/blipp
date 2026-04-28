import { describe, it, expect } from "vitest";
import {
  countMarkdownWords,
  validatePulsePost,
  PULSE_PER_SOURCE_QUOTE_CAP,
  PULSE_RATIO_MIN,
  PULSE_WORD_FLOOR,
  PULSE_WORD_CEILING,
} from "../validation";

const lorem = (words: number) =>
  Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

describe("countMarkdownWords", () => {
  it("counts plain prose words", () => {
    expect(countMarkdownWords("hello world foo bar")).toBe(4);
  });

  it("strips fenced code blocks", () => {
    const md = "Some prose here.\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\nMore prose.";
    expect(countMarkdownWords(md)).toBe(5); // Some prose here. More prose.
  });

  it("collapses markdown links to their visible text", () => {
    expect(countMarkdownWords("Check [this thing](https://x.com/y)")).toBe(3);
  });

  it("strips a trailing Sources section in the body", () => {
    const md = "Body content here.\n\n## Sources\n- [Ep](/p/x/y)";
    expect(countMarkdownWords(md)).toBe(3);
  });
});

describe("validatePulsePost", () => {
  function basePost(overrides: Partial<Parameters<typeof validatePulsePost>[0]> = {}) {
    return validatePulsePost({
      title: "Test post",
      body: lorem(900),
      sourcesMarkdown: "- [Source](/p/show/ep)",
      status: "DRAFT",
      mode: "HUMAN",
      ratioCheckPassed: true,
      editor: { status: "READY" },
      ...overrides,
    });
  }

  it("passes a complete human post with no quotes", () => {
    const r = basePost();
    expect(r.ok).toBe(true);
    expect(r.publishBlocking).toEqual([]);
  });

  it("blocks publish when sources footer is missing", () => {
    const r = basePost({ sourcesMarkdown: "" });
    expect(r.ok).toBe(false);
    expect(r.publishBlocking.find((f) => f.rule === "sources.required")).toBeTruthy();
  });

  it("blocks publish when editor is NOT_READY", () => {
    const r = basePost({ editor: { status: "NOT_READY" } });
    expect(r.ok).toBe(false);
    expect(r.publishBlocking.find((f) => f.rule === "editor.notReady")).toBeTruthy();
  });

  it("blocks publish when editor is RETIRED", () => {
    const r = basePost({ editor: { status: "RETIRED" } });
    expect(r.publishBlocking.find((f) => f.rule === "editor.retired")).toBeTruthy();
  });

  it("blocks publish when ratio attestation flag is false", () => {
    const r = basePost({ ratioCheckPassed: false });
    expect(r.ok).toBe(false);
    expect(r.publishBlocking.find((f) => f.rule === "ratio.attestation")).toBeTruthy();
  });

  it("blocks publish when any source exceeds the 50-word quote cap", () => {
    const r = basePost({
      quotes: [{ sourceId: "ep-1", words: PULSE_PER_SOURCE_QUOTE_CAP + 1 }],
    });
    expect(r.ok).toBe(false);
    const cap = r.publishBlocking.find((f) => f.rule === "quotes.perSourceCap");
    expect(cap).toBeTruthy();
    expect((cap!.meta as any).cap).toBe(PULSE_PER_SOURCE_QUOTE_CAP);
  });

  it("blocks publish when ratio falls below the 3:1 minimum", () => {
    const r = basePost({
      body: lorem(60), // 60 words
      quotes: [{ sourceId: "ep-1", words: 30 }], // 30 quoted → analysis 30, ratio 1:1
    });
    expect(r.ok).toBe(false);
    const ratio = r.publishBlocking.find((f) => f.rule === "quotes.ratio");
    expect(ratio).toBeTruthy();
    expect((ratio!.meta as any).min).toBe(PULSE_RATIO_MIN);
  });

  it("warns when word count falls below the floor", () => {
    const r = basePost({ body: lorem(500) });
    // word floor warning is non-blocking
    expect(r.warnings.find((f) => f.rule === "wordCount.floor")).toBeTruthy();
    expect((r.warnings.find((f) => f.rule === "wordCount.floor")!.meta as any).floor).toBe(PULSE_WORD_FLOOR);
  });

  it("warns when word count exceeds the ceiling", () => {
    const r = basePost({ body: lorem(2000) });
    expect(r.warnings.find((f) => f.rule === "wordCount.ceiling")).toBeTruthy();
    expect((r.warnings.find((f) => f.rule === "wordCount.ceiling")!.meta as any).ceiling).toBe(PULSE_WORD_CEILING);
  });

  it("computes ratio + quoteCounts in the report", () => {
    const r = basePost({
      body: lorem(800),
      quotes: [
        { sourceId: "ep-1", words: 40 },
        { sourceId: "ep-2", words: 30 },
        { sourceId: "ep-1", words: 5 },
      ],
    });
    expect(r.computed.quotedWordCount).toBe(75);
    expect(r.computed.quoteCounts).toEqual({ "ep-1": 45, "ep-2": 30 });
    expect(r.computed.ratio).toBeGreaterThan(0);
  });

  it("aggregates same-source quotes against the cap", () => {
    const r = basePost({
      quotes: [
        { sourceId: "ep-1", words: 30 },
        { sourceId: "ep-1", words: 25 },
      ],
    });
    expect(r.publishBlocking.find((f) => f.rule === "quotes.perSourceCap")).toBeTruthy();
  });
});
