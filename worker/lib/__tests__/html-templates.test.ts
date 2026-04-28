import { describe, it, expect } from "vitest";
import {
  renderEpisodePage,
  renderShowPage,
  renderCategoryPage,
  truncateToWords,
  type EpisodePageData,
} from "../html-templates";

const baseEpisode: EpisodePageData = {
  episodeTitle: "How AI changes healthcare",
  episodeSlug: "how-ai-changes-healthcare",
  podcastTitle: "Future Forward",
  podcastSlug: "future-forward",
  podcastImageUrl: "https://example.com/cover.jpg",
  publishedAt: new Date("2026-04-20T00:00:00Z"),
  durationSeconds: 60 * 42,
  narrativeText:
    "AI is transforming medicine. " +
    Array.from({ length: 30 })
      .map((_, i) => `Sentence ${i} explores a different angle of the same idea.`)
      .join(" "),
  topicTags: ["health", "ai"],
  categoryName: "Technology",
  categorySlug: "technology",
  topClaims: [
    { text: "AI cuts diagnostic time by 60%", topic: "Diagnostics" },
    { text: "FDA approval pipeline is the bottleneck" },
    { text: "Doctors mostly trust the recommendations" },
  ],
  moreFromShow: [
    { title: "Robots in surgery", slug: "robots-in-surgery", publishedAt: new Date("2026-04-13") },
  ],
  relatedInCategory: [{ title: "Code & Coffee", slug: "code-and-coffee" }],
  signupNextPath: "/p/future-forward/how-ai-changes-healthcare",
};

describe("truncateToWords", () => {
  it("returns the input untouched when shorter than max", () => {
    const text = "Short input under the threshold.";
    expect(truncateToWords(text, 150, 200)).toBe("Short input under the threshold.");
  });

  it("hard-cuts at maxWords with ellipsis when no sentence boundary fits", () => {
    const text = Array.from({ length: 250 }).map((_, i) => `word${i}`).join(" ");
    const out = truncateToWords(text, 150, 200);
    const wordCount = out.replace(/…$/, "").trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("ends at a sentence boundary when one fits in the range", () => {
    // ~30 words per sentence × 8 = 240 words total. Truncation triggers at 200.
    // The first 6 sentences (180 words) fit inside [150, 200], so the cutter
    // stops at sentence #6 — after which we replace trailing punctuation with `…`.
    const sentence = Array.from({ length: 30 }).map((_, i) => `w${i}`).join(" ");
    const text = Array.from({ length: 8 }).map(() => `${sentence}.`).join(" ");
    const out = truncateToWords(text, 150, 200);
    expect(out.endsWith("…")).toBe(true);
    // Body before ellipsis should not include any trailing punctuation
    expect(out.slice(0, -1).trim()).not.toMatch(/[.!?]$/);
  });
});

describe("renderEpisodePage", () => {
  it("renders the Top takeaways list with one li per claim", () => {
    const html = renderEpisodePage(baseEpisode);
    expect(html).toContain("Top takeaways");
    const liMatches = html.match(/<li>/g) ?? [];
    expect(liMatches.length).toBe(3);
    expect(html).toContain("AI cuts diagnostic time by 60%");
    expect(html).toContain("Diagnostics");
  });

  it("links the signup CTA with ?next= pointing at the canonical path", () => {
    const html = renderEpisodePage(baseEpisode);
    const expected = `/sign-up?next=${encodeURIComponent(
      "/p/future-forward/how-ai-changes-healthcare"
    )}`;
    expect(html).toContain(`href="${expected}"`);
  });

  it("emits a JSON-LD @graph containing PodcastEpisode + Article + BreadcrumbList", () => {
    const html = renderEpisodePage(baseEpisode);
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed["@context"]).toBe("https://schema.org");
    const types = (parsed["@graph"] as any[]).map((n: any) => n["@type"]);
    expect(types).toContain("PodcastEpisode");
    expect(types).toContain("Article");
    expect(types).toContain("BreadcrumbList");

    // Article.mentions should reference the PodcastEpisode by @id
    const article = (parsed["@graph"] as any[]).find((n: any) => n["@type"] === "Article");
    const episode = (parsed["@graph"] as any[]).find((n: any) => n["@type"] === "PodcastEpisode");
    expect(article.mentions["@id"]).toBe(episode["@id"]);

    // Breadcrumb should include the category since one was provided
    const crumb = (parsed["@graph"] as any[]).find((n: any) => n["@type"] === "BreadcrumbList");
    const names = crumb.itemListElement.map((it: any) => it.name);
    expect(names).toContain("Technology");
  });

  it("uses the truncated excerpt for OG description (≤160 chars)", () => {
    const html = renderEpisodePage(baseEpisode);
    const ogMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    expect(ogMatch).not.toBeNull();
    expect(ogMatch![1].length).toBeLessThanOrEqual(160);
  });

  it("emits a twitter:image meta tag", () => {
    const html = renderEpisodePage(baseEpisode);
    expect(html).toMatch(/<meta name="twitter:image"/);
  });

  it("renders the More from this show + Related in category sections when present", () => {
    const html = renderEpisodePage(baseEpisode);
    expect(html).toContain("More from Future Forward");
    expect(html).toContain("Robots in surgery");
    expect(html).toContain("Related in Technology");
    expect(html).toContain("Code &amp; Coffee");
  });

  it("skips Top takeaways when topClaims is empty", () => {
    const html = renderEpisodePage({ ...baseEpisode, topClaims: [] });
    expect(html).not.toContain("Top takeaways");
  });

  it("emits the empty Pulse featured-in placeholder", () => {
    const html = renderEpisodePage(baseEpisode);
    expect(html).toContain("data-pulse-featured-in");
  });

  it("omits the sample player section when sampleAudioUrl is absent", () => {
    const html = renderEpisodePage({ ...baseEpisode, sampleAudioUrl: null });
    // CSS for .sample-player is always in <style>; the element itself must be absent.
    expect(html).not.toContain('id="sample-btn"');
    expect(html).not.toContain('id="sample-bar"');
    expect(html).not.toMatch(/<section class="sample-player"/);
  });

  it("renders sample player + JSON-encoded audio URL when sampleAudioUrl is present", () => {
    const html = renderEpisodePage({
      ...baseEpisode,
      sampleAudioUrl: "https://r2.example.com/clip.mp3",
    });
    expect(html).toContain('id="sample-btn"');
    expect(html).toContain('id="sample-bar"');
    expect(html).toContain('id="sample-cta"');
    // URL must be JSON-encoded into the inline script (no naked interpolation)
    expect(html).toContain('"https://r2.example.com/clip.mp3"');
    // Default 30-second sample
    expect(html).toContain("30-second sample");
  });

  it("respects custom sampleSeconds in the rendered label", () => {
    const html = renderEpisodePage({
      ...baseEpisode,
      sampleAudioUrl: "https://r2.example.com/clip.mp3",
      sampleSeconds: 45,
    });
    expect(html).toContain("45-second sample");
  });
});

describe("renderShowPage", () => {
  it("includes a BreadcrumbList in the JSON-LD @graph", () => {
    const html = renderShowPage({
      podcastTitle: "Future Forward",
      podcastSlug: "future-forward",
      podcastDescription: "Things that come next.",
      episodeCount: 3,
      episodes: [
        { title: "Ep 1", slug: "ep-1", publishedAt: new Date() },
      ],
      categoryName: "Technology",
      categorySlug: "technology",
    });
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const parsed = JSON.parse(match![1]);
    const types = (parsed["@graph"] as any[]).map((n: any) => n["@type"]);
    expect(types).toContain("PodcastSeries");
    expect(types).toContain("BreadcrumbList");
  });
});

describe("renderCategoryPage", () => {
  it("emits CollectionPage + BreadcrumbList JSON-LD", () => {
    const html = renderCategoryPage({
      categoryName: "Technology",
      categorySlug: "technology",
      podcasts: [
        { title: "Future Forward", slug: "future-forward", episodeCount: 5 },
      ],
    });
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    const types = (parsed["@graph"] as any[]).map((n: any) => n["@type"]);
    expect(types).toContain("CollectionPage");
    expect(types).toContain("BreadcrumbList");
  });
});
