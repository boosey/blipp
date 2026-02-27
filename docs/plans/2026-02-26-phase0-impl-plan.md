# Blipp Phase 0: "The Daily Briefing" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a launch-ready MVP where users subscribe to podcasts, set a briefing length, and receive a daily audio briefing distilled from new episodes — with a cached clip architecture on Cloudflare.

**Architecture:** Hono API on Cloudflare Workers + Vite React SPA on Cloudflare Pages (via `@cloudflare/vite-plugin`). Prisma ORM over Neon PostgreSQL (via Hyperdrive). Cloudflare Queues for background jobs. Clerk for auth, Stripe for payments. Clip caching in R2 keyed by (episode, durationTier).

**Tech Stack:** Hono, Vite, React, TypeScript, Tailwind CSS + shadcn/ui, Prisma, Neon PostgreSQL, Cloudflare (Workers, Pages, R2, Queues, Hyperdrive), Clerk, Stripe, Anthropic Claude SDK, OpenAI SDK, fast-xml-parser

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json`
- Create: `worker/index.ts`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `.env.example`, `.dev.vars.example`, `.gitignore`

**Step 1: Scaffold Vite + React project with Cloudflare**

Run:
```bash
npm create cloudflare@latest . -- --framework=react --platform=workers
```

If the directory is non-empty, accept overwrite prompts for scaffolding files. Expected: Vite + React project with `@cloudflare/vite-plugin` configured.

**Step 2: Install Hono and core dependencies**

Run:
```bash
npm install hono @hono/clerk-auth @clerk/backend @clerk/react stripe @anthropic-ai/sdk openai fast-xml-parser zod react-router-dom
npm install -D @types/react @types/react-dom prisma wrangler tailwindcss @tailwindcss/vite
```

**Step 3: Configure Hono as the Worker entry**

Replace `worker/index.ts` with:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  ASSETS: Fetcher;
  // Bindings added in later tasks
};

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
```

**Step 4: Update `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
```

**Step 5: Update `wrangler.jsonc`**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "blipp",
  "compatibility_date": "2026-02-26",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./worker/index.ts",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

**Step 6: Create `.env.example` and `.dev.vars.example`**

`.env.example` (for Vite client-side):
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_APP_URL=http://localhost:5173
```

`.dev.vars.example` (for Worker secrets — used by `wrangler dev`):
```env
# Auth (Clerk)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PRO_PLUS_PRICE_ID=price_...

# Database (Neon — used for prisma migrate, not runtime)
DATABASE_URL=postgresql://user:password@host:5432/blipp

# Anthropic (distillation)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (TTS)
OPENAI_API_KEY=sk-...

# Podcast Index
PODCAST_INDEX_KEY=your-key
PODCAST_INDEX_SECRET=your-secret
```

**Step 7: Set up Tailwind + base styles**

Create `src/index.css`:
```css
@import "tailwindcss";
```

**Step 8: Create minimal App component**

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center">
      <h1 className="text-4xl font-bold">Blipp</h1>
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 9: Update `.gitignore`**

Append to `.gitignore`:
```
.dev.vars
.wrangler/
node_modules/
dist/
.env
```

**Step 10: Verify dev server starts**

Run: `npx vite dev`

Expected: Dev server at localhost:5173, "Blipp" heading visible, `/api/health` returns JSON.

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + Hono on Cloudflare Workers"
```

---

## Task 2: Database Schema (Prisma + Neon)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `worker/lib/db.ts`

**Step 1: Initialize Prisma**

Run:
```bash
npx prisma init --datasource-provider postgresql
```

**Step 2: Write the Prisma schema**

Replace `prisma/schema.prisma` with the full schema from the design doc (`docs/plans/2026-02-26-phase0-design.md`, "Prisma Schema" section). This includes: `User`, `Podcast`, `Episode`, `Distillation`, `Clip`, `Subscription`, `Briefing`, `BriefingSegment` models and all enums.

**Step 3: Create Prisma client factory for Workers**

```typescript
// worker/lib/db.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// IMPORTANT: Must create per-request on Workers.
// A global PrismaClient causes hangs after first request
// due to connection pool state persisting across I/O contexts.
export function createPrismaClient(hyperdrive: Hyperdrive): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: hyperdrive.connectionString,
  });
  return new PrismaClient({ adapter });
}
```

**Step 4: Install Prisma adapter packages**

Run:
```bash
npm install @prisma/adapter-pg pg
npm install -D @types/pg
```

**Step 5: Add Hyperdrive binding to `wrangler.jsonc`**

Add to `wrangler.jsonc`:
```jsonc
{
  // ... existing config
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<hyperdrive-config-id>"
    }
  ]
}
```

**Step 6: Generate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: Prisma Client generated successfully.

**Step 7: Push schema to Neon (requires DATABASE_URL in `.env`)**

Run:
```bash
npx prisma db push
```

Expected: Schema synced to database.

**Step 8: Commit**

```bash
git add prisma/schema.prisma worker/lib/db.ts
git commit -m "feat: add Prisma schema with clip caching models"
```

---

## Task 3: Auth (Clerk)

**Files:**
- Create: `worker/middleware/auth.ts`
- Create: `worker/routes/webhooks/clerk.ts`
- Modify: `worker/index.ts`
- Create: `src/providers/clerk-provider.tsx`

**Step 1: Install Clerk React**

Run:
```bash
npm install @clerk/react
```

**Step 2: Create Clerk middleware for Hono**

```typescript
// worker/middleware/auth.ts
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { createMiddleware } from "hono/factory";

export { clerkMiddleware, getAuth };

// Middleware that requires authentication
export const requireAuth = createMiddleware(async (c, next) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
```

**Step 3: Create Clerk webhook handler**

```typescript
// worker/routes/webhooks/clerk.ts
import { Hono } from "hono";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";

const clerkWebhooks = new Hono<{ Bindings: Env }>();

clerkWebhooks.post("/", async (c) => {
  // Clerk sends user.created, user.updated, user.deleted events
  // For MVP: handle user.created to sync to DB
  const payload = await c.req.json();
  const { type, data } = payload;

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    switch (type) {
      case "user.created": {
        await prisma.user.create({
          data: {
            clerkId: data.id,
            email: data.email_addresses[0]?.email_address ?? "",
            name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null,
            imageUrl: data.image_url ?? null,
          },
        });
        break;
      }
      case "user.updated": {
        await prisma.user.update({
          where: { clerkId: data.id },
          data: {
            email: data.email_addresses[0]?.email_address,
            name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null,
            imageUrl: data.image_url ?? null,
          },
        });
        break;
      }
      case "user.deleted": {
        await prisma.user.delete({ where: { clerkId: data.id } });
        break;
      }
    }
    return c.json({ received: true });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { clerkWebhooks };
```

**Step 4: Create shared Env type**

```typescript
// worker/types.ts
export type Env = {
  ASSETS: Fetcher;
  HYPERDRIVE: Hyperdrive;
  R2: R2Bucket;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;
  STRIPE_PRO_PLUS_PRICE_ID: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  PODCAST_INDEX_KEY: string;
  PODCAST_INDEX_SECRET: string;
  FEED_REFRESH_QUEUE: Queue;
  DISTILLATION_QUEUE: Queue;
  CLIP_GENERATION_QUEUE: Queue;
  BRIEFING_ASSEMBLY_QUEUE: Queue;
};
```

**Step 5: Wire auth into main app**

Update `worker/index.ts`:
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerkMiddleware } from "./middleware/auth";
import { clerkWebhooks } from "./routes/webhooks/clerk";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());
app.use("/api/*", clerkMiddleware());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/webhooks/clerk", clerkWebhooks);

export default app;
```

**Step 6: Create Clerk provider for React**

```tsx
// src/providers/clerk-provider.tsx
import { ClerkProvider } from "@clerk/react";

export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}
```

**Step 7: Commit**

```bash
git add worker/middleware/ worker/routes/webhooks/ worker/types.ts src/providers/
git commit -m "feat: add Clerk auth middleware and webhook handler"
```

---

## Task 4: Stripe Payments

**Files:**
- Create: `worker/lib/stripe.ts`
- Create: `worker/routes/webhooks/stripe.ts`
- Create: `worker/routes/billing.ts`

**Step 1: Create Stripe client factory**

```typescript
// worker/lib/stripe.ts
import Stripe from "stripe";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
```

**Step 2: Create Stripe webhook handler**

```typescript
// worker/routes/webhooks/stripe.ts
import { Hono } from "hono";
import { createStripeClient } from "../../lib/stripe";
import { createPrismaClient } from "../../lib/db";
import type { Env } from "../../types";
import type Stripe from "stripe";

const stripeWebhooks = new Hono<{ Bindings: Env }>();

stripeWebhooks.post("/", async (c) => {
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);

  const rawBody = await c.req.raw.arrayBuffer();
  const bodyBytes = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      bodyBytes,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      crypto as unknown as Stripe.CryptoProvider
    );
  } catch (err: any) {
    return c.json({ error: `Webhook failed: ${err.message}` }, 400);
  }

  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkId = session.metadata?.clerkId;
        if (!clerkId) break;

        const tier = session.metadata?.tier === "PRO_PLUS" ? "PRO_PLUS" : "PRO";
        await prisma.user.update({
          where: { clerkId },
          data: {
            stripeCustomerId: session.customer as string,
            tier,
          },
        });

        // Also update Clerk publicMetadata
        const clerkClient = c.get("clerk");
        await clerkClient.users.updateUserMetadata(clerkId, {
          publicMetadata: { tier },
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await prisma.user.update({
          where: { stripeCustomerId: customerId },
          data: { tier: "FREE" },
        });
        // Update Clerk too
        const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
        if (user) {
          const clerkClient = c.get("clerk");
          await clerkClient.users.updateUserMetadata(user.clerkId, {
            publicMetadata: { tier: "FREE" },
          });
        }
        break;
      }
    }
    return c.json({ received: true });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { stripeWebhooks };
```

**Step 3: Create billing routes**

```typescript
// worker/routes/billing.ts
import { Hono } from "hono";
import { getAuth } from "../middleware/auth";
import { createStripeClient } from "../lib/stripe";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

const billing = new Hono<{ Bindings: Env }>();

// Create checkout session for upgrade
billing.post("/checkout", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const { tier } = await c.req.json<{ tier: "PRO" | "PRO_PLUS" }>();
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);

  const priceId = tier === "PRO_PLUS"
    ? c.env.STRIPE_PRO_PLUS_PRICE_ID
    : c.env.STRIPE_PRO_PRICE_ID;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { clerkId: auth.userId, tier },
    success_url: `${c.req.header("origin")}/settings/billing?success=true`,
    cancel_url: `${c.req.header("origin")}/settings/billing?canceled=true`,
  });

  return c.json({ url: session.url });
});

// Create portal session for managing subscription
billing.post("/portal", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });
    if (!user?.stripeCustomerId) return c.json({ error: "No subscription" }, 400);

    const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${c.req.header("origin")}/settings/billing`,
    });

    return c.json({ url: session.url });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { billing };
```

**Step 4: Wire into main app**

Add to `worker/index.ts`:
```typescript
import { stripeWebhooks } from "./routes/webhooks/stripe";
import { billing } from "./routes/billing";

// ... after existing routes
app.route("/api/webhooks/stripe", stripeWebhooks);
app.route("/api/billing", billing);
```

**Step 5: Commit**

```bash
git add worker/lib/stripe.ts worker/routes/webhooks/stripe.ts worker/routes/billing.ts
git commit -m "feat: add Stripe checkout, portal, and webhook handling"
```

---

## Task 5: Podcast Index API Client

**Files:**
- Create: `worker/lib/podcast-index.ts`
- Test: `worker/lib/__tests__/podcast-index.test.ts`

**Step 1: Install vitest**

Run:
```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

**Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 3: Write the failing test**

```typescript
// worker/lib/__tests__/podcast-index.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PodcastIndexClient } from "../podcast-index";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("PodcastIndexClient", () => {
  let client: PodcastIndexClient;

  beforeEach(() => {
    client = new PodcastIndexClient("test-key", "test-secret");
    mockFetch.mockReset();
  });

  it("should search podcasts by term", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        feeds: [{ id: 1, title: "Test Podcast", url: "https://example.com/feed.xml" }],
      }),
    });

    const results = await client.searchByTerm("test");
    expect(results.feeds).toHaveLength(1);
    expect(results.feeds[0].title).toBe("Test Podcast");
  });

  it("should include correct auth headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ feeds: [] }),
    });

    await client.searchByTerm("test");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Auth-Key"]).toBe("test-key");
    expect(headers["User-Agent"]).toContain("Blipp");
    expect(headers["Authorization"]).toBeDefined();
  });

  it("should throw on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(client.searchByTerm("test")).rejects.toThrow("401");
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/podcast-index.test.ts`

Expected: FAIL — module not found

**Step 5: Write implementation using Web Crypto API**

```typescript
// worker/lib/podcast-index.ts
const BASE_URL = "https://api.podcastindex.org/api/1.0";

export interface PodcastFeed {
  id: number;
  title: string;
  url: string;
  description?: string;
  author?: string;
  image?: string;
  categories?: Record<string, string>;
}

export interface PodcastEpisode {
  id: number;
  title: string;
  description?: string;
  enclosureUrl: string;
  duration?: number;
  datePublished: number;
  transcriptUrl?: string;
  feedId: number;
  guid?: string;
}

export interface SearchResult {
  feeds: PodcastFeed[];
  count: number;
}

export interface EpisodesResult {
  items: PodcastEpisode[];
  count: number;
}

export class PodcastIndexClient {
  constructor(
    private apiKey: string,
    private apiSecret: string
  ) {}

  private async getHeaders(): Promise<Record<string, string>> {
    const authDate = Math.floor(Date.now() / 1000);
    const data = new TextEncoder().encode(
      this.apiKey + this.apiSecret + authDate
    );
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return {
      "User-Agent": "Blipp/1.0",
      "X-Auth-Key": this.apiKey,
      "X-Auth-Date": `${authDate}`,
      Authorization: hash,
    };
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Podcast Index API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async searchByTerm(
    term: string,
    options: { max?: number } = {}
  ): Promise<SearchResult> {
    return this.request<SearchResult>("/search/byterm", {
      q: term,
      ...(options.max && { max: String(options.max) }),
    });
  }

  async episodesByFeedId(
    feedId: number,
    options: { max?: number; since?: number } = {}
  ): Promise<EpisodesResult> {
    return this.request<EpisodesResult>("/episodes/byfeedid", {
      id: String(feedId),
      ...(options.max && { max: String(options.max) }),
      ...(options.since && { since: String(options.since) }),
    });
  }

  async episodesByFeedUrl(
    feedUrl: string,
    options: { max?: number } = {}
  ): Promise<EpisodesResult> {
    return this.request<EpisodesResult>("/episodes/byfeedurl", {
      url: feedUrl,
      ...(options.max && { max: String(options.max) }),
    });
  }

  async trending(
    options: { max?: number; cat?: string } = {}
  ): Promise<SearchResult> {
    return this.request<SearchResult>("/podcasts/trending", {
      ...(options.max && { max: String(options.max) }),
      ...(options.cat && { cat: options.cat }),
    });
  }
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run worker/lib/__tests__/podcast-index.test.ts`

Expected: All tests PASS

**Step 7: Commit**

```bash
git add worker/lib/podcast-index.ts worker/lib/__tests__/podcast-index.test.ts vitest.config.ts
git commit -m "feat: add Podcast Index API client with Web Crypto auth"
```

---

## Task 6: RSS Feed Parser + Transcript Fetcher

**Files:**
- Create: `worker/lib/rss-parser.ts`
- Create: `worker/lib/transcript.ts`
- Test: `worker/lib/__tests__/rss-parser.test.ts`
- Test: `worker/lib/__tests__/transcript.test.ts`

**Step 1: Write the failing RSS parser test**

```typescript
// worker/lib/__tests__/rss-parser.test.ts
import { describe, it, expect } from "vitest";
import { parsePodcastFeed } from "../rss-parser";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test Podcast</title>
    <description>A test podcast</description>
    <itunes:author>Test Author</itunes:author>
    <itunes:image href="https://example.com/image.jpg"/>
    <item>
      <title>Episode 1</title>
      <guid>ep-001</guid>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="1234"/>
      <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
      <itunes:duration>3600</itunes:duration>
      <podcast:transcript url="https://example.com/ep1.vtt" type="text/vtt"/>
    </item>
  </channel>
</rss>`;

describe("parsePodcastFeed", () => {
  it("should parse podcast metadata", () => {
    const feed = parsePodcastFeed(SAMPLE_RSS);
    expect(feed.title).toBe("Test Podcast");
    expect(feed.author).toBe("Test Author");
    expect(feed.imageUrl).toBe("https://example.com/image.jpg");
  });

  it("should parse episodes with transcript URL", () => {
    const feed = parsePodcastFeed(SAMPLE_RSS);
    expect(feed.episodes).toHaveLength(1);
    expect(feed.episodes[0].guid).toBe("ep-001");
    expect(feed.episodes[0].audioUrl).toBe("https://example.com/ep1.mp3");
    expect(feed.episodes[0].transcriptUrl).toBe("https://example.com/ep1.vtt");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run worker/lib/__tests__/rss-parser.test.ts`

Expected: FAIL

**Step 3: Implement RSS parser with fast-xml-parser**

```typescript
// worker/lib/rss-parser.ts
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface ParsedFeed {
  title: string;
  description: string | null;
  author: string | null;
  imageUrl: string | null;
  episodes: ParsedEpisode[];
}

export interface ParsedEpisode {
  title: string;
  guid: string;
  audioUrl: string;
  publishedAt: Date;
  durationSeconds: number | null;
  description: string | null;
  transcriptUrl: string | null;
}

export function parsePodcastFeed(xml: string): ParsedFeed {
  const data = parser.parse(xml);
  const channel = data.rss?.channel;
  if (!channel) throw new Error("Invalid RSS feed: no channel element");

  const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);

  return {
    title: channel.title ?? "",
    description: channel.description ?? null,
    author: channel["itunes:author"] ?? null,
    imageUrl: channel["itunes:image"]?.["@_href"] ?? null,
    episodes: items.map(parseEpisode),
  };
}

function parseEpisode(item: any): ParsedEpisode {
  // Handle podcast:transcript — can be object or array
  let transcriptUrl: string | null = null;
  const transcript = item["podcast:transcript"];
  if (transcript) {
    const entry = Array.isArray(transcript) ? transcript[0] : transcript;
    transcriptUrl = entry?.["@_url"] ?? null;
  }

  // Parse duration — could be seconds (3600) or HH:MM:SS
  let durationSeconds: number | null = null;
  const dur = item["itunes:duration"];
  if (dur) {
    if (typeof dur === "number") {
      durationSeconds = dur;
    } else if (typeof dur === "string" && dur.includes(":")) {
      const parts = dur.split(":").map(Number);
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
    } else {
      durationSeconds = parseInt(dur, 10) || null;
    }
  }

  return {
    title: item.title ?? "",
    guid: item.guid?.["#text"] ?? item.guid ?? "",
    audioUrl: item.enclosure?.["@_url"] ?? "",
    publishedAt: new Date(item.pubDate ?? 0),
    durationSeconds,
    description: item.description ?? null,
    transcriptUrl,
  };
}
```

**Step 4: Run RSS parser tests**

Run: `npx vitest run worker/lib/__tests__/rss-parser.test.ts`

Expected: All PASS

**Step 5: Write failing transcript fetcher test**

```typescript
// worker/lib/__tests__/transcript.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseVTT, parseSRT, fetchTranscript } from "../transcript";

describe("parseVTT", () => {
  it("should parse WebVTT into plain text", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello and welcome to the show.

00:00:05.000 --> 00:00:10.000
Today we discuss testing.`;

    const text = parseVTT(vtt);
    expect(text).toBe("Hello and welcome to the show. Today we discuss testing.");
  });
});

describe("parseSRT", () => {
  it("should parse SRT into plain text", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
Hello and welcome.

2
00:00:05,000 --> 00:00:10,000
Today we discuss testing.`;

    const text = parseSRT(srt);
    expect(text).toBe("Hello and welcome. Today we discuss testing.");
  });
});

describe("fetchTranscript", () => {
  it("should fetch and parse a VTT transcript", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello world.`,
    });
    vi.stubGlobal("fetch", mockFetch);

    const text = await fetchTranscript("https://example.com/ep.vtt");
    expect(text).toBe("Hello world.");
  });
});
```

**Step 6: Run test to verify it fails, then implement**

```typescript
// worker/lib/transcript.ts

export function parseVTT(vtt: string): string {
  return vtt
    .split("\n")
    .filter((line) => {
      if (!line.trim()) return false;
      if (line.startsWith("WEBVTT")) return false;
      if (line.startsWith("NOTE")) return false;
      if (/^\d{2}:\d{2}/.test(line)) return false;
      return true;
    })
    .map((line) => line.trim())
    .join(" ");
}

export function parseSRT(srt: string): string {
  return srt
    .split("\n")
    .filter((line) => {
      if (!line.trim()) return false;
      if (/^\d+$/.test(line.trim())) return false;
      if (/\d{2}:\d{2}:\d{2}/.test(line)) return false;
      return true;
    })
    .map((line) => line.trim())
    .join(" ");
}

export async function fetchTranscript(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  const text = await response.text();

  if (url.endsWith(".vtt") || text.startsWith("WEBVTT")) {
    return parseVTT(text);
  }
  if (url.endsWith(".srt")) {
    return parseSRT(text);
  }
  // Assume plain text
  return text.trim();
}
```

**Step 7: Run all tests**

Run: `npx vitest run worker/lib/__tests__/`

Expected: All PASS

**Step 8: Commit**

```bash
git add worker/lib/rss-parser.ts worker/lib/transcript.ts worker/lib/__tests__/
git commit -m "feat: add RSS parser and transcript fetcher for Workers"
```

---

## Task 7: Distillation Engine (Claude Two-Pass)

**Files:**
- Create: `worker/lib/distillation.ts`
- Test: `worker/lib/__tests__/distillation.test.ts`

**Step 1: Write the failing test**

```typescript
// worker/lib/__tests__/distillation.test.ts
import { describe, it, expect, vi } from "vitest";
import { extractClaims, generateNarrative, WORDS_PER_MINUTE } from "../distillation";

describe("extractClaims", () => {
  it("should call Claude and return parsed claims", async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { claim: "AI is transforming work", speaker: "Host", importance: 9, novelty: 7 },
          ]),
        },
      ],
    });

    const mockClient = { messages: { create: mockCreate } } as any;
    const claims = await extractClaims(mockClient, "Sample transcript about AI.");

    expect(claims).toHaveLength(1);
    expect(claims[0].importance).toBe(9);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("generateNarrative", () => {
  it("should call Claude with target word count", async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce({
      content: [{ type: "text", text: "This is the generated narrative about AI." }],
    });

    const mockClient = { messages: { create: mockCreate } } as any;
    const claims = [{ claim: "AI is transforming work", speaker: "Host", importance: 9, novelty: 7 }];
    const narrative = await generateNarrative(mockClient, claims, 3);

    expect(narrative).toBeDefined();
    expect(typeof narrative).toBe("string");
    // Check that target word count was passed in the prompt
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain(`${3 * WORDS_PER_MINUTE}`);
  });
});
```

**Step 2: Run test to verify it fails, then implement**

```typescript
// worker/lib/distillation.ts
import Anthropic from "@anthropic-ai/sdk";

export const WORDS_PER_MINUTE = 150;

export interface Claim {
  claim: string;
  speaker: string;
  importance: number;
  novelty: number;
}

export async function extractClaims(
  client: Anthropic,
  transcript: string
): Promise<Claim[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Analyze this podcast transcript. Extract the top 10 most important claims, insights, or arguments. For each, provide:
- claim: one-sentence summary
- speaker: who said it
- importance: 1-10
- novelty: 1-10

Return ONLY a JSON array, no other text.

Transcript:
${transcript}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text) as Claim[];
}

export async function generateNarrative(
  client: Anthropic,
  claims: Claim[],
  durationMinutes: number
): Promise<string> {
  const targetWordCount = durationMinutes * WORDS_PER_MINUTE;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Write a ${targetWordCount}-word spoken narrative for an audio briefing.

Build the narrative around these key claims (ranked by importance):
${JSON.stringify(claims, null, 2)}

Rules:
- Write for spoken delivery (short sentences, natural transitions)
- Hit ${targetWordCount} words +/-10%
- Include specific data points, names, and quotes
- Flow as a single coherent story, not a bullet-point list
- Do NOT include any stage directions or non-spoken text`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

**Step 3: Run tests**

Run: `npx vitest run worker/lib/__tests__/distillation.test.ts`

Expected: All PASS

**Step 4: Commit**

```bash
git add worker/lib/distillation.ts worker/lib/__tests__/distillation.test.ts
git commit -m "feat: add two-pass Claude distillation engine"
```

---

## Task 8: TTS Service (OpenAI)

**Files:**
- Create: `worker/lib/tts.ts`
- Test: `worker/lib/__tests__/tts.test.ts`

**Step 1: Write the failing test**

```typescript
// worker/lib/__tests__/tts.test.ts
import { describe, it, expect, vi } from "vitest";
import { generateSpeech } from "../tts";

describe("generateSpeech", () => {
  it("should call OpenAI TTS and return audio buffer", async () => {
    const fakeAudio = new ArrayBuffer(100);
    const mockCreate = vi.fn().mockResolvedValueOnce({
      arrayBuffer: async () => fakeAudio,
    });

    const mockClient = { audio: { speech: { create: mockCreate } } } as any;
    const result = await generateSpeech(mockClient, "Hello world");

    expect(result.byteLength).toBe(100);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: "Hello world",
        response_format: "mp3",
      })
    );
  });
});
```

**Step 2: Implement**

```typescript
// worker/lib/tts.ts
import OpenAI from "openai";

export async function generateSpeech(
  client: OpenAI,
  text: string,
  voice: string = "coral"
): Promise<ArrayBuffer> {
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice as any,
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a warm, professional tone suitable for a daily podcast briefing. Use natural pacing with brief pauses between topics.",
  });

  return response.arrayBuffer();
}
```

**Step 3: Run tests**

Run: `npx vitest run worker/lib/__tests__/tts.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add worker/lib/tts.ts worker/lib/__tests__/tts.test.ts
git commit -m "feat: add OpenAI TTS audio generation"
```

---

## Task 9: MP3 Concatenation

**Files:**
- Create: `worker/lib/mp3-concat.ts`
- Test: `worker/lib/__tests__/mp3-concat.test.ts`

**Step 1: Write the failing test**

```typescript
// worker/lib/__tests__/mp3-concat.test.ts
import { describe, it, expect } from "vitest";
import { concatMp3Buffers, stripId3v2Header } from "../mp3-concat";

describe("stripId3v2Header", () => {
  it("should strip ID3v2 header from buffer", () => {
    // ID3v2 header: "ID3" + version (2 bytes) + flags (1 byte) + size (4 bytes syncsafe)
    // Size of 0 means no tag body, just the 10-byte header
    const header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const audioData = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // fake MP3 frame sync
    const withHeader = new Uint8Array([...header, ...audioData]);

    const stripped = stripId3v2Header(withHeader);
    expect(stripped).toEqual(audioData);
  });

  it("should return buffer unchanged if no ID3v2 header", () => {
    const audioData = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const result = stripId3v2Header(audioData);
    expect(result).toEqual(audioData);
  });
});

describe("concatMp3Buffers", () => {
  it("should concatenate multiple buffers", () => {
    const buf1 = new Uint8Array([1, 2, 3]).buffer;
    const buf2 = new Uint8Array([4, 5, 6]).buffer;

    const result = concatMp3Buffers([buf1, buf2]);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it("should strip ID3v2 headers from all but first buffer", () => {
    const header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const audio1 = new Uint8Array([0xff, 0xfb, 0x01]);
    const audio2 = new Uint8Array([0xff, 0xfb, 0x02]);

    const buf1 = new Uint8Array([...header, ...audio1]).buffer;
    const buf2 = new Uint8Array([...header, ...audio2]).buffer;

    const result = new Uint8Array(concatMp3Buffers([buf1, buf2]));
    // First buffer keeps its header, second has it stripped
    expect(result.length).toBe(header.length + audio1.length + audio2.length);
  });
});
```

**Step 2: Implement**

```typescript
// worker/lib/mp3-concat.ts

export function stripId3v2Header(data: Uint8Array): Uint8Array {
  // ID3v2 header starts with "ID3" (0x49 0x44 0x33)
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    // Bytes 6-9 encode the syncsafe tag size
    const size =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f);
    return data.slice(10 + size);
  }
  return data;
}

export function concatMp3Buffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const arrays = buffers.map((buf, i) => {
    const u = new Uint8Array(buf);
    // Strip ID3v2 header from all but first buffer
    return i === 0 ? u : stripId3v2Header(u);
  });

  const totalLength = arrays.reduce((acc, u) => acc + u.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const u of arrays) {
    result.set(u, offset);
    offset += u.byteLength;
  }
  return result.buffer;
}
```

**Step 3: Run tests**

Run: `npx vitest run worker/lib/__tests__/mp3-concat.test.ts`

Expected: All PASS

**Step 4: Commit**

```bash
git add worker/lib/mp3-concat.ts worker/lib/__tests__/mp3-concat.test.ts
git commit -m "feat: add MP3 concatenation for Workers (no ffmpeg)"
```

---

## Task 10: Clip Caching & R2 Storage

**Files:**
- Create: `worker/lib/clip-cache.ts`
- Create: `worker/lib/time-fitting.ts`
- Test: `worker/lib/__tests__/time-fitting.test.ts`

**Step 1: Write the time-fitting test**

```typescript
// worker/lib/__tests__/time-fitting.test.ts
import { describe, it, expect } from "vitest";
import {
  DURATION_TIERS,
  nearestTier,
  allocateWordBudget,
  WORDS_PER_MINUTE,
} from "../time-fitting";

describe("nearestTier", () => {
  it("should round to nearest duration tier", () => {
    expect(nearestTier(2.5)).toBe(3);
    expect(nearestTier(0.8)).toBe(1);
    expect(nearestTier(6)).toBe(5);
    expect(nearestTier(8)).toBe(7);
    expect(nearestTier(12)).toBe(10);
    expect(nearestTier(20)).toBe(15);
  });
});

describe("allocateWordBudget", () => {
  it("should allocate proportionally based on transcript length", () => {
    const episodes = [
      { transcriptWordCount: 10000 },
      { transcriptWordCount: 5000 },
      { transcriptWordCount: 5000 },
    ];

    const allocations = allocateWordBudget(episodes, 15);

    // Total should be close to 15 * 150 = 2250 minus overhead
    const total = allocations.reduce((sum, a) => sum + a.allocatedWords, 0);
    expect(total).toBeLessThanOrEqual(15 * WORDS_PER_MINUTE);

    // First episode (double the transcript) should get more words
    expect(allocations[0].allocatedWords).toBeGreaterThan(allocations[1].allocatedWords);

    // Each allocation should map to a valid duration tier
    for (const a of allocations) {
      expect(DURATION_TIERS).toContain(a.durationTier);
    }
  });
});
```

**Step 2: Implement time-fitting**

```typescript
// worker/lib/time-fitting.ts

export const WORDS_PER_MINUTE = 150;
export const DURATION_TIERS = [1, 2, 3, 5, 7, 10, 15] as const;
export type DurationTier = (typeof DURATION_TIERS)[number];

const INTRO_WORDS = 30;
const OUTRO_WORDS = 15;
const TRANSITION_WORDS = 15;
const MIN_SEGMENT_WORDS = 150; // 1 minute minimum

export function nearestTier(minutes: number): DurationTier {
  let closest = DURATION_TIERS[0];
  let closestDiff = Math.abs(minutes - closest);

  for (const tier of DURATION_TIERS) {
    const diff = Math.abs(minutes - tier);
    if (diff < closestDiff) {
      closest = tier;
      closestDiff = diff;
    }
  }
  return closest;
}

export interface WordAllocation {
  index: number;
  allocatedWords: number;
  durationTier: DurationTier;
}

export function allocateWordBudget(
  episodes: { transcriptWordCount: number }[],
  targetMinutes: number
): WordAllocation[] {
  const totalBudget = targetMinutes * WORDS_PER_MINUTE;
  const overhead =
    INTRO_WORDS + OUTRO_WORDS + episodes.length * TRANSITION_WORDS;
  const contentBudget = totalBudget - overhead;

  const totalSourceWords = episodes.reduce(
    (sum, ep) => sum + ep.transcriptWordCount,
    0
  );

  return episodes.map((ep, index) => {
    const proportion = ep.transcriptWordCount / totalSourceWords;
    const allocatedWords = Math.max(
      MIN_SEGMENT_WORDS,
      Math.floor(contentBudget * proportion)
    );
    const durationMinutes = allocatedWords / WORDS_PER_MINUTE;
    const durationTier = nearestTier(durationMinutes);

    return { index, allocatedWords: durationTier * WORDS_PER_MINUTE, durationTier };
  });
}
```

**Step 3: Run test**

Run: `npx vitest run worker/lib/__tests__/time-fitting.test.ts`

Expected: All PASS

**Step 4: Implement clip cache (R2 operations)**

```typescript
// worker/lib/clip-cache.ts

export function clipKey(episodeId: string, durationTier: number): string {
  return `clips/${episodeId}/${durationTier}.mp3`;
}

export function briefingKey(userId: string, date: string): string {
  return `briefings/${userId}/${date}.mp3`;
}

export async function getClip(
  r2: R2Bucket,
  episodeId: string,
  durationTier: number
): Promise<ArrayBuffer | null> {
  const object = await r2.get(clipKey(episodeId, durationTier));
  if (!object) return null;
  return object.arrayBuffer();
}

export async function putClip(
  r2: R2Bucket,
  episodeId: string,
  durationTier: number,
  audio: ArrayBuffer
): Promise<void> {
  await r2.put(clipKey(episodeId, durationTier), audio, {
    httpMetadata: { contentType: "audio/mpeg" },
  });
}

export async function putBriefing(
  r2: R2Bucket,
  userId: string,
  date: string,
  audio: ArrayBuffer
): Promise<string> {
  const key = briefingKey(userId, date);
  await r2.put(key, audio, {
    httpMetadata: { contentType: "audio/mpeg" },
  });
  return key;
}
```

**Step 5: Commit**

```bash
git add worker/lib/time-fitting.ts worker/lib/clip-cache.ts worker/lib/__tests__/time-fitting.test.ts
git commit -m "feat: add time-fitting algorithm and R2 clip cache"
```

---

## Task 11: Podcast API Routes

**Files:**
- Create: `worker/routes/podcasts.ts`
- Modify: `worker/index.ts`

**Step 1: Create podcast routes**

```typescript
// worker/routes/podcasts.ts
import { Hono } from "hono";
import { getAuth } from "../middleware/auth";
import { PodcastIndexClient } from "../lib/podcast-index";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

const podcasts = new Hono<{ Bindings: Env }>();

// Search podcasts via Podcast Index
podcasts.get("/search", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q");
  if (!q) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const client = new PodcastIndexClient(c.env.PODCAST_INDEX_KEY, c.env.PODCAST_INDEX_SECRET);
  const results = await client.searchByTerm(q, { max: 20 });
  return c.json(results);
});

// Get trending podcasts
podcasts.get("/trending", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const client = new PodcastIndexClient(c.env.PODCAST_INDEX_KEY, c.env.PODCAST_INDEX_SECRET);
  const results = await client.trending({ max: 20 });
  return c.json(results);
});

// Subscribe to a podcast
podcasts.post("/subscribe", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const { feedUrl, title, imageUrl, podcastIndexId, author } = await c.req.json();
  const prisma = createPrismaClient(c.env.HYPERDRIVE);

  try {
    // Upsert podcast
    const podcast = await prisma.podcast.upsert({
      where: { feedUrl },
      create: { feedUrl, title, imageUrl, podcastIndexId, author },
      update: { title, imageUrl, author },
    });

    // Get DB user
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });

    // Create subscription
    await prisma.subscription.create({
      data: { userId: user.id, podcastId: podcast.id },
    });

    return c.json({ subscribed: true, podcastId: podcast.id });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// Unsubscribe
podcasts.delete("/subscribe/:podcastId", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });
    await prisma.subscription.delete({
      where: { userId_podcastId: { userId: user.id, podcastId: c.req.param("podcastId") } },
    });
    return c.json({ unsubscribed: true });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// Get user's subscriptions
podcasts.get("/subscriptions", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });
    const subs = await prisma.subscription.findMany({
      where: { userId: user.id },
      include: { podcast: true },
    });
    return c.json(subs);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { podcasts };
```

**Step 2: Wire into main app**

Add to `worker/index.ts`:
```typescript
import { podcasts } from "./routes/podcasts";
app.route("/api/podcasts", podcasts);
```

**Step 3: Commit**

```bash
git add worker/routes/podcasts.ts
git commit -m "feat: add podcast search, subscribe, and subscription routes"
```

---

## Task 12: Briefing API Routes

**Files:**
- Create: `worker/routes/briefings.ts`
- Modify: `worker/index.ts`

**Step 1: Create briefing routes**

```typescript
// worker/routes/briefings.ts
import { Hono } from "hono";
import { getAuth } from "../middleware/auth";
import { createPrismaClient } from "../lib/db";
import type { Env } from "../types";

const briefings = new Hono<{ Bindings: Env }>();

// Get user's briefings
briefings.get("/", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });
    const results = await prisma.briefing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { segments: true },
    });
    return c.json(results);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// Get today's briefing
briefings.get("/today", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const briefing = await prisma.briefing.findFirst({
      where: { userId: user.id, createdAt: { gte: today } },
      include: { segments: { orderBy: { orderIndex: "asc" } } },
    });

    return c.json(briefing);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// Trigger on-demand briefing generation
briefings.post("/generate", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: auth.userId } });

    // Check tier limits (free: 3/week, 5 min max)
    if (user.tier === "FREE") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekCount = await prisma.briefing.count({
        where: { userId: user.id, createdAt: { gte: weekAgo } },
      });
      if (weekCount >= 3) {
        return c.json({ error: "Free tier limit: 3 briefings per week" }, 429);
      }
    }

    const targetMinutes = user.tier === "FREE"
      ? Math.min(user.briefingLengthMinutes, 5)
      : user.briefingLengthMinutes;

    const briefing = await prisma.briefing.create({
      data: { userId: user.id, targetMinutes },
    });

    // Queue the briefing assembly
    await c.env.BRIEFING_ASSEMBLY_QUEUE.send({
      briefingId: briefing.id,
      userId: user.id,
      targetMinutes,
    });

    return c.json({ briefingId: briefing.id, status: "PENDING" });
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

// Update briefing preferences
briefings.patch("/preferences", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

  const { briefingLengthMinutes, briefingTime, timezone } = await c.req.json();
  const prisma = createPrismaClient(c.env.HYPERDRIVE);
  try {
    const updated = await prisma.user.update({
      where: { clerkId: auth.userId },
      data: {
        ...(briefingLengthMinutes !== undefined && { briefingLengthMinutes }),
        ...(briefingTime !== undefined && { briefingTime }),
        ...(timezone !== undefined && { timezone }),
      },
    });
    return c.json(updated);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

export { briefings };
```

**Step 2: Wire into main app**

Add to `worker/index.ts`:
```typescript
import { briefings } from "./routes/briefings";
app.route("/api/briefings", briefings);
```

**Step 3: Commit**

```bash
git add worker/routes/briefings.ts
git commit -m "feat: add briefing routes with tier enforcement"
```

---

## Task 13: Queue Consumer Workers

**Files:**
- Create: `worker/queues/feed-refresh.ts`
- Create: `worker/queues/distillation.ts`
- Create: `worker/queues/clip-generation.ts`
- Create: `worker/queues/briefing-assembly.ts`
- Modify: `worker/index.ts` (add queue handler export)

**Step 1: Create feed refresh consumer**

```typescript
// worker/queues/feed-refresh.ts
import { createPrismaClient } from "../lib/db";
import { parsePodcastFeed } from "../lib/rss-parser";
import type { Env } from "../types";

export async function handleFeedRefresh(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
) {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    // If cron-triggered (no messages), refresh all podcasts
    const podcasts = await prisma.podcast.findMany();

    for (const podcast of podcasts) {
      try {
        const response = await fetch(podcast.feedUrl);
        const xml = await response.text();
        const feed = parsePodcastFeed(xml);

        for (const ep of feed.episodes) {
          const existing = await prisma.episode.findUnique({
            where: { podcastId_guid: { podcastId: podcast.id, guid: ep.guid } },
          });

          if (!existing) {
            const episode = await prisma.episode.create({
              data: {
                podcastId: podcast.id,
                title: ep.title,
                description: ep.description,
                audioUrl: ep.audioUrl,
                publishedAt: ep.publishedAt,
                durationSeconds: ep.durationSeconds,
                guid: ep.guid,
                transcriptUrl: ep.transcriptUrl,
              },
            });

            // Queue distillation if transcript is available
            if (ep.transcriptUrl) {
              await env.DISTILLATION_QUEUE.send({
                episodeId: episode.id,
                transcriptUrl: ep.transcriptUrl,
              });
            }
          }
        }

        await prisma.podcast.update({
          where: { id: podcast.id },
          data: { lastFetchedAt: new Date() },
        });
      } catch (err) {
        console.error(`Feed refresh failed for ${podcast.feedUrl}:`, err);
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

**Step 2: Create distillation consumer**

```typescript
// worker/queues/distillation.ts
import Anthropic from "@anthropic-ai/sdk";
import { createPrismaClient } from "../lib/db";
import { fetchTranscript } from "../lib/transcript";
import { extractClaims } from "../lib/distillation";
import type { Env } from "../types";

interface DistillationMessage {
  episodeId: string;
  transcriptUrl: string;
}

export async function handleDistillation(
  batch: MessageBatch<DistillationMessage>,
  env: Env,
  ctx: ExecutionContext
) {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    for (const msg of batch.messages) {
      const { episodeId, transcriptUrl } = msg.body;

      try {
        // Create or update distillation record
        const distillation = await prisma.distillation.upsert({
          where: { episodeId },
          create: { episodeId, status: "FETCHING_TRANSCRIPT" },
          update: { status: "FETCHING_TRANSCRIPT" },
        });

        // Fetch transcript
        const transcript = await fetchTranscript(transcriptUrl);

        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { transcript, status: "EXTRACTING_CLAIMS" },
        });

        // Extract claims (Pass 1)
        const claims = await extractClaims(anthropic, transcript);

        await prisma.distillation.update({
          where: { id: distillation.id },
          data: { claimsJson: claims as any, status: "COMPLETED" },
        });

        msg.ack();
      } catch (err: any) {
        console.error(`Distillation failed for episode ${episodeId}:`, err);
        await prisma.distillation.upsert({
          where: { episodeId },
          create: { episodeId, status: "FAILED", errorMessage: err.message },
          update: { status: "FAILED", errorMessage: err.message },
        });
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

**Step 3: Create clip generation consumer**

```typescript
// worker/queues/clip-generation.ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createPrismaClient } from "../lib/db";
import { generateNarrative } from "../lib/distillation";
import { generateSpeech } from "../lib/tts";
import { putClip } from "../lib/clip-cache";
import type { Env } from "../types";

interface ClipMessage {
  episodeId: string;
  distillationId: string;
  durationTier: number;
}

export async function handleClipGeneration(
  batch: MessageBatch<ClipMessage>,
  env: Env,
  ctx: ExecutionContext
) {
  const prisma = createPrismaClient(env.HYPERDRIVE);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    for (const msg of batch.messages) {
      const { episodeId, distillationId, durationTier } = msg.body;

      try {
        // Check if clip already exists
        const existing = await prisma.clip.findUnique({
          where: { episodeId_durationTier: { episodeId, durationTier } },
        });
        if (existing?.status === "COMPLETED") {
          msg.ack();
          continue;
        }

        // Create or update clip record
        const clip = await prisma.clip.upsert({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          create: { episodeId, distillationId, durationTier, status: "GENERATING_NARRATIVE" },
          update: { status: "GENERATING_NARRATIVE" },
        });

        // Get claims from distillation
        const distillation = await prisma.distillation.findUniqueOrThrow({
          where: { id: distillationId },
        });
        const claims = distillation.claimsJson as any[];

        // Generate narrative (Pass 2)
        const narrative = await generateNarrative(anthropic, claims, durationTier);
        const wordCount = narrative.split(/\s+/).length;

        await prisma.clip.update({
          where: { id: clip.id },
          data: { narrativeText: narrative, wordCount, status: "GENERATING_AUDIO" },
        });

        // Generate TTS audio
        const audio = await generateSpeech(openai, narrative);

        // Store in R2
        await putClip(env.R2, episodeId, durationTier, audio);

        const audioKey = `clips/${episodeId}/${durationTier}.mp3`;
        await prisma.clip.update({
          where: { id: clip.id },
          data: { audioKey, status: "COMPLETED" },
        });

        msg.ack();
      } catch (err: any) {
        console.error(`Clip generation failed:`, err);
        await prisma.clip.update({
          where: { episodeId_durationTier: { episodeId, durationTier } },
          data: { status: "FAILED", errorMessage: err.message },
        }).catch(() => {});
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

**Step 4: Create briefing assembly consumer**

```typescript
// worker/queues/briefing-assembly.ts
import { createPrismaClient } from "../lib/db";
import { allocateWordBudget } from "../lib/time-fitting";
import { getClip, putBriefing } from "../lib/clip-cache";
import { concatMp3Buffers } from "../lib/mp3-concat";
import type { Env } from "../types";

interface BriefingMessage {
  briefingId: string;
  userId: string;
  targetMinutes: number;
}

export async function handleBriefingAssembly(
  batch: MessageBatch<BriefingMessage>,
  env: Env,
  ctx: ExecutionContext
) {
  const prisma = createPrismaClient(env.HYPERDRIVE);

  try {
    for (const msg of batch.messages) {
      const { briefingId, userId, targetMinutes } = msg.body;

      try {
        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: "ASSEMBLING" },
        });

        // Get user's subscriptions with latest episodes
        const subs = await prisma.subscription.findMany({
          where: { userId },
          include: {
            podcast: {
              include: {
                episodes: {
                  orderBy: { publishedAt: "desc" },
                  take: 1,
                  include: { distillation: true },
                },
              },
            },
          },
        });

        // Filter to episodes with completed distillation
        const readyEpisodes = subs
          .map((s) => s.podcast.episodes[0])
          .filter((ep) => ep?.distillation?.status === "COMPLETED");

        if (readyEpisodes.length === 0) {
          await prisma.briefing.update({
            where: { id: briefingId },
            data: { status: "FAILED", errorMessage: "No episodes with completed distillation" },
          });
          msg.ack();
          continue;
        }

        // Allocate time budget
        const allocations = allocateWordBudget(
          readyEpisodes.map((ep) => ({
            transcriptWordCount: ep.distillation!.transcript?.split(/\s+/).length ?? 5000,
          })),
          targetMinutes
        );

        // Collect audio buffers — check cache, queue missing clips
        const audioBuffers: ArrayBuffer[] = [];
        let allClipsReady = true;

        for (let i = 0; i < readyEpisodes.length; i++) {
          const ep = readyEpisodes[i];
          const alloc = allocations[i];

          const cachedClip = await getClip(env.R2, ep.id, alloc.durationTier);

          if (cachedClip) {
            audioBuffers.push(cachedClip);
          } else {
            // Queue clip generation
            await env.CLIP_GENERATION_QUEUE.send({
              episodeId: ep.id,
              distillationId: ep.distillation!.id,
              durationTier: alloc.durationTier,
            });
            allClipsReady = false;
          }

          // Record segment
          await prisma.briefingSegment.create({
            data: {
              briefingId,
              clipId: ep.id, // Will be updated when clip is ready
              orderIndex: i,
              transitionText: i === 0
                ? `Here's your briefing. Starting with ${ep.podcast?.title ?? "your first podcast"}.`
                : `Next, from ${ep.podcast?.title ?? "your next podcast"}.`,
            },
          });
        }

        if (!allClipsReady) {
          // Re-queue this briefing for later assembly
          await prisma.briefing.update({
            where: { id: briefingId },
            data: { status: "PENDING" },
          });
          msg.retry({ delaySeconds: 60 });
          continue;
        }

        // All clips ready — concatenate
        const finalAudio = concatMp3Buffers(audioBuffers);

        // Store briefing
        const date = new Date().toISOString().split("T")[0];
        const audioKey = await putBriefing(env.R2, userId, date, finalAudio);

        await prisma.briefing.update({
          where: { id: briefingId },
          data: {
            status: "COMPLETED",
            audioKey,
            audioUrl: audioKey, // Will be R2 public URL
            generatedAt: new Date(),
          },
        });

        msg.ack();
      } catch (err: any) {
        console.error(`Briefing assembly failed:`, err);
        await prisma.briefing.update({
          where: { id: briefingId },
          data: { status: "FAILED", errorMessage: err.message },
        }).catch(() => {});
        msg.retry();
      }
    }
  } finally {
    ctx.waitUntil(prisma.$disconnect());
  }
}
```

**Step 5: Wire queue consumers into the Worker export**

Update `worker/index.ts` to export the queue handler:

```typescript
import { handleFeedRefresh } from "./queues/feed-refresh";
import { handleDistillation } from "./queues/distillation";
import { handleClipGeneration } from "./queues/clip-generation";
import { handleBriefingAssembly } from "./queues/briefing-assembly";

// ... existing app code ...

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    switch (batch.queue) {
      case "feed-refresh":
        return handleFeedRefresh(batch, env, ctx);
      case "distillation":
        return handleDistillation(batch as MessageBatch<any>, env, ctx);
      case "clip-generation":
        return handleClipGeneration(batch as MessageBatch<any>, env, ctx);
      case "briefing-assembly":
        return handleBriefingAssembly(batch as MessageBatch<any>, env, ctx);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron trigger: refresh all feeds
    await env.FEED_REFRESH_QUEUE.send({ type: "cron" });
  },
};
```

**Step 6: Update `wrangler.jsonc` with all queue bindings**

Add to `wrangler.jsonc`:
```jsonc
{
  // ... existing config
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "blipp-audio" }
  ],
  "queues": {
    "producers": [
      { "binding": "FEED_REFRESH_QUEUE", "queue": "feed-refresh" },
      { "binding": "DISTILLATION_QUEUE", "queue": "distillation" },
      { "binding": "CLIP_GENERATION_QUEUE", "queue": "clip-generation" },
      { "binding": "BRIEFING_ASSEMBLY_QUEUE", "queue": "briefing-assembly" }
    ],
    "consumers": [
      { "queue": "feed-refresh", "max_batch_size": 10, "max_retries": 3 },
      { "queue": "distillation", "max_batch_size": 5, "max_retries": 3 },
      { "queue": "clip-generation", "max_batch_size": 3, "max_retries": 3 },
      { "queue": "briefing-assembly", "max_batch_size": 5, "max_retries": 3 }
    ]
  },
  "triggers": {
    "crons": ["*/30 * * * *"]
  }
}
```

**Step 7: Commit**

```bash
git add worker/queues/ worker/index.ts wrangler.jsonc
git commit -m "feat: add queue consumers for feed refresh, distillation, clip gen, briefing assembly"
```

---

## Task 14: Frontend — Layout, Routing, Auth

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Create: `src/layouts/app-layout.tsx`
- Create: `src/pages/landing.tsx`
- Create: `src/pages/dashboard.tsx`
- Create: `src/pages/discover.tsx`
- Create: `src/pages/settings.tsx`

**Step 1: Set up routing and Clerk provider**

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppClerkProvider } from "./providers/clerk-provider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppClerkProvider>
        <App />
      </AppClerkProvider>
    </BrowserRouter>
  </StrictMode>
);
```

```tsx
// src/App.tsx
import { Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/react";
import { AppLayout } from "./layouts/app-layout";
import { Landing } from "./pages/landing";
import { Dashboard } from "./pages/dashboard";
import { Discover } from "./pages/discover";
import { Settings } from "./pages/settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        element={
          <>
            <SignedIn><AppLayout /></SignedIn>
            <SignedOut><RedirectToSignIn /></SignedOut>
          </>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
```

**Step 2: Create app layout**

```tsx
// src/layouts/app-layout.tsx
import { Outlet, Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/react";

export function AppLayout() {
  const location = useLocation();
  const isActive = (path: string) =>
    location.pathname === path ? "text-white" : "text-zinc-400 hover:text-zinc-200";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <nav className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-xl font-bold">Blipp</Link>
          <Link to="/dashboard" className={isActive("/dashboard")}>Briefings</Link>
          <Link to="/discover" className={isActive("/discover")}>Discover</Link>
          <Link to="/settings" className={isActive("/settings")}>Settings</Link>
        </div>
        <UserButton />
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 3: Create placeholder pages**

```tsx
// src/pages/landing.tsx
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton } from "@clerk/react";

export function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-6xl font-bold">Blipp</h1>
      <p className="text-xl text-zinc-400">Your podcasts, distilled to fit your time.</p>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-zinc-200">
            Get Started
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link
          to="/dashboard"
          className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-zinc-200"
        >
          Go to Dashboard
        </Link>
      </SignedIn>
    </div>
  );
}
```

```tsx
// src/pages/dashboard.tsx
export function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Today's Briefing</h1>
      <p className="text-zinc-400">Your briefing will appear here.</p>
    </div>
  );
}
```

```tsx
// src/pages/discover.tsx
export function Discover() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Discover Podcasts</h1>
      <p className="text-zinc-400">Search and subscribe to podcasts.</p>
    </div>
  );
}
```

```tsx
// src/pages/settings.tsx
export function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <p className="text-zinc-400">Briefing preferences and billing.</p>
    </div>
  );
}
```

**Step 4: Verify dev server, routing works**

Run: `npx vite dev`

Expected: Landing page at `/`, sign-in redirects to Clerk, authenticated routes render with layout.

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: add frontend layout, routing, and auth with Clerk"
```

---

## Task 15: Frontend — Dashboard & Briefing Player

**Files:**
- Modify: `src/pages/dashboard.tsx`
- Create: `src/components/briefing-player.tsx`
- Create: `src/lib/api.ts`

**Step 1: Create API helper**

```typescript
// src/lib/api.ts
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
```

**Step 2: Create briefing player component**

```tsx
// src/components/briefing-player.tsx
import { useRef, useState } from "react";

interface BriefingPlayerProps {
  audioUrl: string;
  title: string;
  segments: { orderIndex: number; transitionText: string }[];
}

export function BriefingPlayer({ audioUrl, title, segments }: BriefingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setProgress(
              (audioRef.current.currentTime / audioRef.current.duration) * 100
            );
          }
        }}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={toggle}
          className="bg-white text-black w-12 h-12 rounded-full flex items-center justify-center font-bold hover:bg-zinc-200"
        >
          {playing ? "||" : "\u25B6"}
        </button>
        <div className="flex-1 bg-zinc-800 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {segments.map((seg) => (
          <div key={seg.orderIndex} className="text-sm text-zinc-400">
            {seg.orderIndex + 1}. {seg.transitionText}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Wire dashboard to API**

```tsx
// src/pages/dashboard.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { BriefingPlayer } from "../components/briefing-player";
import { apiFetch } from "../lib/api";

interface Briefing {
  id: string;
  status: string;
  audioUrl: string | null;
  targetMinutes: number;
  createdAt: string;
  segments: { orderIndex: number; transitionText: string }[];
}

export function Dashboard() {
  const { getToken } = useAuth();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Briefing | null>("/briefings/today")
      .then(setBriefing)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const generateBriefing = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ briefingId: string }>("/briefings/generate", {
        method: "POST",
      });
      // Poll for completion
      const poll = setInterval(async () => {
        const updated = await apiFetch<Briefing | null>("/briefings/today");
        if (updated?.status === "COMPLETED") {
          setBriefing(updated);
          setLoading(false);
          clearInterval(poll);
        } else if (updated?.status === "FAILED") {
          setLoading(false);
          clearInterval(poll);
        }
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setLoading(false);
    }
  };

  if (loading) {
    return <p className="text-zinc-400">Loading...</p>;
  }

  if (!briefing || briefing.status !== "COMPLETED") {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Today's Briefing</h1>
        <p className="text-zinc-400 mb-4">No briefing yet today.</p>
        <button
          onClick={generateBriefing}
          className="bg-white text-black px-4 py-2 rounded-lg font-semibold hover:bg-zinc-200"
        >
          Generate Briefing
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Today's Briefing</h1>
      <BriefingPlayer
        audioUrl={briefing.audioUrl!}
        title={`${briefing.targetMinutes}-minute briefing`}
        segments={briefing.segments}
      />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/ src/lib/api.ts src/pages/dashboard.tsx
git commit -m "feat: add briefing player and dashboard with API integration"
```

---

## Task 16: Frontend — Podcast Discovery & Subscription

**Files:**
- Modify: `src/pages/discover.tsx`
- Create: `src/components/podcast-card.tsx`

**Step 1: Create podcast card component**

```tsx
// src/components/podcast-card.tsx
import { useState } from "react";
import { apiFetch } from "../lib/api";

interface PodcastCardProps {
  id?: number;
  title: string;
  author?: string;
  image?: string;
  url: string;
  description?: string;
  isSubscribed?: boolean;
  podcastId?: string;
  onSubscriptionChange?: () => void;
}

export function PodcastCard({
  title, author, image, url, description, isSubscribed, podcastId, onSubscriptionChange,
}: PodcastCardProps) {
  const [loading, setLoading] = useState(false);

  const subscribe = async () => {
    setLoading(true);
    try {
      await apiFetch("/podcasts/subscribe", {
        method: "POST",
        body: JSON.stringify({ feedUrl: url, title, imageUrl: image, author }),
      });
      onSubscriptionChange?.();
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!podcastId) return;
    setLoading(true);
    try {
      await apiFetch(`/podcasts/subscribe/${podcastId}`, { method: "DELETE" });
      onSubscriptionChange?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 flex gap-4">
      {image && <img src={image} alt={title} className="w-16 h-16 rounded-lg object-cover" />}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate">{title}</h3>
        {author && <p className="text-sm text-zinc-400">{author}</p>}
        {description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{description}</p>}
      </div>
      <button
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={loading}
        className={`px-4 py-2 rounded-lg text-sm font-medium shrink-0 ${
          isSubscribed
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            : "bg-white text-black hover:bg-zinc-200"
        }`}
      >
        {loading ? "..." : isSubscribed ? "Unsubscribe" : "Subscribe"}
      </button>
    </div>
  );
}
```

**Step 2: Build discover page with search**

```tsx
// src/pages/discover.tsx
import { useState, useEffect } from "react";
import { PodcastCard } from "../components/podcast-card";
import { apiFetch } from "../lib/api";

export function Discover() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const loadSubs = () => {
    apiFetch<any[]>("/podcasts/subscriptions").then(setSubscriptions).catch(console.error);
  };

  useEffect(() => { loadSubs(); }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ feeds: any[] }>(`/podcasts/search?q=${encodeURIComponent(query)}`);
      setResults(data.feeds ?? []);
    } finally {
      setSearching(false);
    }
  };

  const subscribedUrls = new Set(subscriptions.map((s: any) => s.podcast.feedUrl));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Discover Podcasts</h1>
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search podcasts..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder:text-zinc-500"
        />
        <button
          onClick={search}
          disabled={searching}
          className="bg-white text-black px-4 py-2 rounded-lg font-semibold hover:bg-zinc-200"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      {subscriptions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Your Subscriptions</h2>
          <div className="space-y-3">
            {subscriptions.map((sub: any) => (
              <PodcastCard
                key={sub.id}
                title={sub.podcast.title}
                author={sub.podcast.author}
                image={sub.podcast.imageUrl}
                url={sub.podcast.feedUrl}
                isSubscribed
                podcastId={sub.podcastId}
                onSubscriptionChange={loadSubs}
              />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Search Results</h2>
          <div className="space-y-3">
            {results.map((feed: any) => (
              <PodcastCard
                key={feed.id}
                title={feed.title}
                author={feed.author}
                image={feed.image}
                url={feed.url}
                description={feed.description}
                isSubscribed={subscribedUrls.has(feed.url)}
                onSubscriptionChange={loadSubs}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/podcast-card.tsx src/pages/discover.tsx
git commit -m "feat: add podcast discovery and subscription UI"
```

---

## Task 17: Frontend — Settings & Billing

**Files:**
- Modify: `src/pages/settings.tsx`

**Step 1: Build settings page**

```tsx
// src/pages/settings.tsx
import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { apiFetch } from "../lib/api";

export function Settings() {
  const { user } = useUser();
  const tier = (user?.publicMetadata as any)?.tier ?? "FREE";

  const [length, setLength] = useState(15);
  const [time, setTime] = useState("07:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);

  const maxLength = tier === "FREE" ? 5 : 30;

  const savePreferences = async () => {
    setSaving(true);
    try {
      await apiFetch("/briefings/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          briefingLengthMinutes: Math.min(length, maxLength),
          briefingTime: time,
          timezone,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async (upgradeTier: "PRO" | "PRO_PLUS") => {
    const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ tier: upgradeTier }),
    });
    window.location.href = url;
  };

  const handleManageBilling = async () => {
    const { url } = await apiFetch<{ url: string }>("/billing/portal", {
      method: "POST",
    });
    window.location.href = url;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Briefing Preferences</h2>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Briefing Length: {length} min {tier === "FREE" && "(max 5 on Free)"}
            </label>
            <input
              type="range"
              min={1}
              max={maxLength}
              value={Math.min(length, maxLength)}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Briefing Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
            />
          </div>
          <button
            onClick={savePreferences}
            disabled={saving}
            className="bg-white text-black px-4 py-2 rounded-lg font-semibold hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Plan</h2>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <p className="mb-4">
            Current plan: <span className="font-semibold">{tier}</span>
          </p>
          {tier === "FREE" ? (
            <div className="flex gap-3">
              <button
                onClick={() => handleUpgrade("PRO")}
                className="bg-white text-black px-4 py-2 rounded-lg font-semibold hover:bg-zinc-200"
              >
                Upgrade to Pro ($9.99/mo)
              </button>
              <button
                onClick={() => handleUpgrade("PRO_PLUS")}
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-zinc-600"
              >
                Upgrade to Pro+ ($19.99/mo)
              </button>
            </div>
          ) : (
            <button
              onClick={handleManageBilling}
              className="bg-zinc-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-zinc-600"
            >
              Manage Subscription
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/settings.tsx
git commit -m "feat: add settings page with briefing preferences and billing"
```

---

## Task 18: End-to-End Wiring & Deploy

**Files:**
- Modify: `worker/index.ts` (final wiring)
- Modify: `wrangler.jsonc` (final config)

**Step 1: Final `worker/index.ts`**

Ensure all routes and queue handlers are imported and wired. Verify the export includes `fetch`, `queue`, and `scheduled` handlers.

**Step 2: Deploy to Cloudflare**

Run:
```bash
# Create R2 bucket
npx wrangler r2 bucket create blipp-audio

# Create queues
npx wrangler queues create feed-refresh
npx wrangler queues create distillation
npx wrangler queues create clip-generation
npx wrangler queues create briefing-assembly

# Create Hyperdrive config (replace with your Neon connection string)
npx wrangler hyperdrive create blipp-db --connection-string="postgresql://..."

# Set secrets
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PODCAST_INDEX_KEY
npx wrangler secret put PODCAST_INDEX_SECRET

# Deploy
npx wrangler deploy
```

**Step 3: Configure webhooks**

- Clerk Dashboard → Webhooks → Add endpoint: `https://blipp.<your-domain>/api/webhooks/clerk`
  - Events: `user.created`, `user.updated`, `user.deleted`
- Stripe Dashboard → Webhooks → Add endpoint: `https://blipp.<your-domain>/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

**Step 4: Smoke test**

1. Visit the deployed URL
2. Sign up via Clerk
3. Search for a podcast and subscribe
4. Generate a briefing
5. Verify audio plays

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: final wiring and deployment configuration"
```
