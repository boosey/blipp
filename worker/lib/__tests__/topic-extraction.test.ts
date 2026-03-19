import { describe, it, expect } from "vitest";
import {
  extractTopicsFromClaims,
  normalizeTopics,
  fingerprint,
} from "../topic-extraction";

const makeClaim = (
  text: string,
  importance = 5,
  overrides: Record<string, unknown> = {}
) => ({
  claim: text,
  speaker: "Host",
  importance,
  novelty: 5,
  excerpt: text,
  ...overrides,
});

describe("extractTopicsFromClaims", () => {
  it("extracts meaningful topics from claim text", () => {
    const claims = [
      makeClaim(
        "Artificial intelligence is transforming healthcare delivery systems"
      ),
      makeClaim(
        "Machine learning models can predict patient outcomes in healthcare"
      ),
    ];
    const topics = extractTopicsFromClaims(claims);
    const topicStrings = topics.map((t) => t.topic);
    expect(topicStrings).toEqual(expect.arrayContaining(["artificial intelligence"]));
    expect(topicStrings).toEqual(expect.arrayContaining(["healthcare"]));
  });

  it("returns empty array for empty claims", () => {
    expect(extractTopicsFromClaims([])).toEqual([]);
  });

  it("filters stopwords and short tokens", () => {
    const claims = [
      makeClaim("The quick brown fox is a very good example of an animal"),
    ];
    const topics = extractTopicsFromClaims(claims);
    const topicStrings = topics.map((t) => t.topic);
    // Common stopwords should not appear as standalone topics
    expect(topicStrings).not.toContain("the");
    expect(topicStrings).not.toContain("is");
    expect(topicStrings).not.toContain("a");
    expect(topicStrings).not.toContain("of");
    expect(topicStrings).not.toContain("an");
    // Short tokens (< 3 chars) should be filtered
    expect(topicStrings.every((t) => t.length >= 3 || t.includes(" "))).toBe(true);
  });

  it("weights topics by claim importance", () => {
    const claims = [
      makeClaim("blockchain technology revolutionizes finance", 10),
      makeClaim("gardening tips for beginners", 1),
    ];
    const topics = extractTopicsFromClaims(claims);
    const blockchain = topics.find((t) => t.topic === "blockchain");
    const gardening = topics.find((t) => t.topic === "gardening");
    // Higher importance claims should produce higher-weighted topics
    expect(blockchain).toBeDefined();
    expect(gardening).toBeDefined();
    expect(blockchain!.weight).toBeGreaterThan(gardening!.weight);
  });

  it("caps at 20 topics", () => {
    // Generate many claims with diverse vocabulary
    const words = [
      "quantum", "computing", "nanotechnology", "robotics", "genetics",
      "astronomy", "neuroscience", "cryptography", "biotechnology", "photonics",
      "thermodynamics", "electromagnetics", "aerodynamics", "geophysics", "biochemistry",
      "pharmacology", "epidemiology", "topology", "algebra", "calculus",
      "statistics", "economics", "psychology", "sociology", "anthropology",
      "linguistics", "philosophy", "archaeology", "metallurgy", "hydrology",
    ];
    const claims = words.map((w) =>
      makeClaim(`${w} advances modern scientific research significantly`)
    );
    const topics = extractTopicsFromClaims(claims);
    expect(topics.length).toBeLessThanOrEqual(20);
  });

  it("all topics are lowercase", () => {
    const claims = [
      makeClaim("NASA and SpaceX are pioneering Mars exploration technology"),
    ];
    const topics = extractTopicsFromClaims(claims);
    for (const t of topics) {
      expect(t.topic).toBe(t.topic.toLowerCase());
    }
  });
});

describe("normalizeTopics", () => {
  it("deduplicates near-identical topics", () => {
    const topics = [
      { topic: "machine-learning", weight: 5 },
      { topic: "machine learning", weight: 3 },
    ];
    const normalized = normalizeTopics(topics);
    const mlTopics = normalized.filter((t) => t.topic === "machine learning");
    expect(mlTopics.length).toBe(1);
    // Weight should be combined
    expect(mlTopics[0].weight).toBe(8);
  });

  it("lowercases all topics", () => {
    const topics = [
      { topic: "Blockchain", weight: 5 },
      { topic: "QUANTUM", weight: 3 },
    ];
    const normalized = normalizeTopics(topics);
    for (const t of normalized) {
      expect(t.topic).toBe(t.topic.toLowerCase());
    }
  });

  it("collapses hyphens to spaces", () => {
    const topics = [{ topic: "deep-learning", weight: 5 }];
    const normalized = normalizeTopics(topics);
    expect(normalized[0].topic).toBe("deep learning");
  });
});

describe("fingerprint", () => {
  it("returns normalized topics from claims", () => {
    const claims = [
      makeClaim("Artificial intelligence transforms modern healthcare systems"),
    ];
    const result = fingerprint(claims);
    expect(result.length).toBeGreaterThan(0);
    // All should be lowercase
    for (const t of result) {
      expect(t.topic).toBe(t.topic.toLowerCase());
    }
    // No hyphens (normalized)
    for (const t of result) {
      expect(t.topic).not.toContain("-");
    }
  });

  it("returns empty array for empty claims", () => {
    expect(fingerprint([])).toEqual([]);
  });
});
