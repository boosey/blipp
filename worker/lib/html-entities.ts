/**
 * Decodes common HTML/XML entities in text fields from RSS feeds and podcast APIs.
 *
 * Handles the 5 XML named entities (&amp; &lt; &gt; &quot; &apos;),
 * additional common HTML named entities, and all numeric/hex character references.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bull: "\u2022",
  hellip: "\u2026",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
};

/**
 * Decode HTML/XML entities in a string.
 * Applies repeatedly to catch double-encoded entities (e.g. `&amp;amp;` → `&amp;` → `&`).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) return text;

  let prev = text;
  // Max 3 passes to handle double/triple encoding without infinite loops
  for (let i = 0; i < 3; i++) {
    const decoded = prev
      // Numeric hex: &#x27; &#x2019;
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      // Numeric decimal: &#39; &#8217;
      .replace(/&#(\d+);/g, (_, dec) =>
        String.fromCodePoint(parseInt(dec, 10))
      )
      // Named entities
      .replace(/&([a-zA-Z]+);/g, (match, name) =>
        NAMED_ENTITIES[name] ?? match
      );

    if (decoded === prev) return decoded;
    prev = decoded;
  }

  return prev;
}
