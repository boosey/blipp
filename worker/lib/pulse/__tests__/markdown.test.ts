import { describe, it, expect } from "vitest";
import { renderMarkdown, countWords } from "../markdown";

describe("renderMarkdown", () => {
  it("renders paragraphs separated by blank lines", () => {
    expect(renderMarkdown("first\n\nsecond")).toBe("<p>first</p>\n<p>second</p>");
  });

  it("folds wrapped lines within a paragraph into one block", () => {
    expect(renderMarkdown("line one\nline two")).toBe("<p>line one line two</p>");
  });

  it("renders ## as h2 and ### as h3", () => {
    expect(renderMarkdown("## Section")).toBe("<h2>Section</h2>");
    expect(renderMarkdown("### Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders bold and italic", () => {
    expect(renderMarkdown("a **bold** and *italic*")).toBe(
      "<p>a <strong>bold</strong> and <em>italic</em></p>"
    );
  });

  it("renders inline code", () => {
    expect(renderMarkdown("use `npm install`")).toContain("<code>npm install</code>");
  });

  it("renders safe links and drops javascript: URLs", () => {
    expect(renderMarkdown("[ok](https://example.com)")).toContain(
      '<a href="https://example.com" rel="noopener">ok</a>'
    );
    // No paren inside the URL — see comment in markdown.ts about regex limits.
    expect(renderMarkdown("[bad](javascript:alert)")).toBe("<p>bad</p>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders blockquotes (used for fair-use source quotes)", () => {
    expect(renderMarkdown("> quoted line")).toBe(
      "<blockquote><p>quoted line</p></blockquote>"
    );
  });

  it("renders --- as <hr />", () => {
    expect(renderMarkdown("---")).toBe("<hr />");
  });

  it("escapes raw HTML", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
    );
  });

  it("escapes HTML inside list items", () => {
    expect(renderMarkdown("- <b>x</b>")).toBe("<ul><li>&lt;b&gt;x&lt;/b&gt;</li></ul>");
  });
});

describe("countWords", () => {
  it("counts words in plain prose", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("ignores markdown markers", () => {
    expect(countWords("## Heading\n\nfirst sentence here.")).toBe(4);
  });

  it("strips link URLs but counts link text", () => {
    expect(countWords("see [the docs](https://example.com) for more")).toBe(5);
  });

  it("strips fenced and inline code", () => {
    expect(countWords("intro\n\n```js\nlots of code here\n```\n\noutro")).toBe(2);
    expect(countWords("a `npm i` b")).toBe(2);
  });

  it("returns 0 for empty/whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\n  ")).toBe(0);
  });
});
