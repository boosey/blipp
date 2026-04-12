import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "../html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes &amp;", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("decodes &lt; and &gt;", () => {
    expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c");
  });

  it("decodes &quot; and &apos;", () => {
    expect(decodeHtmlEntities('say &quot;hello&quot; &apos;world&apos;')).toBe(
      `say "hello" 'world'`
    );
  });

  it("decodes numeric decimal entities", () => {
    expect(decodeHtmlEntities("&#39;quoted&#39;")).toBe("'quoted'");
  });

  it("decodes numeric hex entities", () => {
    expect(decodeHtmlEntities("&#x27;quoted&#x27;")).toBe("'quoted'");
  });

  it("handles double-encoded entities", () => {
    expect(decodeHtmlEntities("Tom &amp;amp; Jerry")).toBe("Tom & Jerry");
  });

  it("returns empty string unchanged", () => {
    expect(decodeHtmlEntities("")).toBe("");
  });

  it("returns text without entities unchanged", () => {
    expect(decodeHtmlEntities("plain text")).toBe("plain text");
  });

  it("decodes smart quotes and dashes", () => {
    expect(decodeHtmlEntities("&ldquo;hello&rdquo; &mdash; world")).toBe(
      "\u201Chello\u201D \u2014 world"
    );
  });

  it("handles mixed entities", () => {
    expect(
      decodeHtmlEntities("Rock &amp; Roll &#8211; The &#x201C;Best&#x201D;")
    ).toBe("Rock & Roll \u2013 The \u201CBest\u201D");
  });
});
