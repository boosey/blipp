/**
 * US city/state/region → DMA code lookup tables and matching functions
 * for podcast geo-tagging.
 */

export interface GeoMatch {
  dmaCode: string;
  scope: "city" | "regional" | "state";
  confidence: number;
  teamId?: string;
}

// ── Top ~100 US cities → DMA code ──

export const US_CITIES: Map<string, { dmaCode: string; state?: string }> = new Map([
  ["New York", { dmaCode: "501", state: "New York" }],
  ["Los Angeles", { dmaCode: "803", state: "California" }],
  ["Chicago", { dmaCode: "602", state: "Illinois" }],
  ["Houston", { dmaCode: "618", state: "Texas" }],
  ["Dallas", { dmaCode: "623", state: "Texas" }],
  ["San Francisco", { dmaCode: "807", state: "California" }],
  ["Seattle", { dmaCode: "819", state: "Washington" }],
  ["Miami", { dmaCode: "528", state: "Florida" }],
  ["Boston", { dmaCode: "506", state: "Massachusetts" }],
  ["Atlanta", { dmaCode: "524", state: "Georgia" }],
  ["Denver", { dmaCode: "751", state: "Colorado" }],
  ["Phoenix", { dmaCode: "753", state: "Arizona" }],
  ["Philadelphia", { dmaCode: "504", state: "Pennsylvania" }],
  ["Detroit", { dmaCode: "505", state: "Michigan" }],
  ["Minneapolis", { dmaCode: "613", state: "Minnesota" }],
  ["Tampa", { dmaCode: "539", state: "Florida" }],
  ["Portland", { dmaCode: "820", state: "Oregon" }],
  ["San Diego", { dmaCode: "825", state: "California" }],
  ["St. Louis", { dmaCode: "609", state: "Missouri" }],
  ["Charlotte", { dmaCode: "517", state: "North Carolina" }],
  ["Nashville", { dmaCode: "659", state: "Tennessee" }],
  ["Indianapolis", { dmaCode: "527", state: "Indiana" }],
  ["Austin", { dmaCode: "635", state: "Texas" }],
  ["Las Vegas", { dmaCode: "839", state: "Nevada" }],
  ["Kansas City", { dmaCode: "616", state: "Missouri" }],
  ["Columbus", { dmaCode: "535", state: "Ohio" }],
  ["Cleveland", { dmaCode: "510", state: "Ohio" }],
  ["Pittsburgh", { dmaCode: "508", state: "Pennsylvania" }],
  ["Cincinnati", { dmaCode: "515", state: "Ohio" }],
  ["Milwaukee", { dmaCode: "617", state: "Wisconsin" }],
  ["New Orleans", { dmaCode: "622", state: "Louisiana" }],
  ["Salt Lake City", { dmaCode: "770", state: "Utah" }],
  ["Jacksonville", { dmaCode: "561", state: "Florida" }],
  ["Memphis", { dmaCode: "640", state: "Tennessee" }],
  ["Richmond", { dmaCode: "556", state: "Virginia" }],
  ["Oklahoma City", { dmaCode: "650", state: "Oklahoma" }],
  ["Hartford", { dmaCode: "533", state: "Connecticut" }],
  ["Raleigh", { dmaCode: "560", state: "North Carolina" }],
  ["Birmingham", { dmaCode: "630", state: "Alabama" }],
  ["Buffalo", { dmaCode: "514", state: "New York" }],
  ["San Antonio", { dmaCode: "641", state: "Texas" }],
  ["Sacramento", { dmaCode: "862", state: "California" }],
  ["Orlando", { dmaCode: "534", state: "Florida" }],
  ["Baltimore", { dmaCode: "512", state: "Maryland" }],
  ["Washington", { dmaCode: "511", state: "District of Columbia" }],
  ["Louisville", { dmaCode: "529", state: "Kentucky" }],
  ["San Jose", { dmaCode: "807", state: "California" }],
  ["Norfolk", { dmaCode: "544", state: "Virginia" }],
  ["Tucson", { dmaCode: "789", state: "Arizona" }],
  ["Fresno", { dmaCode: "866", state: "California" }],
  ["Omaha", { dmaCode: "652", state: "Nebraska" }],
  ["Honolulu", { dmaCode: "744", state: "Hawaii" }],
  ["Albuquerque", { dmaCode: "790", state: "New Mexico" }],
]);

// ── All 50 states → DMA codes ──

export const US_STATES: Map<string, string[]> = new Map([
  ["Alabama", ["630", "691", "698", "522", "686"]],
  ["Alaska", ["743"]],
  ["Arizona", ["753", "789", "771"]],
  ["Arkansas", ["693", "628", "670"]],
  ["California", ["803", "807", "825", "862", "866", "800", "868"]],
  ["Colorado", ["751", "752"]],
  ["Connecticut", ["533", "501"]],
  ["Delaware", ["504"]],
  ["Florida", ["528", "539", "534", "561", "548", "592", "571", "656"]],
  ["Georgia", ["524", "503", "522"]],
  ["Hawaii", ["744"]],
  ["Idaho", ["757", "758"]],
  ["Illinois", ["602", "675", "648"]],
  ["Indiana", ["527", "588", "581", "509"]],
  ["Iowa", ["679", "637", "682"]],
  ["Kansas", ["616", "678"]],
  ["Kentucky", ["529", "541", "515"]],
  ["Louisiana", ["622", "612", "642", "644"]],
  ["Maine", ["500"]],
  ["Maryland", ["512", "511"]],
  ["Massachusetts", ["506"]],
  ["Michigan", ["505", "563", "540"]],
  ["Minnesota", ["613", "737"]],
  ["Mississippi", ["718", "746", "711"]],
  ["Missouri", ["609", "616", "619"]],
  ["Montana", ["762", "754", "755", "756"]],
  ["Nebraska", ["652", "722"]],
  ["Nevada", ["839", "811"]],
  ["New Hampshire", ["506"]],
  ["New Jersey", ["501", "504"]],
  ["New Mexico", ["790"]],
  ["New York", ["501", "514", "532", "555", "526", "565"]],
  ["North Carolina", ["517", "560", "518", "545"]],
  ["North Dakota", ["724"]],
  ["Ohio", ["535", "510", "515", "542", "547"]],
  ["Oklahoma", ["650", "671"]],
  ["Oregon", ["820"]],
  ["Pennsylvania", ["504", "508", "566", "577"]],
  ["Rhode Island", ["521"]],
  ["South Carolina", ["519", "546", "570"]],
  ["South Dakota", ["725", "740"]],
  ["Tennessee", ["659", "640", "557", "531"]],
  ["Texas", ["618", "623", "635", "641", "651", "636", "749", "634", "692"]],
  ["Utah", ["770"]],
  ["Vermont", ["523"]],
  ["Virginia", ["556", "544", "511", "573"]],
  ["Washington", ["819", "881"]],
  ["West Virginia", ["564", "559"]],
  ["Wisconsin", ["617", "658", "669"]],
  ["Wyoming", ["767"]],
]);

// ── Regional phrases → DMA codes ──

export const REGIONAL_PHRASES: Map<string, string[]> = new Map([
  ["Bay Area", ["807"]],
  ["Pacific Northwest", ["819", "820"]],
  ["Tri-State", ["501"]],
  ["the South", ["524", "528", "622", "659", "630"]],
  ["New England", ["506", "533"]],
  ["Southern California", ["803", "825"]],
  ["the Midwest", ["602", "505", "613", "617"]],
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

  for (const [city, { dmaCode, state }] of US_CITIES) {
    const inTitle = wordBoundaryMatch(title, city);
    const inCombined = wordBoundaryMatch(combined, city);

    if (!inCombined) continue;

    if (AMBIGUOUS_CITIES.has(city)) {
      // For ambiguous cities: require state context or title-only mention
      const stateInText = state ? wordBoundaryMatch(combined, state) : false;
      if (!stateInText && !inTitle) continue;
    }

    matches.push({
      dmaCode,
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

  for (const [state, dmaCodes] of US_STATES) {
    if (wordBoundaryMatch(combined, state)) {
      const inTitle = wordBoundaryMatch(title, state);
      for (const dmaCode of dmaCodes) {
        matches.push({
          dmaCode,
          scope: "state",
          confidence: inTitle ? 0.6 : 0.4,
        });
      }
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

  for (const [phrase, dmaCodes] of REGIONAL_PHRASES) {
    if (wordBoundaryMatch(combined, phrase)) {
      const inTitle = wordBoundaryMatch(title, phrase);
      for (const dmaCode of dmaCodes) {
        matches.push({
          dmaCode,
          scope: "regional",
          confidence: inTitle ? 0.8 : 0.6,
        });
      }
    }
  }

  return matches;
}
