# User App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first PWA user experience within the existing Blipp codebase — discover podcasts, subscribe, request briefings, and listen to clips.

**Architecture:** Same SPA codebase. New `MobileLayout` with bottom tab nav for user routes. New API endpoints for podcast detail, episode listing, and user request tracking. Existing admin routes/layout untouched.

**Tech Stack:** React 19, React Router v7, Tailwind v4, shadcn/ui, Hono, Prisma 7 (all existing). New: `vite-plugin-pwa`.

---

## Task 1: Shared Type Contracts

Define shared types used by both API responses and frontend components.

**Files:**
- Create: `src/types/user.ts`

**Step 1: Create the shared types file**

```typescript
// src/types/user.ts

/** Podcast detail as returned by the API */
export interface PodcastDetail {
  id: string;
  title: string;
  description: string | null;
  feedUrl: string;
  imageUrl: string | null;
  author: string | null;
  podcastIndexId: string | null;
  episodeCount: number;
  isSubscribed: boolean;
}

/** Episode summary for listing */
export interface EpisodeSummary {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  durationSeconds: number | null;
}

/** Briefing request as seen by the user */
export interface UserRequest {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  targetMinutes: number;
  createdAt: string;
  briefingId: string | null;
  /** Podcast info from the first request item */
  podcastTitle: string | null;
  podcastImageUrl: string | null;
  episodeTitle: string | null;
}

/** User-friendly status label */
export type RequestStatusLabel = "Creating" | "Complete" | "Error";

export function toStatusLabel(status: UserRequest["status"]): RequestStatusLabel {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "Creating";
    case "COMPLETED":
      return "Complete";
    case "FAILED":
      return "Error";
  }
}
```

**Step 2: Commit**

```bash
git add src/types/user.ts
git commit -m "feat: add shared user app type contracts"
```

---

## Task 2: API — Podcast Detail & Episodes Endpoints

Add `GET /api/podcasts/:id` and `GET /api/podcasts/:id/episodes` to the existing podcasts route file.

**Files:**
- Modify: `worker/routes/podcasts.ts`
- Test: `worker/routes/__tests__/podcasts-detail.test.ts`

**Step 1: Write the failing tests**

```typescript
// worker/routes/__tests__/podcasts-detail.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules before imports
vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk_123" })),
}));

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/podcast-index", () => ({
  PodcastIndexClient: vi.fn(),
}));

import { Hono } from "hono";
import { podcasts } from "../podcasts";
import { createPrismaClient } from "../../lib/db";
import { PodcastIndexClient } from "../../lib/podcast-index";

function createTestApp() {
  const app = new Hono();
  app.route("/podcasts", podcasts);
  return app;
}

describe("GET /podcasts/:id", () => {
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn() },
    podcast: { findUniqueOrThrow: vi.fn() },
    subscription: { findFirst: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPrismaClient as any).mockReturnValue(mockPrisma);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns podcast detail with isSubscribed=true", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      title: "Test Pod",
      description: "A podcast",
      feedUrl: "https://example.com/feed.xml",
      imageUrl: "https://example.com/img.jpg",
      author: "Author",
      podcastIndexId: "12345",
      episodeCount: 10,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({ id: "sub_1" });

    const app = createTestApp();
    const res = await app.request("/podcasts/pod_1", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.podcast.id).toBe("pod_1");
    expect(body.podcast.isSubscribed).toBe(true);
  });

  it("returns podcast detail with isSubscribed=false", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      title: "Test Pod",
      description: null,
      feedUrl: "https://example.com/feed.xml",
      imageUrl: null,
      author: null,
      podcastIndexId: null,
      episodeCount: 0,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    const app = createTestApp();
    const res = await app.request("/podcasts/pod_1", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.podcast.isSubscribed).toBe(false);
  });
});

describe("GET /podcasts/:id/episodes", () => {
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn() },
    podcast: { findUniqueOrThrow: vi.fn() },
    subscription: { findFirst: vi.fn() },
    episode: { findMany: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPrismaClient as any).mockReturnValue(mockPrisma);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns episodes for a podcast from the database", async () => {
    mockPrisma.podcast.findUniqueOrThrow.mockResolvedValue({
      id: "pod_1",
      feedUrl: "https://example.com/feed.xml",
      podcastIndexId: "12345",
    });
    mockPrisma.episode.findMany.mockResolvedValue([
      {
        id: "ep_1",
        title: "Episode 1",
        description: "First ep",
        publishedAt: new Date("2026-01-01"),
        durationSeconds: 3600,
      },
    ]);

    const app = createTestApp();
    const res = await app.request("/podcasts/pod_1/episodes", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.episodes).toHaveLength(1);
    expect(body.episodes[0].title).toBe("Episode 1");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run worker/routes/__tests__/podcasts-detail.test.ts
```

Expected: FAIL — routes don't exist yet.

**Step 3: Implement the endpoints**

Add to `worker/routes/podcasts.ts` (append before the closing of the file):

```typescript
/**
 * GET /:id — Get podcast detail with subscription status.
 *
 * @param id - The podcast's database ID
 * @returns Podcast detail with isSubscribed flag
 */
podcasts.get("/:id", async (c) => {
  const userId = getAuth(c)!.userId!;
  const podcastId = c.req.param("id");
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const podcast = await prisma.podcast.findUniqueOrThrow({
      where: { id: podcastId },
    });

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, podcastId },
    });

    return c.json({
      podcast: {
        id: podcast.id,
        title: podcast.title,
        description: podcast.description,
        feedUrl: podcast.feedUrl,
        imageUrl: podcast.imageUrl,
        author: podcast.author,
        podcastIndexId: podcast.podcastIndexId,
        episodeCount: podcast.episodeCount,
        isSubscribed: !!subscription,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /:id/episodes — List episodes for a podcast.
 * Returns episodes from the local database, ordered by publish date descending.
 *
 * @param id - The podcast's database ID
 * @returns Array of episode summaries
 */
podcasts.get("/:id/episodes", async (c) => {
  const podcastId = c.req.param("id");
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    // Verify podcast exists
    await prisma.podcast.findUniqueOrThrow({
      where: { id: podcastId },
    });

    const episodes = await prisma.episode.findMany({
      where: { podcastId },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        publishedAt: true,
        durationSeconds: true,
      },
    });

    return c.json({ episodes });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

**Important:** These two routes MUST be placed AFTER the existing named routes (`/search`, `/trending`, `/subscriptions`, `/subscribe`, `/refresh`) but BEFORE any catch-all. The `/:id` pattern would match string paths like "search" if placed first. Verify existing route order in the file.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run worker/routes/__tests__/podcasts-detail.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add worker/routes/podcasts.ts worker/routes/__tests__/podcasts-detail.test.ts
git commit -m "feat: add podcast detail and episodes API endpoints"
```

---

## Task 3: API — User Requests Endpoint

Add `GET /api/requests` and `GET /api/requests/:id` for the user to track their briefing requests.

**Files:**
- Create: `worker/routes/requests.ts`
- Modify: `worker/routes/index.ts` (mount new route)
- Test: `worker/routes/__tests__/requests.test.ts`

**Step 1: Write the failing tests**

```typescript
// worker/routes/__tests__/requests.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk_123" })),
}));

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

import { Hono } from "hono";
import { requests } from "../requests";
import { createPrismaClient } from "../../lib/db";

function createTestApp() {
  const app = new Hono();
  app.route("/requests", requests);
  return app;
}

describe("GET /requests", () => {
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn() },
    briefingRequest: { findMany: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPrismaClient as any).mockReturnValue(mockPrisma);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns user requests with enriched podcast/episode info", async () => {
    mockPrisma.briefingRequest.findMany.mockResolvedValue([
      {
        id: "req_1",
        status: "COMPLETED",
        targetMinutes: 5,
        createdAt: new Date("2026-03-06"),
        briefingId: "br_1",
        items: [{ podcastId: "pod_1", episodeId: "ep_1" }],
        jobs: [
          {
            episode: {
              title: "Great Episode",
              podcast: { title: "Great Podcast", imageUrl: "https://img.com/1.jpg" },
            },
          },
        ],
      },
    ]);

    const app = createTestApp();
    const res = await app.request("/requests", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].podcastTitle).toBe("Great Podcast");
    expect(body.requests[0].episodeTitle).toBe("Great Episode");
  });

  it("returns empty array when user has no requests", async () => {
    mockPrisma.briefingRequest.findMany.mockResolvedValue([]);

    const app = createTestApp();
    const res = await app.request("/requests", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requests).toEqual([]);
  });
});

describe("GET /requests/:id", () => {
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn() },
    briefingRequest: { findFirst: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPrismaClient as any).mockReturnValue(mockPrisma);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_1" });
  });

  it("returns request detail with briefing audio URL", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue({
      id: "req_1",
      status: "COMPLETED",
      targetMinutes: 5,
      createdAt: new Date("2026-03-06"),
      briefingId: "br_1",
      items: [{ podcastId: "pod_1" }],
      briefing: { id: "br_1", audioUrl: "https://r2.example.com/briefing.mp3", actualSeconds: 300 },
      jobs: [
        {
          episode: {
            title: "Great Episode",
            podcast: { title: "Great Podcast", imageUrl: "https://img.com/1.jpg" },
          },
        },
      ],
    });

    const app = createTestApp();
    const res = await app.request("/requests/req_1", {}, { HYPERDRIVE: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.request.briefing.audioUrl).toBe("https://r2.example.com/briefing.mp3");
  });

  it("returns 404 for non-existent request", async () => {
    mockPrisma.briefingRequest.findFirst.mockResolvedValue(null);

    const app = createTestApp();
    const res = await app.request("/requests/nonexistent", {}, { HYPERDRIVE: {} });

    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run worker/routes/__tests__/requests.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the requests route**

```typescript
// worker/routes/requests.ts
import { Hono } from "hono";
import type { Env } from "../types";
import { requireAuth, getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";

export const requests = new Hono<{ Bindings: Env }>();

requests.use("*", requireAuth);

/**
 * GET / — List the user's briefing requests with status and podcast info.
 * Returns the 50 most recent requests, newest first.
 */
requests.get("/", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const rawRequests = await prisma.briefingRequest.findMany({
      where: { userId: user.id, isTest: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        jobs: {
          take: 1,
          include: {
            episode: {
              include: { podcast: { select: { title: true, imageUrl: true } } },
            },
          },
        },
      },
    });

    const requests = rawRequests.map((r) => {
      const firstJob = r.jobs[0];
      return {
        id: r.id,
        status: r.status,
        targetMinutes: r.targetMinutes,
        createdAt: r.createdAt,
        briefingId: r.briefingId,
        podcastTitle: firstJob?.episode?.podcast?.title ?? null,
        podcastImageUrl: firstJob?.episode?.podcast?.imageUrl ?? null,
        episodeTitle: firstJob?.episode?.title ?? null,
      };
    });

    return c.json({ requests });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

/**
 * GET /:id — Get a single briefing request with briefing detail.
 */
requests.get("/:id", async (c) => {
  const userId = getAuth(c)!.userId!;
  const requestId = c.req.param("id");
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    const request = await prisma.briefingRequest.findFirst({
      where: { id: requestId, userId: user.id },
      include: {
        briefing: {
          select: { id: true, audioUrl: true, actualSeconds: true },
        },
        jobs: {
          include: {
            episode: {
              include: { podcast: { select: { title: true, imageUrl: true } } },
            },
          },
        },
      },
    });

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    const firstJob = request.jobs[0];
    return c.json({
      request: {
        id: request.id,
        status: request.status,
        targetMinutes: request.targetMinutes,
        createdAt: request.createdAt,
        briefingId: request.briefingId,
        podcastTitle: firstJob?.episode?.podcast?.title ?? null,
        podcastImageUrl: firstJob?.episode?.podcast?.imageUrl ?? null,
        episodeTitle: firstJob?.episode?.title ?? null,
        briefing: request.briefing,
      },
    });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

**Step 4: Mount the route in `worker/routes/index.ts`**

Add import and route:

```typescript
import { requests } from "./requests";
// ...
routes.route("/requests", requests);
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run worker/routes/__tests__/requests.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add worker/routes/requests.ts worker/routes/index.ts worker/routes/__tests__/requests.test.ts
git commit -m "feat: add user requests API endpoints"
```

---

## Task 4: API — Episode Briefing Request

Modify `POST /api/briefings/generate` to support requesting a briefing for a specific episode (one-off request), not just from subscriptions.

**Files:**
- Modify: `worker/routes/briefings.ts`
- Test: `worker/routes/__tests__/briefings-episode.test.ts`

**Step 1: Write the failing test**

```typescript
// worker/routes/__tests__/briefings-episode.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../middleware/auth", () => ({
  requireAuth: vi.fn((_c: any, next: any) => next()),
  getAuth: vi.fn(() => ({ userId: "clerk_123" })),
}));

vi.mock("../../lib/db", () => ({
  createPrismaClient: vi.fn(),
}));

vi.mock("../../lib/time-fitting", () => ({
  nearestTier: vi.fn((n: number) => n),
}));

import { Hono } from "hono";
import { briefings } from "../briefings";
import { createPrismaClient } from "../../lib/db";

function createTestApp() {
  const app = new Hono();
  app.route("/briefings", briefings);
  return app;
}

describe("POST /briefings/generate with episodeId", () => {
  const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };
  const mockPrisma = {
    user: { findUniqueOrThrow: vi.fn() },
    episode: { findUniqueOrThrow: vi.fn() },
    subscription: { findMany: vi.fn() },
    briefing: { count: vi.fn() },
    briefingRequest: { create: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPrismaClient as any).mockReturnValue(mockPrisma);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user_1",
      tier: "PRO",
      briefingLengthMinutes: 5,
    });
  });

  it("creates a request for a specific episode", async () => {
    mockPrisma.episode.findUniqueOrThrow.mockResolvedValue({
      id: "ep_1",
      podcastId: "pod_1",
    });
    mockPrisma.briefingRequest.create.mockResolvedValue({
      id: "req_1",
      status: "PENDING",
      targetMinutes: 5,
    });

    const app = createTestApp();
    const res = await app.request(
      "/briefings/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: "ep_1" }),
      },
      { HYPERDRIVE: {}, ORCHESTRATOR_QUEUE: mockQueue }
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.briefingRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ episodeId: "ep_1", useLatest: false }),
          ]),
        }),
      })
    );
    expect(mockQueue.send).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run worker/routes/__tests__/briefings-episode.test.ts
```

Expected: FAIL — the route ignores `episodeId` in the body.

**Step 3: Modify the generate endpoint**

In `worker/routes/briefings.ts`, update the `POST /generate` handler. After parsing the user, read the request body for an optional `episodeId`:

```typescript
briefings.post("/generate", async (c) => {
  const userId = getAuth(c)!.userId!;
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkId: userId },
    });

    // Parse optional body for episode-specific request
    let body: { episodeId?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      // No body or invalid JSON — treat as subscription-based request
    }

    let targetMinutes = user.briefingLengthMinutes;

    // Enforce free-tier limits
    if (user.tier === "FREE") {
      targetMinutes = Math.min(targetMinutes, FREE_MAX_MINUTES);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const weeklyCount = await prisma.briefing.count({
        where: {
          userId: user.id,
          createdAt: { gte: oneWeekAgo },
        },
      });

      if (weeklyCount >= FREE_WEEKLY_LIMIT) {
        return c.json(
          {
            error: "Free tier limit reached: 3 briefings per week",
            limit: FREE_WEEKLY_LIMIT,
            used: weeklyCount,
          },
          429
        );
      }
    }

    let items;

    if (body.episodeId) {
      // One-off episode request
      const episode = await prisma.episode.findUniqueOrThrow({
        where: { id: body.episodeId },
      });

      const durationTier = nearestTier(targetMinutes);
      items = [
        {
          podcastId: episode.podcastId,
          episodeId: episode.id,
          durationTier,
          useLatest: false,
        },
      ];
    } else {
      // Subscription-based request (existing behavior)
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: user.id },
        select: { podcastId: true },
      });
      if (!subscriptions.length) {
        return c.json({ error: "No podcast subscriptions found" }, 400);
      }

      const perEpisodeTier = nearestTier(targetMinutes / subscriptions.length);
      items = subscriptions.map((s: { podcastId: string }) => ({
        podcastId: s.podcastId,
        episodeId: null,
        durationTier: perEpisodeTier,
        useLatest: true,
      }));
    }

    const request = await prisma.briefingRequest.create({
      data: {
        userId: user.id,
        targetMinutes,
        items: items as any,
        isTest: false,
        status: "PENDING",
      },
    });

    await c.env.ORCHESTRATOR_QUEUE.send({
      requestId: request.id,
      action: "evaluate",
    });

    return c.json({ request: { id: request.id, status: "PENDING", targetMinutes } }, 201);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run worker/routes/__tests__/briefings-episode.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add worker/routes/briefings.ts worker/routes/__tests__/briefings-episode.test.ts
git commit -m "feat: support episode-specific briefing requests"
```

---

## Task 5: Mobile Layout with Bottom Navigation

Create the mobile shell layout with a bottom tab bar.

**Files:**
- Create: `src/layouts/mobile-layout.tsx`
- Create: `src/components/bottom-nav.tsx`

**Step 1: Create the BottomNav component**

```typescript
// src/components/bottom-nav.tsx
import { Link, useLocation } from "react-router-dom";
import { Home, Search, Library, Settings } from "lucide-react";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-xs transition-colors ${
                active ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 2: Create the MobileLayout**

```typescript
// src/layouts/mobile-layout.tsx
import { Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { BottomNav } from "../components/bottom-nav";

export function MobileLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-lg font-bold">Blipp</span>
        <UserButton />
      </header>

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-20">
        <Outlet />
      </main>

      {/* Bottom nav — pb-20 on main prevents content from being hidden behind it */}
      <BottomNav />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/layouts/mobile-layout.tsx src/components/bottom-nav.tsx
git commit -m "feat: add mobile layout with bottom tab navigation"
```

---

## Task 6: Route Wiring

Update `App.tsx` to use MobileLayout for user routes. Keep existing admin routes untouched. Redirect `/dashboard` to `/home` for backwards compat.

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update routes**

Replace the existing `AppLayout` user routes with `MobileLayout` routes:

```typescript
// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { lazy, Suspense } from "react";
import { MobileLayout } from "./layouts/mobile-layout";
import { AdminLayout } from "./layouts/admin-layout";
import { AdminGuard } from "./components/admin-guard";
import { Landing } from "./pages/landing";
import { Pricing } from "./pages/pricing";
import { Home } from "./pages/home";
import { Discover } from "./pages/discover";
import { PodcastDetail } from "./pages/podcast-detail";
import { LibraryPage } from "./pages/library";
import { Settings } from "./pages/settings";
import { BriefingPlayer } from "./pages/briefing-player";

// Lazy-load admin pages for code splitting
const CommandCenter = lazy(() => import("./pages/admin/command-center"));
const Pipeline = lazy(() => import("./pages/admin/pipeline"));
const Catalog = lazy(() => import("./pages/admin/catalog"));
const Episodes = lazy(() => import("./pages/admin/episodes"));
const Briefings = lazy(() => import("./pages/admin/briefings"));
const AdminUsers = lazy(() => import("./pages/admin/users"));
const Analytics = lazy(() => import("./pages/admin/analytics"));
const Configuration = lazy(() => import("./pages/admin/configuration"));
const Requests = lazy(() => import("./pages/admin/requests"));

function AdminLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-[#9CA3AF] text-sm">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* Backwards compat */}
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="/billing" element={<Navigate to="/settings" replace />} />

      {/* User routes — mobile layout */}
      <Route
        element={
          <>
            <SignedIn>
              <MobileLayout />
            </SignedIn>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
          </>
        }
      >
        <Route path="/home" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/discover/:podcastId" element={<PodcastDetail />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/briefing/:requestId" element={<BriefingPlayer />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <Suspense fallback={<AdminLoading />}>
              <AdminLayout />
            </Suspense>
          </AdminGuard>
        }
      >
        <Route index element={<Navigate to="command-center" replace />} />
        <Route path="command-center" element={<Suspense fallback={<AdminLoading />}><CommandCenter /></Suspense>} />
        <Route path="pipeline" element={<Suspense fallback={<AdminLoading />}><Pipeline /></Suspense>} />
        <Route path="catalog" element={<Suspense fallback={<AdminLoading />}><Catalog /></Suspense>} />
        <Route path="episodes" element={<Suspense fallback={<AdminLoading />}><Episodes /></Suspense>} />
        <Route path="briefings" element={<Suspense fallback={<AdminLoading />}><Briefings /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<AdminLoading />}><AdminUsers /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<AdminLoading />}><Analytics /></Suspense>} />
        <Route path="configuration" element={<Suspense fallback={<AdminLoading />}><Configuration /></Suspense>} />
        <Route path="requests" element={<Suspense fallback={<AdminLoading />}><Requests /></Suspense>} />
      </Route>
    </Routes>
  );
}
```

**Note:** This will not compile until the page components are created in subsequent tasks. That's expected — we're wiring the skeleton first. The pages will be created as stub components in the next tasks.

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire mobile layout routes for user app"
```

---

## Task 7: Home Page — Request List

The home page shows the user's briefing requests with status badges.

**Files:**
- Create: `src/pages/home.tsx`
- Create: `src/components/status-badge.tsx`
- Create: `src/components/request-item.tsx`

**Step 1: Create the StatusBadge component**

```typescript
// src/components/status-badge.tsx
import type { RequestStatusLabel } from "../types/user";

const badgeStyles: Record<RequestStatusLabel, string> = {
  Creating: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Complete: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Error: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function StatusBadge({ label }: { label: RequestStatusLabel }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeStyles[label]}`}
    >
      {label}
    </span>
  );
}
```

**Step 2: Create the RequestItem component**

```typescript
// src/components/request-item.tsx
import { Link } from "react-router-dom";
import { StatusBadge } from "./status-badge";
import type { UserRequest } from "../types/user";
import { toStatusLabel } from "../types/user";

export function RequestItem({ request }: { request: UserRequest }) {
  const label = toStatusLabel(request.status);
  const isPlayable = request.status === "COMPLETED" && request.briefingId;

  const content = (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      {request.podcastImageUrl ? (
        <img
          src={request.podcastImageUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-zinc-800 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {request.episodeTitle || request.podcastTitle || "Briefing"}
        </p>
        <p className="text-xs text-zinc-500">
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      <StatusBadge label={label} />
    </div>
  );

  if (isPlayable) {
    return <Link to={`/briefing/${request.id}`}>{content}</Link>;
  }

  return content;
}
```

**Step 3: Create the Home page**

```typescript
// src/pages/home.tsx
import { useEffect, useState, useCallback } from "react";
import { useApiFetch } from "../lib/api";
import { RequestItem } from "../components/request-item";
import type { UserRequest } from "../types/user";

export function Home() {
  const apiFetch = useApiFetch();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: UserRequest[] }>("/requests");
      setRequests(data.requests);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Poll for status updates on active requests
  useEffect(() => {
    const hasActive = requests.some(
      (r) => r.status === "PENDING" || r.status === "PROCESSING"
    );
    if (!hasActive) return;

    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [requests, fetchRequests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-zinc-400 text-center">No briefings yet.</p>
        <p className="text-zinc-500 text-sm text-center">
          Head to Discover to find podcasts and create your first briefing.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Your Briefings</h1>
      <div className="space-y-2">
        {requests.map((req) => (
          <RequestItem key={req.id} request={req} />
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/pages/home.tsx src/components/status-badge.tsx src/components/request-item.tsx
git commit -m "feat: add home page with request list and status badges"
```

---

## Task 8: Discover Page — Mobile Redesign

Refactor the existing discover page for mobile. Add navigation to podcast detail page.

**Files:**
- Modify: `src/pages/discover.tsx`
- Modify: `src/components/podcast-card.tsx` (make it navigable)

**Step 1: Update PodcastCard to support navigation**

The card should link to the podcast detail page when tapped, with the subscribe button as a secondary action. The card now receives a `podcastIndexId` (from search results) or a `dbId` (from subscriptions) for routing.

```typescript
// src/components/podcast-card.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

export interface PodcastCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  isSubscribed: boolean;
  /** If from local DB, the database ID for navigation */
  dbId?: string;
  feedUrl?: string;
  onToggle?: () => void;
}

export function PodcastCard({
  id,
  title,
  author,
  description,
  imageUrl,
  isSubscribed,
  dbId,
  feedUrl,
  onToggle,
}: PodcastCardProps) {
  const apiFetch = useApiFetch();
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (isSubscribed) {
        await apiFetch(`/podcasts/subscribe/${dbId || id}`, { method: "DELETE" });
      } else {
        await apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: feedUrl || "",
            title,
            description,
            imageUrl,
            podcastIndexId: id,
            author,
          }),
        });
      }
      onToggle?.();
    } finally {
      setLoading(false);
    }
  }

  const card = (
    <div className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <img
        src={imageUrl}
        alt={title}
        className="w-14 h-14 rounded object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm truncate">{title}</h3>
        <p className="text-xs text-zinc-400 truncate">{author}</p>
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{description}</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`self-center px-3 py-1.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${
          isSubscribed
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            : "bg-white text-zinc-950 hover:bg-zinc-200"
        } disabled:opacity-50`}
      >
        {loading ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
      </button>
    </div>
  );

  // If we have a dbId, the podcast is in our DB and we can link to detail
  if (dbId) {
    return <Link to={`/discover/${dbId}`}>{card}</Link>;
  }

  return card;
}
```

**Step 2: Update the Discover page**

Refactor for mobile layout — search bar at top, trending below, subscriptions moved to Library page:

```typescript
// src/pages/discover.tsx
import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "../lib/api";
import { PodcastCard } from "../components/podcast-card";

interface PodcastFeed {
  id: string;
  title: string;
  author: string;
  description: string;
  image: string;
  url: string;
}

interface SubscribedPodcast {
  id: string;
  title: string;
  author: string;
  description: string;
  imageUrl: string;
}

export function Discover() {
  const apiFetch = useApiFetch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PodcastFeed[]>([]);
  const [trending, setTrending] = useState<PodcastFeed[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiFetch<{
        subscriptions: { podcast: SubscribedPodcast; podcastId: string }[];
      }>("/podcasts/subscriptions");
      setSubscribedIds(new Set(data.subscriptions.map((s) => s.podcastId)));
    } catch {
      // Ignore
    }
  }, [apiFetch]);

  const fetchTrending = useCallback(async () => {
    try {
      const data = await apiFetch<{ feeds: PodcastFeed[] }>("/podcasts/trending");
      setTrending(data.feeds || []);
    } catch {
      // Ignore
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSubscriptions();
    fetchTrending();
  }, [fetchSubscriptions, fetchTrending]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ feeds: PodcastFeed[] }>(
        `/podcasts/search?q=${encodeURIComponent(query)}`
      );
      setResults(data.feeds || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  const displayList = results.length > 0 ? results : trending;
  const listTitle = results.length > 0 ? "Search Results" : "Trending";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search podcasts..."
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-white text-zinc-950 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">{listTitle}</h2>
        <div className="space-y-2">
          {displayList.map((feed) => (
            <PodcastCard
              key={feed.id}
              id={String(feed.id)}
              title={feed.title}
              author={feed.author}
              description={feed.description}
              imageUrl={feed.image}
              feedUrl={feed.url}
              isSubscribed={subscribedIds.has(String(feed.id))}
              onToggle={fetchSubscriptions}
            />
          ))}
        </div>
        {displayList.length === 0 && !searching && (
          <p className="text-zinc-500 text-sm text-center py-8">
            {results.length === 0 && query ? "No results found." : "Loading..."}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/pages/discover.tsx src/components/podcast-card.tsx
git commit -m "feat: redesign discover page for mobile, update podcast card"
```

---

## Task 9: Podcast Detail Page

New page showing podcast info, subscribe button, and episode list with "Create Briefing" action.

**Files:**
- Create: `src/pages/podcast-detail.tsx`

**Step 1: Create the page**

```typescript
// src/pages/podcast-detail.tsx
import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useApiFetch } from "../lib/api";
import type { PodcastDetail as PodcastDetailType, EpisodeSummary } from "../types/user";

export function PodcastDetail() {
  const { podcastId } = useParams<{ podcastId: string }>();
  const apiFetch = useApiFetch();
  const [podcast, setPodcast] = useState<PodcastDetailType | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [requestingEpisodeId, setRequestingEpisodeId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!podcastId) return;
    try {
      const [podData, epData] = await Promise.all([
        apiFetch<{ podcast: PodcastDetailType }>(`/podcasts/${podcastId}`),
        apiFetch<{ episodes: EpisodeSummary[] }>(`/podcasts/${podcastId}/episodes`),
      ]);
      setPodcast(podData.podcast);
      setEpisodes(epData.episodes);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [podcastId, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubscribeToggle() {
    if (!podcast) return;
    setSubscribing(true);
    try {
      if (podcast.isSubscribed) {
        await apiFetch(`/podcasts/subscribe/${podcast.id}`, { method: "DELETE" });
      } else {
        await apiFetch("/podcasts/subscribe", {
          method: "POST",
          body: JSON.stringify({
            feedUrl: podcast.feedUrl,
            title: podcast.title,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            podcastIndexId: podcast.podcastIndexId,
            author: podcast.author,
          }),
        });
      }
      setPodcast((prev) => prev ? { ...prev, isSubscribed: !prev.isSubscribed } : prev);
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCreateBriefing(episodeId: string) {
    setRequestingEpisodeId(episodeId);
    try {
      await apiFetch("/briefings/generate", {
        method: "POST",
        body: JSON.stringify({ episodeId }),
      });
      // Could navigate to home, or show a toast
    } finally {
      setRequestingEpisodeId(null);
    }
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Podcast not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Podcast header */}
      <div className="flex gap-4">
        {podcast.imageUrl ? (
          <img
            src={podcast.imageUrl}
            alt={podcast.title}
            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-zinc-800 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">{podcast.title}</h1>
          {podcast.author && (
            <p className="text-sm text-zinc-400">{podcast.author}</p>
          )}
          <p className="text-xs text-zinc-500 mt-1">
            {podcast.episodeCount} episodes
          </p>
          <button
            onClick={handleSubscribeToggle}
            disabled={subscribing}
            className={`mt-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              podcast.isSubscribed
                ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                : "bg-white text-zinc-950 hover:bg-zinc-200"
            } disabled:opacity-50`}
          >
            {subscribing
              ? "..."
              : podcast.isSubscribed
                ? "Subscribed"
                : "Subscribe"}
          </button>
        </div>
      </div>

      {/* Description */}
      {podcast.description && (
        <p className="text-sm text-zinc-400 line-clamp-4">
          {podcast.description}
        </p>
      )}

      {/* Episodes */}
      <div>
        <h2 className="text-base font-semibold mb-3">Episodes</h2>
        {episodes.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No episodes yet. Episodes appear after a feed refresh.
          </p>
        ) : (
          <div className="space-y-2">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{ep.title}</p>
                    <div className="flex gap-2 text-xs text-zinc-500 mt-1">
                      <span>
                        {new Date(ep.publishedAt).toLocaleDateString()}
                      </span>
                      {ep.durationSeconds && (
                        <span>{formatDuration(ep.durationSeconds)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateBriefing(ep.id)}
                    disabled={requestingEpisodeId === ep.id}
                    className="px-3 py-1.5 bg-white text-zinc-950 rounded text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {requestingEpisodeId === ep.id ? "..." : "Brief"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/podcast-detail.tsx
git commit -m "feat: add podcast detail page with episode list"
```

---

## Task 10: Library Page

Shows subscribed podcasts as a grid. Tap navigates to podcast detail.

**Files:**
- Create: `src/pages/library.tsx`

**Step 1: Create the page**

```typescript
// src/pages/library.tsx
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useApiFetch } from "../lib/api";

interface SubscribedPodcast {
  id: string;
  podcastId: string;
  podcast: {
    id: string;
    title: string;
    imageUrl: string | null;
    author: string | null;
  };
}

export function LibraryPage() {
  const apiFetch = useApiFetch();
  const [subscriptions, setSubscriptions] = useState<SubscribedPodcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await apiFetch<{ subscriptions: SubscribedPodcast[] }>(
        "/podcasts/subscriptions"
      );
      setSubscriptions(data.subscriptions);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-zinc-400 text-center">No subscriptions yet.</p>
        <p className="text-zinc-500 text-sm text-center">
          Search for podcasts in Discover and subscribe to your favorites.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Library</h1>
      <div className="grid grid-cols-3 gap-3">
        {subscriptions.map((sub) => (
          <Link
            key={sub.id}
            to={`/discover/${sub.podcast.id}`}
            className="flex flex-col items-center gap-2"
          >
            {sub.podcast.imageUrl ? (
              <img
                src={sub.podcast.imageUrl}
                alt={sub.podcast.title}
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-zinc-800" />
            )}
            <p className="text-xs text-center font-medium truncate w-full">
              {sub.podcast.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/library.tsx
git commit -m "feat: add library page with subscription grid"
```

---

## Task 11: Briefing Player Page

Full-screen player for a completed briefing, accessed from the Home request list.

**Files:**
- Create: `src/pages/briefing-player.tsx`

**Step 1: Create the page**

```typescript
// src/pages/briefing-player.tsx
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApiFetch } from "../lib/api";

interface RequestDetail {
  id: string;
  status: string;
  podcastTitle: string | null;
  podcastImageUrl: string | null;
  episodeTitle: string | null;
  briefing: {
    audioUrl: string;
    actualSeconds: number | null;
  } | null;
}

export function BriefingPlayer() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const apiFetch = useApiFetch();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!requestId) return;
    apiFetch<{ request: RequestDetail }>(`/requests/${requestId}`)
      .then((data) => setRequest(data.request))
      .catch(() => navigate("/home"))
      .finally(() => setLoading(false));
  }, [requestId, apiFetch, navigate]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function cyclePlaybackRate() {
    const rates = [1, 1.25, 1.5, 2];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!request || !request.briefing?.audioUrl) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-400">Briefing not available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4">
      {/* Artwork */}
      {request.podcastImageUrl ? (
        <img
          src={request.podcastImageUrl}
          alt=""
          className="w-48 h-48 rounded-2xl object-cover shadow-lg"
        />
      ) : (
        <div className="w-48 h-48 rounded-2xl bg-zinc-800" />
      )}

      {/* Title info */}
      <div className="text-center">
        <h1 className="text-lg font-bold">
          {request.episodeTitle || "Briefing"}
        </h1>
        {request.podcastTitle && (
          <p className="text-sm text-zinc-400 mt-1">{request.podcastTitle}</p>
        )}
      </div>

      {/* Audio element */}
      <audio
        ref={audioRef}
        src={request.briefing.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Seek bar */}
      <div className="w-full max-w-sm">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-zinc-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <button
          onClick={cyclePlaybackRate}
          className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded"
        >
          {playbackRate}x
        </button>
        <button
          onClick={togglePlayback}
          className="w-14 h-14 flex items-center justify-center bg-white text-zinc-950 rounded-full font-bold text-lg"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "||" : "\u25B6"}
        </button>
        <div className="w-10" /> {/* Spacer for symmetry */}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/briefing-player.tsx
git commit -m "feat: add briefing player page with audio controls"
```

---

## Task 12: Settings Page — Mobile Polish

The existing settings page works but needs minor adjustments for the mobile layout (it's now inside MobileLayout instead of AppLayout). The billing section should stay inline since we removed the separate `/billing` route.

**Files:**
- Modify: `src/pages/settings.tsx`

**Step 1: Review and adjust**

The existing settings page at `src/pages/settings.tsx` already handles preferences and billing inline. The only changes needed:

- Remove the `Link` import to `/pricing` (or keep it, it's fine)
- Ensure `max-w-lg` works well on mobile (it will, since the parent is `px-4`)

The page is already mobile-friendly. If no substantive changes are needed, skip this task.

**Step 2: Verify it renders correctly in the new layout**

Run `npm run dev` and navigate to `/settings`. Confirm it renders inside MobileLayout with the bottom nav.

**Step 3: Commit (only if changes were made)**

```bash
git add src/pages/settings.tsx
git commit -m "refactor: adjust settings page for mobile layout"
```

---

## Task 13: Remove Old AppLayout (Cleanup)

The old `AppLayout` with the top navigation bar is no longer used by any route. The admin routes use `AdminLayout`. Remove the dead code.

**Files:**
- Delete: `src/layouts/app-layout.tsx`
- Modify: `src/pages/billing.tsx` — if it exists as a standalone page, remove it (billing is now in settings)

**Step 1: Verify nothing imports AppLayout**

Search for `app-layout` imports across the codebase. It should only be imported by `App.tsx`, which we already updated to use `MobileLayout`.

**Step 2: Delete the file**

```bash
git rm src/layouts/app-layout.tsx
```

**Step 3: Remove Billing page if standalone**

Check if `src/pages/billing.tsx` exists and is still referenced. If it's only used by the old `/billing` route (now redirected to `/settings`), delete it:

```bash
git rm src/pages/billing.tsx
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old AppLayout and standalone billing page"
```

---

## Task 14: PWA Configuration

Add PWA support via `vite-plugin-pwa` for installability and app shell caching.

**Files:**
- Modify: `vite.config.ts`
- Create: `public/manifest.json` (or let the plugin generate it)

**Step 1: Install the PWA plugin**

```bash
npm install --legacy-peer-deps vite-plugin-pwa
```

**Step 2: Read `vite.config.ts` to understand current config**

Read the file before modifying.

**Step 3: Add PWA plugin to Vite config**

Add the PWA plugin import and configuration. The exact config depends on the current `vite.config.ts` structure, but the addition should look like:

```typescript
import { VitePWA } from "vite-plugin-pwa";

// Add to plugins array:
VitePWA({
  registerType: "autoUpdate",
  manifest: {
    name: "Blipp",
    short_name: "Blipp",
    description: "Podcast briefings in minutes",
    theme_color: "#09090b",
    background_color: "#09090b",
    display: "standalone",
    start_url: "/home",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    navigateFallback: "/index.html",
  },
})
```

**Note:** You'll need placeholder icon files in `public/`. Create simple placeholder PNGs (can be replaced with real icons later).

**Step 4: Add viewport meta tag**

Ensure `index.html` has the proper mobile viewport and PWA meta tags:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#09090b" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

**Step 5: Commit**

```bash
git add vite.config.ts public/ index.html
git commit -m "feat: add PWA configuration with vite-plugin-pwa"
```

---

## Task 15: Smoke Test & Verify

Run the app end-to-end and verify all routes work.

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Fix any type errors.

**Step 2: Run existing tests**

```bash
npm test
```

Ensure no regressions (pre-existing failures in `discover.test.tsx` and `settings.test.tsx` are known).

**Step 3: Run dev server and manual verification**

```bash
npm run dev
```

Verify in a mobile-width browser window:
- [ ] `/` — Landing page loads
- [ ] Sign in → redirected to `/home`
- [ ] `/home` — Shows request list (or empty state)
- [ ] `/discover` — Search bar + trending loads
- [ ] `/discover/:podcastId` — Podcast detail with episodes (requires a podcast in the DB)
- [ ] `/library` — Shows subscribed podcasts
- [ ] `/settings` — Preferences + billing
- [ ] `/briefing/:requestId` — Audio player (requires a completed briefing)
- [ ] Bottom nav highlights correct tab
- [ ] `/admin/*` — Still works with AdminLayout

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve smoke test issues"
```

---

## Summary

| Task | Description | Type |
|------|-------------|------|
| 1 | Shared type contracts | Types |
| 2 | Podcast detail + episodes API | Backend |
| 3 | User requests API | Backend |
| 4 | Episode-specific briefing request | Backend |
| 5 | Mobile layout + bottom nav | Frontend |
| 6 | Route wiring | Frontend |
| 7 | Home page (request list) | Frontend |
| 8 | Discover page (mobile redesign) | Frontend |
| 9 | Podcast detail page | Frontend |
| 10 | Library page | Frontend |
| 11 | Briefing player page | Frontend |
| 12 | Settings page polish | Frontend |
| 13 | Remove old AppLayout | Cleanup |
| 14 | PWA configuration | Infra |
| 15 | Smoke test & verify | QA |

**Dependencies:**
- Tasks 1-4 (backend + types) can run in parallel
- Task 5 must complete before Task 6
- Task 6 must complete before Tasks 7-12 (pages need routes)
- Tasks 7-12 are independent of each other
- Task 13 depends on Task 6
- Task 14 is independent
- Task 15 depends on all other tasks
