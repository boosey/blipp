# Plan: Geolocation Capture + Onboarding Profile Questions

**Date:** 2026-03-19
**Status:** Design complete, implementation deferred until rec engine overhaul

## Context

The recommendation engine currently infers user interests purely from behavioral signals (subscriptions, favorites, votes). This creates a cold-start problem and misses explicit user context like location, profession, and interests. This plan adds two data sources:

1. **Cloudflare `cf` geolocation** — automatic, zero-friction location capture on every app load
2. **Onboarding profile step** — optional profession, interests, and listening goals

The rec engine scoring weights are being reworked in a separate session, so this plan focuses on **data capture, storage, and API** — making the new signals available for the rec engine to consume. Minimal rec engine changes: just wire interests into `computeUserProfile()` category weights and improve cold-start.

---

## Step 1: Prisma Schema — New User Fields

**File:** `prisma/schema.prisma` (User model)

Add 7 new optional fields:

```prisma
// Geolocation (auto-captured from Cloudflare cf object)
geoCity          String?
geoRegion        String?   // State/province
geoCountry       String?   // ISO 3166-1 alpha-2 (e.g., "US", "GB")
geoTimezone      String?   // IANA timezone (e.g., "America/New_York")
geoUpdatedAt     DateTime?

// Onboarding profile (optional, user-editable)
profession       String?     // From predefined dropdown
interests        String[]    // Multi-select broad topics
listeningGoals   String[]    // Multi-select goals

@@index([geoCountry])
```

All nullable — no breaking changes, no data migration needed.

Run: `npx prisma db push` (staging + production)

---

## Step 2: Shared Constants

**New file:** `src/lib/profile-constants.ts`

Shared between onboarding, settings, and backend validation. Frontend-safe (no server imports).

```typescript
export const PROFESSIONS = [
  "Software Engineer", "Designer", "Product Manager", "Marketing",
  "Data / Analytics", "Sales", "Finance", "Healthcare", "Education",
  "Student", "Journalist", "Researcher", "Entrepreneur", "Legal",
  "Creative / Arts",
] as const;

export const INTERESTS = [
  "Artificial Intelligence", "Startups", "World News",
  "US Politics", "Science & Nature", "History", "Psychology",
  "Personal Finance", "Health & Fitness", "Parenting",
  "Sports", "Music", "Film & TV", "Gaming", "Food & Cooking",
  "Travel", "Climate & Environment", "Philosophy",
  "Career Development", "Relationships", "True Crime",
  "Space & Astronomy", "Spirituality", "Design & Architecture",
] as const;

export const LISTENING_GOALS = [
  "Stay informed on current events",
  "Learn new things",
  "Entertainment & fun",
  "Professional development",
  "Deep dives & research",
  "Background listening",
] as const;
```

---

## Step 3: Backend — Geolocation Capture

**File:** `worker/routes/me.ts` — `GET /` handler

After `getCurrentUser()` + `findUnique`, extract CF geo and conditionally update:

```typescript
const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined;
const geoStale = !fullUser.geoUpdatedAt ||
  (Date.now() - new Date(fullUser.geoUpdatedAt).getTime() > 86_400_000); // 24h

if (cf && geoStale) {
  c.executionCtx.waitUntil(
    prisma.user.update({
      where: { id: fullUser.id },
      data: {
        geoCity: (cf.city as string) || null,
        geoRegion: (cf.region as string) || null,
        geoCountry: (cf.country as string) || null,
        geoTimezone: (cf.timezone as string) || null,
        geoUpdatedAt: new Date(),
      },
    }).catch(() => {}) // fire-and-forget, don't block response
  );
}
```

Key decisions:
- Only on `GET /api/me` (called once per app session), not global middleware
- 24h throttle prevents redundant DB writes
- `waitUntil` — non-blocking, doesn't delay the response
- `cf` is undefined in tests — guarded by `if (cf && geoStale)`

---

## Step 4: Backend — Profile API Endpoints

**File:** `worker/routes/me.ts`

### `GET /profile`
Returns current profile data for settings page.

### `PATCH /profile`
Zod-validated body:
```typescript
const ProfileSchema = z.object({
  profession: z.string().max(100).nullable().optional(),
  interests: z.array(z.string().max(50)).max(20).optional(),
  listeningGoals: z.array(z.string().max(100)).max(10).optional(),
});
```

Updates user record, then calls `recomputeUserProfile(userId, prisma)` to refresh recommendation profile with new interest data. Recompute is try/caught — non-critical.

---

## Step 5: Rec Engine — Wire Interests into Profile

**File:** `worker/lib/recommendations.ts` — `computeUserProfile()`

Minimal change: after aggregating category weights from subscriptions/favorites/votes, also incorporate declared interests via an `INTEREST_TO_CATEGORIES` mapping.

```typescript
const INTEREST_TO_CATEGORIES: Record<string, string[]> = {
  "Artificial Intelligence": ["Technology", "Science"],
  "Startups": ["Business", "Technology"],
  "World News": ["News", "Society & Culture"],
  // ... (full mapping for all 24 interests)
};
```

### Cold-start improvement

Users with profile data (interests filled in) skip the popularity-only fallback and go straight to personalized scoring, even with <3 subscriptions.

**Note:** Full scoring weight rework happens in separate rec engine overhaul session. These changes just ensure interests data feeds into the existing `categoryWeights` vector.

---

## Step 6: Frontend — Onboarding Profile Step

**File:** `src/pages/onboarding.tsx`

Change step flow from `1 | 2 | 3` to `1 | 2 | 3 | 4`:
- Step 1: Welcome (unchanged)
- **Step 2: Profile Questions (NEW)**
- Step 3: Podcast Selection (was step 2)
- Step 4: Confirmation (was step 3)

### Step 2 UI — Profile Questions

Three optional sections:

**a) Profession** — shadcn `Select` dropdown from `PROFESSIONS` constant + "Other" freeform

**b) Interests** — toggleable pill grid (same pattern as category filter pills in podcast selection step)

**c) Listening Goals** — toggleable pill grid, multi-select

On "Continue": `PATCH /me/profile`, then advance. Non-blocking.
"Skip" button: advances without saving.

---

## Step 7: Frontend — Settings Profile Section

**File:** `src/pages/settings.tsx`

New "Profile" section after "Account", before "Usage":
- Fetch via `useFetch<{data: ProfileData}>("/me/profile")`
- Same UI as onboarding (dropdown + pill grids)
- Save button → `PATCH /me/profile` → toast feedback

---

## Step 8: Tests

- `worker/routes/__tests__/me.test.ts` — profile CRUD + geo capture + throttle
- `worker/lib/__tests__/recommendations.test.ts` — interest→category mapping, cold-start with/without profile

---

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | 7 new User fields + index |
| `src/lib/profile-constants.ts` | **New** — shared constants |
| `worker/routes/me.ts` | Geo capture on GET, new GET/PATCH /profile |
| `worker/lib/recommendations.ts` | Interest→category mapping, cold-start improvement |
| `src/pages/onboarding.tsx` | New step 2 (profile questions) |
| `src/pages/settings.tsx` | New "Profile" section |
| Tests | Profile + geo + rec engine integration |

---

## Other Data Sources Considered

### YouTube Data API v3 (deferred)
- User's channel subscriptions → podcast interest signals
- Requires `youtube.readonly` OAuth scope via Clerk Google auth
- Google verification process needed (days to weeks)
- At 1400+ podcasts, catalog overlap is viable
- Worth pursuing after core profile features ship

### LinkedIn API (rejected)
- Extremely restrictive — only basic profile for most apps
- Not practical for profession/interest data

### Browser Geolocation API (rejected for now)
- Street-level accuracy but requires explicit permission prompt
- CF geolocation (city-level, automatic) is sufficient for recs
