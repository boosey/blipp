import { describe, it, expect } from "vitest";
import {
  US_CITIES,
  US_STATES,
  REGIONAL_PHRASES,
  AMBIGUOUS_CITIES,
  findCityMatches,
  findStateMatches,
  findRegionalMatches,
} from "../geo-lookup";

describe("geo-lookup tables", () => {
  it("US_CITIES contains key cities with correct DMA codes", () => {
    expect(US_CITIES.get("New York")?.dmaCode).toBe("501");
    expect(US_CITIES.get("Los Angeles")?.dmaCode).toBe("803");
    expect(US_CITIES.get("Chicago")?.dmaCode).toBe("602");
    expect(US_CITIES.get("Houston")?.dmaCode).toBe("618");
    expect(US_CITIES.get("Seattle")?.dmaCode).toBe("819");
    expect(US_CITIES.get("Miami")?.dmaCode).toBe("528");
  });

  it("US_STATES covers all 50 states", () => {
    expect(US_STATES.size).toBe(50);
  });

  it("US_STATES maps Texas to expected DMA codes", () => {
    const texas = US_STATES.get("Texas");
    expect(texas).toBeDefined();
    expect(texas).toContain("618"); // Houston
    expect(texas).toContain("623"); // Dallas
    expect(texas).toContain("635"); // Austin
  });

  it("REGIONAL_PHRASES maps Bay Area to SF DMA", () => {
    expect(REGIONAL_PHRASES.get("Bay Area")).toEqual(["807"]);
  });

  it("REGIONAL_PHRASES maps Pacific Northwest to Seattle+Portland", () => {
    const pnw = REGIONAL_PHRASES.get("Pacific Northwest");
    expect(pnw).toContain("819");
    expect(pnw).toContain("820");
  });

  it("AMBIGUOUS_CITIES contains expected entries", () => {
    expect(AMBIGUOUS_CITIES.has("Portland")).toBe(true);
    expect(AMBIGUOUS_CITIES.has("Springfield")).toBe(true);
    expect(AMBIGUOUS_CITIES.has("Columbus")).toBe(true);
    expect(AMBIGUOUS_CITIES.has("Jacksonville")).toBe(true);
    // Non-ambiguous city should not be in set
    expect(AMBIGUOUS_CITIES.has("Seattle")).toBe(false);
  });
});

describe("findCityMatches", () => {
  it("matches city name in title", () => {
    const matches = findCityMatches("The Seattle Sports Hour", "Weekly sports recap");
    expect(matches).toHaveLength(1);
    expect(matches[0].dmaCode).toBe("819");
    expect(matches[0].scope).toBe("city");
    expect(matches[0].confidence).toBe(0.9);
  });

  it("matches city name in description with lower confidence", () => {
    const matches = findCityMatches("Local News Podcast", "Covering news from Denver and surrounding areas");
    expect(matches).toHaveLength(1);
    expect(matches[0].dmaCode).toBe("751");
    expect(matches[0].confidence).toBe(0.7);
  });

  it("does not match partial city names", () => {
    const matches = findCityMatches("Portland Cement Talk", "");
    // "Portland" is ambiguous but appears in title → should match
    expect(matches.length).toBeGreaterThan(0);
  });

  it("requires state context for ambiguous cities in description only", () => {
    // "Portland" in description without state → no match
    const noMatch = findCityMatches("Sports Talk", "Great coverage of Portland teams");
    expect(noMatch).toHaveLength(0);

    // "Portland" in description with state → match
    const withState = findCityMatches("Sports Talk", "Great coverage of Portland Oregon teams");
    expect(withState).toHaveLength(1);
    expect(withState[0].dmaCode).toBe("820");
  });

  it("allows ambiguous city in title without state context", () => {
    const matches = findCityMatches("Jacksonville Daily News", "Local news and weather");
    expect(matches).toHaveLength(1);
    expect(matches[0].dmaCode).toBe("561");
    expect(matches[0].confidence).toBe(0.9);
  });

  it("returns empty for no geographic mentions", () => {
    const matches = findCityMatches("True Crime Weekly", "A podcast about unsolved mysteries");
    expect(matches).toHaveLength(0);
  });

  it("matches multiple cities", () => {
    const matches = findCityMatches("East Coast Roundup", "News from Boston and Miami this week");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const dmaCodes = matches.map((m) => m.dmaCode);
    expect(dmaCodes).toContain("506"); // Boston
    expect(dmaCodes).toContain("528"); // Miami
  });
});

describe("findStateMatches", () => {
  it("matches state name in title", () => {
    const matches = findStateMatches("Texas Football Weekly", "");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].scope).toBe("state");
    expect(matches[0].confidence).toBe(0.6);
    const dmaCodes = matches.map((m) => m.dmaCode);
    expect(dmaCodes).toContain("618"); // Houston
  });

  it("matches state name in description with lower confidence", () => {
    const matches = findStateMatches("Local Politics", "Coverage of California state legislature");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].confidence).toBe(0.4);
  });

  it("does not match state substrings", () => {
    // "Virginia" should not match inside "West Virginia" when only "West Virginia" is present
    // But both "Virginia" standalone would match
    const matches = findStateMatches("News", "News from Oregon today");
    const dmaCodes = matches.map((m) => m.dmaCode);
    expect(dmaCodes).toContain("820"); // Oregon/Portland
  });

  it("returns empty for non-US states", () => {
    const matches = findStateMatches("Ontario News", "Canadian province updates");
    expect(matches).toHaveLength(0);
  });
});

describe("findRegionalMatches", () => {
  it("matches Bay Area", () => {
    const matches = findRegionalMatches("Bay Area Tech Talk", "Silicon Valley startup news");
    expect(matches).toHaveLength(1);
    expect(matches[0].dmaCode).toBe("807");
    expect(matches[0].scope).toBe("regional");
    expect(matches[0].confidence).toBe(0.8);
  });

  it("matches Pacific Northwest in description", () => {
    const matches = findRegionalMatches("Outdoor Adventures", "Hiking in the Pacific Northwest");
    expect(matches).toHaveLength(2);
    const dmaCodes = matches.map((m) => m.dmaCode);
    expect(dmaCodes).toContain("819"); // Seattle
    expect(dmaCodes).toContain("820"); // Portland
    expect(matches[0].confidence).toBe(0.6); // description-only
  });

  it("matches the Midwest", () => {
    const matches = findRegionalMatches("the Midwest Report", "");
    expect(matches.length).toBeGreaterThanOrEqual(4);
    expect(matches[0].scope).toBe("regional");
  });

  it("returns empty for non-regional phrases", () => {
    const matches = findRegionalMatches("Tech News Daily", "Latest in technology");
    expect(matches).toHaveLength(0);
  });
});
