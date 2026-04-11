/**
 * Generate URL-safe slugs for public Blipp pages.
 */

/**
 * Convert a string to a URL-safe slug.
 * Lowercase, hyphen-separated, no special characters.
 * e.g. "The Lex Fridman Podcast #412 — Sam Altman" → "the-lex-fridman-podcast-412-sam-altman"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, 120); // cap length
}

/**
 * Generate a unique slug by appending a numeric suffix if needed.
 * `existingSlugs` is the set of slugs already taken in the same scope.
 * `idFallback` (optional) is used when `text` slugifies to empty —
 * passing the row id avoids `item-<Date.now()>` collisions under rapid
 * successive calls in the same millisecond.
 */
export function uniqueSlug(
  text: string,
  existingSlugs: Set<string>,
  idFallback?: string
): string {
  const base = slugify(text);
  if (base) {
    if (!existingSlugs.has(base)) return base;
    let i = 2;
    while (existingSlugs.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
  // Empty slugification — use a stable id-based fallback if provided.
  const suffix = idFallback ? idFallback.slice(-10) : String(Date.now());
  let slug = `item-${suffix}`;
  let i = 2;
  while (existingSlugs.has(slug)) slug = `item-${suffix}-${i++}`;
  return slug;
}
