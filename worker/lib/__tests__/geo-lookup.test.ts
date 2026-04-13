import { describe, it, expect } from "vitest";
import {
  US_CITIES,
  REGIONAL_PHRASES,
  AMBIGUOUS_CITIES,
  findCityMatches,
  findStateMatches,
  findRegionalMatches,
} from "../geo-lookup";

describe("geo-lookup tables", () => {
  it("US_CITIES contains key cities with correct states", () => {
    expect(US_CITIES.get("New York")?.state).toBe("New York");
    expect(US_CITIES.get("Los Angeles")?.state).toBe("California");
    expect(US_CITIES.get("Chicago")?.state).toBe("Illinois");
    expect(US_CITIES.get("Houston")?.state).toBe("Texas");
    expect(US_CITIES.get("Seattle")?.state).toBe("Washington");
    expect(US_CITIES.get("Miami")?.state).toBe("Florida");
  });

  it("REGIONAL_PHRASES maps Bay Area to SF", () => {
    const bayArea = REGIONAL_PHRASES.get("Bay Area");
    expect(bayArea).toBeDefined();
    expect(bayArea!.some((l) => l.city === "San Francisco" && l.state === "California")).toBe(true);
  });

  it("REGIONAL_PHRASES maps Pacific Northwest to Seattle+Portland", () => {
    const pnw = REGIONAL_PHRASES.get("Pacific Northwest");
    expect(pnw).toBeDefined();
    expect(pnw!.some((l) => l.city === "Seattle")).toBe(true);
    expect(pnw!.some((l) => l.city === "Portland")).toBe(true);
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
    expect(matches[0].city).toBe("Seattle");
    expect(matches[0].state).toBe("Washington");
    expect(matches[0].scope).toBe("city");
    expect(matches[0].confidence).toBe(0.9);
  });

  it("matches city name in description with lower confidence", () => {
    const matches = findCityMatches("Local News Podcast", "Covering news from Denver and surrounding areas");
    expect(matches).toHaveLength(1);
    expect(matches[0].city).toBe("Denver");
    expect(matches[0].state).toBe("Colorado");
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
    expect(withState[0].city).toBe("Portland");
    expect(withState[0].state).toBe("Oregon");
  });

  it("allows ambiguous city in title without state context", () => {
    const matches = findCityMatches("Jacksonville Daily News", "Local news and weather");
    expect(matches).toHaveLength(1);
    expect(matches[0].city).toBe("Jacksonville");
    expect(matches[0].state).toBe("Florida");
    expect(matches[0].confidence).toBe(0.9);
  });

  it("returns empty for no geographic mentions", () => {
    const matches = findCityMatches("True Crime Weekly", "A podcast about unsolved mysteries");
    expect(matches).toHaveLength(0);
  });

  it("matches multiple cities", () => {
    const matches = findCityMatches("East Coast Roundup", "News from Boston and Miami this week");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const cities = matches.map((m) => m.city);
    expect(cities).toContain("Boston");
    expect(cities).toContain("Miami");
  });
});

describe("findStateMatches", () => {
  it("matches state name in title", () => {
    const matches = findStateMatches("Texas Football Weekly", "");
    expect(matches).toHaveLength(1);
    expect(matches[0].state).toBe("Texas");
    expect(matches[0].city).toBe("");
    expect(matches[0].scope).toBe("state");
    expect(matches[0].confidence).toBe(0.6);
  });

  it("matches state name in description with lower confidence", () => {
    const matches = findStateMatches("Local Politics", "Coverage of California state legislature");
    const ca = matches.find((m) => m.state === "California");
    expect(ca).toBeDefined();
    expect(ca!.confidence).toBe(0.4);
  });

  it("matches state from description", () => {
    const matches = findStateMatches("News", "News from Oregon today");
    const states = matches.map((m) => m.state);
    expect(states).toContain("Oregon");
  });

  it("returns empty for non-US states", () => {
    const matches = findStateMatches("Ontario News", "Canadian province updates");
    expect(matches).toHaveLength(0);
  });
});

describe("findRegionalMatches", () => {
  it("matches Bay Area", () => {
    const matches = findRegionalMatches("Bay Area Tech Talk", "Silicon Valley startup news");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].city).toBe("San Francisco");
    expect(matches[0].state).toBe("California");
    expect(matches[0].scope).toBe("regional");
    expect(matches[0].confidence).toBe(0.8);
  });

  it("matches Pacific Northwest in description", () => {
    const matches = findRegionalMatches("Outdoor Adventures", "Hiking in the Pacific Northwest");
    expect(matches).toHaveLength(2);
    const cities = matches.map((m) => m.city);
    expect(cities).toContain("Seattle");
    expect(cities).toContain("Portland");
    expect(matches[0].confidence).toBe(0.6); // description-only
  });

  it("does not match removed ambiguous phrases like the South or the Midwest", () => {
    const south = findRegionalMatches("the South Report", "");
    expect(south).toHaveLength(0);
    const midwest = findRegionalMatches("the Midwest Report", "");
    expect(midwest).toHaveLength(0);
  });

  it("returns empty for non-regional phrases", () => {
    const matches = findRegionalMatches("Tech News Daily", "Latest in technology");
    expect(matches).toHaveLength(0);
  });
});
