import { describe, it, expect } from "vitest";
import {
  renderPulsePost,
  renderPulseIndex,
  renderPulseEditor,
  renderPulseTopic,
} from "../templates";

const baseEditor = {
  slug: "alex",
  name: "Alex Boudreaux",
  bio: "Founder of Blipp.",
  avatarUrl: "https://example.com/alex.jpg",
  twitterHandle: "alexbdx",
  linkedinUrl: "https://linkedin.com/in/alex",
  websiteUrl: "https://podblipp.com",
};

const basePost = {
  slug: "ai-and-podcasts",
  title: "What AI is doing to podcasts",
  subtitle: "Five threads from the last week.",
  body: "## Section\n\nFirst paragraph with **bold** text.\n\nSecond paragraph here.",
  sourcesMarkdown: "- Episode A on [Show X](https://example.com)",
  topicTags: ["AI", "Podcasting"],
  heroImageUrl: null,
  publishedAt: new Date("2026-04-20"),
  wordCount: 950,
  editor: baseEditor,
  citedEpisodes: [
    { showSlug: "show-x", episodeSlug: "ep-1", title: "Episode A", showTitle: "Show X" },
  ],
};

describe("renderPulsePost", () => {
  it("includes the post title, subtitle, and editor byline", () => {
    const html = renderPulsePost(basePost);
    expect(html).toContain("What AI is doing to podcasts");
    expect(html).toContain("Five threads from the last week.");
    expect(html).toContain("Alex Boudreaux");
    expect(html).toContain("/pulse/by/alex");
  });

  it("renders the body markdown to HTML", () => {
    const html = renderPulsePost(basePost);
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders the Sources section", () => {
    const html = renderPulsePost(basePost);
    expect(html).toContain("Sources");
    expect(html).toContain("Episode A");
  });

  it("emits BlogPosting JSON-LD with author Person + sameAs", () => {
    const html = renderPulsePost(basePost);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    const blogPost = parsed["@graph"].find((n: any) => n["@type"] === "BlogPosting");
    expect(blogPost).toBeDefined();
    expect(blogPost.author["@type"]).toBe("Person");
    expect(blogPost.author.name).toBe("Alex Boudreaux");
    expect(blogPost.author.sameAs).toContain("https://twitter.com/alexbdx");
    expect(blogPost.author.sameAs).toContain("https://linkedin.com/in/alex");
    expect(blogPost.wordCount).toBe(950);
    expect(blogPost.articleSection).toBe("AI");
    expect(blogPost.keywords).toBe("AI, Podcasting");
  });

  it("includes cited episodes in mentions[]", () => {
    const html = renderPulsePost(basePost);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const parsed = JSON.parse(match![1]);
    const blogPost = parsed["@graph"].find((n: any) => n["@type"] === "BlogPosting");
    expect(blogPost.mentions).toHaveLength(1);
    expect(blogPost.mentions[0]["@type"]).toBe("PodcastEpisode");
    expect(blogPost.mentions[0].url).toBe("https://podblipp.com/p/show-x/ep-1");
    expect(blogPost.mentions[0].partOfSeries.url).toBe("https://podblipp.com/p/show-x");
  });

  it("uses seoTitle/seoDescription overrides when provided", () => {
    const html = renderPulsePost({
      ...basePost,
      seoTitle: "SEO override title",
      seoDescription: "SEO override description",
    });
    expect(html).toContain("<title>SEO override title</title>");
    expect(html).toContain('content="SEO override description"');
  });

  it("falls back to subtitle for description when seoDescription absent", () => {
    const html = renderPulsePost(basePost);
    expect(html).toMatch(/og:description.*Five threads from the last week/);
  });
});

describe("renderPulseIndex", () => {
  it("renders an empty-state when no posts", () => {
    const html = renderPulseIndex({ posts: [], page: 1, totalPages: 1 });
    expect(html).toContain("No posts yet");
  });

  it("renders post cards linking to /pulse/:slug", () => {
    const html = renderPulseIndex({
      posts: [
        {
          slug: "first-post",
          title: "First post",
          subtitle: "About things",
          publishedAt: new Date("2026-04-20"),
          wordCount: 1000,
          topicTags: ["AI"],
          editor: { slug: "alex", name: "Alex" },
        },
      ],
      page: 1,
      totalPages: 1,
    });
    expect(html).toContain('href="/pulse/first-post"');
    expect(html).toContain("First post");
    expect(html).toContain("By Alex");
    // Reading time = wordCount/220 ≈ 5
    expect(html).toContain("5 min read");
  });

  it("renders pagination when totalPages > 1", () => {
    const html = renderPulseIndex({ posts: [], page: 2, totalPages: 3 });
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain('href="/pulse?page=1"');
    expect(html).toContain('href="/pulse?page=3"');
  });
});

describe("renderPulseEditor", () => {
  it("renders editor profile card with sameAs links", () => {
    const html = renderPulseEditor({
      editor: { ...baseEditor, expertiseAreas: ["AI"] },
      posts: [],
    });
    expect(html).toContain("Alex Boudreaux");
    expect(html).toContain("Founder of Blipp.");
    expect(html).toContain('href="https://twitter.com/alexbdx"');
    expect(html).toContain('href="https://linkedin.com/in/alex"');
  });

  it("emits Person JSON-LD with sameAs", () => {
    const html = renderPulseEditor({ editor: baseEditor, posts: [] });
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const parsed = JSON.parse(match![1]);
    expect(parsed["@type"]).toBe("Person");
    expect(parsed.name).toBe("Alex Boudreaux");
    expect(parsed.sameAs).toContain("https://twitter.com/alexbdx");
  });
});

describe("renderPulseTopic", () => {
  it("renders topic label and matching post cards", () => {
    const html = renderPulseTopic({
      topicSlug: "ai",
      topicLabel: "AI",
      posts: [
        {
          slug: "ai-post",
          title: "AI post",
          subtitle: null,
          publishedAt: new Date("2026-04-20"),
          wordCount: null,
          topicTags: ["AI"],
          editor: { slug: "alex", name: "Alex" },
        },
      ],
    });
    expect(html).toContain("<h1>AI</h1>");
    expect(html).toContain("AI post");
    expect(html).toContain("1 post.");
  });
});
