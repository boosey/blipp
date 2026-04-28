/**
 * Minimal Markdown → HTML renderer for Pulse posts.
 *
 * Handles only the constructs Pulse editors actually need:
 *   - Paragraphs (blank-line separated)
 *   - Headings: ## h2, ### h3
 *   - Bold (**text**), italic (*text*)
 *   - Links: [text](url)
 *   - Inline code: `code`
 *   - Unordered lists: - item
 *   - Ordered lists: 1. item
 *   - Blockquotes: > line   (used for fair-use source quotes)
 *   - Horizontal rules: ---
 *
 * Everything else is treated as plain text and HTML-escaped. This
 * intentionally rejects raw <script>, <iframe>, <style>, etc., because
 * the Pulse body is editor-controlled but still flows through a
 * worker-side renderer where dependency surface matters.
 *
 * Not a goal: GitHub-flavored Markdown completeness. If editors need
 * tables or footnotes, swap in `marked`+sanitizer in a follow-up.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Apply inline-level transformations (bold, italic, links, code) to an
 * already-HTML-escaped string. Order matters: code first so its contents
 * don't get re-parsed for bold/italic.
 */
function inline(escaped: string): string {
  // Inline code — escape contents already done; just wrap.
  let s = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links: [text](url). URL is restricted to http/https/mailto/relative.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    if (!/^(https?:\/\/|mailto:|\/)/i.test(url)) {
      return text; // drop unsafe URL, keep visible text
    }
    return `<a href="${url}" rel="noopener">${text}</a>`;
  });

  // Bold first (matches **) so single * doesn't steal it.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic.
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return s;
}

interface Block {
  type: "p" | "h2" | "h3" | "ul" | "ol" | "blockquote" | "hr";
  lines: string[];
}

/**
 * Group raw lines into typed blocks. A block ends at a blank line, a
 * change of block type, or end-of-input. Lists buffer their items.
 */
function tokenize(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }

    if (line.startsWith("### ")) {
      flush();
      out.push({ type: "h3", lines: [line.slice(4).trim()] });
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push({ type: "h2", lines: [line.slice(3).trim()] });
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      flush();
      out.push({ type: "hr", lines: [] });
      continue;
    }
    if (line.startsWith("> ")) {
      if (!cur || cur.type !== "blockquote") {
        flush();
        cur = { type: "blockquote", lines: [] };
      }
      cur.lines.push(line.slice(2));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!cur || cur.type !== "ul") {
        flush();
        cur = { type: "ul", lines: [] };
      }
      cur.lines.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!cur || cur.type !== "ol") {
        flush();
        cur = { type: "ol", lines: [] };
      }
      cur.lines.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    // Default: paragraph; multiple lines fold into one with spaces.
    if (!cur || cur.type !== "p") {
      flush();
      cur = { type: "p", lines: [] };
    }
    cur.lines.push(line);
  }
  flush();
  return out;
}

export function renderMarkdown(md: string): string {
  const blocks = tokenize(md);
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "h2":
        out.push(`<h2>${inline(escapeHtml(b.lines[0]))}</h2>`);
        break;
      case "h3":
        out.push(`<h3>${inline(escapeHtml(b.lines[0]))}</h3>`);
        break;
      case "hr":
        out.push("<hr />");
        break;
      case "p":
        out.push(`<p>${inline(escapeHtml(b.lines.join(" ")))}</p>`);
        break;
      case "blockquote":
        out.push(
          `<blockquote>${b.lines
            .map((l) => `<p>${inline(escapeHtml(l))}</p>`)
            .join("")}</blockquote>`
        );
        break;
      case "ul":
        out.push(
          `<ul>${b.lines.map((l) => `<li>${inline(escapeHtml(l))}</li>`).join("")}</ul>`
        );
        break;
      case "ol":
        out.push(
          `<ol>${b.lines.map((l) => `<li>${inline(escapeHtml(l))}</li>`).join("")}</ol>`
        );
        break;
    }
  }
  return out.join("\n");
}

/**
 * Word count over a markdown body. Strips markdown markers and code so
 * the count reflects readable prose. Used by the admin UI to enforce
 * the Phase 4.0 word-count floor (800).
 */
export function countWords(md: string): number {
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]+`/g, " ")         // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // link text only
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\d+\.\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}
