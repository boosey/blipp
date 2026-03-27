# Development Guide

Comprehensive guide for setting up, running, and developing the Blipp project locally.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **npm** -- always use `--legacy-peer-deps` due to Clerk peer dependency conflicts
- **Git**
- Accounts and API keys for: Clerk, Stripe, Neon, Anthropic, OpenAI, Podcast Index
- Optional for STT benchmarking: OpenAI (Whisper), Deepgram, Groq, Cloudflare Workers AI

## Initial Setup

### 1. Clone and Install

```bash
git clone https://github.com/boosey/blipp.git
cd blipp
npm install --legacy-peer-deps
```

### 2. Create Environment Files

Two env files at project root (both gitignored):

#### `.dev.vars` (Worker secrets -- used by Wrangler)

```env
# Auth (Clerk)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_placeholder

# Payments (Stripe sandbox)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_placeholder

# Database (Neon pooled connection string)
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Podcast Index
PODCAST_INDEX_KEY=...
PODCAST_INDEX_SECRET=...
# ^ Quote the secret if it contains special characters (^, $, #)

# Optional — STT benchmark providers
DEEPGRAM_API_KEY=...
GROQ_API_KEY=...
```

#### `.env` (Vite client vars + Prisma CLI)

```env
# Prisma CLI reads this for db push / migrate / studio
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require

VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_APP_URL=http://localhost:5173
```

**Important:** The `.env` `DATABASE_URL` must use the Neon **pooler** endpoint (hostname contains `-pooler`, port 5432, `sslmode=require`). Do not use the direct endpoint.

Webhook secrets (`CLERK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`) use placeholders for local dev since webhooks are not called locally. The app runs fine without them.

### 3. Set Up the Database

```bash
# Generate Prisma client (Cloudflare runtime + Node.js runtime)
npx prisma generate

# Push schema to Neon (creates all tables)
npx prisma db push

# Seed initial data (plans, AI model registry, etc.)
npx prisma db seed
```

#### Prisma Cloudflare Runtime Quirk

After `npx prisma generate`, you must manually create a barrel export file at `src/generated/prisma/index.ts`. The Cloudflare runtime generator does not produce one automatically. This file is gitignored, so it must be recreated after every fresh clone or `prisma generate`.

You can verify the database setup with Prisma Studio:

```bash
npx prisma studio
```

### 4. Run the Dev Server

```bash
npm run dev
```

This runs `scripts/dev.mjs`, which:
1. Reads `DATABASE_URL` from `.dev.vars`
2. Exports it as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
3. Starts `vite dev` (via the Cloudflare Vite plugin)

The app runs at **http://localhost:8787**. The Worker handles `/api/*` requests, and the Vite SPA serves everything else.

---

## Service Account Setup

If you need to create accounts from scratch, here is what each service provides and where to sign up.

| Service | Purpose | Sign Up | Cost |
|---------|---------|---------|------|
| **Clerk** | Authentication (sign-up, sign-in, sessions) | [dashboard.clerk.com](https://dashboard.clerk.com/sign-up) | Free tier |
| **Neon** | Serverless PostgreSQL | [neon.tech](https://neon.tech) | Free tier (0.5 GB) |
| **Stripe** | Payments and subscriptions | [dashboard.stripe.com](https://dashboard.stripe.com/register) | Free sandbox |
| **Anthropic** | Claude API for distillation/narrative | [console.anthropic.com](https://console.anthropic.com/) | $5 min credits |
| **OpenAI** | TTS audio + Whisper STT | [platform.openai.com](https://platform.openai.com/) | $5 min credits |
| **Podcast Index** | Podcast catalog data | [api.podcastindex.org](https://api.podcastindex.org/signup) | Free |
| **Deepgram** | STT benchmarking (Nova models) | [console.deepgram.com](https://console.deepgram.com/signup) | Free credits |
| **Groq** | Fast STT/LLM/TTS inference | [console.groq.com](https://console.groq.com) | Free tier |

### Clerk Setup

1. Create an application named `Blipp`
2. Enable **Email address** and **Google** sign-in
3. Google SSO uses Clerk's shared dev credentials -- no Google Cloud project needed for local dev
4. Copy the **Publishable key** (`pk_test_`) and **Secret key** (`sk_test_`) from Configure > API keys

### Neon Setup

1. Create a project named `blipp` with database `neondb`
2. Copy both the **pooled** (`-pooler` hostname) and **direct** connection strings
3. Use the pooled string in `.dev.vars` and `.env`

### Stripe Setup

1. Create a sandbox named `blipp-dev` (no bank details needed)
2. Copy the sandbox **Secret key** (`sk_test_`) from Developers > API keys
3. Products are not needed for local dev -- billing flows won't work end-to-end without them

### Anthropic / OpenAI Setup

Both require purchasing API credits ($5 minimum). Without credits, API requests fail even with a valid key.

### Podcast Index Setup

Completely free. Sign up and check your email for the API Key and API Secret.

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Worker + Vite SPA at localhost:8787) |
| `npm run build` | Production build (Vite) |
| `npm test` | Run all tests (Vitest) |
| `npm run test:integration` | Run integration tests |
| `npm run typecheck` | Type check (`tsc --noEmit`) |
| `npm run clean:pipeline` | Clean pipeline data (uses raw `pg`) |
| `npm run clean:pipeline:dry` | Dry-run pipeline clean (preview only) |
| `npm run clean:pipeline:staging` | Clean pipeline data on staging |
| `npm run clean:pipeline:production` | Clean pipeline data on production |
| `npm run clean:stt-benchmark` | Clean STT benchmark data |
| `npm run db:check` | Database health check (uses raw `pg`) |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run deploy` | Build + deploy to staging |
| `npm run deploy:production` | Build + deploy to production |
| `npm run deploy:quick` | Deploy to staging (skip build) |
| `npm run deploy:quick:production` | Deploy to production (skip build) |

---

## Running Tests

```bash
# All tests
npm test

# Specific test file
npx vitest run worker/queues/__tests__/feed-refresh.test.ts

# Worker tests (may need memory increase)
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/

# Type checking
npm run typecheck
```

### Test Helpers

Test utilities live in `tests/helpers/mocks.ts`:

- `createMockPrisma()` -- Mock Prisma client with all models
- `createMockEnv()` -- Mock Env bindings (queues, R2, Hyperdrive, AI)
- `createMockContext()` -- Mock Hono context with `executionCtx`

### API Route Tests

Tests for public API routes live in `worker/routes/__tests__/`. Route tests must inject a prisma middleware into the test app before mounting routes:

```typescript
app.use("/*", async (c, next) => {
  c.set("prisma", mockPrisma);
  await next();
});
app.route("/path", myRoutes);
```

This mirrors the real Prisma middleware and provides the mock prisma client to route handlers via `c.get("prisma")`.

### Vitest v4 Mock Gotcha

`vi.clearAllMocks()` resets `mockResolvedValue` implementations. If you use `clearAllMocks` in `afterEach`, re-set your mocks in `beforeEach`.

---

## Key Development Patterns

### Hono Route Pattern

```typescript
const routes = new Hono<{ Bindings: Env }>();
routes.use("*", requireAuth);
routes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  // Prisma middleware handles lifecycle — no try/finally needed
  return c.json({ data: result });
});
```

### Database Access

Prisma middleware (`worker/middleware/prisma.ts`) creates a per-request PrismaClient and sets it on `c.get("prisma")`. The middleware disconnects automatically via `waitUntil`. Route handlers simply call `c.get("prisma")` — no manual creation or cleanup needed.

**Note:** Queue handlers do NOT use Hono context. They still use manual `createPrismaClient(env.HYPERDRIVE)` + try/finally disconnect.

### Plan Limit Enforcement

Route handlers that create subscriptions or briefings enforce plan limits using helpers from `worker/lib/plan-limits.ts`:

```typescript
import { getUserWithPlan, checkDurationLimit, checkSubscriptionLimit } from "../lib/plan-limits";

const user = await getUserWithPlan(c, prisma);
const durationError = checkDurationLimit(body.durationTier, user.plan.maxDurationMinutes);
if (durationError) return c.json({ error: durationError }, 403);
```

### Admin Route Helpers

Shared helpers in `worker/lib/admin-helpers.ts` eliminate boilerplate in admin list endpoints:

```typescript
import { parsePagination, parseSort, paginatedResponse } from "../../lib/admin-helpers";

routes.get("/", async (c) => {
  const prisma = c.get("prisma") as any;
  const { page, pageSize, skip } = parsePagination(c);
  const orderBy = parseSort(c);
  const [data, total] = await Promise.all([
    prisma.model.findMany({ skip, take: pageSize, orderBy }),
    prisma.model.count(),
  ]);
  return c.json(paginatedResponse(data, total, page, pageSize));
});
```

- `getCurrentUser(c, prisma)` — resolves Clerk auth to a DB User record (auto-creates from Clerk API if missing, assigns default plan)

### Queue Handler Pattern

Each queue handler follows this structure:

1. Create PrismaClient from env
2. Check stage gate: `if (!(await checkStageEnabled(prisma, batch, "STAGE_NAME", log))) return;`
3. Iterate over batch messages
4. Process each message in try/catch
5. `msg.ack()` on success, `msg.retry()` on failure
6. Disconnect Prisma in `finally`

The `checkStageEnabled()` helper from `worker/lib/queue-helpers.ts` replaces the manual stage-enabled check pattern. Messages with `type: "manual"` bypass the gate.

### Pipeline Events

Use `writeEvent()` from `worker/lib/pipeline-events.ts` for structured logging within pipeline steps. Events are fire-and-forget (errors are swallowed) so they never break processing.

### Frontend Data Fetching

Use the `useFetch` hook from `src/lib/use-fetch.ts` for simple load-on-mount data fetching:

```typescript
import { useFetch } from "../lib/use-fetch";

const { data, loading, error, refetch } = useFetch<{ items: Item[] }>("/endpoint");
const items = data?.items ?? [];
```

For polling or user-triggered fetches (search, form submissions), use `useApiFetch()` manually.

### Admin Routes

- Do **not** duplicate `clerkMiddleware()` in admin route files -- it is applied globally in `worker/index.ts`
- Admin routes use the `requireAdmin` middleware from `worker/middleware/admin.ts`
- Admin auth checks the `isAdmin` boolean on the User model
- Import `PIPELINE_STAGE_NAMES` from `worker/lib/constants.ts` — do not define stage name mappings locally

### Frontend Structure

- **MobileLayout** is the primary layout for user-facing routes
- Bottom tab navigation: Home, Discover, Library, Settings
- Admin routes use a separate AdminLayout
- Billing functionality lives within the Settings page (no separate billing page)

### PWA Development

The app is configured as a Progressive Web App via `vite-plugin-pwa`:

- Manifest and service worker are auto-generated by the plugin
- Service worker caches the app shell for offline-capable loading
- Display mode is `standalone` (fullscreen app experience, no browser chrome)
- Placeholder icons are in `public/` -- replace with production assets before launch

---

## Prisma Workflow

### Schema Changes

```bash
# Edit prisma/schema.prisma, then:
npx prisma db push        # Sync schema to Neon (no migration files)
npx prisma generate        # Regenerate client
```

Use `db push` for prototyping. Switch to `prisma migrate dev` when you need migration history.

### Dual Generators

The schema defines two generators:
- **`client`** — Cloudflare runtime output at `src/generated/prisma/` (used by the Worker)
- **`scripts`** — Node.js runtime output at `src/generated/prisma-node/` (used by CLI scripts like seed, clean, db:check)

### Runtime Configuration

The `PlatformConfig` table stores runtime config as key-value pairs. Access via `getConfig(prisma, key, fallback)` from `worker/lib/config.ts` (caches for 60 seconds).

### AI Model Configuration

AI models are managed via the admin Model Registry (`/admin/model-registry`). The model registry lives in the `AiModel` + `AiModelProvider` database tables. Each pipeline stage reads its model+provider config from `PlatformConfig` via `getModelConfig(prisma, stage)`.

Multi-provider implementations:
- **STT**: `worker/lib/stt-providers.ts` (OpenAI, Deepgram, Groq, Cloudflare)
- **LLM**: `worker/lib/llm-providers.ts` (Anthropic, Groq, Cloudflare)
- **TTS**: `worker/lib/tts-providers.ts` (OpenAI, Groq, Cloudflare)

### Cloudflare Runtime

The Prisma schema uses `runtime = "cloudflare"` and the `@prisma/adapter-pg` adapter to connect through Hyperdrive. The generated client output goes to `src/generated/prisma/`.

---

## Deployment

Quick deploy (assuming infrastructure exists):

```bash
# Set secrets
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
# ... (all secrets from .dev.vars)

# Deploy
npx wrangler deploy
```

---

## Known Issues and Workarounds

### npm install requires --legacy-peer-deps

Clerk packages have peer dependency conflicts. Always run:

```bash
npm install --legacy-peer-deps
```

### Prisma Cloudflare runtime -- no barrel export

After `npx prisma generate`, manually create `src/generated/prisma/index.ts` re-exporting the generated files. This file is gitignored and must be recreated after fresh clones.

### Neon free tier cold starts

First request after idle takes 5-10 seconds. Neon spins down compute after 5 minutes of inactivity on the free tier.

### OOM running all worker tests

Running the full worker test suite can cause heap allocation failure:

```bash
# Fix: increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npx vitest run worker/

# Or: run tests in smaller batches
npx vitest run worker/queues/__tests__/feed-refresh.test.ts
```

### Tailwind v4 syntax

- `@keyframes` must be placed outside the `@theme` block
- Use `var(--color-*)` instead of `theme()` for color references

### Pre-existing test failures

All previously known test failures have been resolved. If you encounter test failures, they should be investigated rather than ignored.

### Clerk compatibility shim

`src/shims/clerk-load-script.ts` handles a version mismatch between `@clerk/clerk-react` and `@hono/clerk-auth`. See `docs/plans/phase0-decisions.md` for details.

### wrangler.jsonc Hyperdrive placeholder

The config contains `<hyperdrive-config-id>` as a placeholder. Replace with a real Hyperdrive config ID for remote deployment. Local dev works without it (uses `localConnectionString` instead).

### Queue naming legacy

The `AUDIO_GENERATION_QUEUE` binding maps to the `clip-generation` queue name in `wrangler.jsonc`. The queue dispatcher routes `clip-generation` messages to the audio generation handler. This is a legacy naming artifact.
