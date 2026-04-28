import { useEffect } from "react";

interface DocumentMeta {
  title?: string;
  description?: string;
  /** When true, emits `<meta name="robots" content="noindex, follow">`. */
  noindex?: boolean;
  /** Canonical URL for the page (absolute). */
  canonical?: string;
  /** Open Graph title. Falls back to `title`. */
  ogTitle?: string;
  /** Open Graph description. Falls back to `description`. */
  ogDescription?: string;
  /** Open Graph image (absolute URL, ≥1200×628). */
  ogImage?: string;
  /** Open Graph type (default "website"). */
  ogType?: string;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * Imperatively manage document <head> tags for the current page.
 *
 * Intentionally minimal — no `react-helmet` dep. Tracks every element it
 * creates via a `data-doc-meta` marker so cleanup on unmount removes only
 * what this hook added (does not touch tags set by other code or by the
 * static `index.html`).
 */
export function useDocumentMeta(meta: DocumentMeta) {
  const json = JSON.stringify(meta);

  useEffect(() => {
    const created: Element[] = [];

    const track = (el: Element) => {
      if (!el.hasAttribute("data-doc-meta")) {
        el.setAttribute("data-doc-meta", "true");
        created.push(el);
      }
    };

    const prevTitle = document.title;
    if (meta.title) document.title = meta.title;

    if (meta.description) track(setMeta("description", meta.description));
    if (meta.noindex) track(setMeta("robots", "noindex, follow"));
    if (meta.canonical) track(setLink("canonical", meta.canonical));

    const ogTitle = meta.ogTitle ?? meta.title;
    const ogDescription = meta.ogDescription ?? meta.description;
    if (ogTitle) track(setMeta("og:title", ogTitle, "property"));
    if (ogDescription) track(setMeta("og:description", ogDescription, "property"));
    if (meta.ogImage) track(setMeta("og:image", meta.ogImage, "property"));
    if (meta.ogType) track(setMeta("og:type", meta.ogType, "property"));

    return () => {
      document.title = prevTitle;
      for (const el of created) el.remove();
    };
  }, [json]);
}
