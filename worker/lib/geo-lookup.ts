/**
 * US city/state/region matching functions for podcast geo-tagging.
 * Matches podcast title/description text against known US cities,
 * states, and regional phrases to determine geographic affinity.
 */

export interface GeoMatch {
  city: string;      // city name, or "" for state-level matches
  state: string;     // full state name
  scope: "city" | "regional" | "state";
  confidence: number;
  teamId?: string;
}

// ── Top ~50 US cities → state ──

export const US_CITIES: Map<string, { state: string }> = new Map([
  ["New York", { state: "New York" }],
  ["Los Angeles", { state: "California" }],
  ["Chicago", { state: "Illinois" }],
  ["Houston", { state: "Texas" }],
  ["Dallas", { state: "Texas" }],
  ["San Francisco", { state: "California" }],
  ["Seattle", { state: "Washington" }],
  ["Miami", { state: "Florida" }],
  ["Boston", { state: "Massachusetts" }],
  ["Atlanta", { state: "Georgia" }],
  ["Denver", { state: "Colorado" }],
  ["Phoenix", { state: "Arizona" }],
  ["Philadelphia", { state: "Pennsylvania" }],
  ["Detroit", { state: "Michigan" }],
  ["Minneapolis", { state: "Minnesota" }],
  ["Tampa", { state: "Florida" }],
  ["Portland", { state: "Oregon" }],
  ["San Diego", { state: "California" }],
  ["St. Louis", { state: "Missouri" }],
  ["Charlotte", { state: "North Carolina" }],
  ["Nashville", { state: "Tennessee" }],
  ["Indianapolis", { state: "Indiana" }],
  ["Austin", { state: "Texas" }],
  ["Las Vegas", { state: "Nevada" }],
  ["Kansas City", { state: "Missouri" }],
  ["Columbus", { state: "Ohio" }],
  ["Cleveland", { state: "Ohio" }],
  ["Pittsburgh", { state: "Pennsylvania" }],
  ["Cincinnati", { state: "Ohio" }],
  ["Milwaukee", { state: "Wisconsin" }],
  ["New Orleans", { state: "Louisiana" }],
  ["Salt Lake City", { state: "Utah" }],
  ["Jacksonville", { state: "Florida" }],
  ["Memphis", { state: "Tennessee" }],
  ["Richmond", { state: "Virginia" }],
  ["Oklahoma City", { state: "Oklahoma" }],
  ["Hartford", { state: "Connecticut" }],
  ["Raleigh", { state: "North Carolina" }],
  ["Birmingham", { state: "Alabama" }],
  ["Buffalo", { state: "New York" }],
  ["San Antonio", { state: "Texas" }],
  ["Sacramento", { state: "California" }],
  ["Orlando", { state: "Florida" }],
  ["Baltimore", { state: "Maryland" }],
  ["Washington", { state: "District of Columbia" }],
  ["Louisville", { state: "Kentucky" }],
  ["San Jose", { state: "California" }],
  ["Norfolk", { state: "Virginia" }],
  ["Tucson", { state: "Arizona" }],
  ["Fresno", { state: "California" }],
  ["Omaha", { state: "Nebraska" }],
  ["Honolulu", { state: "Hawaii" }],
  ["Albuquerque", { state: "New Mexico" }],
  ["Green Bay", { state: "Wisconsin" }],
]);

// ── All 50 states (+ DC) for state-level matching ──

const US_STATE_NAMES: Set<string> = new Set([
  ...new Set([...US_CITIES.values()].map((v) => v.state)),
  // States not represented in the cities list above
  "Alaska", "Arkansas", "Idaho", "Iowa", "Kansas", "Maine",
  "Mississippi", "Montana", "Nebraska", "New Hampshire",
  "New Jersey", "New Mexico", "North Dakota", "Rhode Island",
  "South Carolina", "South Dakota", "Vermont", "West Virginia",
  "Wyoming", "Delaware",
]);

// ── Regional phrases → city/state pairs ──

export const REGIONAL_PHRASES: Map<string, { city: string; state: string }[]> = new Map([
  ["Bay Area", [{ city: "San Francisco", state: "California" }, { city: "San Jose", state: "California" }]],
  ["Pacific Northwest", [{ city: "Seattle", state: "Washington" }, { city: "Portland", state: "Oregon" }]],
  ["Tri-State", [{ city: "New York", state: "New York" }]],
  ["the South", [{ city: "Atlanta", state: "Georgia" }, { city: "Miami", state: "Florida" }, { city: "New Orleans", state: "Louisiana" }, { city: "Nashville", state: "Tennessee" }, { city: "Birmingham", state: "Alabama" }]],
  ["New England", [{ city: "Boston", state: "Massachusetts" }, { city: "Hartford", state: "Connecticut" }]],
  ["Southern California", [{ city: "Los Angeles", state: "California" }, { city: "San Diego", state: "California" }]],
  ["the Midwest", [{ city: "Chicago", state: "Illinois" }, { city: "Detroit", state: "Michigan" }, { city: "Minneapolis", state: "Minnesota" }, { city: "Milwaukee", state: "Wisconsin" }]],
]);

// ── Ambiguous city names (exist in multiple states) ──

export const AMBIGUOUS_CITIES: Set<string> = new Set([
  "Portland",
  "Springfield",
  "Columbus",
  "Jacksonville",
  "Richmond",
  "Memphis",
  "Birmingham",
  "Charlotte",
]);

// ── Matching functions ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryMatch(text: string, term: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
  return pattern.test(text);
}

/**
 * Find city matches in podcast title/description.
 * For ambiguous cities: require state name also in text, OR city appears in title only.
 */
export function findCityMatches(title: string, description: string): GeoMatch[] {
  const matches: GeoMatch[] = [];
  const combined = `${title} ${description}`;

  for (const [city, { state }] of US_CITIES) {
    const inTitle = wordBoundaryMatch(title, city);
    const inCombined = wordBoundaryMatch(combined, city);

    if (!inCombined) continue;

    if (AMBIGUOUS_CITIES.has(city)) {
      // For ambiguous cities: require state context or title-only mention
      const stateInText = wordBoundaryMatch(combined, state);
      if (!stateInText && !inTitle) continue;
    }

    matches.push({
      city,
      state,
      scope: "city",
      confidence: inTitle ? 0.9 : 0.7,
    });
  }

  return matches;
}

/**
 * Find state matches in podcast title/description using full state names.
 */
export function findStateMatches(title: string, description: string): GeoMatch[] {
  const matches: GeoMatch[] = [];
  const combined = `${title} ${description}`;

  for (const state of US_STATE_NAMES) {
    if (wordBoundaryMatch(combined, state)) {
      const inTitle = wordBoundaryMatch(title, state);
      matches.push({
        city: "",
        state,
        scope: "state",
        confidence: inTitle ? 0.6 : 0.4,
      });
    }
  }

  return matches;
}

/**
 * Find regional phrase matches in podcast title/description.
 */
export function findRegionalMatches(title: string, description: string): GeoMatch[] {
  const matches: GeoMatch[] = [];
  const combined = `${title} ${description}`;

  for (const [phrase, locations] of REGIONAL_PHRASES) {
    if (wordBoundaryMatch(combined, phrase)) {
      const inTitle = wordBoundaryMatch(title, phrase);
      for (const loc of locations) {
        matches.push({
          city: loc.city,
          state: loc.state,
          scope: "regional",
          confidence: inTitle ? 0.8 : 0.6,
        });
      }
    }
  }

  return matches;
}
